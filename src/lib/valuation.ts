/**
 * Lib compartida para el generador de valoraciones IA (Brief #016).
 * Hermano de priceAnalysis.ts — NO modifica ese módulo.
 *
 * Exporta: tipos, parser defensivo de ValuationResult JSON, builder de prompt.
 * Reutiliza extractGroundingUrls de priceAnalysis.ts.
 *
 * ⚠️ No usar responseMimeType:application/json cuando hay grounding (incompatible).
 *    El JSON se exige por prompt y se parsea con parseValuationResponse().
 * ⚠️ Gate del parser: rangos.mercado.precio > 0 (no existe enum como en #015).
 */

export { extractGroundingUrls } from './priceAnalysis';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type EstadoInmueble = 'Para reformar' | 'Bien conservado' | 'Buen estado' | 'Reformado';
export type TipoInmueble = 'piso' | 'casa' | 'local' | 'otro';
export type ConfianzaLevel = 'alta' | 'media' | 'baja';

export interface ValuationInputs {
  direccion?: string;
  referencia_catastral?: string;
  zona?: string;
  m2: number;
  habitaciones?: number;
  banos?: number;
  planta?: string;
  ascensor?: boolean;
  tipo?: TipoInmueble;
  ano?: number;
  estado: EstadoInmueble;
  reformas_extras?: string;
  property_id?: string;
}

export interface ValuationRange {
  precio: number;
  precio_m2: number;
  dias_estimados: number;
  justificacion: string;
}

export interface ValuationResult {
  precio_m2_zona: number;
  precio_m2_zona_rango?: { min: number; max: number };
  estado_ajuste_pct: number;
  rangos: {
    venta_rapida: ValuationRange;
    mercado: ValuationRange;
    premium: ValuationRange;
  };
  confianza: ConfianzaLevel;
  comparables: { fuente: string; precio_m2: number; url?: string }[];
  factores: string[];
  supuestos?: string[];
  advertencias?: string[];
}

// ─── Parseo defensivo ─────────────────────────────────────────────────────────

/**
 * Extrae el primer bloque JSON válido de la respuesta del LLM.
 * Cascada: strip fences → JSON.parse → rescate {..} → null.
 * Gate: rangos.mercado.precio > 0 (si no hay precio de mercado válido → null).
 */
