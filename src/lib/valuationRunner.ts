/**
 * Runner del análisis de valoración IA (Brief #016).
 *
 * Lógica compartida entre:
 *  - la Netlify Background Function `netlify/functions/valuation-run-background.mts`
 *    (vía de producción: 15 min de límite, fiable para Gemini Pro ~40-90 s), y
 *  - el fallback inline de `POST /api/valuation` (dev local sin background fns).
 *
 * ⚠️ Sin imports con alias `@/` — este módulo lo empaqueta esbuild para la
 *    Netlify Function; usa solo imports relativos.
 *
 * Pipeline: resolveCatastro (geolocalización en código) → Gemini + grounding →
 *           parse + applyLowballGuard → UPDATE valuation_reports.
 */

import { createClient } from '@supabase/supabase-js';
import {
  buildValuationPrompt,
  parseValuationResponse,
  applyLowballGuard,
  extractGroundingUrls,
} from './valuation';
import type { ValuationInputs, ValuationResult } from './valuation';
import { resolveCatastro } from './catastro';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

function env(name: string, fallback = ''): string {
  return process.env[name] || fallback;
}

function supabaseAdmin() {
  return createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
}

/**
 * Quita el bloque JSON inicial dejando solo la narrativa markdown.
 * Robusto frente a vallas ```json sin cerrar: si hay result y existe un
 * encabezado markdown (## …), corta desde ahí. Si no, hace fallback a strip
 * de vallas y limpieza de vallas huérfanas.
 */
export function stripLeadingJson(raw: string, hasResult: boolean): string {
  const text = (raw || '').trim();
  if (!hasResult) return text;
  const heading = text.match(/(^|\n)#{1,3}\s+\S/);
  if (heading && heading.index !== undefined) {
    const start = heading.index + (heading[1] ? heading[1].length : 0);
    return text.slice(start).replace(/```/g, '').trim();
  }
  return text.replace(/```(?:json)?[\s\S]*?```/g, '').replace(/```/g, '').trim();
}

/**
 * Ejecuta el análisis completo y persiste el resultado en valuation_reports.
 * No lanza: cualquier error se captura y marca el reporte como 'failed'.
 */
export async function runValuation(valuationId: string, inputs: ValuationInputs): Promise<void> {
  const db = supabaseAdmin();
  const GEMINI_API_KEY = env('GEMINI_API_KEY');
  const VALUATION_LLM_MODEL = env('VALUATION_LLM_MODEL', 'gemini-2.5-pro');

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
