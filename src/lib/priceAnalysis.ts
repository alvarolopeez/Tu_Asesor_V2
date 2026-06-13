/**
 * Lib compartida para el generador de informes de rebaja (Brief #015).
 *
 * Exporta: tipos, parser defensivo de veredicto JSON, extractor de URLs de
 * grounding, builder de contexto y builder de prompt.
 *
 * ⚠️ No usar responseMimeType:application/json cuando hay grounding (incompatible).
 *    El JSON se exige por prompt y se parsea con parsePriceAnalysisResponse().
 */

import type { PriceDropEstimate } from '@/components/admin/sections/dashboard/operaciones/operacionesUtils';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface PriceComparable {
  fuente: string;
  precio_m2: number;
  url?: string;
}

export interface PriceVerdicto {
  veredicto: 'caro' | 'ajustado' | 'correcto';
  sobreprecio_pct: number;
  precio_recomendado: number;
  rebaja_eur: number;
  rebaja_pct_low: number;
  rebaja_pct_high: number;
  confianza: 'alta' | 'media' | 'baja';
  comparables: PriceComparable[];
  motivos: string[];
}

export interface PriceAnalysisContext {
  property: {
    id: string;
    title: string;
    price: number;
    sqm: number | null;
    rooms: number | null;
    baths: number | null;
    zone: string | null;
    address: string | null;
    days_on_market: number | null;
    price_per_sqm: number | null;
    published_at: string | null;
  };
  agent_valuation: number | null;
  appointments: {
    completed: number;
    pending: number;
    cancelled: number;
    notes: string[];
  };
  buyer_feedback: Array<{
    event_type: string;
    title: string;
    notes: string | null;
    event_date: string;
  }>;
  web_visits: number;
  diffusion_impacts: number;
  internal_comparables: Array<{
    id: string;
    price: number;
    sqm: number | null;
    price_per_sqm: number | null;
    zone: string | null;
  }>;
  heuristic_estimate: PriceDropEstimate | null;
}

// ─── Parseo defensivo ─────────────────────────────────────────────────────────

/**
 * Extrae el primer bloque JSON válido de la respuesta del LLM.
 * Cascada: strip fences → JSON.parse → rescate {..} → null.
 */
export function parsePriceAnalysisResponse(raw: string): PriceVerdicto | null {
  let jsonStr = (raw || '').trim();

  const codeFence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeFence) jsonStr = codeFence[1];

  const tryParse = (s: string): Record<string, unknown> | null => {
    try { return JSON.parse(s) as Record<string, unknown>; } catch { return null; }
  };

  let parsed = tryParse(jsonStr);
  if (!parsed) {
    const start = jsonStr.indexOf('{');
    const end = jsonStr.lastIndexOf('}');
    if (start !== -1 && end > start) parsed = tryParse(jsonStr.slice(start, end + 1));
  }
  if (!parsed) return null;

  const v = parsed.veredicto as string | undefined;
  if (!v || !['caro', 'ajustado', 'correcto'].includes(v)) return null;

  return {
    veredicto: v as PriceVerdicto['veredicto'],
    sobreprecio_pct: Number(parsed.sobreprecio_pct ?? 0),
    precio_recomendado: Number(parsed.precio_recomendado ?? 0),
    rebaja_eur: Number(parsed.rebaja_eur ?? 0),
    rebaja_pct_low: Number(parsed.rebaja_pct_low ?? 0),
    rebaja_pct_high: Number(parsed.rebaja_pct_high ?? 0),
    confianza: (['alta', 'media', 'baja'].includes(parsed.confianza as string)
      ? parsed.confianza
      : 'baja') as PriceVerdicto['confianza'],
    comparables: Array.isArray(parsed.comparables)
      ? (parsed.comparables as any[]).map((c) => ({
          fuente: String(c.fuente ?? ''),
          precio_m2: Number(c.precio_m2 ?? 0),
          url: c.url ? String(c.url) : undefined,
        }))
      : [],
    motivos: Array.isArray(parsed.motivos)
      ? (parsed.motivos as unknown[]).map(String)
      : [],
  };
}

/** Extrae las URLs de grounding de la respuesta de Gemini 2.x/3.x. */
export function extractGroundingUrls(data: Record<string, any>): string[] {
  const chunks = data?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks)) return [];
  return Array.from(
    new Set(
      (chunks as any[])
        .map((c) => c?.web?.uri)
        .filter((u): u is string => typeof u === 'string' && u.length > 0),
    ),
  );
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

