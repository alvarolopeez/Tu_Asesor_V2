import type { PropertyRow, LeadRow, BuyerDemandRow, EncargoRow, SellerActivityLogRow } from "../types";

/** Días reales en el mercado = hoy − published_at. Null si aún no publicada. */
export function daysOnMarket(p: PropertyRow): number | null {
  if (!p.published_at) return null;
  const ms = Date.now() - new Date(p.published_at).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

// ─── Constantes compartidas ────────────────────────────────────

/** Óptimo de cierre en días. Única fuente de verdad para el gráfico y la heurística de rebaja. */
export const OPTIMO_CIERRE_DIAS = 26;

/** Franjas de precio estándar compartidas entre T2 (mercado) y T4 (crecimiento). */
export const PRICE_RANGES: ReadonlyArray<{ label: string; min: number; max: number }> = [
  { label: "< 150k",    min: 0,       max: 150_000 },
  { label: "150k-250k", min: 150_000, max: 250_000 },
  { label: "250k-350k", min: 250_000, max: 350_000 },
  { label: "350k-500k", min: 350_000, max: 500_000 },
  { label: "500k-700k", min: 500_000, max: 700_000 },
  { label: "> 700k",    min: 700_000, max: Infinity },
];

// ─── 1. Pipeline de propietarios ──────────────────────────────

export interface PipelineMap {
  nuevos: number;
  contactados: number;
  adquisiciones: number;
}

/** Legacy 3-stage pipeline. Mantenido por compatibilidad. */
export function computePipeline(sellerLeads: LeadRow[]): PipelineMap {
  return {
    nuevos: sellerLeads.filter(s => s.status === "new").length,
    contactados: sellerLeads.filter(s => s.status === "contacted").length,
    adquisiciones: sellerLeads.filter(s => s.status === "closed").length,
  };
}

export interface OwnerPipelineStage {
  key: string;
  label: string;
  count: number;
  color: string;
}

/**
 * Pipeline extendido de 6 etapas con filtro de fechas.
 *
 * Etapas y fuentes de datos:
 * 1. Nuevo Lead           — leads.status='new'           (created_at)
 * 2. Contacto Establecido — leads.status='contacted'     (created_at)
 * 3. Adquisición Hecha    — leads.status='closed'        (created_at) — acuerdo operativo
 * 4. Encargo Firmado      — encargos.fecha_firma≠null    (fecha_firma) — documento legal firmado
 * 5. Contrato Privado     — seller_activity_logs con event_type='Contrato privado' (event_date)
 * 6. Cerrado / Vendido    — encargos.status='vendido'    (updated_at)
 *
 * "Adquisición Hecha" y "Encargo Firmado" son hitos distintos: el primero es el cierre
 * comercial (lead marcado closed), el segundo es la firma del documento jurídico.
 * Si dateRange.from y .to son null, se muestran todos los registros sin filtro.
 */
export function computeOwnerPipeline(
  sellerLeads: LeadRow[],
  encargos: EncargoRow[],
  sellerActivityLogs: SellerActivityLogRow[],
  dateRange: { from: Date | null; to: Date | null },
): OwnerPipelineStage[] {
  const { from, to } = dateRange;
  const noFilter = !from && !to;

  function inRange(dateStr: string | null | undefined): boolean {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (from && d < from) return false;
    if (to) {
      const toEnd = new Date(to);
      toEnd.setHours(23, 59, 59, 999);
      if (d > toEnd) return false;
    }
    return true;
  }

  const pass = (dateStr: string | null | undefined) => noFilter || inRange(dateStr);

  return [
    {
      key: "nuevos",
      label: "Nuevo Lead",
      count: sellerLeads.filter(s => s.status === "new" && pass(s.created_at)).length,
      color: "bg-blue-500",
    },
    {
      key: "contactados",
      label: "Contacto Establecido",
      count: sellerLeads.filter(s => s.status === "contacted" && pass(s.created_at)).length,
      color: "bg-indigo-500",
    },
    {
      key: "adquisiciones",
      label: "Adquisición Hecha",
      count: sellerLeads.filter(s => s.status === "closed" && pass(s.created_at)).length,
      color: "bg-cyan-500",
    },
    {
      key: "encargosFirmados",
      label: "Encargo Firmado",
      count: encargos.filter(e => e.fecha_firma && pass(e.fecha_firma)).length,
      color: "bg-emerald-500",
    },
    {
      key: "contratosFirmados",
      label: "Contrato Privado Firmado",
      count: sellerActivityLogs.filter(l => l.event_type === "Contrato privado" && pass(l.event_date)).length,
      color: "bg-amber-500",
    },
    {
      key: "vendidos",
      label: "Cerrado / Vendido",
      count: encargos.filter(e => e.status === "vendido" && pass(e.updated_at)).length,
      color: "bg-green-500",
    },
  ];
}

// ─── 2. Días en mercado por rango de precio ──────────────────

export interface MarketDayRange {
  label: string;
  avg: number;
}

function generateBucketRanges(
  bucketSize: number,
): Array<{ label: string; min: number; max: number }> {
  const cap = bucketSize * 15; // top bucket starts at 15× el bucket
  const ranges: Array<{ label: string; min: number; max: number }> = [];
  for (let min = 0; min < cap; min += bucketSize) {
    const max = min + bucketSize;
    const kMin = min / 1000;
    const kMax = max / 1000;
    ranges.push({ label: min === 0 ? `< ${kMax}k` : `${kMin}k-${kMax}k`, min, max });
  }
  ranges.push({ label: `> ${cap / 1000}k`, min: cap, max: Infinity });
  return ranges;
}

export function computeMarketDays(
  properties: PropertyRow[],
  opts?: {
    ranges?: ReadonlyArray<{ label: string; min: number; max: number }>;
    year?: number;
    bucketSize?: number;
  },
): MarketDayRange[] {
  let ranges: ReadonlyArray<{ label: string; min: number; max: number }> = opts?.ranges ?? PRICE_RANGES;
  if (opts?.bucketSize && opts.bucketSize > 0) {
    ranges = generateBucketRanges(opts.bucketSize);
  }

  let filtered = properties;
  if (opts?.year) {
    filtered = properties.filter(p => {
      const d = p.published_at ? new Date(p.published_at) : new Date(p.created_at);
      return d.getFullYear() === opts.year!;
    });
  }

  return ranges.map(range => {
    const matched = filtered
      .filter(p => p.price >= range.min && p.price < range.max)
      .map(daysOnMarket)
      .filter((d): d is number => d !== null);
    const avg =
      matched.length > 0
        ? Math.round(matched.reduce((acc, d) => acc + d, 0) / matched.length)
        : 0;
    return { label: range.label, avg };
  });
}

// ─── 3. Demanda por zonas (top 10 global) ────────────────────

export interface ZoneDemandItem {
  zone: string;
  count: number;
  avgBudget: number;
}

/** Alias para compatibilidad con SevillaDemandChart. */
export type SevillaDemandItem = ZoneDemandItem;

/**
 * Top 10 zonas con más compradores activos, basado en buyers_demands.preferred_zones.
 * Una demand puede sumar a varias zonas si tiene múltiples preferred_zones.
 * Solo cuenta demands con status='Activo'.
 */
export function computeZoneDemand(buyersDemands: BuyerDemandRow[]): ZoneDemandItem[] {
  const active = buyersDemands.filter(d => d.status === "Activo");
  const zoneMap = new Map<string, { count: number; totalBudget: number }>();

  active.forEach(demand => {
    const zones = demand.preferred_zones ?? [];
    zones.forEach(zone => {
      const z = zone.trim();
      if (!z) return;
      const entry = zoneMap.get(z) ?? { count: 0, totalBudget: 0 };
      entry.count += 1;
      entry.totalBudget += demand.max_budget ?? 0;
      zoneMap.set(z, entry);
    });
  });

  const result: ZoneDemandItem[] = [];
  zoneMap.forEach((val, zone) => {
    result.push({
      zone,
      count: val.count,
      avgBudget: val.count > 0 ? Math.round(val.totalBudget / val.count) : 0,
    });
  });

  return result.sort((a, b) => b.count - a.count).slice(0, 10);
}

/** @deprecated La fuente correcta es buyers_demands.preferred_zones. Usa computeZoneDemand. */
export function computeSevillaDemand(_buyerLeads: LeadRow[]): ZoneDemandItem[] {
  return [];
}

// ─── 4. Crecimiento de compradores (interactivo) ─────────────

export interface GrowthDatum {
  label: string;
  count: number;
  total: number;
}

export type GrowthGranularity = "day" | "week" | "month" | "year";

interface TimeBucket {
  key: string;
  label: string;
  count: number;
}

function isoWeekMonday(d: Date): Date {
  const monday = new Date(d);
  const dow = d.getDay();
  monday.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function toBucketKey(d: Date, g: GrowthGranularity): string {
  if (g === "day") return d.toISOString().slice(0, 10);
  if (g === "week") return isoWeekMonday(d).toISOString().slice(0, 10);
  if (g === "month") return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return `${d.getFullYear()}`;
}

const MONTH_NAMES_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function toBucketLabel(key: string, g: GrowthGranularity): string {
  if (g === "day" || g === "week") {
    const d = new Date(key + "T12:00:00Z");
    return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
  }
  if (g === "month") {
    const [yr, mo] = key.split("-");
    return `${MONTH_NAMES_SHORT[Number(mo) - 1]} ${yr.slice(2)}`;
  }
  return key;
}

function buildTimeBuckets(from: Date, to: Date, g: GrowthGranularity): TimeBucket[] {
  const buckets: TimeBucket[] = [];
  const seen = new Set<string>();
  const cur = new Date(from);
  cur.setHours(0, 0, 0, 0);
  const toEnd = new Date(to);
  toEnd.setHours(23, 59, 59, 999);

  while (cur <= toEnd) {
    const key = toBucketKey(cur, g);
    if (!seen.has(key)) {
      seen.add(key);
      buckets.push({ key, label: toBucketLabel(key, g), count: 0 });
    }
    if (g === "day") cur.setDate(cur.getDate() + 1);
    else if (g === "week") cur.setDate(cur.getDate() + 7);
    else if (g === "month") cur.setMonth(cur.getMonth() + 1);
    else cur.setFullYear(cur.getFullYear() + 1);
  }

  return buckets;
}

function defaultFromDate(g: GrowthGranularity): Date {
  const now = new Date();
  if (g === "day") return new Date(now.getTime() - 6 * 86_400_000);
  if (g === "week") {
    const d = new Date(now);
    d.setDate(now.getDate() - 11 * 7);
    return d;
  }
  if (g === "month") return new Date(now.getFullYear(), now.getMonth() - 5, 1);
  return new Date(now.getFullYear() - 4, 0, 1);
}

/**
 * Crecimiento acumulado de compradores por granularidad temporal y rango de precio.
 * Fuente: buyers_demands.created_at + max_budget (en lugar de leads.created_at).
 */
export function computeGrowth(
  buyersDemands: BuyerDemandRow[],
  opts?: {
    granularity?: GrowthGranularity;
    from?: Date;
    to?: Date;
    priceMin?: number;
    priceMax?: number;
  },
): GrowthDatum[] {
  const g = opts?.granularity ?? "month";
  const from = opts?.from ?? defaultFromDate(g);
  const to = opts?.to ?? new Date();

  let demands = buyersDemands;
  if (opts?.priceMin !== undefined) demands = demands.filter(d => d.max_budget >= opts.priceMin!);
  if (opts?.priceMax !== undefined && isFinite(opts.priceMax)) {
    demands = demands.filter(d => d.max_budget < opts.priceMax!);
  }

  const buckets = buildTimeBuckets(from, to, g);
  const bucketIdx = new Map(buckets.map((b, i) => [b.key, i]));

  demands.forEach(demand => {
    if (!demand.created_at) return;
    const d = new Date(demand.created_at);
    if (d < from || d > to) return;
    const key = toBucketKey(d, g);
    const idx = bucketIdx.get(key);
    if (idx !== undefined) buckets[idx].count += 1;
  });

  let cumulative = 0;
  return buckets.map(b => {
    cumulative += b.count;
    return { label: b.label, count: b.count, total: cumulative };
  });
}

// ─── 5. Perfil financiero e intención de compra ──────────────

export interface BuyerProfiles {
  sinEstudioCount: number;
  estudioHechoCount: number;
  preconcedidaCount: number;
  contadoCount: number;
  habitualCount: number;
  inversionCount: number;
  totalFinCount: number;
  totalIntentCount: number;
}

/**
 * Perfil de compradores activos desde buyers_demands.
 *
 * Capacidad financiera (desde funding_type):
 *   'Hipoteca' → subcategoría desde lead.preferences; sin detalle → "sin estudio" (conservador).
 *   'Contado'  → "al contado".
 *
 * Propósito de adquisición:
 *   Si lead.preferences.tipo_compra está confirmado → prevalece.
 *   Regla de fallback: Hipoteca → Habitual; Contado → Inversión.
 */
export function computeBuyerProfiles(
  buyersDemands: BuyerDemandRow[],
  allLeads?: LeadRow[],
): BuyerProfiles {
  const active = buyersDemands.filter(d => d.status === "Activo");

  const leadMap = new Map<string, LeadRow>();
  (allLeads ?? []).forEach(l => leadMap.set(l.id, l));

  let sinEstudioCount = 0;
  let estudioHechoCount = 0;
  let preconcedidaCount = 0;
  let contadoCount = 0;
  let habitualCount = 0;
  let inversionCount = 0;

  active.forEach(demand => {
    const ft = demand.funding_type;
    const lead = demand.lead_id ? leadMap.get(demand.lead_id) : undefined;
    const prefs = (lead?.preferences ?? {}) as Record<string, unknown>;

    // ─── Capacidad financiera ─────────────────────────────────
    if (ft === "Contado") {
      contadoCount += 1;
    } else if (ft === "Hipoteca") {
      const finProfile = prefs.perfil_financiero as string | undefined;
      const mortgageStatus = prefs.mortgageStatus as string | undefined;
      if (finProfile === "preconcedida" || mortgageStatus === "Preconcedida") {
        preconcedidaCount += 1;
      } else if (finProfile === "estudio_hecho") {
        estudioHechoCount += 1;
      } else {
        sinEstudioCount += 1; // conservador: sin detalle → sin estudio
      }
    }
    // Si funding_type es null/otro → no se clasifica (esperando dato).

    // ─── Propósito de adquisición ────────────────────────────
    const tipoCompra = prefs.tipo_compra as string | undefined;
    if (tipoCompra === "habitual") {
      habitualCount += 1;
    } else if (tipoCompra === "inversion") {
      inversionCount += 1;
    } else {
      // Regla de fallback de Álvaro: Hipoteca → Habitual; Contado → Inversión.
      if (ft === "Hipoteca") habitualCount += 1;
      else if (ft === "Contado") inversionCount += 1;
    }
  });

  return {
    sinEstudioCount,
    estudioHechoCount,
    preconcedidaCount,
    contadoCount,
    habitualCount,
    inversionCount,
    totalFinCount: sinEstudioCount + estudioHechoCount + preconcedidaCount + contadoCount,
    totalIntentCount: habitualCount + inversionCount,
  };
}

// ─── 6. Ranking de visitas y medias ──────────────────────────

export interface PropertyViews {
  top3: PropertyRow[];
  bottom3: PropertyRow[];
  platformAvgViews: number;
  platformAvgDays: number;
}

export function computePropertyViews(
  properties: PropertyRow[],
  visitsByProperty?: Record<string, number>,
): PropertyViews {
  const views = (p: PropertyRow): number => visitsByProperty?.[p.id] ?? 0;
  const sorted = [...properties].sort((a, b) => views(b) - views(a));
  const top3 = sorted.slice(0, 3);
  const bottom3 = sorted.slice(-3).reverse();

  const platformAvgViews =
    properties.length > 0
      ? Math.round(properties.reduce((acc, p) => acc + views(p), 0) / properties.length)
      : 0;

  const publishedDays = properties.map(daysOnMarket).filter((d): d is number => d !== null);
  const platformAvgDays =
    publishedDays.length > 0
      ? Math.round(publishedDays.reduce((acc, d) => acc + d, 0) / publishedDays.length)
      : 0;

  return { top3, bottom3, platformAvgViews, platformAvgDays };
}

// ─── 7. Métricas de la propiedad seleccionada ────────────────

export interface SelectedMetrics {
  selectedViews: number;
  selectedPhysicalCompleted: number;
  selectedPhysicalPending: number;
  selectedDays: number;
  selectedPrice: number;
  selectedValuation: number;
  valuationDiffPct: number;
  correlationRating: string;
  correlationColor: string;
  isPublished: boolean;
}

function featureNum(p: PropertyRow, key: string): number {
  return Number((p.features as Record<string, unknown>)?.[key] || 0);
}

export function computeSelectedMetrics(
  selectedProperty: PropertyRow | undefined,
  opts?: {
    days?: number | null;
    views?: number;
    physicalCompleted?: number;
    physicalPending?: number;
    valuation?: number;
  },
): SelectedMetrics {
  const realDays =
    opts?.days !== undefined ? opts.days : (selectedProperty ? daysOnMarket(selectedProperty) : null);
  const selectedViews = opts?.views ?? 0;
  const selectedPhysicalCompleted = opts?.physicalCompleted ?? 0;
  const selectedPhysicalPending = opts?.physicalPending ?? 0;
  const selectedDays = realDays ?? 0;
  const isPublished = realDays !== null;
  const selectedPrice = selectedProperty ? Number(selectedProperty.price || 0) : 0;
  const selectedValuation =
    opts?.valuation && opts.valuation > 0
      ? opts.valuation
      : selectedProperty
        ? featureNum(selectedProperty, "precio_valoracion")
        : 0;

  const valuationDiffPct =
    selectedValuation > 0 ? ((selectedPrice - selectedValuation) / selectedValuation) * 100 : 0;

  let correlationRating = "Normal";
  let correlationColor = "text-yellow-400";
  if (valuationDiffPct <= -10) {
    correlationRating = "Precio Excelente";
    correlationColor = "text-green-400";
  } else if (valuationDiffPct <= -5) {
    correlationRating = "Precio Competitivo";
    correlationColor = "text-emerald-400";
  } else if (valuationDiffPct > 10) {
    correlationRating = "Precio Fuera de Mercado";
    correlationColor = "text-red-400 font-extrabold";
  } else if (valuationDiffPct > 0) {
    correlationRating = "Precio Elevado";
    correlationColor = "text-orange-400";
  }

  return {
    selectedViews,
    selectedPhysicalCompleted,
    selectedPhysicalPending,
    selectedDays,
    selectedPrice,
    selectedValuation,
    valuationDiffPct,
    correlationRating,
    correlationColor,
    isPublished,
  };
}

// ─── 8. Estimación de bajada de precio ───────────────────────

export interface PriceDropEstimate {
  eurLow: number;
  eurHigh: number;
  pctLow: number;
  pctHigh: number;
  confidence: "alta" | "media" | "baja";
  reasons: string[];
  noAdjustment: boolean;
}

export const PRICE_DROP_CONFIG = {
  W_PRECIO: 0.5,
  W_TIEMPO: 5,
  W_VISITAS: 3,
  CAP_PCT: 15,
  RANGE_LOW_FACTOR: 0.6,
};

/**
 * Heurística de ajuste de precio.
 *
 *   sobreprecio%  = (precio − valoración) / valoración × 100
 *   factorTiempo  = max(0, (díasPublicada − OPTIMO_CIERRE_DIAS) / OPTIMO_CIERRE_DIAS)
 *   factorVisitas = max(0, (mediaVisitas − visitas) / mediaVisitas)
 *   Ajuste% = clamp(W·sobreprecio + W·tiempo + W·visitas, 0, CAP)
 *
 * Nota: factorTiempo usa OPTIMO_CIERRE_DIAS (26 días) como umbral, no la media del portal.
 * Cualquier inmueble publicado más de 26 días empuja una sugerencia de rebaja.
 */
export function computePriceDropEstimate(args: {
  price: number;
  valuation: number;
  daysOnMarket: number | null;
  avgDays: number;        // media del portal (solo para display, no para el umbral)
  visits: number;
  avgVisits: number;
  marketSampleSize: number;
}): PriceDropEstimate {
  const { W_PRECIO, W_TIEMPO, W_VISITAS, CAP_PCT, RANGE_LOW_FACTOR } = PRICE_DROP_CONFIG;
  const { price, valuation, daysOnMarket, visits, avgVisits, marketSampleSize } = args;
  const reasons: string[] = [];

  const sobreprecioPct = valuation > 0 ? ((price - valuation) / valuation) * 100 : 0;
  if (valuation > 0 && sobreprecioPct > 0) {
    reasons.push(`Precio un ${sobreprecioPct.toFixed(0)}% por encima de la valoración de referencia.`);
  }

  // Umbral: OPTIMO_CIERRE_DIAS (no la media del portal) → más agresivo con rebajas.
  const factorTiempo =
    daysOnMarket !== null
      ? Math.max(0, (daysOnMarket - OPTIMO_CIERRE_DIAS) / OPTIMO_CIERRE_DIAS)
      : 0;
  if (factorTiempo > 0) {
    reasons.push(`Lleva ${daysOnMarket} días publicada (óptimo: ${OPTIMO_CIERRE_DIAS} días).`);
  }

  const factorVisitas = avgVisits > 0 ? Math.max(0, (avgVisits - visits) / avgVisits) : 0;
  if (factorVisitas > 0) {
    reasons.push(`${visits} visitas, por debajo de la media (${avgVisits}).`);
  }

  const rawPct = W_PRECIO * Math.max(0, sobreprecioPct) + W_TIEMPO * factorTiempo + W_VISITAS * factorVisitas;
  const pctHigh = Math.min(CAP_PCT, Math.max(0, rawPct));
  const pctLow = pctHigh * RANGE_LOW_FACTOR;

  const round1k = (n: number) => Math.round(n / 1000) * 1000;
  const eurHigh = round1k(price * (pctHigh / 100));
  const eurLow = round1k(price * (pctLow / 100));

  let confidence: PriceDropEstimate["confidence"] = "alta";
  if (valuation <= 0) {
    confidence = "baja";
    reasons.push("Sin valoración de referencia: estimación basada solo en tiempo y visitas.");
  } else if (marketSampleSize < 3 || daysOnMarket === null) {
    confidence = "media";
  }

  const noAdjustment = pctHigh < 0.5;
  if (noAdjustment) {
    reasons.length = 0;
    reasons.push("Las señales actuales no justifican una bajada de precio.");
  }

  return {
    eurLow,
    eurHigh,
    pctLow: Number(pctLow.toFixed(1)),
    pctHigh: Number(pctHigh.toFixed(1)),
    confidence,
    reasons,
    noAdjustment,
  };
}
