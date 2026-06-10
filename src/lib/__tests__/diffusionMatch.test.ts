/**
 * Tests para matchDemand — Brief #007 T4.
 * Módulo puro: sin mocks de Supabase.
 */

import { matchDemand, type DiffusionPropertyParams } from '../diffusionMatch';

const PROPERTY: DiffusionPropertyParams = {
  price: 200_000,
  propertyType: 'Piso',
  rooms: 3,
  baths: 2,
  lat: 37.39,
  lng: -5.99,
};

function run(overrides: {
  demand?: Record<string, unknown>;
  lead?: Record<string, unknown> | null;
  property?: Partial<DiffusionPropertyParams>;
  priceMargin?: number;
  geoRadius?: number;
} = {}) {
  return matchDemand({
    demand: { max_budget: 250_000, property_type: 'Piso', rooms: 0, bathrooms: 0, ...overrides.demand },
    lead: overrides.lead === undefined
      ? { status: 'contacted', preferences: {} }
      : overrides.lead,
    property: { ...PROPERTY, ...overrides.property },
    priceMargin: overrides.priceMargin ?? 10,
    geoRadius: overrides.geoRadius ?? 5,
  });
}

describe('matchDemand — funnel', () => {
  it('lead closed → descartado', () => {
    expect(run({ lead: { status: 'closed', preferences: {} } })).toEqual({ match: false, reason: 'funnel' });
  });

  it('lead lost → descartado', () => {
    expect(run({ lead: { status: 'lost', preferences: {} } })).toEqual({ match: false, reason: 'funnel' });
  });

  it('lead visit_scheduled → INCLUIDO (una cita no descarta para otros pisos)', () => {
    const r = run({ lead: { status: 'visit_scheduled', preferences: {} } });
    expect(r.match).toBe(true);
  });

  it('demand sin lead → incluida con warning no_lead', () => {
    const r = run({ lead: null });
    expect(r).toEqual({ match: true, warnings: ['no_lead'] });
  });
});

describe('matchDemand — presupuesto', () => {
  it('max_budget dentro del margen → incluido', () => {
    // price 200k, margen 10% → mínimo aceptable 180k.
    expect(run({ demand: { max_budget: 185_000 } }).match).toBe(true);
  });

  it('max_budget por debajo del margen → descartado', () => {
    expect(run({ demand: { max_budget: 150_000 } })).toEqual({ match: false, reason: 'budget' });
  });

  it('max_budget exactamente en el límite → incluido', () => {
    expect(run({ demand: { max_budget: 180_000 } }).match).toBe(true);
  });

  it('max_budget 0 (perfil incompleto) → incluido con warning no_budget', () => {
    expect(run({ demand: { max_budget: 0 } })).toEqual({ match: true, warnings: ['no_budget'] });
  });

  it('max_budget numérico en string (Supabase numeric) → se evalúa bien', () => {
    expect(run({ demand: { max_budget: '150000' } })).toEqual({ match: false, reason: 'budget' });
    expect(run({ demand: { max_budget: '250000' } }).match).toBe(true);
  });
});

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

  it('rooms de la demand mayor que la propiedad → descartado', () => {
    expect(run({ demand: { rooms: 4 } })).toEqual({ match: false, reason: 'rooms' });
  });

  it('rooms 0 = sin filtro', () => {
    expect(run({ demand: { rooms: 0 }, property: { rooms: 0 } }).match).toBe(true);
  });

  it('bathrooms de la demand mayor que la propiedad → descartado', () => {
    expect(run({ demand: { bathrooms: 3 } })).toEqual({ match: false, reason: 'baths' });
  });
});

describe('matchDemand — geo', () => {
  // Polígono pequeño alrededor de (37.39, -5.99) — la propiedad cae dentro.
  const POLY_AROUND_PROP: [number, number][] = [
    [37.38, -6.00],
    [37.40, -6.00],
    [37.40, -5.98],
    [37.38, -5.98],
  ];
  // Polígono lejano (Madrid) — fuera del radio de 5 km.
  const POLY_FAR: [number, number][] = [
    [40.40, -3.71],
    [40.42, -3.71],
    [40.42, -3.69],
    [40.40, -3.69],
  ];

  it('propiedad dentro del polígono del lead → incluido', () => {
    const r = run({ lead: { status: 'new', preferences: { polygons: [POLY_AROUND_PROP] } } });
    expect(r.match).toBe(true);
  });

  it('propiedad fuera del polígono y del radio → descartado', () => {
    const r = run({ lead: { status: 'new', preferences: { polygons: [POLY_FAR] } } });
    expect(r).toEqual({ match: false, reason: 'geo' });
  });

  it('lead sin datos geo → sin filtro geo', () => {
    expect(run({ lead: { status: 'new', preferences: {} } }).match).toBe(true);
  });

  it('demand sin lead → sin filtro geo aunque la propiedad tenga coordenadas', () => {
    expect(run({ lead: null }).match).toBe(true);
  });

  it('propiedad sin coordenadas → sin filtro geo', () => {
    const r = run({
      lead: { status: 'new', preferences: { polygons: [POLY_FAR] } },
      property: { lat: undefined, lng: undefined },
    });
    expect(r.match).toBe(true);
  });
});
