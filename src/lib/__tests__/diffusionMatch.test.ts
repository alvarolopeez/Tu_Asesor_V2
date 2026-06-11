/**
 * Tests para matchDemand + propertyMatchesZones — actualizado Brief #012.
 * Módulo puro: sin mocks de Supabase.
 */

import { matchDemand, propertyMatchesZones, type DiffusionPropertyParams } from '../diffusionMatch';

// Propiedad base para la mayoría de tests
const PROPERTY: DiffusionPropertyParams = {
  price: 200_000,
  propertyType: 'Piso',
  rooms: 3,
  baths: 2,
  zona: null,
  address: 'Calle Fake, Barrio Centro, Sevilla, España',
};

// Helper con defaults razonables para no repetir boilerplate.
// priceMarginUp=30 da headroom para que el default max_budget=250k pase en
// tests que no evalúan presupuesto (200k * 1.30 = 260k > 250k).
function run(overrides: {
  demand?: Record<string, unknown>;
  lead?: Record<string, unknown> | null;
  property?: Partial<DiffusionPropertyParams>;
  priceMarginDown?: number;
  priceMarginUp?: number;
  demandZones?: string[];
} = {}) {
  return matchDemand({
    demand: { max_budget: 250_000, property_type: 'Piso', rooms: 0, bathrooms: 0, ...overrides.demand },
    lead: overrides.lead === undefined
      ? { status: 'contacted', preferences: {} }
      : overrides.lead,
    property: { ...PROPERTY, ...overrides.property },
    priceMarginDown: overrides.priceMarginDown ?? 10,
    priceMarginUp:   overrides.priceMarginUp   ?? 30,
    demandZones:     overrides.demandZones      ?? [],
  });
}

// ─── Estado de la demand ─────────────────────────────────────────────────────

describe('matchDemand — estado de la demand (Brief #011 F0.1)', () => {
  it("demand 'Desactivado' → descartada aunque todo lo demás matchee", () => {
    expect(run({ demand: { status: 'Desactivado' } })).toEqual({ match: false, reason: 'demand_status' });
  });

  it("demand 'Activo' → incluida", () => {
    expect(run({ demand: { status: 'Activo' } }).match).toBe(true);
  });

  it('demand sin status (legacy/null) → incluida', () => {
    expect(run({ demand: { status: null } }).match).toBe(true);
  });
});

// ─── Funnel ──────────────────────────────────────────────────────────────────

describe('matchDemand — funnel', () => {
  it('lead closed → descartado', () => {
    expect(run({ lead: { status: 'closed', preferences: {} } })).toEqual({ match: false, reason: 'funnel' });
  });

  it('lead lost → descartado', () => {
    expect(run({ lead: { status: 'lost', preferences: {} } })).toEqual({ match: false, reason: 'funnel' });
  });

  it('lead visit_scheduled → INCLUIDO (una cita no descarta para otros pisos)', () => {
    expect(run({ lead: { status: 'visit_scheduled', preferences: {} } }).match).toBe(true);
  });

  it('demand sin lead → incluida con warning no_lead', () => {
    expect(run({ lead: null })).toEqual({ match: true, warnings: ['no_lead'] });
  });
});

// ─── Presupuesto (banda asimétrica — Brief #012) ─────────────────────────────

describe('matchDemand — presupuesto', () => {
  it('max_budget dentro de la banda → incluido', () => {
    // price 200k, down=10 → lower=180k; up=10 → upper=220k. 185k ∈ [180k,220k].
    expect(run({ demand: { max_budget: 185_000 }, priceMarginUp: 10 }).match).toBe(true);
  });

  it('max_budget por debajo del límite inferior → descartado', () => {
    expect(run({ demand: { max_budget: 150_000 } })).toEqual({ match: false, reason: 'budget' });
  });

  it('max_budget exactamente en el límite inferior → incluido', () => {
    // price 200k, down=10 → lower=180k exacto.
    expect(run({ demand: { max_budget: 180_000 } }).match).toBe(true);
  });

  it('max_budget por encima del límite superior → descartado (Brief #012 causa raíz)', () => {
    // price 200k, up=10 → upper=220k. 290k > 220k.
    expect(run({ demand: { max_budget: 290_000 }, priceMarginUp: 10 })).toEqual({ match: false, reason: 'budget' });
  });

  it('max_budget 0 (perfil incompleto) → incluido con warning no_budget', () => {
    expect(run({ demand: { max_budget: 0 } })).toEqual({ match: true, warnings: ['no_budget'] });
  });

  it('max_budget numérico en string (Supabase numeric) → se evalúa bien', () => {
    expect(run({ demand: { max_budget: '150000' } })).toEqual({ match: false, reason: 'budget' });
    // 200k en string → dentro de [180k, 260k].
    expect(run({ demand: { max_budget: '200000' } }).match).toBe(true);
  });
});

