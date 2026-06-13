/**
 * POST /api/properties/[id]/price-analysis
 *   Inicia el análisis de rebaja con Gemini Pro + grounding.
 *   Upserta rebaja_reports{status:'running'} ANTES de llamar al LLM para que
 *   el cliente pueda hacer polling via GET si Netlify corta la conexión (~26-30s).
 *   La lambda continúa después del corte (patrón probado en producción con el blog).
 *
 * GET /api/properties/[id]/price-analysis
 *   Lee el último resultado de rebaja_reports por property_id.
 *   El cliente hace polling hasta status='done'|'failed'.
 *
 * Modelo: REBAJA_LLM_MODEL (default gemini-2.5-pro-preview) con google_search.
 * ⚠️ grounding es incompatible con responseMimeType:application/json →
 *    el JSON del veredicto se exige por prompt y se parsea con parsePriceAnalysisResponse().
 *
 * @created 2026-06-13 brief #015
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  buildPriceAnalysisPrompt,
  parsePriceAnalysisResponse,
  extractGroundingUrls,
} from '@/lib/priceAnalysis';
import type { PriceAnalysisContext, PriceVerdicto } from '@/lib/priceAnalysis';
import { computePriceDropEstimate } from '@/components/admin/sections/dashboard/operaciones/operacionesUtils';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const REBAJA_LLM_MODEL = process.env.REBAJA_LLM_MODEL || 'gemini-2.5-pro';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

function supabaseAdmin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
}

// ─── GET ────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!SERVICE_ROLE_KEY) return NextResponse.json({ error: 'Config' }, { status: 503 });
  const { id: propertyId } = await params;

  const { data, error } = await supabaseAdmin()
    .from('rebaja_reports')
    .select('*')
    .eq('property_id', propertyId)
    .single();

  if (error || !data) {
    return NextResponse.json({ status: 'not_found' }, { status: 404 });
  }
  return NextResponse.json(data);
}

// ─── POST ───────────────────────────────────────────────────────────────────

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!SERVICE_ROLE_KEY) return NextResponse.json({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY' }, { status: 503 });
  if (!GEMINI_API_KEY) return NextResponse.json({ error: 'Falta GEMINI_API_KEY' }, { status: 503 });
  const { id: propertyId } = await params;
  if (!propertyId) return NextResponse.json({ error: 'Falta id' }, { status: 400 });

  const db = supabaseAdmin();

  // Marca 'running' inmediatamente → el cliente puede empezar a hacer polling
  await db.from('rebaja_reports').upsert(
    { property_id: propertyId, status: 'running', started_at: new Date().toISOString() },
    { onConflict: 'property_id' },
  );

  try {
    const ctx = await buildContext(db, propertyId);
    const prompt = buildPriceAnalysisPrompt(ctx);

    // Llama Gemini con grounding. No usamos streamGenerateContent porque
    // la compatibilidad de streaming + grounding + razonamiento no está confirmada.
    const geminiRes = await fetch(
      `${GEMINI_BASE}/${REBAJA_LLM_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 4096,
          },
        }),
      },
    );

    if (!geminiRes.ok) {
      const body = await geminiRes.text();
      console.error('[price-analysis] Gemini HTTP', geminiRes.status, body.slice(0, 400));
      const diagMsg = `Gemini ${geminiRes.status} [model=${REBAJA_LLM_MODEL}] ${body.slice(0, 300)}`;
      await db.from('rebaja_reports').upsert(
        { property_id: propertyId, status: 'failed', finished_at: new Date().toISOString(), error_msg: diagMsg },
        { onConflict: 'property_id' },
      );
      return NextResponse.json({ error: 'Error del modelo IA' }, { status: 502 });
    }

    const geminiData: Record<string, any> = await geminiRes.json();

    // Reconstruye el texto: puede venir partido en parts cuando hay grounding
    const rawText: string = (geminiData?.candidates?.[0]?.content?.parts || [])
      .map((p: any) => p?.text)
      .filter(Boolean)
      .join('\n');

    const groundingUrls = extractGroundingUrls(geminiData);
    const veredicto: PriceVerdicto | null = parsePriceAnalysisResponse(rawText);

    // Separa la narrativa del bloque JSON para mostrarlo limpio
    const markdownText = veredicto
      ? rawText.replace(/```json[\s\S]*?```/g, '').trim()
      : rawText;

    // Actualiza con resultado
    await db.from('rebaja_reports').upsert(
      {
        property_id: propertyId,
        status: 'done',
        finished_at: new Date().toISOString(),
        markdown: markdownText,
        veredicto: veredicto as unknown as Record<string, unknown>,
        context: ctx as unknown as Record<string, unknown>,
        grounding_urls: groundingUrls,
      },
      { onConflict: 'property_id' },
    );

    return NextResponse.json({
      status: 'done',
      markdown: markdownText,
      veredicto,
      context: ctx,
      grounding_urls: groundingUrls,
    });
  } catch (err) {
    console.error('[price-analysis] Error:', err);
    await db.from('rebaja_reports').upsert(
      { property_id: propertyId, status: 'failed', finished_at: new Date().toISOString(), error_msg: String(err) },
      { onConflict: 'property_id' },
    );
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// ─── Recolección de contexto (T1) ───────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildContext(db: SupabaseClient<any, any, any>, propertyId: string): Promise<PriceAnalysisContext> {
  const [
    { data: prop },
    { data: apptsData },
    { data: buyerLogs },
    { count: webVisitsCount },
    { count: diffImpacts },
    { data: similarsData },
    { data: sellerLead },
  ] = await Promise.all([
    db.from('properties').select('id,title,price,features,images,published_at').eq('id', propertyId).single(),
    db.from('appointments').select('scheduled_at,status,type,notes').eq('property_id', propertyId),
    db.from('buyer_activity_logs').select('event_type,title,notes,event_date').eq('property_id', propertyId).order('event_date', { ascending: false }).limit(20),
    db.from('web_visits').select('id', { count: 'exact', head: true }).ilike('page_path', `%${propertyId}%`),
    db.from('diffusion_impacts').select('id', { count: 'exact', head: true }).eq('property_id', propertyId),
    db.from('properties').select('id,price,features').eq('status', 'active').neq('id', propertyId),
    // Busca lead vendedor con este property_id para obtener la valoración del asesor
    db.from('leads').select('preferences').eq('type', 'seller').eq('property_id', propertyId).limit(1).maybeSingle(),
  ]);

  const features = (prop?.features as Record<string, any>) || {};
  // Bug fix #1: leer zona PLANA (features.zona), no features.location.zone
  const zone = (features.zona as string | undefined) || null;
  const address = (features.address as string | undefined) || (features.location?.address as string | undefined) || null;
  const sqm = Number(features.sqm || 0) || null;
  const price = Number(prop?.price || 0);
  const pricePerSqm = sqm && sqm > 0 ? Math.round(price / sqm) : null;

  const daysOnMarket = prop?.published_at
    ? Math.max(0, Math.floor((Date.now() - new Date(prop.published_at).getTime()) / 86_400_000))
    : null;

  // Bug fix #3: valoración del asesor desde preferences del lead vendedor
  const sellerPrefs = (sellerLead?.preferences as Record<string, any>) || {};
  const agentValuation = Number(sellerPrefs.agent_valuation || sellerPrefs.estimated_value || 0) || null;

  const appts = (apptsData || []) as any[];
  const apptNotes = appts.map((a: any) => (a.notes || '').trim()).filter(Boolean).slice(0, 8);

  // Bug fix #4: feedback de buyer_activity_logs (no solo notas de citas)
  const buyerFeedback = (buyerLogs || []) as Array<{ event_type: string; title: string; notes: string | null; event_date: string }>;

  // Comparables internos por zona y precio ±15%
  const priceLow = Math.round(price * 0.85);
  const priceHigh = Math.round(price * 1.15);
  const similarsAll = (similarsData || []) as any[];
  const sameZoneComps = zone
    ? similarsAll.filter((s: any) => {
        const f = s.features as Record<string, any> || {};
        const sz = (f.zona as string | undefined) || '';
        return sz.toLowerCase().includes(zone.toLowerCase());
      })
    : [];
  const priceFiltered = (sameZoneComps.length > 0 ? sameZoneComps : similarsAll)
    .filter((s: any) => s.price >= priceLow && s.price <= priceHigh);
  const internalComparables = priceFiltered.slice(0, 8).map((s: any) => {
    const sf = (s.features as Record<string, any>) || {};
    const ssqm = Number(sf.sqm || 0) || null;
    return {
      id: s.id as string,
      price: Number(s.price),
      sqm: ssqm,
      price_per_sqm: ssqm ? Math.round(Number(s.price) / ssqm) : null,
      zone: (sf.zona as string | undefined) || null,
    };
  });

  // Heurística como cota de cordura (T5)
  const avgDays = 30; // fallback si no hay media del portal
  const avgVisits = 5; // fallback
  const heuristicEstimate = price > 0
    ? computePriceDropEstimate({
        price,
        valuation: agentValuation || 0,
        daysOnMarket,
        avgDays,
        visits: webVisitsCount || 0,
        avgVisits,
        marketSampleSize: priceFiltered.length,
      })
    : null;

  return {
    property: {
      id: propertyId,
      title: prop?.title || '',
      price,
      sqm,
      rooms: Number(features.rooms || 0) || null,
      baths: Number(features.baths || 0) || null,
      zone,
      address,
      days_on_market: daysOnMarket,
      price_per_sqm: pricePerSqm,
      published_at: prop?.published_at || null,
    },
    agent_valuation: agentValuation,
    appointments: {
      completed: appts.filter((a: any) => a.status === 'completed').length,
      pending: appts.filter((a: any) => a.status === 'pending').length,
      cancelled: appts.filter((a: any) => a.status === 'cancelled').length,
      notes: apptNotes,
    },
    buyer_feedback: buyerFeedback,
    web_visits: webVisitsCount || 0,
    diffusion_impacts: diffImpacts || 0,
    internal_comparables: internalComparables,
    heuristic_estimate: heuristicEstimate,
  };
}
