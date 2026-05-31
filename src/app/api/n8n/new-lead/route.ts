import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * Proxy server-side para disparar el webhook n8n "Notificacion Nuevo Lead"
 * (workflow QikfXMJumWbpI3wL) — envía la plantilla HSM aprobada
 * `bienvenida_nuevo_lead` (es) al nuevo comprador.
 *
 * Por qué un proxy (mismo patrón que `/api/n8n/diffusion`):
 *   - La URL del webhook n8n no se expone al cliente.
 *   - El servidor inserta un log de auditoría en `n8n_webhook_logs`.
 *   - Validación: el lead debe existir y tener teléfono.
 *
 * Llamado desde `BuyerRegistrationModal` justo después de crear un lead
 * comprador NUEVO (no en update — evita re-bienvenida a leads recurrentes).
 *
 * Body esperado: { leadId: string }
 * El webhook n8n recibirá: { data: { name, phone, email, lead_id, source, preferences } }
 *
 * @created 2026-06-01 — fix de "no llega la bienvenida". Antes el modal solo
 * insertaba en Supabase sin disparar n8n; por eso `Notificacion Nuevo Lead`
 * tenía 0 ejecuciones desde producción.
 */

const N8N_NEW_LEAD_WEBHOOK_URL =
  process.env.N8N_NEW_LEAD_WEBHOOK_URL ||
  'https://alvaroolopez.app.n8n.cloud/webhook/new-lead';

export async function POST(request: NextRequest) {
  try {
    const { leadId } = (await request.json()) as { leadId?: string };
    if (!leadId) {
      return NextResponse.json({ error: 'Missing leadId' }, { status: 400 });
    }

    // 1) Recuperar el lead recién creado (validación de existencia + obtener teléfono real).
    const { data: lead, error } = await supabase
      .from('leads')
      .select('id, name, phone, email, type, source, preferences, created_at')
      .eq('id', leadId)
      .single();

    if (error || !lead) {
      console.warn('[N8N new-lead] Lead no encontrado:', leadId, error?.message);
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    if (!lead.phone) {
      // Sin teléfono no podemos enviar WhatsApp — devolvemos 200 silencioso (no es un error de servidor).
      return NextResponse.json({ ok: true, skipped: 'no_phone' });
    }

    // 2) Construir payload con la forma que espera el workflow `Notificacion Nuevo Lead`.
    //    El nodo "Extraer Datos Lead" lee `$json.body.data.*`.
    const prefs = (lead.preferences || {}) as Record<string, unknown>;
    const location =
      (prefs.location as string) ||
      (Array.isArray(prefs.zonas) && (prefs.zonas as string[])[0]) ||
      'Sevilla';

    const payload = {
      data: {
        lead_id: lead.id,
        name: lead.name,
        phone: lead.phone,
        email: lead.email || '',
        source: lead.source || 'web',
        preferences: { location, ...prefs },
      },
    };

    // 3) Disparar el webhook n8n.
    const res = await fetch(N8N_NEW_LEAD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch((err) => {
      console.warn('[N8N new-lead] HTTP post falló:', err.message);
      return { ok: false, status: 500, statusText: 'Offline' } as Response;
    });

    // 4) Log de auditoría.
    await supabase.from('n8n_webhook_logs').insert({
      webhook_name: 'new_lead_welcome',
      source: 'server_proxy',
      payload,
      response_status: res.status || 200,
      error_message: res.ok ? null : `n8n webhook respondió ${res.statusText}`,
    });

    return NextResponse.json({ ok: res.ok, status: res.status });
  } catch (err) {
    console.error('[N8N new-lead] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