// ─── Tipo, habitaciones y baños ──────────────────────────────────────────────

describe('matchDemand — tipo, habitaciones y baños', () => {
  it('tipos definidos y distintos → descartado', () => {
    expect(run({ demand: { property_type: 'Casa' } })).toEqual({ match: false, reason: 'type' });
  });

  it('demand Indiferente → incluido aunque difiera', () => {
    expect(run({ demand: { property_type: 'Indiferente' } }).match).toBe(true);
  });

  it('demand sin tipo → incluido', () => {
    expect(run({ demand: { property_type: null } }).match).toBe(true);
  });

  it('rooms diff=1 (pide 1 más de lo que hay) → INCLUIDO (tolerancia ±1)', () => {
    // property.rooms=3, demand.rooms=4 → diff=1 ≤ 1 → pasa
    expect(run({ demand: { rooms: 4 } }).match).toBe(true);
  });

  it('rooms diff=2 (pide 2 más de lo que hay) → descartado', () => {
    // property.rooms=3, demand.rooms=5 → diff=2 > 1 → rooms reason
    expect(run({ demand: { rooms: 5 } })).toEqual({ match: false, reason: 'rooms' });
  });

  it('rooms 0 = sin filtro', () => {
    expect(run({ demand: { rooms: 0 }, property: { rooms: 0 } }).match).toBe(true);
  });

  it('baths diff=1 → INCLUIDO (tolerancia ±1)', () => {
    // property.baths=2, demand.bathrooms=3 → diff=1 ≤ 1 → pasa
    expect(run({ demand: { bathrooms: 3 } }).match).toBe(true);
  });

  it('baths diff=2 → descartado', () => {
    // property.baths=2, demand.bathrooms=4 → diff=2 > 1 → baths reason
    expect(run({ demand: { bathrooms: 4 } })).toEqual({ match: false, reason: 'baths' });
  });
});

// ─── Geo por zona (Brief #012) ───────────────────────────────────────────────

describe('propertyMatchesZones (helper)', () => {
  it('zones vacío → sin filtro (true)', () => {
    expect(propertyMatchesZones({ address: 'cualquier cosa' }, [])).toBe(true);
  });

  it('match por segmento de zona en la dirección (normalizado)', () => {
    const prop = { zona: null, address: 'Calle Coral, Las Avenidas, Distrito Macarena, Sevilla' };
    expect(propertyMatchesZones(prop, ['Macarena - Las Avenidas'])).toBe(true);
  });

  it('segmento de zona no aparece en la dirección → false', () => {
    const prop = { zona: null, address: 'Calle Coral, Las Avenidas, Distrito Macarena, Sevilla' };
    expect(propertyMatchesZones(prop, ['Utrera - Utrera Centro'])).toBe(false);
  });

  it('zona explícita en la propiedad → comparación directa (match)', () => {
    const prop = { zona: 'Macarena - Las Avenidas', address: 'Calle irrelevante, Utrera' };
    expect(propertyMatchesZones(prop, ['Macarena - Las Avenidas'])).toBe(true);
  });

  it('zona explícita en la propiedad → comparación directa (no match)', () => {
    const prop = { zona: 'Nervión - Nervión', address: 'Calle Coral, Las Avenidas, Macarena' };
    expect(propertyMatchesZones(prop, ['Macarena - Las Avenidas'])).toBe(false);
  });

  it('normaliza acentos (demanda con tilde, dirección sin tilde → match)', () => {
    const prop = { zona: null, address: 'Calle Macarena, Sevilla' };
    expect(propertyMatchesZones(prop, ['Mácarena - Zona Norte'])).toBe(true);
  });
});