export function parseValuationResponse(raw: string): ValuationResult | null {
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

  const rangos = parsed.rangos as Record<string, any> | undefined;
  if (!rangos) return null;

  const mercadoPrecio = Number(rangos.mercado?.precio ?? 0);
  if (mercadoPrecio <= 0) return null;

  const parseRange = (r: any): ValuationRange => ({
    precio: Number(r?.precio ?? 0),
    precio_m2: Number(r?.precio_m2 ?? 0),
    dias_estimados: Number(r?.dias_estimados ?? 0),
    justificacion: String(r?.justificacion ?? ''),
  });

  const zonaRangoRaw = parsed.precio_m2_zona_rango as Record<string, any> | undefined;

  return {
    precio_m2_zona: Number(parsed.precio_m2_zona ?? 0),
    precio_m2_zona_rango: zonaRangoRaw
      ? { min: Number(zonaRangoRaw.min ?? 0), max: Number(zonaRangoRaw.max ?? 0) }
      : undefined,
    estado_ajuste_pct: Number(parsed.estado_ajuste_pct ?? 0),
    rangos: {
      venta_rapida: parseRange(rangos.venta_rapida),
      mercado: parseRange(rangos.mercado),
      premium: parseRange(rangos.premium),
    },
    confianza: (['alta', 'media', 'baja'].includes(parsed.confianza as string)
      ? parsed.confianza
      : 'baja') as ConfianzaLevel,
    comparables: Array.isArray(parsed.comparables)
      ? (parsed.comparables as any[]).map((c) => ({
          fuente: String(c.fuente ?? ''),
          precio_m2: Number(c.precio_m2 ?? 0),
          url: c.url ? String(c.url) : undefined,
        }))
      : [],
    factores: Array.isArray(parsed.factores)
      ? (parsed.factores as unknown[]).map(String)
      : [],
    supuestos: Array.isArray(parsed.supuestos)
      ? (parsed.supuestos as unknown[]).map(String)
      : undefined,
    advertencias: Array.isArray(parsed.advertencias)
      ? (parsed.advertencias as unknown[]).map(String)
      : undefined,
  };
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

const ESTADO_AJUSTE: Record<EstadoInmueble, string> = {
  'Para reformar':   '−15% a −25% sobre €/m² de zona (ajuste base; la IA lo afina con las reformas y extras)',
  'Bien conservado': '−5% a −10% sobre €/m² de zona',
  'Buen estado':     '0% (precio de zona como referencia directa)',
  'Reformado':       '+5% a +15% sobre €/m² de zona según la calidad de las reformas',
};

export function buildValuationPrompt(inputs: ValuationInputs): string {
  const locationParts: string[] = [];
  if (inputs.direccion) locationParts.push(`Dirección: ${inputs.direccion}`);
  if (inputs.referencia_catastral) locationParts.push(`Ref. catastral: ${inputs.referencia_catastral}`);
  if (inputs.zona) locationParts.push(`Zona CRM: ${inputs.zona}`);
  const locationBlock = locationParts.join(' | ') || 'No especificada';
  const zonaLabel = inputs.zona || inputs.direccion || 'Sevilla';

  const extras: string[] = [];
  if (inputs.planta) extras.push(`Planta: ${inputs.planta}`);
  if (inputs.ascensor !== undefined) extras.push(`Ascensor: ${inputs.ascensor ? 'Sí' : 'No'}`);
  if (inputs.ano) extras.push(`Año construcción: ${inputs.ano}`);
  const extrasBlock = extras.length > 0 ? extras.join(' | ') : 'No indicados';

  const reformasBlock = inputs.reformas_extras?.trim()
    ? `Reformas y extras: ${inputs.reformas_extras}`
    : 'Sin reformas adicionales indicadas.';

  const ajusteGuia = ESTADO_AJUSTE[inputs.estado] ?? '0%';

  return `Eres un tasador inmobiliario senior especializado en Sevilla y el Aljarafe, España. Tu misión es estimar el **mejor precio de salida al mercado** de un inmueble aún no publicado.

Produce:
1. Un **informe de valoración en markdown** explicando PASO A PASO la cuenta: €/m² zona → rango zona → ajuste por estado → ajuste por reformas/extras → 3 rangos de precio. Usa fuentes reales; cita las URLs.
2. Al FINAL, un bloque \`\`\`json con la valoración estructurada.

---
## DATOS DEL INMUEBLE
- Localización: ${locationBlock}
- Superficie: **${inputs.m2} m²**
- Tipo: ${inputs.tipo ?? 'piso'}
- Habitaciones: ${inputs.habitaciones ?? '?'} | Baños: ${inputs.banos ?? '?'}
- ${extrasBlock}
- Estado: **${inputs.estado}** (ajuste orientativo: ${ajusteGuia})
- ${reformasBlock}

---
## INSTRUCCIONES
- Usa Google Search para encontrar €/m² reales de venta en **${zonaLabel}** (Idealista, Fotocasa, Habitaclia, portales inmobiliarios). Cita SIEMPRE la URL de cada fuente.
- Busca el **rango de €/m²** de la zona (min–max), no solo un valor puntual.
${inputs.referencia_catastral ? `- Busca el valor de referencia del Catastro para la ref. catastral "${inputs.referencia_catastral}" como ancla objetiva de sanidad (no es el precio de venta).` : ''}
- Consulta índices de escrituración recientes: Registradores de la Propiedad, Tinsa, Ministerio de Vivienda.
- Explica la cuenta PASO A PASO: €/m² zona → ajuste por estado → ajuste por reformas → precio total.
- Registra los **supuestos** que estás asumiendo (coste de reforma, m² útiles vs construidos, etc.) para que el asesor pueda corregirlos.
- Si hay factores que aumentan o disminuyen el precio (reforma cocina, planta alta sin ascensor, orientación, etc.), listarlos en \`factores\`.
- Si la zona tiene pocos datos o la dirección es ambigua, anótalo en \`advertencias\` y baja la confianza.
- NUNCA inventes comparables. Cada €/m² de mercado debe tener fuente real con URL.
- Tono: ejecutivo, directo, en castellano de España. Máximo 500 palabras de análisis.

---
## DEFINICIÓN DE LOS 3 RANGOS (precio de salida)
- **venta_rapida**: −5/−10% sobre el precio de mercado realista. Objetivo: cierre ~20-26 días.
- **mercado**: precio realista ajustado por zona + estado + reformas. Días estimados según demanda del barrio.
- **premium**: +5/+10% si el inmueble tiene extras diferenciales claros. Requiere más tiempo de espera.

Cada rango: € total, €/m², días estimados y justificación breve.

---
Al final del informe incluye OBLIGATORIAMENTE este bloque JSON (sin texto después):
\`\`\`json
{
  "precio_m2_zona": 0,
  "precio_m2_zona_rango": {"min": 0, "max": 0},
  "estado_ajuste_pct": 0.0,
  "rangos": {
    "venta_rapida": {"precio": 0, "precio_m2": 0, "dias_estimados": 0, "justificacion": ""},
    "mercado":      {"precio": 0, "precio_m2": 0, "dias_estimados": 0, "justificacion": ""},
    "premium":      {"precio": 0, "precio_m2": 0, "dias_estimados": 0, "justificacion": ""}
  },
  "confianza": "alta|media|baja",
  "comparables": [{"fuente": "nombre del portal", "precio_m2": 0, "url": "https://..."}],
  "factores": ["reforma cocina suma X €/m²", "planta sin ascensor resta Y €/m²"],
  "supuestos": ["coste reforma estimado en X €/m²", "m² útiles = 90% construidos"],
  "advertencias": []
}
\`\`\`
`;
}
