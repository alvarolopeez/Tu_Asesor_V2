/**
 * Lib compartida para el generador de valoraciones IA (Brief #016).
 * Hermano de priceAnalysis.ts — NO modifica ese módulo.
 *
 * Exporta: tipos, parser defensivo de ValuationResult JSON, builder de prompt,
 * y applyLowballGuard (red de seguridad anti-infravaloración).
 * Reutiliza extractGroundingUrls de priceAnalysis.ts.
 *
 * ⚠️ No usar responseMimeType:application/json cuando hay grounding (incompatible).
 *    El JSON se exige por prompt y se parsea con parseValuationResponse().
 * ⚠️ Gate del parser: rangos.mercado.precio > 0 (no existe enum como en #015).
 *
 * Prompt v3 (2026-06-13, fix caso "calle Granate"): geolocalización-primero,
 *   anti-lowball por triangulación, búsqueda obligatoria de infraestructura.
 *   Ver docs/sync/SYNC_AI.md.
 */

export { extractGroundingUrls } from './priceAnalysis';
import { formatCatastroBlock } from './catastro';
import type { CatastroLocation } from './catastro';

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

// ─── Red de seguridad anti-lowball ──────────────────────────────────────────────

/**
 * Mediana de una lista de números (>0). Devuelve 0 si la lista está vacía.
 */
