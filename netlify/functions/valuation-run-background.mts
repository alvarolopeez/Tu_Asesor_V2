/**
 * Netlify Background Function — ejecuta el análisis de valoración IA.
 *
 * El sufijo "-background" hace que Netlify la invoque de forma ASÍNCRONA:
 * responde 202 al instante y corre hasta 15 min en segundo plano. Esto resuelve
 * el timeout del patrón fire-and-forget anterior (Gemini Pro tarda ~40-90 s,
 * por encima del límite de 26 s de las funciones síncronas en Netlify Pro).
 *
 * La dispara `POST /api/valuation` tras crear la fila `running`.
 * Protegida por un secreto compartido (service role key) para evitar disparos
 * públicos del endpoint /.netlify/functions/valuation-run-background.
 *
 * @created 2026-06-13 brief #016 fix (fiabilidad)
 */

import { runValuation } from '../../src/lib/valuationRunner';
import type { ValuationInputs } from '../../src/lib/valuation';

export default async (req: Request): Promise<Response> => {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!secret || req.headers.get('x-internal-secret') !== secret) {
    return new Response('Forbidden', { status: 403 });
  }

  let body: { valuationId?: string; inputs?: ValuationInputs };
  try {
    body = await req.json();
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const { valuationId, inputs } = body;
  if (!valuationId || !inputs) {
    return new Response('Missing valuationId/inputs', { status: 400 });
  }

  // Background function: corre hasta completarse (15 min límite). La respuesta
  // se ignora por el invocador (ya recibió 202), pero await asegura que Netlify
  // mantiene viva la ejecución hasta el final.
  await runValuation(valuationId, inputs);
  return new Response('done');
};
