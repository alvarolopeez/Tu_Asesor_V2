import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/properties/[id]/ai-report
 *
 * Genera un análisis de mercado del inmueble usando Gemini Flash (mismo
 * provider que el chatbot). Recopila los datos REALES desde Supabase
 * server-side (visitas web, citas físicas con status, propuestas firmadas,
 * inmuebles similares) y los inyecta como contexto al LLM. El prompt
 * impone NO inventar nada y declarar explícitamente cuando faltan datos.
 *
 * @hook idealistaData: campo opcional reservado para enchufar la API de
 *       Idealista en una fase posterior; por ahora se omite.
 *
 * @created 2026-06-06 brief #002 T7
 */

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const LLM_MODEL = process.env.LLM_MODEL || 'gemini-1.5-flash';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
);

interface AppointmentLite {
  id: string;
  scheduled_at: string;
  status: string | null;
  type?: string | null;
  notes?: string | null;
}

interface AIReportContext {
  property: {
    id: string;
    title: string;
    price: number;
    sqm?: number;
    rooms?: number;
    baths?: number;
    address?: string | null;
    zone?: string | null;
    published_at: string | null;
    days_on_market: number | null;
  };
  appointments: {
    completed: number;
    pending: number;
    cancelled: number;
    notes: string[];
  };
  proposals: {
    total: number;
    signed: number;
    pending: number;
  };
  web_visits: {
    total: number;
  };
  similar_properties: {
    sample: number;
    avg_price: number;
    avg_sqm: number;
  };
  /** Hook idealista — no usado todavía. */
  idealistaData?: unknown;
}

function buildPrompt(ctx: AIReportContext): string {
  return [
    'Eres analista inmobiliario senior en Sevilla. A partir EXCLUSIVAMENTE de los datos del inmueble y de sus interacciones reales (visitas, anotaciones, propuestas, días en mercado, visitas web), produce un informe en markdown con esta estructura:',
    '',
    '1. **Diagnóstico de mercado** — qué dice la actividad real del inmueble.',
    '2. **Análisis de demanda** — cómo se comporta vs media de la plataforma (cuando aplique).',
    '3. **Recomendación de ajuste de precio** — con rango € si los datos lo justifican; si no, di que NO hace falta bajar.',
    '4. **Próximos pasos accionables** — 3 acciones concretas, no genéricas.',
    '',
    'REGLAS:',
    '- Si faltan datos para alguna sección, dilo explícitamente ("Aún no hay datos suficientes para X").',
    '- NUNCA inventes cifras, comparables ni señales que no estén en el JSON de contexto.',
    '- Tono ejecutivo, breve, en castellano de España.',
    '- No metas placeholders tipo "[completar]"; si no sabes, di que no sabes.',
    '',
    'CONTEXTO (JSON):',
    '```json',
    JSON.stringify(ctx, null, 2),
    '```',
  ].join('\n');
}