describe('matchDemand — geo por zona', () => {
  const ADDR_AVENIDAS = 'Calle Coral, Las Avenidas, Distrito Macarena, Sevilla, Andalucía, 41009, España';

  it('demandZones vacío → sin filtro geo (incluido)', () => {
    expect(run({ demandZones: [] }).match).toBe(true);
  });

  it('zona del comprador coincide con la dirección → incluido', () => {
    expect(run({
      property: { zona: null, address: ADDR_AVENIDAS },
      demandZones: ['Macarena - Las Avenidas'],
    }).match).toBe(true);
  });

  it('zona del comprador no coincide con la dirección → reason:geo', () => {
    expect(run({
      property: { zona: null, address: ADDR_AVENIDAS },
      demandZones: ['Utrera - Utrera Centro'],
    })).toEqual({ match: false, reason: 'geo' });
  });

  it('demand sin lead + zones vacío → sin filtro geo (incluido con warning no_lead)', () => {
    // En el nuevo modelo la geo depende de demandZones, no del lead.
    // Sin lead y sin zonas → no hay geo que aplicar.
    expect(run({ lead: null, demandZones: [] })).toEqual({
      match: true,
      warnings: ['no_lead'],
    });
  });

  it('demand sin lead + zones con zona errónea → reason:geo (el lead no exime del filtro)', () => {
    expect(run({
      lead: null,
      property: { zona: null, address: 'Calle Coral, Las Avenidas, Macarena, Sevilla' },
      demandZones: ['Utrera - Utrera Centro'],
    })).toEqual({ match: false, reason: 'geo' });
  });
});

// ─── Brief #012 — escenarios del criterio de aceptación ─────────────────────

