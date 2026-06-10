/**
 * Matching puro de la difusión (Smart Matchmaker) — Brief #007 T4.
 *
 * La fuente canónica del perfil comprador es `buyers_demands` (decisión 2):
 * presupuesto, tipo, habitaciones y baños se evalúan contra la demand. Los
 * datos geográficos (polígonos dibujados en el CRM) siguen viviendo en
 * `leads.preferences` y llegan aquí vía el JOIN por `lead_id`.
 *
 * Reglas:
 *  - Funnel: descarta solo leads en closed/lost. Una demand SIN lead se
 *    incluye (no hay funnel que la excluya) — el caller loguea el caso.
 *  - Presupuesto: `max_budget > 0` → exige `max_budget >= price*(1-margen%)`.
 *    `max_budget = 0` (perfil incompleto, p. ej. reserva web sin entrevista)
 *    → se INCLUYE; el caller loguea para visibilidad.
 *  - Tipo: descarta solo si ambos lados están definidos, ninguno es
 *    "Indiferente" y difieren.
 *  - Habitaciones/baños: `property >= demand` (0 o null = sin filtro).
 *  - Geo: si el lead tiene polygons/area/lat-lng en preferences se aplica;
 *    sin lead o sin datos geo → sin filtro (se incluye).
 *
 * Módulo PURO (sin Supabase ni env) para poder testearlo con jest sin mocks.
 */

// ─── Geometría ──────────────────────────────────────────────────────────────

export function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radio de la tierra en km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distancia en km
}

export function getPolygonCentroid(polygon: [number, number][]): [number, number] {
  let latSum = 0;
  let lngSum = 0;
  polygon.forEach(([lat, lng]) => {
    latSum += lat;
    lngSum += lng;
  });
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
  /** undefined si la propiedad no tiene coordenadas válidas → sin filtro geo. */
  lat?: number;
  lng?: number;
}

export interface DiffusionDemand {
  max_budget?: number | string | null;
  property_type?: string | null;
  rooms?: number | null;
  bathrooms?: number | null;
}

export interface DiffusionLead {
  status?: string | null;
  preferences?: Record<string, unknown> | null;
}

export type DemandMatchResult =
  | { match: false; reason: 'funnel' | 'budget' | 'type' | 'rooms' | 'baths' | 'geo' }
  | { match: true; warnings: Array<'no_lead' | 'no_budget'> };

// ─── Matching ───────────────────────────────────────────────────────────────

export function matchDemand(params: {
  demand: DiffusionDemand;
  /** Lead vinculado vía buyers_demands.lead_id, o null si no hay. */
  lead: DiffusionLead | null;
  property: DiffusionPropertyParams;
  priceMargin: number;
  geoRadius: number;
}): DemandMatchResult {
  const { demand, lead, property, priceMargin, geoRadius } = params;
  const warnings: Array<'no_lead' | 'no_budget'> = [];

  // Funnel (decisión 3): solo closed/lost quedan fuera. visit_scheduled ENTRA
  // (una cita para UN piso no descarta al comprador para otros).
  if (lead) {
    if (lead.status === 'closed' || lead.status === 'lost') {
      return { match: false, reason: 'funnel' };
    }
  } else {
    warnings.push('no_lead');
  }

  // Presupuesto (bug del PDF): la demand es la fuente, no leads.preferences.
  const maxBudget = Number(demand.max_budget || 0);
  if (maxBudget > 0) {
    const minAcceptableBudget = property.price * (1 - priceMargin / 100);
    if (maxBudget < minAcceptableBudget) return { match: false, reason: 'budget' };
  } else {
    warnings.push('no_budget');
  }

  // Tipo de inmueble: descarta solo si ambos definidos, ninguno Indiferente y difieren.
  const demandType = demand.property_type;
  const propType = property.propertyType;
  if (
    demandType && demandType !== 'Indiferente' &&
    propType && propType !== 'Indiferente' &&
    demandType !== propType
  ) {
    return { match: false, reason: 'type' };
  }

  // Habitaciones / baños mínimos (0 = sin filtro).
  const minRooms = Number(demand.rooms || 0);
  if (minRooms > 0 && property.rooms < minRooms) return { match: false, reason: 'rooms' };
  const minBaths = Number(demand.bathrooms || 0);
  if (minBaths > 0 && property.baths < minBaths) return { match: false, reason: 'baths' };

  // Geo: solo si el lead tiene datos geográficos en preferences.
  if (lead && property.lat !== undefined && property.lng !== undefined) {
    const prefs = (lead.preferences || {}) as Record<string, any>;
    const polygons = prefs.polygons;
    const area = prefs.area;

    let locationMatch = false;
    let hasLocationPreferences = false;

    if (polygons && Array.isArray(polygons) && polygons.length > 0) {
      hasLocationPreferences = true;
      locationMatch = polygons.some((poly: any) => {
        if (!Array.isArray(poly) || poly.length < 3) return false;
        if (isPointInPolygon([property.lat!, property.lng!], poly as [number, number][])) return true;
        const [cLat, cLng] = getPolygonCentroid(poly);
        return getDistance(property.lat!, property.lng!, cLat, cLng) <= geoRadius;
      });
    } else if (area && Array.isArray(area) && area.length >= 3) {
      hasLocationPreferences = true;
      if (isPointInPolygon([property.lat!, property.lng!], area as [number, number][])) {
        locationMatch = true;
      } else {
        const [cLat, cLng] = getPolygonCentroid(area);
        locationMatch = getDistance(property.lat!, property.lng!, cLat, cLng) <= geoRadius;
      }
    } else if (prefs.latitude && prefs.longitude) {
      hasLocationPreferences = true;
      locationMatch =
        getDistance(property.lat!, property.lng!, Number(prefs.latitude), Number(prefs.longitude)) <= geoRadius;
    }

    if (hasLocationPreferences && !locationMatch) return { match: false, reason: 'geo' };
  }

  return { match: true, warnings };
}