async function callGemini(prompt: string): Promise<{ markdown: string | null; raw?: unknown }> {
  if (!GEMINI_API_KEY) {
    return { markdown: null };
  }
  try {
    const modelName = LLM_MODEL === 'gemini-1.5-flash' ? 'gemini-flash-latest' : LLM_MODEL;
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.5,
            maxOutputTokens: 1500,
          },
        }),
      },
    );
    if (!res.ok) {
      const body = await res.text();
      console.error('[ai-report][Gemini] HTTP', res.status, body);
      return { markdown: null, raw: body };
    }
    const data = await res.json();
    const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return { markdown: text || null, raw: data };
  } catch (err) {
    console.error('[ai-report][Gemini] error:', err);
    return { markdown: null };
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY' }, { status: 503 });
  }
  const { id: propertyId } = await params;
  if (!propertyId) return NextResponse.json({ error: 'Falta id' }, { status: 400 });

  // 1. Propiedad.
  const { data: prop, error: propErr } = await supabaseAdmin
    .from('properties')
    .select('id, title, description, price, status, features, images, created_at, updated_at, published_at')
    .eq('id', propertyId)
    .single();
  if (propErr || !prop) {
    return NextResponse.json({ error: 'Inmueble no encontrado' }, { status: 404 });
  }

  const features = (prop.features as Record<string, any>) || {};
  const daysOnMarket = prop.published_at
    ? Math.max(0, Math.floor((Date.now() - new Date(prop.published_at).getTime()) / 86_400_000))
    : null;

  // 2. Citas: counts por status + notas para feedback cualitativo.
  const { data: apptsData } = await supabaseAdmin
    .from('appointments')
    .select('id, scheduled_at, status, type, notes')
    .eq('property_id', propertyId);
  const appts: AppointmentLite[] = (apptsData as AppointmentLite[] | null) || [];

  const apptCompleted = appts.filter((a) => a.status === 'completed').length;
  const apptPending = appts.filter((a) => a.status === 'pending').length;
  const apptCancelled = appts.filter((a) => a.status === 'cancelled').length;
  const apptNotes = appts
    .map((a) => (a.notes || '').trim())
    .filter((n) => n.length > 0)
    .slice(0, 10);

  // 3. Propuestas/contratos generados (template.category like 'propuesta' / 'contrato').
  const { data: docsData } = await supabaseAdmin
    .from('generated_documents')
    .select('id, signature_status, template_id, document_templates(category)')
    .eq('property_id', propertyId);
  const docs = (docsData as any[]) || [];
  const proposals = docs.filter((d) => {
    const cat = d.document_templates?.category || '';
    return /propuesta|contrato/i.test(cat);
  });
  const proposalsSigned = proposals.filter((d) => d.signature_status === 'completed').length;

  // 4. Visitas web (page_path contiene el id, misma convención que Operaciones).
  const { data: visits } = await supabaseAdmin
    .from('web_visits')
    .select('page_path');
  const webVisitsTotal = ((visits as { page_path: string }[] | null) || [])
    .filter((v) => v.page_path?.includes(propertyId)).length;

  // 5. Comparables: properties activas con price ±15% y misma zona.
  const priceLow = Math.round(Number(prop.price) * 0.85);
  const priceHigh = Math.round(Number(prop.price) * 1.15);
  const zone = (features?.location?.zone as string | undefined) || (features?.location?.address as string | undefined) || null;
  let similarsQuery = supabaseAdmin
    .from('properties')
    .select('id, price, features')
    .eq('status', 'active')
    .neq('id', propertyId)
    .gte('price', priceLow)
    .lte('price', priceHigh);
  const { data: similars } = await similarsQuery;
  const similarsAll = (similars as { id: string; price: number; features: any }[] | null) || [];
  const sameZone = zone
    ? similarsAll.filter((s) => {
        const z = s.features?.location?.zone || s.features?.location?.address;
        return typeof z === 'string' && z.toLowerCase().includes(zone.toLowerCase());
      })
    : similarsAll;
  const similarSample = sameZone.length > 0 ? sameZone : similarsAll;
  const avgPrice = similarSample.length > 0
    ? Math.round(similarSample.reduce((s, p) => s + Number(p.price || 0), 0) / similarSample.length)
    : 0;
  const avgSqm = similarSample.length > 0
    ? Math.round(
        similarSample.reduce((s, p) => s + Number(p.features?.sqm || 0), 0) / similarSample.length,
      )
    : 0;

  // 6. Construir contexto.
  const ctx: AIReportContext = {
    property: {
      id: prop.id,
      title: prop.title,
      price: Number(prop.price),
      sqm: Number(features?.sqm || 0) || undefined,
      rooms: Number(features?.rooms || 0) || undefined,
      baths: Number(features?.baths || 0) || undefined,
      address: features?.location?.address || null,
      zone: zone,
      published_at: prop.published_at || null,
      days_on_market: daysOnMarket,
    },
    appointments: {
      completed: apptCompleted,
      pending: apptPending,
      cancelled: apptCancelled,
      notes: apptNotes,
    },
    proposals: {
      total: proposals.length,
      signed: proposalsSigned,
      pending: proposals.length - proposalsSigned,
    },
    web_visits: {
      total: webVisitsTotal,
    },
    similar_properties: {
      sample: similarSample.length,
      avg_price: avgPrice,
      avg_sqm: avgSqm,
    },
    // idealistaData: undefined,  // hook futuro
  };

  // 7. LLM.
  const prompt = buildPrompt(ctx);
  const { markdown } = await callGemini(prompt);

  if (!markdown) {
    return NextResponse.json(
      {
        error: 'No se pudo generar el informe IA. ¿Está configurada GEMINI_API_KEY en el servidor?',
        context: ctx,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ markdown, context: ctx });
}
