/**
 * Matching puro de la difusión (Smart Matchmaker) — Brief #012.
 *
 * Fuente canónica del perfil comprador: `buyers_demands`.
 * Geo por nombre de zona (preferred_zones), no por radio km (Brief #012).
 *
 * Reglas:
 *  - Estado de la demand: descarta `status='Desactivado'` (Brief #011 F0.1).
 *    Cualquier otro valor (Activo, legacy, null) entra.
 *  - Funnel: descarta solo leads en closed/lost. visit_scheduled ENTRA.
 *  - Presupuesto: banda asimétrica [price*(1-down%), price*(1+up%)].
 *    max_budget=0 (perfil incompleto) → se INCLUYE con warning 'no_budget'.
 *  - Tipo: descarta solo si ambos definidos, ninguno 'Indiferente' y difieren.
 *  - Habitaciones/baños: tolerancia ±1 (rechaza solo si diff > 1).
 *  - m²: informativo, nunca excluye (decisión de Álvaro — Brief #012).
 *  - Geo: por preferred_zones (etiquetas de taxonomía). Vacío/null → sin filtro.
 *    Zona del inmueble: features.zona si existe; fallback por texto en address.
 *
 * Módulo PURO (sin Supabase ni env) para poder testearlo con jest sin mocks.
 */

// ─── Geometría (conservadas; ya no las usa matchDemand pero sí otros módulos) ──

export function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function getPolygonCentroid(polygon: [number, number][]): [number, number] {
  let latSum = 0, lngSum = 0;
  polygon.forEach(([lat, lng]) => { latSum += lat; lngSum += lng; });
  return [latSum / polygon.length, lngSum / polygon.length];
}

export function isPointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  const [lat, lng] = point;
  let isInside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [latI, lngI] = polygon[i];
    const [latJ, lngJ] = polygon[j];
    const intersect = ((lngI > lng) !== (lngJ > lng))
        && (lat < (latJ - latI) * (lng - lngI) / (lngJ - lngI) + latI);
    if (intersect) isInside = !isInside;
  }
  return isInside;
}

// ─── Tipos del matching ─────────────────────────────────────────────────────

export interface DiffusionPropertyParams {
  price: number;
  propertyType?: string | null;
  rooms: number;
  baths: number;
  /** Etiqueta de zona de la taxonomía (ej. "Macarena - Las Avenidas"). */
  zona?: string | null;
  /** Dirección textual — fallback geo cuando zona=null (Brief #012). */
  address?: string | null;
  /** Latitud (informativa; ya no usada para geo tras Brief #012). */
  lat?: number;
  /** Longitud (informativa; ya no usada para geo tras Brief #012). */
  lng?: number;
}

export interface DiffusionDemand {
  max_budget?: number | string | null;
  property_type?: string | null;
  rooms?: number | null;
  bathrooms?: number | null;
  status?: string | null;
}

export interface DiffusionLead {
  status?: string | null;
  preferences?: Record<string, unknown> | null;
}

export type DemandMatchResult =
  | { match: false; reason: 'demand_status' | 'funnel' | 'budget' | 'type' | 'rooms' | 'baths' | 'geo' }
  | { match: true; warnings: Array<'no_lead' | 'no_budget'> };

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Devuelve true si el inmueble cae en alguna de las zonas del comprador.
 *
 * Resolución de zona del inmueble:
 * 1. Si prop.zona tiene valor (etiqueta de taxonomía) → comparación directa.
 * 2. Fallback: cada zona se parte en segmentos por " - "; si algún segmento
 *    aparece en la dirección normalizada → match (sin acentos, minúsculas).
 */
export function propertyMatchesZones(
  prop: { zona?: string | null; address?: string | null },
  zones: string[]
): boolean {
  if (!zones || zones.length === 0) return true;
  const normAddress = prop.address ? normalizeText(prop.address) : '';
  return zones.some((zone) => {
    if (prop.zona) {
      return normalizeText(prop.zona) === normalizeText(zone);
    }
    const segments = zone
      .split(' - ')
      .map(s => normalizeText(s.trim()))
      .filter(s => s.length > 0);
    return segments.some(seg => normAddress.includes(seg));
  });
}

// ─── Matching ───────────────────────────────────────────────────────────────

export function matchDemand(params: {
  demand: DiffusionDemand;
  /** Lead vinculado vía buyers_demands.lead_id, o null si no hay. */
  lead: DiffusionLead | null;
  property: DiffusionPropertyParams;
  /** Desviación a la baja del precio (%). Tiene prioridad sobre priceMargin. */
  priceMarginDown?: number;
  /** Desviación al alza del precio (%). Tiene prioridad sobre priceMargin. */
  priceMarginUp?: number;
  /** @deprecated Fallback simétrico; usado cuando no vienen priceMarginDown/Up. */
  priceMargin?: number;
  /** Zonas de interés del comprador (buyers_demands.preferred_zones). */
  demandZones: string[];
}): DemandMatchResult {
  const { demand, lead, property } = params;
  const marginDown = params.priceMarginDown ?? params.priceMargin ?? 10;
  const marginUp   = params.priceMarginUp   ?? params.priceMargin ?? 10;
  const warnings: Array<'no_lead' | 'no_budget'> = [];

  // Demand archivada (Brief #011 F0.1): 'Desactivado' queda fuera de la difusión.
  if (demand.status === 'Desactivado') {
    return { match: false, reason: 'demand_status' };
  }

  // Funnel: solo closed/lost quedan fuera. visit_scheduled ENTRA.
  if (lead) {
    if (lead.status === 'closed' || lead.status === 'lost') {
      return { match: false, reason: 'funnel' };
    }
  } else {
    warnings.push('no_lead');
  }

  // Presupuesto: banda asimétrica [lower, upper] alrededor del precio.
  // max_budget=0 (perfil incompleto) → incluido con warning 'no_budget'.
  const maxBudget = Number(demand.max_budget || 0);
  if (maxBudget > 0) {
    const lower = property.price * (1 - marginDown / 100);
    const upper = property.price * (1 + marginUp / 100);
    if (maxBudget < lower || maxBudget > upper) {
      return { match: false, reason: 'budget' };
    }
  } else {
    warnings.push('no_budget');
  }

  // Tipo de inmueble: descarta solo si ambos definidos, ninguno 'Indiferente' y difieren.
  const demandType = demand.property_type;
  const propType = property.propertyType;
  if (
    demandType && demandType !== 'Indiferente' &&
    propType && propType !== 'Indiferente' &&
    demandType !== propType
  ) {
    return { match: false, reason: 'type' };
  }

  // Habitaciones/baños: tolerancia ±1. Rechaza solo si diff > 1.
  const demandRooms = Number(demand.rooms || 0);
  if (demandRooms > 0 && (demandRooms - property.rooms) > 1) {
    return { match: false, reason: 'rooms' };
  }
  const demandBaths = Number(demand.bathrooms || 0);
  if (demandBaths > 0 && (demandBaths - property.baths) > 1) {
    return { match: false, reason: 'baths' };
  }

  // m² mínimos: informativo, nunca excluye (decisión de Álvaro — Brief #012).

  // Geo: por nombre de zona. preferred_zones vacío → sin filtro (permisivo).
  if (!propertyMatchesZones(property, params.demandZones)) {
    return { match: false, reason: 'geo' };
  }

  return { match: true, warnings };
}
