/**
 * POST /api/valuation
 *   Inicia una valoración IA de un inmueble (input-driven, property_id opcional).
 *   INSERT en valuation_reports{status:'running'} → devuelve {id} inmediatamente.
 *   El análisis (Catastro + Gemini, ~40-90 s) corre en una Netlify Background
 *   Function (`valuation-run-background`, límite 15 min) — fiable, a diferencia
 *   del fire-and-forget síncrono que moría por timeout (26 s en Netlify Pro).
 *   El cliente hace polling vía GET /api/valuation/[id].
 *
 * Modelo: VALUATION_LLM_MODEL (default gemini-2.5-pro) con google_search.
 * ⚠️ grounding es incompatible con responseMimeType:application/json.
 *
 * @created 2026-06-13 brief #016
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { ValuationInputs } from '@/lib/valuation';
import { runValuation } from '@/lib/valuationRunner';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

function supabaseAdmin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
}

/**
 * Dispara la Background Function de Netlify. Devuelve true si quedó encolada
 * (202/2xx). En dev local (sin runtime de funciones Netlify) fallará y el caller
 * cae al fallback inline.
 */
async function triggerBackground(req: NextRequest, valuationId: string, inputs: ValuationInputs): Promise<boolean> {
  try {
    const origin = process.env.URL || process.env.DEPLOY_PRIME_URL || new URL(req.url).origin;
    const res = await fetch(`${origin}/.netlify/functions/valuation-run-background`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': SERVICE_ROLE_KEY },
      body: JSON.stringify({ valuationId, inputs }),
    });
    return res.status === 202 || res.ok;
  } catch (err) {
    console.warn('[valuation] trigger background falló, usando fallback inline:', String(err));
    return false;
  }
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

  // Vía producción: Background Function de Netlify (15 min, fiable).
  const queued = await triggerBackground(req, valuationId, inputs);
  if (!queued) {
    // Fallback dev local (sin runtime de funciones Netlify): fire-and-forget.
    void runValuation(valuationId, inputs);
  }

  return NextResponse.json({ id: valuationId, status: 'running' });
}