export function buildPriceAnalysisPrompt(ctx: PriceAnalysisContext): string {
  const sqmLabel = ctx.property.sqm
    ? `${ctx.property.sqm} m² (${ctx.property.price_per_sqm?.toLocaleString() ?? '?'} €/m²)`
    : 'desconocidos';
  const zonaLabel = ctx.property.zone || ctx.property.address || 'zona no especificada';
  const diasLabel =
    ctx.property.days_on_market !== null
      ? `${ctx.property.days_on_market} días`
      : 'sin publicar';
  const valorAsesor = ctx.agent_valuation
    ? `${ctx.agent_valuation.toLocaleString()} €`
    : 'no disponible';

  const feedbackBlock =
    ctx.buyer_feedback.length > 0
      ? ctx.buyer_feedback
          .slice(0, 15)
          .map((f) => `- [${f.event_type}] ${f.title}${f.notes ? ': ' + f.notes : ''}`)
          .join('\n')
      : 'Sin registros de feedback de compradores.';

  const internalComp =
    ctx.internal_comparables.length > 0
      ? ctx.internal_comparables
          .slice(0, 8)
          .map(
            (c) =>
              `- ${c.price.toLocaleString()} € | ${c.sqm ?? '?'} m² | ${c.price_per_sqm?.toLocaleString() ?? '?'} €/m² | zona: ${c.zone ?? 'desconocida'}`,
          )
          .join('\n')
      : 'Sin comparables internos activos en la plataforma.';

  return `Eres un tasador inmobiliario senior especializado en Sevilla, España. Analiza el siguiente inmueble y produce:
1. Un informe en **markdown** con: diagnóstico de mercado, análisis de feedback de compradores, señales de demanda y recomendación de precio.
2. Al FINAL, un bloque \`\`\`json con el veredicto estructurado.

---
## DATOS DEL INMUEBLE
- Título: ${ctx.property.title}
- Precio de publicación: ${ctx.property.price.toLocaleString()} €
- Superficie: ${sqmLabel}
- Habitaciones: ${ctx.property.rooms ?? '?'} | Baños: ${ctx.property.baths ?? '?'}
- Zona: ${zonaLabel}
- Días en mercado: ${diasLabel} (óptimo de cierre: 26 días)
- Valoración del asesor: ${valorAsesor}

## SEÑALES CRM
- Visitas físicas completadas: ${ctx.appointments.completed} | pendientes: ${ctx.appointments.pending} | canceladas: ${ctx.appointments.cancelled}
- Visitas web al detalle del inmueble: ${ctx.web_visits}
- Impactos de difusión WhatsApp: ${ctx.diffusion_impacts}
- Notas de citas: ${ctx.appointments.notes.length > 0 ? ctx.appointments.notes.join(' / ') : 'ninguna'}

## FEEDBACK DE COMPRADORES (buyer_activity_logs)
${feedbackBlock}

## COMPARABLES INTERNOS (plataforma)
${internalComp}

## INSTRUCCIONES
- Usa la herramienta de búsqueda de Google para encontrar precios reales de €/m² de venta en ${zonaLabel}, Sevilla (Idealista, Fotocasa, Habitaclia, portales inmobiliarios). Cita siempre la URL.
- Si el inmueble está claramente caro, dilo sin rodeos con la cifra exacta. Si el feedback de compradores menciona que está caro, cítalo literalmente.
- Si los datos son insuficientes (poco tiempo en mercado, sin señales), di explícitamente "datos insuficientes" y usa veredicto "ajustado" con confianza "baja".
- NUNCA inventes comparables ni cifras. Cada €/m² de mercado debe tener fuente real.
- Tono: ejecutivo, directo, en castellano de España. Máximo 600 palabras de análisis.

Al final del informe incluye OBLIGATORIAMENTE este bloque JSON:
\`\`\`json
{
  "veredicto": "caro|ajustado|correcto",
  "sobreprecio_pct": 0.0,
  "precio_recomendado": 0,
  "rebaja_eur": 0,
  "rebaja_pct_low": 0.0,
  "rebaja_pct_high": 0.0,
  "confianza": "alta|media|baja",
  "comparables": [{"fuente": "nombre del portal", "precio_m2": 0, "url": "https://..."}],
  "motivos": ["motivo 1", "motivo 2"]
}
\`\`\`
`;
}
