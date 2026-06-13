/**
 * POST /api/valuation
 *   Inicia una valoración IA de un inmueble (input-driven, property_id opcional).
 *   INSERT en valuation_reports{status:'running'} → devuelve {id} inmediatamente.
 *   El análisis Gemini continúa en background (la lambda Netlify sobrevive al corte).
 *   El cliente hace polling vía GET /api/valuation/[id].
 *
 * Modelo: VALUATION_LLM_MODEL (default gemini-2.5-pro) con google_search.
 * ⚠️ grounding es incompatible con responseMimeType:application/json.
 *
 * @created 2026-06-13 brief #016
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  buildValuationPrompt,
  parseValuationResponse,
  applyLowballGuard,
  extractGroundingUrls,
} from '@/lib/valuation';
import type { ValuationInputs, ValuationResult } from '@/lib/valuation';
import { resolveCatastro } from '@/lib/catastro';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const VALUATION_LLM_MODEL = process.env.VALUATION_LLM_MODEL || 'gemini-2.5-pro';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

function supabaseAdmin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
}

// ─── GET (listado histórico) ──────────────────────────────────────────────────

export async function GET(_req: NextRequest) {
  if (!SERVICE_ROLE_KEY) return NextResponse.json({ error: 'Config' }, { status: 503 });
  const db = supabaseAdmin();
  const { data } = await db
    .from('valuation_reports')
    .select('id,created_at,status,inputs,result,property_id,error_msg')
    .order('created_at', { ascending: false })
    .limit(20);
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  if (!SERVICE_ROLE_KEY) return NextResponse.json({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY' }, { status: 503 });
  if (!GEMINI_API_KEY) return NextResponse.json({ error: 'Falta GEMINI_API_KEY' }, { status: 503 });

  let inputs: ValuationInputs;
  try {
    inputs = (await req.json()) as ValuationInputs;
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  if (!inputs.m2 || inputs.m2 <= 0) {
    return NextResponse.json({ error: 'Falta m² válido' }, { status: 400 });
  }
  if (!inputs.estado) {
    return NextResponse.json({ error: 'Falta estado del inmueble' }, { status: 400 });
  }
  if (!inputs.direccion && !inputs.referencia_catastral && !inputs.zona) {
    return NextResponse.json({ error: 'Falta al menos dirección, referencia catastral o zona' }, { status: 400 });
  }

  const db = supabaseAdmin();

  const { data: row, error: insertErr } = await db
    .from('valuation_reports')
    .insert({
      status: 'running',
      inputs: inputs as unknown as Record<string, unknown>,
      property_id: inputs.property_id || null,
    })
    .select('id')
    .single();

  if (insertErr || !row) {
    console.error('[valuation] Insert error:', insertErr);
    return NextResponse.json({ error: 'Error al crear la valoración' }, { status: 500 });
  }

  const valuationId = row.id as string;

  // Lanza el análisis sin await — la lambda Netlify continúa tras el return.
  // Patrón probado en blog (#010) y rebaja (#015).
  void runAnalysis(db, valuationId, inputs);

  return NextResponse.json({ id: valuationId, status: 'running' });
}

/**
 * Quita el bloque JSON inicial dejando solo la narrativa markdown.
 * Robusto frente a vallas ```json sin cerrar: si hay result y existe un
 * encabezado markdown (## …), corta desde ahí. Si no, hace fallback a strip
 * de vallas y limpieza de vallas huérfanas.
 */
function stripLeadingJson(raw: string, hasResult: boolean): string {
  const text = (raw || '').trim();
  if (!hasResult) return text;
  const heading = text.match(/(^|\n)#{1,3}\s+\S/);
  if (heading && heading.index !== undefined) {
    const start = heading.index + (heading[1] ? heading[1].length : 0);
    return text.slice(start).replace(/```/g, '').trim();
  }
  return text.replace(/```(?:json)?[\s\S]*?```/g, '').replace(/```/g, '').trim();
}

async function runAnalysis(
  db: ReturnType<typeof supabaseAdmin>,
  valuationId: string,
  inputs: ValuationInputs,
) {
  try {
    // Geolocalización en código: resuelve la ref catastral contra el Catastro
    // oficial (+ geocodificación) y la inyecta como verdad innegociable. Erradica
    // la alucinación de distrito de Gemini (caso "Granate" → San Pablo). Best-effort.
    const confirmed = inputs.referencia_catastral
      ? await resolveCatastro(inputs.referencia_catastral)
      : null;
    if (confirmed) {
      console.log('[valuation] Catastro confirmó:', confirmed.cp, confirmed.barrio, confirmed.distrito);
    }
    const prompt = buildValuationPrompt(inputs, confirmed);

    const geminiRes = await fetch(
      `${GEMINI_BASE}/${VALUATION_LLM_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: {
            // Baja varianza: las reglas de geolocalización y anti-lowball son
            // determinísticas, no creativas.
            temperature: 0.2,
            maxOutputTokens: 16384,
          },
        }),
      },
    );

    if (!geminiRes.ok) {
      const body = await geminiRes.text();
      console.error('[valuation] Gemini HTTP', geminiRes.status, body.slice(0, 400));
      const diagMsg = `Gemini ${geminiRes.status} [model=${VALUATION_LLM_MODEL}] ${body.slice(0, 300)}`;
      await db
        .from('valuation_reports')
        .update({ status: 'failed', finished_at: new Date().toISOString(), error_msg: diagMsg })
        .eq('id', valuationId);
      return;
    }

    const geminiData: Record<string, any> = await geminiRes.json();

    const rawText: string = (geminiData?.candidates?.[0]?.content?.parts || [])
      .map((p: any) => p?.text)
      .filter(Boolean)
      .join('\n');

    const groundingUrls = extractGroundingUrls(geminiData);
    const parsed = parseValuationResponse(rawText);
    // Red de seguridad anti-infravaloración (caso "Granate"): si el mercado
    // queda por debajo de la mediana de comparables, marca y baja confianza.
    const result: ValuationResult | null = parsed ? applyLowballGuard(parsed) : null;

    // Aísla la narrativa markdown del bloque JSON inicial.
    // ⚠️ Gemini a veces abre ```json pero NO cierra la valla → un strip por
    //    regex de valla deja el JSON dentro. Como el prompt exige JSON PRIMERO
    //    y luego secciones ##, cortamos desde el primer encabezado markdown.
    const markdownText = stripLeadingJson(rawText, !!result);

    await db
      .from('valuation_reports')
      .update({
        status: 'done',
        finished_at: new Date().toISOString(),
        markdown: markdownText,
        result: result as unknown as Record<string, unknown>,
        grounding_urls: groundingUrls,
      })
      .eq('id', valuationId);
  } catch (err) {
    console.error('[valuation] Error:', err);
    await db
      .from('valuation_reports')
      .update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        error_msg: String(err),
      })
      .eq('id', valuationId);
  }
}
