import type { PropertyRow, LeadRow } from "../types";

/** Lee un campo numérico de `features` (JSON) de una propiedad, con fallback 0. */
function featureNum(p: PropertyRow, key: string): number {
  return Number((p.features as Record<string, any>)?.[key] || 0);
}

/**
 * Días reales en el mercado = hoy − published_at (Fase 3).
 * Devuelve null si la propiedad aún no se ha publicado (sin published_at).
 * Sustituye el antiguo `features.dias_mercado` (campo estático que nadie rellenaba).
 */
export function daysOnMarket(p: PropertyRow): number | null {
  if (!p.published_at) return null;
  const ms = Date.now() - new Date(p.published_at).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

// ─── 1. Pipeline de propietarios ─────────────────────────────
export interface PipelineMap {
  valoracion: number;
  captacion: number;
  notas_encargo: number;
  propuestas: number;
  pendientes_notaria: number;
}

export function computePipeline(sellerLeads: LeadRow[]): PipelineMap {
  return {
    valoracion: sellerLeads.filter((s) => s.status === "new").length,
    captacion: sellerLeads.filter((s) => s.status === "contacted").length,
    notas_encargo: sellerLeads.filter((s) => s.status === "qualified").length,
    propuestas: sellerLeads.filter((s) => s.status === "visit_scheduled").length,
    pendientes_notaria: sellerLeads.filter((s) => s.status === "closed").length,
  };
}

// ─── 2. Días en mercado por rango de precio ──────────────────
export interface MarketDayRange {
  label: string;
  avg: number;
}

export function computeMarketDays(properties: PropertyRow[]): MarketDayRange[] {
  const priceRanges = [
    { label: "< 150k", filter: (p: PropertyRow) => p.price < 150000 },
    { label: "150k-300k", filter: (p: PropertyRow) => p.price >= 150000 && p.price < 300000 },
    { label: "300k-500k", filter: (p: PropertyRow) => p.price >= 300000 && p.price < 500000 },
    { label: "> 500k", filter: (p: PropertyRow) => p.price >= 500000 }
  ];

  return priceRanges.map(range => {
    // Solo cuentan las propiedades publicadas (con días reales en mercado)
    const matched = properties.filter(range.filter)
      .map(daysOnMarket)
      .filter((d): d is number => d !== null);
    const avg = matched.length > 0
      ? Math.round(matched.reduce((acc, d) => acc + d, 0) / matched.length)
      : 0;
    return { label: range.label, avg };
  });
}

// ─── 3. Demanda por barrios de Sevilla ───────────────────────
export interface SevillaDemandItem {
  zone: string;
  count: number;
  avgBudget: number;
}

/**
 * Sin baselines: la demanda por barrio se calcula EXCLUSIVAMENTE a partir
 * de leads reales de BD. Las cifras inventadas anteriores (Triana 48,
 * Nervión 42, etc.) mentían en el informe — fuera.
 * @cleanup 2026-06-06 brief #002 T1
 */
const SEVILLA_BARRIOS_BASELINE: { zone: string; count: number; totalBudget: number }[] = [];

/** Normaliza el campo `zonas` (array | string | ausente) de un lead a string[]. */
function leadZones(b: LeadRow): string[] {
  const rawZones = b.preferences?.zonas;
  return Array.isArray(rawZones)
    ? rawZones
    : typeof rawZones === "string"
      ? [rawZones]
      : [];
}

/**
 * Cruza la baseline de barrios de Sevilla con la demanda real de la BD y
 * añade dinámicamente zonas nuevas no-Madrid no contempladas en la baseline.
 */
export function computeSevillaDemand(buyerLeads: LeadRow[]): SevillaDemandItem[] {
  const merged: SevillaDemandItem[] = SEVILLA_BARRIOS_BASELINE.map(item => {
    const matches = buyerLeads.filter((b) => {
      const zonesList = leadZones(b);
      return zonesList.some((z: string) => z.toLowerCase().includes(item.zone.toLowerCase()) || item.zone.toLowerCase().includes(z.toLowerCase()));
    });

    const dbCount = matches.length;
    const dbBudgetSum = matches.reduce((sum: number, b) => sum + Number(b.preferences?.presupuesto_max || 0), 0);

    const totalCount = item.count + dbCount;
    const totalBudgetSum = item.totalBudget + dbBudgetSum;

    return {
      zone: item.zone,
      count: totalCount,
      avgBudget: totalCount > 0 ? Math.round(totalBudgetSum / totalCount) : 0
    };
  });

  // Parse any new non-Madrid zones from database
  buyerLeads.forEach((b) => {
    const zonesList = leadZones(b);
    const madridZones = ["chamartín", "retiro", "chueca", "malasaña", "carabanchel", "vallecas", "majadahonda", "pozuelo", "usera", "villaverde"];

    zonesList.forEach((z: string) => {
      const isMadrid = madridZones.some(mz => z.toLowerCase().includes(mz));
      const isInBaseline = SEVILLA_BARRIOS_BASELINE.some(item => item.zone.toLowerCase().includes(z.toLowerCase()) || z.toLowerCase().includes(item.zone.toLowerCase()));

      if (!isMadrid && !isInBaseline && z.trim().length > 0) {
        const existingIdx = merged.findIndex(item => item.zone.toLowerCase() === z.toLowerCase());
        const budget = Number(b.preferences?.presupuesto_max || 250000);
        if (existingIdx === -1) {
          merged.push({ zone: z, count: 1, avgBudget: budget });
        } else {
          const item = merged[existingIdx];
          const newCount = item.count + 1;
          item.avgBudget = Math.round((item.avgBudget * item.count + budget) / newCount);
          item.count = newCount;
        }
      }
    });
  });

  return merged;
}

// ─── 4. Crecimiento mensual acumulado de compradores ─────────
export interface GrowthDatum {
  monthName: string;
  monthNum: number;
  year: number;
  dbCount: number;
  total: number;
}

export function computeGrowth(buyerLeads: LeadRow[]): GrowthDatum[] {
  const monthsList = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const currentMonthNum = new Date().getMonth();

  const growthMonths = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(currentMonthNum - 5 + i);
    return {
      monthName: monthsList[d.getMonth()],
      monthNum: d.getMonth(),
      year: d.getFullYear(),
      dbCount: 0
    };
  });

  buyerLeads.forEach((b) => {
    const date = new Date(b.created_at);
    const m = date.getMonth();
    const y = date.getFullYear();
    const match = growthMonths.find(gm => gm.monthNum === m && gm.year === y);
    if (match) {
      match.dbCount += 1;
    }
  });

  // Sin baseline ficticia: el "total" acumulado es solo lo que hay en BD.
  // @cleanup 2026-06-06 brief #002 T1 — antes se sumaba [120,131,145,156,168,184].
  let cumulativeDbCount = 0;
  return growthMonths.map((m) => {
    cumulativeDbCount += m.dbCount;
    return { ...m, total: cumulativeDbCount };
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

export function computeBuyerProfiles(buyerLeads: LeadRow[]): BuyerProfiles {
  // Contadores reales. Antes arrancaban en cifras inventadas (32/45/63/40 y
  // 126/54) y aplicaban heurísticas pseudo-aleatorias (charCode % 3) cuando
  // el lead no tenía el campo — eso inflaba el informe con humo.
  // @cleanup 2026-06-06 brief #002 T1 — solo cuenta lo que el lead declara.
  let sinEstudioCount = 0;
  let estudioHechoCount = 0;
  let preconcedidaCount = 0;
  let contadoCount = 0;

  let habitualCount = 0;
  let inversionCount = 0;

  buyerLeads.forEach((b) => {
    const prefs = (b.preferences || {}) as Record<string, unknown>;

    // Perfil financiero — admite tanto la clave nueva (`perfil_financiero`)
    // como las que el formulario público del comprador ya rellena
    // (`paymentMethod` + `mortgageStatus`). El bot (T4) escribirá la nueva.
    const finProfile = prefs.perfil_financiero as string | undefined;
    const paymentMethod = prefs.paymentMethod as string | undefined;
    const mortgageStatus = prefs.mortgageStatus as string | undefined;

    if (finProfile === "sin_estudio" || mortgageStatus === "Necesito estudio") {
      sinEstudioCount += 1;
    } else if (finProfile === "estudio_hecho") {
      estudioHechoCount += 1;
    } else if (finProfile === "preconcedida" || mortgageStatus === "Preconcedida") {
      preconcedidaCount += 1;
    } else if (finProfile === "contado" || paymentMethod === "Al contado") {
      contadoCount += 1;
    }
    // Sin dato → no se cuenta. Mejor 0 que adivinar.

    const tipoCompra = prefs.tipo_compra as string | undefined;
    if (tipoCompra === "habitual") {
      habitualCount += 1;
    } else if (tipoCompra === "inversion") {
      inversionCount += 1;
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

// ─── 6. Ranking de visitas (top/bottom) y medias ─────────────
export interface PropertyViews {
  top3: PropertyRow[];
  bottom3: PropertyRow[];
  platformAvgViews: number;
  platformAvgDays: number;
}

/**
 * @param visitsByProperty mapa id→visitas reales (desde web_visits). Si se omite, 0.
 */
export function computePropertyViews(
  properties: PropertyRow[],
  visitsByProperty?: Record<string, number>,
): PropertyViews {
  const views = (p: PropertyRow): number => visitsByProperty?.[p.id] ?? 0;

  const sorted = [...properties].sort((a, b) => views(b) - views(a));
  const top3 = sorted.slice(0, 3);
  const bottom3 = sorted.slice(-3).reverse();

  const platformAvgViews = properties.length > 0
    ? Math.round(properties.reduce((acc, p) => acc + views(p), 0) / properties.length)
    : 0;

  // Media de días en mercado sobre las propiedades publicadas
  const publishedDays = properties.map(daysOnMarket).filter((d): d is number => d !== null);
  const platformAvgDays = publishedDays.length > 0
    ? Math.round(publishedDays.reduce((acc, d) => acc + d, 0) / publishedDays.length)
    : 0;

  return { top3, bottom3, platformAvgViews, platformAvgDays };
}

// ─── 7. Métricas de la propiedad seleccionada ────────────────
export interface SelectedMetrics {
  selectedViews: number;
  /** Visitas físicas con status='completed'. Solo estas cuentan como cierre. */
  selectedPhysicalCompleted: number;
  /** Visitas físicas con status='pending'. Aún no realizadas. */
  selectedPhysicalPending: number;
  selectedDays: number;
  selectedPrice: number;
  selectedValuation: number;
  valuationDiffPct: number;
  correlationRating: string;
  correlationColor: string;
  /** false si la propiedad seleccionada aún no se ha publicado. */
  isPublished: boolean;
}

/**
 * @param opts.days                       días reales en mercado (desde published_at). null = sin publicar.
 * @param opts.views                      visitas web reales (desde web_visits).
 * @param opts.physicalCompleted          visitas físicas con status='completed' (de appointments).
 * @param opts.physicalPending            visitas físicas con status='pending' (de appointments).
 * @param opts.valuation                  valoración de referencia (lead vinculado → fallback feature).
 */
export function computeSelectedMetrics(
  selectedProperty: PropertyRow | undefined,
  opts?: { days?: number | null; views?: number; physicalCompleted?: number; physicalPending?: number; valuation?: number },
): SelectedMetrics {
  const realDays = opts?.days !== undefined ? opts.days : (selectedProperty ? daysOnMarket(selectedProperty) : null);
  const selectedViews = opts?.views ?? 0;
  const selectedPhysicalCompleted = opts?.physicalCompleted ?? 0;
  const selectedPhysicalPending = opts?.physicalPending ?? 0;
  const selectedDays = realDays ?? 0;
  const isPublished = realDays !== null;
  const selectedPrice = selectedProperty ? Number(selectedProperty.price || 0) : 0;
  const selectedValuation = opts?.valuation && opts.valuation > 0
    ? opts.valuation
    : (selectedProperty ? featureNum(selectedProperty, "precio_valoracion") : 0);

  const valuationDiffPct = selectedValuation > 0
    ? ((selectedPrice - selectedValuation) / selectedValuation) * 100
    : 0;

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

// ─── 8. Estimación de bajada de precio (heurística explicable) ───────────
export interface PriceDropEstimate {
  /** Ajuste sugerido en € (rango bajo→alto, redondeado a 1.000€). */
  eurLow: number;
  eurHigh: number;
  /** Ajuste sugerido en % (rango bajo→alto). */
  pctLow: number;
  pctHigh: number;
  confidence: "alta" | "media" | "baja";
  /** Frases explicando de dónde sale el ajuste (transparencia). */
  reasons: string[];
  /** true si no hay sobreprecio/señales → no se recomienda bajar. */
  noAdjustment: boolean;
}

/**
 * Heurística de ajuste de precio. Punto de partida documentado y fácil de tunear:
 *
 *   sobreprecio%  = (precio − valoración) / valoración × 100         (si hay valoración)
 *   factorTiempo  = max(0, (díasPublicada − mediaDías) / mediaDías)
 *   factorVisitas = max(0, (mediaVisitas − visitas) / mediaVisitas)
 *   Ajuste% = clamp(W_PRECIO·max(0,sobreprecio%) + W_TIEMPO·factorTiempo + W_VISITAS·factorVisitas, 0, CAP)
 *
 * Confianza: baja si falta valoración o hay pocas muestras de mercado.
 */
export const PRICE_DROP_CONFIG = {
  W_PRECIO: 0.5,
  W_TIEMPO: 5,
  W_VISITAS: 3,
  CAP_PCT: 15, // tope del ajuste sugerido (decisión Álvaro: moderado)
  RANGE_LOW_FACTOR: 0.6, // el extremo bajo del rango = 60% del ajuste
};

export function computePriceDropEstimate(args: {
  price: number;
  valuation: number;       // 0 = desconocida
  daysOnMarket: number | null;
  avgDays: number;
  visits: number;
  avgVisits: number;
  marketSampleSize: number; // nº de propiedades publicadas (para confianza)
}): PriceDropEstimate {
  const { W_PRECIO, W_TIEMPO, W_VISITAS, CAP_PCT, RANGE_LOW_FACTOR } = PRICE_DROP_CONFIG;
  const { price, valuation, daysOnMarket, avgDays, visits, avgVisits, marketSampleSize } = args;
  const reasons: string[] = [];

  const sobreprecioPct = valuation > 0 ? ((price - valuation) / valuation) * 100 : 0;
  if (valuation > 0 && sobreprecioPct > 0) {
    reasons.push(`Precio un ${sobreprecioPct.toFixed(0)}% por encima de la valoración de referencia.`);
  }

  const factorTiempo = avgDays > 0 && daysOnMarket !== null
    ? Math.max(0, (daysOnMarket - avgDays) / avgDays)
    : 0;
  if (factorTiempo > 0) {
    reasons.push(`Lleva ${daysOnMarket} días publicada (media ${avgDays}).`);
  }

  const factorVisitas = avgVisits > 0
    ? Math.max(0, (avgVisits - visits) / avgVisits)
    : 0;
  if (factorVisitas > 0) {
    reasons.push(`${visits} visitas, por debajo de la media (${avgVisits}).`);
  }

  const rawPct = W_PRECIO * Math.max(0, sobreprecioPct) + W_TIEMPO * factorTiempo + W_VISITAS * factorVisitas;
  const pctHigh = Math.min(CAP_PCT, Math.max(0, rawPct));
  const pctLow = pctHigh * RANGE_LOW_FACTOR;

  const round1k = (n: number) => Math.round(n / 1000) * 1000;
  const eurHigh = round1k(price * (pctHigh / 100));
  const eurLow = round1k(price * (pctLow / 100));

  // Confianza
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
