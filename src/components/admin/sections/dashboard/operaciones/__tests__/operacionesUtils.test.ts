/**
 * Tests para operacionesUtils — Brief #014 (5 paneles dashboard Operaciones).
 * Módulos puros, sin Supabase.
 */

import {
  OPTIMO_CIERRE_DIAS,
  PRICE_RANGES,
  computeOwnerPipeline,
  computeMarketDays,
  computeZoneDemand,
  computeGrowth,
  computeBuyerProfiles,
  computePriceDropEstimate,
} from "../operacionesUtils";

import type {
  LeadRow,
  EncargoRow,
  SellerActivityLogRow,
  PropertyRow,
  BuyerDemandRow,
} from "../../types";

// ─── Helpers ──────────────────────────────────────────────────

function makeLead(overrides: Partial<LeadRow> = {}): LeadRow {
  return {
    id: "l1",
    name: "Test Lead",
    phone: null,
    email: null,
    type: "seller",
    status: "new",
    source: null,
    property_id: null,
    preferences: {},
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeEncargo(overrides: Partial<EncargoRow> = {}): EncargoRow {
  return {
    id: "e1",
    seller_lead_id: null,
    property_id: null,
    fecha_firma: null,
    status: "activo",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeSellerLog(overrides: Partial<SellerActivityLogRow> = {}): SellerActivityLogRow {
  return {
    id: "sl1",
    lead_id: "l1",
    event_type: "Contrato privado",
    event_date: "2026-01-15T00:00:00Z",
    property_id: null,
    ...overrides,
  };
}

function makeProperty(overrides: Partial<PropertyRow> = {}): PropertyRow {
  return {
    id: "p1",
    title: "Test",
    description: null,
    price: 200_000,
    status: null,
    features: {},
    images: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    published_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeDemand(overrides: Partial<BuyerDemandRow> = {}): BuyerDemandRow {
  return {
    id: "d1",
    name: "Comprador",
    phone: null,
    email: null,
    max_budget: 200_000,
    status: "Activo",
    preferred_zones: null,
    created_at: "2026-01-15T00:00:00Z",
    funding_type: null,
    lead_id: null,
    ...overrides,
  };
}

// ─── OPTIMO_CIERRE_DIAS ────────────────────────────────────────

test("OPTIMO_CIERRE_DIAS es 26", () => {
  expect(OPTIMO_CIERRE_DIAS).toBe(26);
});

// ─── computeOwnerPipeline ──────────────────────────────────────

describe("computeOwnerPipeline", () => {
  const noFilter = { from: null, to: null };

  test("sin filtro — cuenta todas las etapas", () => {
    const leads = [
      makeLead({ status: "new" }),
      makeLead({ id: "l2", status: "contacted" }),
      makeLead({ id: "l3", status: "closed" }),
    ];
    const encargos = [
      makeEncargo({ fecha_firma: "2026-01-10T00:00:00Z" }),
      makeEncargo({ id: "e2", status: "vendido", updated_at: "2026-02-01T00:00:00Z" }),
    ];
    const logs = [makeSellerLog()];

    const stages = computeOwnerPipeline(leads, encargos, logs, noFilter);
    const get = (key: string) => stages.find(s => s.key === key)?.count ?? -1;

    expect(get("nuevos")).toBe(1);
    expect(get("contactados")).toBe(1);
    expect(get("adquisiciones")).toBe(1);
    expect(get("encargosFirmados")).toBe(1);
    expect(get("contratosFirmados")).toBe(1);
    expect(get("vendidos")).toBe(1);
  });

  test("filtro de fechas excluye registros fuera del rango", () => {
    const leads = [
      makeLead({ status: "new", created_at: "2026-01-01T00:00:00Z" }),
      makeLead({ id: "l2", status: "new", created_at: "2025-01-01T00:00:00Z" }),
    ];
    const from = new Date("2026-01-01T00:00:00Z");
    const to = new Date("2026-12-31T00:00:00Z");
    const stages = computeOwnerPipeline(leads, [], [], { from, to });
    expect(stages.find(s => s.key === "nuevos")?.count).toBe(1);
  });

  test("encargo con fecha_firma dentro del rango cuenta; fuera no", () => {
    const encargos = [
      makeEncargo({ id: "e1", fecha_firma: "2026-03-01T00:00:00Z" }),
      makeEncargo({ id: "e2", fecha_firma: "2025-01-01T00:00:00Z" }),
    ];
    const from = new Date("2026-01-01T00:00:00Z");
    const to = new Date("2026-12-31T00:00:00Z");
    const stages = computeOwnerPipeline([], encargos, [], { from, to });
    expect(stages.find(s => s.key === "encargosFirmados")?.count).toBe(1);
  });

  test("Contrato privado se cuenta por event_type exacto", () => {
    const logs = [
      makeSellerLog({ event_type: "Contrato privado", event_date: "2026-02-01T00:00:00Z" }),
      makeSellerLog({ id: "sl2", event_type: "Otro evento", event_date: "2026-02-01T00:00:00Z" }),
    ];
    const stages = computeOwnerPipeline([], [], logs, noFilter);
    expect(stages.find(s => s.key === "contratosFirmados")?.count).toBe(1);
  });

  test("vendido cuenta encargos con status='vendido'", () => {
    const encargos = [
      makeEncargo({ status: "vendido" }),
      makeEncargo({ id: "e2", status: "activo" }),
    ];
    const stages = computeOwnerPipeline([], encargos, [], noFilter);
    expect(stages.find(s => s.key === "vendidos")?.count).toBe(1);
  });
});

// ─── computeMarketDays ────────────────────────────────────────

describe("computeMarketDays", () => {
  test("usa PRICE_RANGES por defecto (6 franjas)", () => {
    const result = computeMarketDays([]);
    expect(result).toHaveLength(PRICE_RANGES.length);
    expect(result[0].label).toBe("< 150k");
    expect(result[5].label).toBe("> 700k");
  });

  test("calcula la media correctamente", () => {
    const props = [
      makeProperty({ price: 200_000, published_at: new Date(Date.now() - 30 * 86_400_000).toISOString() }),
      makeProperty({ id: "p2", price: 210_000, published_at: new Date(Date.now() - 50 * 86_400_000).toISOString() }),
    ];
    const result = computeMarketDays(props);
    const range = result.find(r => r.label === "150k-250k")!;
    expect(range.avg).toBe(40); // (30+50)/2
  });

  test("filtra por año correctamente", () => {
    const props = [
      makeProperty({ price: 200_000, published_at: "2025-06-01T00:00:00Z" }),
      makeProperty({ id: "p2", price: 200_000, published_at: "2026-06-01T00:00:00Z" }),
    ];
    const result2025 = computeMarketDays(props, { year: 2025 });
    const result2026 = computeMarketDays(props, { year: 2026 });
    const range = (r: typeof result2025) => r.find(x => x.label === "150k-250k")!;
    // 2025 tiene 1 propiedad (avg > 0); 2026 tiene 1 (avg > 0); ambas deben diferir
    expect(range(result2025).avg).toBeGreaterThan(range(result2026).avg);
  });

  test("bucketSize=100000 genera rangos de 100k", () => {
    const result = computeMarketDays([], { bucketSize: 100_000 });
    expect(result[0].label).toBe("< 100k");
    expect(result[1].label).toBe("100k-200k");
  });
});

// ─── computeZoneDemand ────────────────────────────────────────

describe("computeZoneDemand", () => {
  test("panel vacío si no hay demands con preferred_zones", () => {
    expect(computeZoneDemand([])).toHaveLength(0);
    expect(computeZoneDemand([makeDemand()])).toHaveLength(0);
  });

  test("cuenta compradores por zona y calcula presupuesto medio", () => {
    const demands = [
      makeDemand({ preferred_zones: ["Macarena"], max_budget: 200_000 }),
      makeDemand({ id: "d2", preferred_zones: ["Macarena", "Nervión"], max_budget: 300_000 }),
    ];
    const result = computeZoneDemand(demands);
    const macarena = result.find(r => r.zone === "Macarena")!;
    const nervion = result.find(r => r.zone === "Nervión")!;
    expect(macarena.count).toBe(2);
    expect(macarena.avgBudget).toBe(250_000);
    expect(nervion.count).toBe(1);
  });

  test("solo cuenta demands con status='Activo'", () => {
    const demands = [
      makeDemand({ preferred_zones: ["Triana"], status: "Activo" }),
      makeDemand({ id: "d2", preferred_zones: ["Triana"], status: "Inactivo" }),
    ];
    const result = computeZoneDemand(demands);
    expect(result.find(r => r.zone === "Triana")!.count).toBe(1);
  });

  test("devuelve máximo 10 zonas ordenadas por count desc", () => {
    const demands = Array.from({ length: 15 }, (_, i) =>
      makeDemand({ id: `d${i}`, preferred_zones: [`Zona${i}`] }),
    );
    const result = computeZoneDemand(demands);
    expect(result).toHaveLength(10);
  });
});

// ─── computeGrowth ────────────────────────────────────────────

describe("computeGrowth", () => {
  test("devuelve serie mensual de 6 puntos por defecto", () => {
    const result = computeGrowth([]);
    expect(result).toHaveLength(6);
  });

  test("acumula compradores correctamente (granularidad month)", () => {
    const now = new Date();
    // Día 1 del mes actual en UTC para evitar arrastre de zona horaria al día anterior
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01T12:00:00Z`;
    const demands = [
      makeDemand({ created_at: thisMonth }),
      makeDemand({ id: "d2", created_at: thisMonth }),
    ];
    const result = computeGrowth(demands);
    const last = result[result.length - 1];
    expect(last.total).toBe(2);
  });

  test("filtra por precio min/max", () => {
    const demands = [
      makeDemand({ max_budget: 100_000 }),
      makeDemand({ id: "d2", max_budget: 300_000 }),
    ];
    const result = computeGrowth(demands, { priceMin: 150_000, priceMax: 500_000 });
    const total = result[result.length - 1].total;
    expect(total).toBe(1); // solo el de 300k
  });

  test("granularidad 'day' devuelve 7 puntos por defecto", () => {
    const result = computeGrowth([], { granularity: "day" });
    expect(result).toHaveLength(7);
  });

  test("la serie funciona con N puntos (no asume longitud fija)", () => {
    const result = computeGrowth([], { granularity: "year" });
    expect(result.length).toBeGreaterThan(1);
    // todos los totales son números
    result.forEach(d => expect(typeof d.total).toBe("number"));
  });
});

// ─── computeBuyerProfiles ─────────────────────────────────────

describe("computeBuyerProfiles", () => {
  test("capacidad: Hipoteca sin detalle → sin estudio (conservador)", () => {
    const demands = [makeDemand({ funding_type: "Hipoteca" })];
    const result = computeBuyerProfiles(demands);
    expect(result.sinEstudioCount).toBe(1);
    expect(result.contadoCount).toBe(0);
  });

  test("capacidad: Contado → al contado", () => {
    const demands = [makeDemand({ funding_type: "Contado" })];
    const result = computeBuyerProfiles(demands);
    expect(result.contadoCount).toBe(1);
    expect(result.sinEstudioCount).toBe(0);
  });

  test("propósito fallback: Hipoteca → Habitual; Contado → Inversión", () => {
    const demands = [
      makeDemand({ id: "d1", funding_type: "Hipoteca" }),
      makeDemand({ id: "d2", funding_type: "Contado" }),
    ];
    const result = computeBuyerProfiles(demands);
    expect(result.habitualCount).toBe(1);
    expect(result.inversionCount).toBe(1);
  });

  test("tipo_compra confirmado prevalece sobre la regla de fallback", () => {
    const demands = [
      makeDemand({ id: "d1", funding_type: "Hipoteca", lead_id: "lead1" }),
    ];
    const leads: LeadRow[] = [
      makeLead({ id: "lead1", type: "buyer", preferences: { tipo_compra: "inversion" } }),
    ];
    const result = computeBuyerProfiles(demands, leads);
    // A pesar de Hipoteca (que sería Habitual), tipo_compra='inversion' prevalece
    expect(result.inversionCount).toBe(1);
    expect(result.habitualCount).toBe(0);
  });

  test("solo cuenta demands con status='Activo'", () => {
    const demands = [
      makeDemand({ funding_type: "Contado", status: "Activo" }),
      makeDemand({ id: "d2", funding_type: "Contado", status: "Inactivo" }),
    ];
    const result = computeBuyerProfiles(demands);
    expect(result.contadoCount).toBe(1);
    expect(result.totalFinCount).toBe(1);
  });

  test("totalFinCount y totalIntentCount correctos — sin NaN", () => {
    const demands = [
      makeDemand({ funding_type: "Hipoteca" }),
      makeDemand({ id: "d2", funding_type: "Contado" }),
    ];
    const result = computeBuyerProfiles(demands);
    expect(result.totalFinCount).toBe(2);
    expect(result.totalIntentCount).toBe(2);
    expect(isNaN(result.totalFinCount)).toBe(false);
    expect(isNaN(result.totalIntentCount)).toBe(false);
  });

  test("sin demands activos → todos 0 (sin NaN)", () => {
    const result = computeBuyerProfiles([]);
    const keys: (keyof typeof result)[] = [
      "sinEstudioCount", "estudioHechoCount", "preconcedidaCount", "contadoCount",
      "habitualCount", "inversionCount", "totalFinCount", "totalIntentCount",
    ];
    keys.forEach(k => {
      expect(result[k]).toBe(0);
      expect(isNaN(result[k])).toBe(false);
    });
  });
});

// ─── computePriceDropEstimate (umbral OPTIMO_CIERRE_DIAS=26) ───

describe("computePriceDropEstimate — umbral 26 días", () => {
  const BASE = {
    price: 200_000,
    valuation: 200_000,
    avgDays: 60, // media del portal (ya NO es el umbral)
    visits: 5,
    avgVisits: 5,
    marketSampleSize: 5,
  };

  test("inmueble con 40 días genera sugerencia de rebaja (supera óptimo 26)", () => {
    // 40 días: factorTiempo=(40-26)/26≈0.538, rawPct=5×0.538≈2.7 > umbral 0.5%
    const result = computePriceDropEstimate({ ...BASE, daysOnMarket: 40 });
    expect(result.noAdjustment).toBe(false);
    expect(result.pctHigh).toBeGreaterThan(0);
  });

  test("inmueble con 25 días NO genera rebaja por tiempo (por debajo del óptimo)", () => {
    const resultAt25 = computePriceDropEstimate({ ...BASE, daysOnMarket: 25 });
    // Sin sobreprecio y sin bajo número de visitas, el factor tiempo es 0
    expect(resultAt25.noAdjustment).toBe(true);
  });

  test("la razón menciona 'óptimo: 26 días' cuando hay factor tiempo", () => {
    const result = computePriceDropEstimate({ ...BASE, daysOnMarket: 60 });
    expect(result.reasons.some(r => r.includes("26"))).toBe(true);
  });

  test("avgDays ya no actúa como umbral (inmueble por debajo de avgDays pero sobre 26 rebaja)", () => {
    // avgDays=100, daysOnMarket=30 → antes no rebajaría (30 < 100). Ahora sí (30 > 26).
    const result = computePriceDropEstimate({ ...BASE, daysOnMarket: 30, avgDays: 100 });
    expect(result.noAdjustment).toBe(false);
  });
});