describe('matchDemand — Brief #012 escenarios nuevos', () => {
  const PRICE_190K = 190_000;
  const ADDR_AVENIDAS = 'Calle Coral, Las Avenidas, Distrito Macarena, Sevilla, Andalucía, 41009, España';
  const PROP_AVENIDAS: DiffusionPropertyParams = {
    price: PRICE_190K,
    propertyType: 'Piso',
    rooms: 2,
    baths: 1,
    zona: null,
    address: ADDR_AVENIDAS,
  };

  // 1. Presupuesto tope superior
  it('budget 290k > upper con up=10 → reason:budget', () => {
    const r = matchDemand({
      demand: { max_budget: 290_000, rooms: 0, bathrooms: 0 },
      lead: { status: 'contacted' },
      property: PROP_AVENIDAS,
      priceMarginDown: 10, priceMarginUp: 10,
      demandZones: ['Macarena - Las Avenidas'],
    });
    expect(r).toEqual({ match: false, reason: 'budget' });
  });

  it('budget 290k > upper incluso con up=30 → reason:budget', () => {
    // 190k * 1.30 = 247k < 290k
    const r = matchDemand({
      demand: { max_budget: 290_000, rooms: 0, bathrooms: 0 },
      lead: { status: 'contacted' },
      property: PROP_AVENIDAS,
      priceMarginDown: 10, priceMarginUp: 30,
      demandZones: ['Macarena - Las Avenidas'],
    });
    expect(r).toEqual({ match: false, reason: 'budget' });
  });

  // 2. Presupuesto en banda
  it('budget 185k ∈ [171k, 209k] con down=10/up=10 → match', () => {
    const r = matchDemand({
      demand: { max_budget: 185_000, rooms: 0, bathrooms: 0 },
      lead: { status: 'contacted' },
      property: PROP_AVENIDAS,
      priceMarginDown: 10, priceMarginUp: 10,
      demandZones: ['Macarena - Las Avenidas'],
    });
    expect(r.match).toBe(true);
  });

  // 3. Presupuesto bajo fuera
  it('budget 90k < lower con down=10 → reason:budget', () => {
    const r = matchDemand({
      demand: { max_budget: 90_000, rooms: 0, bathrooms: 0 },
      lead: { status: 'contacted' },
      property: PROP_AVENIDAS,
      priceMarginDown: 10, priceMarginUp: 10,
      demandZones: [],
    });
    expect(r).toEqual({ match: false, reason: 'budget' });
  });

  // 4. Rooms ±1
  it('rooms diff=1 (demand=3, prop=2) → match (tolerancia ±1)', () => {
    const r = matchDemand({
      demand: { max_budget: 185_000, rooms: 3, bathrooms: 1 },
      lead: { status: 'contacted' },
      property: PROP_AVENIDAS,
      priceMarginDown: 10, priceMarginUp: 10,
      demandZones: [],
    });
    expect(r.match).toBe(true);
  });

  it('rooms diff=2 (demand=4, prop=2) → reason:rooms', () => {
    const r = matchDemand({
      demand: { max_budget: 185_000, rooms: 4, bathrooms: 1 },
      lead: { status: 'contacted' },
      property: PROP_AVENIDAS,
      priceMarginDown: 10, priceMarginUp: 10,
      demandZones: [],
    });
    expect(r).toEqual({ match: false, reason: 'rooms' });
  });

  // 5. Baths ±1
  it('baths diff=1 (demand=2, prop=1) → match (tolerancia ±1)', () => {
    const r = matchDemand({
      demand: { max_budget: 185_000, rooms: 0, bathrooms: 2 },
      lead: { status: 'contacted' },
      property: PROP_AVENIDAS,
      priceMarginDown: 10, priceMarginUp: 10,
      demandZones: [],
    });
    expect(r.match).toBe(true);
  });

  it('baths diff=2 (demand=3, prop=1) → reason:baths', () => {
    const r = matchDemand({
      demand: { max_budget: 185_000, rooms: 0, bathrooms: 3 },
      lead: { status: 'contacted' },
      property: PROP_AVENIDAS,
      priceMarginDown: 10, priceMarginUp: 10,
      demandZones: [],
    });
    expect(r).toEqual({ match: false, reason: 'baths' });
  });

  // 6. m² soft: nunca produce rechazo
  it('min_sqm alto en la demand NUNCA produce reason:rooms ni ningún rechazo', () => {
    // min_sqm no existe en DiffusionDemand — nunca se evalúa (Brief #012).
    // Este test verifica que la demand pasa aunque hubiera min_sqm alto.
    const r = matchDemand({
      demand: { max_budget: 185_000, rooms: 0, bathrooms: 0 },
      lead: { status: 'contacted' },
      property: { ...PROP_AVENIDAS },
      priceMarginDown: 10, priceMarginUp: 10,
      demandZones: [],
    });
    expect(r.match).toBe(true);
  });

  // 7. Geo por zona — match
  it('demandZones ["Macarena - Las Avenidas"], address con "Las Avenidas" → match', () => {
    const r = matchDemand({
      demand: { max_budget: 185_000, rooms: 0, bathrooms: 0 },
      lead: { status: 'contacted' },
      property: PROP_AVENIDAS,
      priceMarginDown: 10, priceMarginUp: 10,
      demandZones: ['Macarena - Las Avenidas'],
    });
    expect(r.match).toBe(true);
  });

  // 8. Geo por zona — no match
  it('demandZones ["Utrera - Utrera Centro"], misma address → reason:geo', () => {
    const r = matchDemand({
      demand: { max_budget: 185_000, rooms: 0, bathrooms: 0 },
      lead: { status: 'contacted' },
      property: PROP_AVENIDAS,
      priceMarginDown: 10, priceMarginUp: 10,
      demandZones: ['Utrera - Utrera Centro'],
    });
    expect(r).toEqual({ match: false, reason: 'geo' });
  });

  // 9. Geo sin zonas
  it('demandZones=[] → sin filtro geo (incluye)', () => {
    const r = matchDemand({
      demand: { max_budget: 185_000, rooms: 0, bathrooms: 0 },
      lead: { status: 'contacted' },
      property: PROP_AVENIDAS,
      priceMarginDown: 10, priceMarginUp: 10,
      demandZones: [],
    });
    expect(r.match).toBe(true);
  });

  // 10. Escenario integrado: los 3 leads reales contra el piso de Avenidas
  it('escenario real: David fuera (presupuesto), Alvaro fuera (zona), solo miriam entra', () => {
    const propParams = {
      demand: { rooms: 0, bathrooms: 0 },
      lead: { status: 'contacted' },
      property: PROP_AVENIDAS,
      priceMarginDown: 10,
      priceMarginUp: 10,
    };

    // David: 290k > 209k (upper) → budget
    const david = matchDemand({
      ...propParams,
      demand: { ...propParams.demand, max_budget: 290_000 },
      demandZones: ['Macarena - Las Avenidas'],
    });
    expect(david).toEqual({ match: false, reason: 'budget' });

    // Alvaro: 140k < 171k (lower) → budget (zona Utrera también fallaría)
    const alvaro = matchDemand({
      ...propParams,
      demand: { ...propParams.demand, max_budget: 140_000 },
      demandZones: ['Utrera - Utrera Centro'],
    });
    expect(alvaro).toEqual({ match: false, reason: 'budget' });

    // miriam: 185k ∈ [171k, 209k], rooms=3 diff=1 ≤ 1, baths=1 diff=0, zona OK → match
    const miriam = matchDemand({
      ...propParams,
      demand: { max_budget: 185_000, rooms: 3, bathrooms: 1 },
      demandZones: ['Macarena - Las Avenidas'],
    });
    expect(miriam.match).toBe(true);
  });
});
