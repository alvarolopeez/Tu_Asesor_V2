/**
 * Tests del cálculo rápido de rango de precio por zona (Brief #017 T2).
 * Aritmética local pura — sin red, sin IA. El informe fino lo da el CRM.
 */

import { computeQuickRange, ZONE_PRICES_M2 } from '../zoneValuation';

describe('computeQuickRange — base por zona', () => {
  it('CP mapeado usa su €/m² de la tabla', () => {
    // 41009 = 1900 €/m². 1900 * 100 m² * 1.0 (bueno) = 190.000.
    const r = computeQuickRange({ zipcode: '41009', sqm: 100, condition: 'bueno' });
    expect(r).not.toBeNull();
    expect(r!.pricePerM2).toBe(1900);
    expect(r!.central).toBe(190000);
    expect(r!.low).toBe(167000); // round(190000 * 0.88)
    expect(r!.high).toBe(213000); // round(190000 * 1.12)
    expect(r!.confidence).toBe('orientativa');
  });

  it('CP de capital NO mapeado cae al fallback capital (2200)', () => {
    // 41015 empieza por 410 pero no está en la tabla → 2200 €/m².
    const r = computeQuickRange({ zipcode: '41015', sqm: 100, condition: 'bueno' });
    expect(r!.pricePerM2).toBe(2200);
    expect(r!.central).toBe(220000);
  });

  it('CP fuera de capital y sin mapear cae al fallback provincial (1700)', () => {
    // 41710 (Utrera) no está en la tabla ni empieza por 410/411 → 1700 €/m².
    const r = computeQuickRange({ zipcode: '41710', sqm: 100, condition: 'bueno' });
    expect(r!.pricePerM2).toBe(1700);
    expect(r!.central).toBe(170000);
  });

  it('CP vacío / ausente cae al fallback provincial', () => {
    const r = computeQuickRange({ sqm: 100 });
    expect(r!.pricePerM2).toBe(1700);
  });
});

describe('computeQuickRange — factor de estado', () => {
  it('reformado vale más que reformar para el mismo inmueble', () => {
    const reformar = computeQuickRange({ zipcode: '41009', sqm: 100, condition: 'reformar' });
    const reformado = computeQuickRange({ zipcode: '41009', sqm: 100, condition: 'reformado' });
    expect(reformar!.central).toBeLessThan(reformado!.central);
    // reformar: 1900*100*0.82 = 155.800 → 156.000
    expect(reformar!.central).toBe(156000);
    // reformado: 1900*100*1.12 = 212.800 → 213.000
    expect(reformado!.central).toBe(213000);
  });

  it('condición desconocida se trata como buen estado (factor 1.0)', () => {
    const r = computeQuickRange({ zipcode: '41009', sqm: 100, condition: 'inexistente' });
    expect(r!.central).toBe(190000);
  });
});

describe('computeQuickRange — extras acotados', () => {
  it('garaje suma exactamente un 4%', () => {
    const sin = computeQuickRange({ zipcode: '41009', sqm: 100, condition: 'bueno' });
    const con = computeQuickRange({ zipcode: '41009', sqm: 100, condition: 'bueno', hasGarage: true });
    // 1900*100*1.0*1.04 = 197.600 → 198.000
    expect(con!.central).toBe(198000);
    expect(con!.central).toBeGreaterThan(sin!.central);
  });

  it('todos los extras juntos no superan +7%', () => {
    const r = computeQuickRange({
      zipcode: '41009', sqm: 100, condition: 'bueno',
      hasGarage: true, hasTerrace: true, hasElevator: true,
    });
    // factor extras = 1 + 0.04 + 0.02 + 0.01 = 1.07
    expect(r!.central).toBe(203000); // round(1900*100*1.07 = 203.300)
    expect(r!.central).toBeLessThanOrEqual(190000 * 1.07);
  });
});

describe('computeQuickRange — entradas inválidas', () => {
  it('sqm 0 → null', () => {
    expect(computeQuickRange({ zipcode: '41009', sqm: 0 })).toBeNull();
  });

  it('sqm negativo → null', () => {
    expect(computeQuickRange({ zipcode: '41009', sqm: -50 })).toBeNull();
  });

  it('sqm ausente → null', () => {
    expect(computeQuickRange({ zipcode: '41009' } as never)).toBeNull();
  });
});

describe('ZONE_PRICES_M2 — sanidad de la tabla', () => {
  it('todos los valores son €/m² realistas (1.000–5.000)', () => {
    for (const [cp, precio] of Object.entries(ZONE_PRICES_M2)) {
      expect(cp).toMatch(/^\d{5}$/);
      expect(precio).toBeGreaterThanOrEqual(1000);
      expect(precio).toBeLessThanOrEqual(5000);
    }
  });
});
