import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { normalizeEsPhone } from '@/lib/phone';
import { sendWhatsAppTemplate } from '@/lib/whatsapp';

/**
 * Alta de lead de valoración desde la web pública (Brief #017 T3).
 *
 * Antes la página escribía el lead con el cliente anon (client-side). Para poder
 * disparar WhatsApp (que necesita WHATSAPP_ACCESS_TOKEN, secreto de servidor) se
 * centraliza aquí el MISMO upsert con dedupe que hacía la página, con service
 * role, y tras crear/actualizar se notifica:
 *   1. Aviso a Álvaro (plantilla `aviso_alvaro`, ya en uso).
 *   2. Bienvenida al cliente (plantilla HSM `valoracion_recibida`, pendiente de
 *      aprobación en Meta — el fallo se traga con catch, no rompe el flujo).
 *
 * Un lead de valoración NUNCA crea una propiedad: solo el lead vendedor; las
 * características del inmueble viven en `leads.preferences`. La conversión a
 * Inmueble/Encargo es una decisión manual de Álvaro en el CRM.
 *
 * POST /api/valuation/lead
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
);

const ADVISOR_PHONE = process.env.ADVISOR_WHATSAPP_PHONE || '';
const TPL_AVISO_ALVARO = 'aviso_alvaro';
const TPL_VALORACION_RECIBIDA = 'valoracion_recibida';

// ── Anti-abuso: rate-limit ligero en memoria por IP (máx 5/hora) ──
const RATE_LIMIT = 5;
const WINDOW_MS = 60 * 60 * 1000;
const ipHits = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (ipHits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= RATE_LIMIT) {
    ipHits.set(ip, hits);
    return true;
  }
  hits.push(now);
  ipHits.set(ip, hits);
  return false;
}

interface LeadPayload {
  name?: string;
  surname?: string;
  email?: string;
  phone?: string;
  propertyType?: string;
  street?: string;
  number?: string;
  floor?: string;
  zipcode?: string;
  city?: string;
  sqm?: string | number;
  rooms?: number;
  baths?: number;
  condition?: string;
  hasElevator?: boolean;
  hasTerrace?: boolean;
  hasGarage?: boolean;
  privacyCheck?: boolean;
  referencia_catastral?: string;
  direccion_oficial?: string;
  rangeLow?: number | null;
  rangeHigh?: number | null;
  // Honeypot: vacío en humanos, relleno por bots.
  website?: string;
  company?: string;
}

export async function POST(req: NextRequest) {
  let body: LeadPayload;
  try {
    body = (await req.json()) as LeadPayload;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  // Honeypot: si el campo trampa viene relleno, es un bot. Respondemos ok
  // silencioso (sin crear lead ni delatar la trampa).
  if ((body.website && body.website.trim()) || (body.company && body.company.trim())) {
    return NextResponse.json({ ok: true, leadId: null });
  }

  // Rate-limit por IP.
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  if (isRateLimited(ip)) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });
  }

  const normalizedPhone = normalizeEsPhone(body.phone);
  const fullName = `${body.name || ''} ${body.surname || ''}`.trim();
  if (!normalizedPhone || !fullName) {
    return NextResponse.json({ ok: false, error: 'missing_fields' }, { status: 400 });
  }

  // Dirección: si el Catastro confirmó, se prefiere la oficial; si no, a mano
  // (omitiendo "Piso" si no hay planta).
  const addressManual = [
    `${body.street || ''} ${body.number || ''}`.trim(),
    body.floor ? `Piso ${body.floor}` : null,
    `${body.zipcode || ''} ${body.city || ''}`.trim(),
  ]
    .filter(Boolean)
    .join(', ');
  const addressFull =
    body.referencia_catastral && body.direccion_oficial ? body.direccion_oficial : addressManual;

  const sqmNum = body.sqm ? Number(body.sqm) : undefined;

  const newPreferences = {
    property_address: addressFull,
    property_type: body.propertyType,
    street: body.street,
    number: body.number,
    referencia_catastral: body.referencia_catastral || undefined,
    direccion_oficial: body.direccion_oficial || undefined,
    floor: body.floor,
    elevator: body.hasElevator,
    city: body.city,
    zipcode: body.zipcode,
    sqm: sqmNum,
    rooms: body.rooms,
    baths: body.baths,
    condition: body.condition,
    hasTerrace: body.hasTerrace,
    hasGarage: body.hasGarage,
    rgpd_accepted: body.privacyCheck,
    // Estimación que vio el cliente en la web (trazabilidad para Álvaro).
    rango_estimado_web:
      body.rangeLow && body.rangeHigh ? { low: body.rangeLow, high: body.rangeHigh } : undefined,
  };

  // ── Upsert con dedupe por teléfono normalizado (mismo patrón que el webhook) ──
  const findExistingLead = async () => {
    const { data, error } = await supabaseAdmin
      .from('leads')
      .select('id, preferences')
      .eq('phone', normalizedPhone)
      .limit(1);
    if (error) throw error;
    return data && data.length > 0 ? data[0] : null;
  };

  const updateExistingLead = async (
    leadId: string,
    existingPrefs: Record<string, unknown> | null,
  ) => {
    const { error } = await supabaseAdmin
      .from('leads')
      .update({
        preferences: { ...(existingPrefs || {}), ...newPreferences },
        name: fullName,
        ...(body.email ? { email: body.email } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId);
    if (error) throw error;
  };

  let leadId: string | null = null;
  try {
    const existing = await findExistingLead();
    if (existing) {
      await updateExistingLead(existing.id, existing.preferences as Record<string, unknown> | null);
      leadId = existing.id;
    } else {
      const { data: inserted, error: leadError } = await supabaseAdmin
        .from('leads')
        .insert([
          {
            name: fullName,
            phone: normalizedPhone,
            email: body.email,
            type: 'seller',
            source: 'Calculadora Valoración',
            preferences: newPreferences,
          },
        ])
        .select('id')
        .single();

      if (leadError) {
        // Race con el UNIQUE INDEX (dos envíos simultáneos): reintenta SELECT + merge.
        if ((leadError as { code?: string }).code === '23505') {
          const retry = await findExistingLead();
          if (!retry) throw leadError;
          await updateExistingLead(retry.id, retry.preferences as Record<string, unknown> | null);
          leadId = retry.id;
        } else {
          throw leadError;
        }
      } else {
        leadId = inserted?.id ?? null;
      }
    }
  } catch (error) {
    console.error('[valuation/lead] Error en upsert del lead:', error);
    return NextResponse.json({ ok: false, error: 'db_error' }, { status: 500 });
  }

  // ── Notificaciones (fire-and-forget: no rompen la respuesta al cliente) ──
  const rangoTxt =
    body.rangeLow && body.rangeHigh
      ? `estimado ${body.rangeLow.toLocaleString('es-ES')}-${body.rangeHigh.toLocaleString('es-ES')} € · `
      : '';
  const m2Txt = sqmNum ? `${sqmNum} m² · ` : '';

  // 1. Aviso a Álvaro.
  if (ADVISOR_PHONE) {
    const detalle = `${fullName} · ${addressFull} · ${m2Txt}${rangoTxt}tel ${normalizedPhone}`;
    void sendWhatsAppTemplate(ADVISOR_PHONE, TPL_AVISO_ALVARO, ['Nueva valoración solicitada', detalle], {
      normalize: true,
      logTag: '[valuation/lead][HSM asesor]',
    }).catch((e) => console.warn('[valuation/lead] aviso Álvaro falló:', e));
  }

  // 2. Bienvenida al cliente (HSM pendiente de aprobación → try/catch).
  try {
    void sendWhatsAppTemplate(normalizedPhone, TPL_VALORACION_RECIBIDA, [body.name || fullName], {
      normalize: true,
      logTag: '[valuation/lead][HSM cliente]',
    }).catch((e) => console.warn('[valuation/lead] bienvenida cliente falló (plantilla pendiente?):', e));
  } catch (e) {
    console.warn('[valuation/lead] bienvenida cliente no enviada:', e);
  }

  return NextResponse.json({ ok: true, leadId });
}