function median(nums: number[]): number {
  const arr = nums.filter((n) => n > 0).sort((a, b) => a - b);
  if (arr.length === 0) return 0;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

/**
 * Guard-rail en CÓDIGO contra la infravaloración (el fallo nº1 del caso "Granate":
 * el LLM eligió el comparable más bajo "para no sobrevalorar").
 *
 * Si el €/m² de mercado queda por debajo del 92% de la MEDIANA de los comparables
 * vivos (≥2 fuentes con precio_m2 > 0), NO reescribe el número en silencio — porque
 * el asesor es la autoridad humana — sino que lo MARCA de forma visible: baja la
 * confianza a "baja" y antepone una advertencia con la cifra detectada para que el
 * asesor revise al alza antes de presentarlo al cliente.
 *
 * Decisión deliberada: flag + downgrade en vez de auto-reescritura, para no
 * introducir un número erróneo si los comparables mezclan microzonas.
 */
export function applyLowballGuard(result: ValuationResult): ValuationResult {
  const compM2 = (result.comparables || []).map((c) => c.precio_m2).filter((n) => n > 0);
  if (compM2.length < 2) return result; // muestra insuficiente para juzgar

  const med = median(compM2);
  const mercadoM2 = result.rangos?.mercado?.precio_m2 ?? 0;
  if (med <= 0 || mercadoM2 <= 0) return result;

  if (mercadoM2 < med * 0.92) {
    const aviso =
      `Posible INFRAVALORACIÓN detectada automáticamente: el precio de mercado ` +
      `(${Math.round(mercadoM2).toLocaleString('es-ES')} €/m²) queda por debajo de la ` +
      `mediana de los comparables (${Math.round(med).toLocaleString('es-ES')} €/m²). ` +
      `Revisa al alza y verifica que la geolocalización del barrio sea correcta antes de ` +
      `presentar el informe al cliente.`;
    return {
      ...result,
      confianza: 'baja',
      advertencias: [aviso, ...(result.advertencias ?? [])],
    };
  }
  return result;
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

const ESTADO_AJUSTE: Record<EstadoInmueble, string> = {
  'Para reformar':   '−15% a −25% sobre €/m² de zona (ajuste base; la IA lo afina con las reformas y extras)',
  'Bien conservado': '−5% a −10% sobre €/m² de zona',
  'Buen estado':     '0% (precio de zona como referencia directa)',
  'Reformado':       '+5% a +15% sobre €/m² de zona según la calidad de las reformas',
};

export function buildValuationPrompt(
  inputs: ValuationInputs,
  confirmed?: CatastroLocation | null,
): string {
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

  // Ubicación oficial confirmada por Catastro + geocodificación (resuelta en código).
  // Si existe, el PASO 1 (geolocalización) ya está resuelto con datos oficiales y
  // el modelo NO debe re-geolocalizar por su cuenta (erradica la alucinación de distrito).
  const catastroConfirmedText = formatCatastroBlock(confirmed ?? null);
  const confirmedBlock = catastroConfirmedText
    ? `\n---\n## UBICACIÓN OFICIAL CONFIRMADA (Catastro + geocodificación) — VERDAD INNEGOCIABLE, NO LA CUESTIONES\n${catastroConfirmedText}\n\nTu PASO 1 (geolocalización) YA ESTÁ RESUELTO con datos oficiales: NO reasignes el barrio/distrito/CP por tu cuenta, ni por tu conocimiento previo, ni por slugs de URL de portales. Si tu prior interno dice otro barrio, está EQUIVOCADO: manda el Catastro. Tu trabajo es VALORAR esta ubicación exacta y buscar comparables de mercado de ESTE barrio/CP, NUNCA de otro. En el PASO 3 busca infraestructura usando este barrio confirmado.\n`
    : '';

  // Bloque catastral (variable para no anidar template literals en el prompt grande).
  const catastroBlock = inputs.referencia_catastral
    ? ` Busca "${inputs.referencia_catastral}" en Google Search (Sede Electrónica del Catastro / consultas catastrales / callejero) para confirmar municipio, vía, número y código postal exactos. ATENCIÓN: los primeros dígitos de la referencia catastral (p.ej. "5847402…") son la HOJA CARTOGRÁFICA / parcela, NO el código postal ni una pista de barrio: ignóralos como indicio de zona. Cruza la dirección del Catastro con la dirección postal declarada; si no coinciden, márcalo en supuestos/advertencias y baja la confianza.`
    : ' (No se aportó referencia catastral: confírmalo todo por dirección postal + callejero oficial y baja la confianza si la zona queda ambigua.)';

  return `Eres un tasador inmobiliario senior especializado en Sevilla y el Aljarafe, España. Tu objetivo es estimar el MEJOR PRECIO DE SALIDA al mercado del siguiente inmueble, reflejando el mercado VIVO de 2025-2026 (mercado al alza en Sevilla). Infravalorar es un error TAN GRAVE como sobrevalorar: si sales bajo, el cliente pierde dinero real. Sé NEUTRAL, no "conservador por defecto".

---
## DATOS DEL INMUEBLE
- Localización (declarada por el CRM, A VERIFICAR): ${locationBlock}
- Superficie: **${inputs.m2} m²**
- Tipo: ${inputs.tipo ?? 'piso'}
- Habitaciones: ${inputs.habitaciones ?? '?'} | Baños: ${inputs.banos ?? '?'}
- ${extrasBlock}
- Estado: **${inputs.estado}** (ajuste orientativo: ${ajusteGuia})
- ${reformasBlock}

ATENCIÓN: La "Zona CRM" es una etiqueta interna del asesor, NO una fuente de geolocalización fiable. Verifícala en el PASO 1; si contradice la dirección/catastro/landmarks, gana la realidad sobre la etiqueta.
${confirmedBlock}
---
## MÉTODO OBLIGATORIO — EJECUTA LOS PASOS EN ORDEN. NO emitas ni un solo €/m² antes de completar el PASO 1.

### PASO 1 — GEOLOCALIZACIÓN RIGUROSA (antes de cualquier precio)
${catastroConfirmedText ? 'La ubicación YA está confirmada en el bloque "UBICACIÓN OFICIAL CONFIRMADA" de arriba (Catastro + geocodificación). ÚSALA tal cual: barrio, distrito y CP son definitivos. NO los cuestiones ni los sobrescribas. Solo te queda enriquecer con landmarks físicos y transporte de ESE barrio (pasos 2-5). Salta directo al PASO 2.\n\nSi y solo si el bloque oficial estuviera incompleto, complétalo así:' : ''}No estimes ningún precio hasta haber confirmado **barrio + distrito + código postal reales** con al menos **2 fuentes independientes** (que no sean ambas portales inmobiliarios; máximo una de ellas portal).

1. **La referencia catastral es el LOCALIZADOR PRIMARIO de la ubicación, no un simple "ancla de precio".**${catastroBlock}
2. **Búsquedas de barrio obligatorias y literales** (ejecútalas con Google Search y cita las URLs): "${zonaLabel} qué barrio", "${zonaLabel} código postal", "${zonaLabel} distrito", "${zonaLabel} callejero ayuntamiento Sevilla". Usa el callejero oficial del Ayuntamiento de Sevilla / INE / Catastro como verdad.
3. **PROHIBIDO deducir el barrio o el distrito del slug de una URL de portal** (p.ej. "/venta-viviendas/sevilla/poligono-san-pablo/"). El slug es marketing/SEO y agrega zonas amplias o mal etiquetadas. Si el slug de un portal contradice el callejero oficial o un landmark físico, GANA el callejero/landmark, no el slug.
4. **Jerarquía de evidencia de ubicación** (de mayor a menor): (1) referencia catastral + dirección postal exacta; (2) landmarks físicos verificables (hospital, estación, avenida, parque, estadio); (3) datos oficiales (Catastro, INE, callejero municipal); (4) artículos/portales que NOMBREN el barrio en texto; y MUY por debajo (5) slugs de URL de portales.
5. **Si dudas entre dos barrios/distritos candidatos, enúncialos AMBOS** en supuestos y di qué evidencia (catastro, CP, landmark) descarta uno. No elijas en silencio.
6. **GATE DE CONFIANZA:** si NO logras confirmar barrio+distrito+CP con al menos 2 fuentes independientes, la confianza NO puede ser "alta"; dilo en advertencias.

### PASO 2 — AUTO-CHEQUEO DE COHERENCIA (obligatorio, antes de precios)
Antes de continuar, autoverifica y NO sigas si algo falla:
- **LANDMARK ↔ DISTRITO:** para cada landmark que vayas a citar (hospital, estación, avenida, estadio), busca en qué barrio/distrito está y comprueba que coincide con el distrito que has asignado a la dirección. Ejemplo de fallo a EVITAR: citar "Hospital Virgen Macarena" (distrito Macarena) y a la vez ubicar el piso en "San Pablo-Santa Justa" (a ~3 km). Eso es una incoherencia interna: PÁRATE, re-geolocaliza y corrige el distrito ANTES de poner precio.
- **CP ↔ BARRIO:** el código postal debe ser consistente con el barrio. Si no casan, vuelve a buscar.
- Si tras el chequeo la ubicación sigue siendo ambigua, baja la confianza a "media" o "baja" y dilo en advertencias.

### PASO 3 — INFRAESTRUCTURA Y DRIVERS DE REVALORIZACIÓN (obligatorio)
Una vez fijado el barrio, BUSCA ACTIVAMENTE proyectos de infraestructura o urbanismo en curso o previstos en el barrio CONFIRMADO (PASO 1) y avenidas colindantes. Query obligatoria (usa el BARRIO/DISTRITO CONFIRMADO, NO la etiqueta CRM): "[barrio confirmado], Sevilla — metro tranvía hospital obras regeneración urbana proyecto 2025 2026". Cubre: nuevas líneas/estaciones de metro o tranvía, ampliaciones de hospital, estaciones de cercanías, peatonalizaciones, regeneración urbana, nuevos equipamientos. Para cada driver relevante: indica estado (en construcción / proyectado / finalización prevista) y CUANTIFICA su impacto al alza en el €/m² dentro de factores. Un metro en construcción a pocos metros o un gran hospital colindante son DRIVERS REALES que el mercado ya está poniendo en precio (pricing-in): pesan al ALZA y justifican el techo del rango, NO el suelo. No los minimices ni los omitas: si la zona tiene un driver mayor conocido y no aparece en factores, el informe está incompleto.

### PASO 4 — PRECIO POR TRIANGULACIÓN (SIN sesgo a la baja)
Construye el €/m² de mercado de la **micro-zona confirmada** (no del distrito amplio, que mezcla barrios baratos y caros y tira la media abajo) recogiendo **al menos 3 fuentes** de 2025-2026 con URL real:

1. **Comparables directos de venta cerrada / escriturada** en la misma micro-zona (Registradores, Ministerio de Vivienda, o ventas reales conocidas) — máxima autoridad, peso ~40% si existen.
2. **Portales de oferta viva** (Idealista, Fotocasa, Habitaclia), anuncios de 2025-2026 de la misma calle/CP — reflejan el mercado de HOY, peso ~30%. Captura el rango €/m² (min-max), no un valor puntual.
3. **Tasadoras** (Tinsa, Sociedad de Tasación) — metodología sólida, algo conservadoras (valor hipotecario), buen ancla de techo realista, peso ~20%.
4. **AVM automáticos** (RealAdvisor, Idealista AVM…) — la fuente MÁS débil y MÁS retrasada, SOLO como sanity-check, peso ~10%. ATENCIÓN: un AVM se entrena con escrituras de hace 6-18 meses; en un mercado al alza "recuerda" precios viejos más bajos y SUBVALORA. Un AVM por debajo de la oferta viva NO es "la cifra prudente": es la cifra DESACTUALIZADA (lag). NUNCA fijes el valor con un AVM.

REGLAS DE TRIANGULACIÓN — anti-lowball (de obligado cumplimiento):
- **El €/m² de mercado = MEDIANA de las fuentes válidas de la micro-zona, ponderada hacia el dato MÁS FRESCO y MÁS específico; NUNCA el mínimo.**
- **PROHIBIDO elegir el valor más bajo "para no sobrevalorar" / "para ser prudente".** Esa frase es exactamente la señal del error. Descartar una fuente (alta o baja) exige una razón OBJETIVA en supuestos: (a) es de otra micro-zona, (b) está obsoleta (>12 meses), o (c) es metodológicamente débil (AVM puro sin comparables vivos). No vale "es la más alta, mejor no fiarse".
- **Un comparable de otro barrio NO sirve.** Si una fuente o slug corresponde a un barrio distinto del confirmado en el PASO 1, descártala como comparable directo (anótalo en supuestos).
- **REGLA DE LA VENTA CERRADA:** si conoces un precio de venta real cerrado de ESTE inmueble o de un gemelo, esa cifra es el centro de gravedad; ninguna estimación puede alejarse >10% de ella sin justificación explícita.
- **Descuento oferta→venta:** precio_venta ≈ precio_oferta_vivo × 0,90 (descuento medio ~10%) en mercado normal; × 0,95 en micro-zonas tensionadas / mercado de vendedor (alta demanda, driver de infraestructura entrando). NUNCA apliques descuentos >15% salvo evidencia explícita de inmueble sobreofertado/estancado: un descuento exagerado es lowball encubierto.
- **TEST DE COHERENCIA DE SALIDA (obligatorio):** si tu €/m² final queda por DEBAJO del mínimo de los anuncios vivos de la micro-zona, es lowball casi seguro → RECALCULA AL ALZA, no a la baja. El precio de venta real está típicamente entre el 88% y el 96% de la oferta, NO al 60-70%.
- **El valor más bajo del rango se mapea a "venta_rapida" (liquidación), JAMÁS a "mercado".** Confundir el suelo con el mercado es el error nº1 a erradicar.

### PASO 5 — AJUSTE POR ESTADO Y EXTRAS
Aplica el ajuste por estado sobre el €/m² de mercado de la micro-zona:
- **"Para reformar":** busca comparables de pisos SIN REFORMAR en la misma zona. El comprador descuenta la reforma (integral en Sevilla: 700-1.000 EUR/m²). Calcula precio = (€/m² en buen estado - coste_reforma) × m², no un porcentaje fijo a ojo.
- **"Bien conservado" / "Buen estado" / "Reformado":** NO descuentes como si necesitara reforma. "Buen estado" toma el €/m² de zona como referencia DIRECTA (ajuste 0%); "Reformado" va por ENCIMA de la media. Restar coste de reforma a un piso en buen estado es un error de subvaloración.
Documenta supuestos (m² útiles vs construidos, coste reforma, etc.) en supuestos. Refleja extras y factores diferenciales en factores con cuantificación en €/m² cuando puedas. NUNCA inventes comparables: cada fuente debe tener URL real.

Definición de los 3 rangos:
- **venta_rapida**: -5/-10% sobre mercado (suelo / liquidación). Cierre ~20-26 días.
- **mercado**: precio realista = mediana triangulada de la micro-zona, ajustado por estado/reformas/drivers. ESTE es el precio de salida recomendado.
- **premium**: +5/+10% si hay extras diferenciales claros o driver de revalorización fuerte. Más tiempo de espera.

---
## FORMATO DE RESPUESTA — SIGUE ESTE ORDEN SIN EXCEPCIONES

**PRIMERO** (antes de cualquier otra cosa): el bloque JSON. Empiézalo con una línea que contenga exactamente tres acentos graves seguidos de la palabra json, y CIÉRRALO con una línea que contenga exactamente tres acentos graves ANTES de empezar las secciones markdown. No escribas absolutamente nada delante del JSON.

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
  "comparables": [{"fuente": "nombre del portal/tasadora", "precio_m2": 0, "url": "https://..."}],
  "factores": ["<driver de infraestructura si existe>: +X €/m²", "<extra del inmueble, p.ej. parking/terraza>: +Y €/m²", "<factor que resta, p.ej. planta baja/sin ascensor>: -Z €/m²"],
  "supuestos": ["Barrio confirmado: <barrio> (distrito <distrito>, CP <cp>), verificado con <fuente1> y <fuente2>", "AVM <fuente> descartado por lag/zona distinta", "m² útiles ~ 90% construidos"],
  "advertencias": []
}
\`\`\`

**DESPUÉS del JSON** (con la valla ya cerrada): informe en markdown con estas secciones obligatorias (máximo 800 palabras total):

## ANÁLISIS DE ZONA
Indica el **barrio, distrito y código postal confirmados** y con qué fuentes lo confirmaste (PASO 1). Describe el perfil del barrio y calidad de vida. Transporte público en 500 m (autobús, metro, tranvía, cercanías) con paradas concretas. Servicios cercanos (colegios, supermercados, parques, centro de salud, farmacia) y landmarks físicos (hospital, estadio, estación). **Proyectos de infraestructura/urbanismo en curso o previstos** (PASO 3) con su estado y plazo. Si hubo incoherencia geográfica o ambigüedad, explica cómo la resolviste.

## ANÁLISIS DE MERCADO
€/m² de venta 2025-2026 en esta **micro-zona concreta** (fuente y URL por cada dato). Evolución de los últimos 12 meses en el barrio. Explica la TRIANGULACIÓN: qué fuentes usaste, cuál fue la mediana, qué descartaste y POR QUÉ (razón objetiva, nunca "para no sobrevalorar"). Si hay datos de pisos sin reformar, cítalos. Deja claro por qué el precio NO es el mínimo de las fuentes.

## FACTORES DEL INMUEBLE
Aspectos concretos que suben el valor vs la media de zona (incluidos los drivers de revalorización del PASO 3, cuantificados en €/m²) y los que lo bajan.

## CONCLUSIÓN
Resumen de la valoración y recomendación de estrategia de precio de salida, con justificación. Confirma explícitamente que el precio recomendado supera el test de coherencia de salida (no queda por debajo de la oferta viva de la micro-zona).
`;
}
