/**
 * Tests del cálculo determinista de liquidación neta al vendedor (Brief #016).
 */

import { computeSellerNet, irpfAhorro, coefPlusvalia } from '../sellerEconomics';

describe('coefPlusvalia (RDL 8/2023, vigente 2026, NO monótono)', () => {
  it('menos de 1 año y 1 año → 0,15', () => {
    expect(coefPlusvalia(0)).toBeCloseTo(0.15, 5);
    expect(coefPlusvalia(1)).toBeCloseTo(0.15, 5);
  });
  it('valle no monótono: cae a su mínimo (0,09) entre los años 12 y 15', () => {
    expect(coefPlusvalia(11)).toBeCloseTo(0.10, 5);
    expect(coefPlusvalia(12)).toBeCloseTo(0.09, 5);
    expect(coefPlusvalia(15)).toBeCloseTo(0.09, 5);
  });
  it('repunta al final y satura en 20+ a 0,40', () => {
    expect(coefPlusvalia(19)).toBeCloseTo(0.23, 5);
    expect(coefPlusvalia(20)).toBeCloseTo(0.40, 5);
    expect(coefPlusvalia(35)).toBeCloseTo(0.40, 5);
  });
});

describe('irpfAhorro (escala del ahorro 2026 por tramos)', () => {
  it('0 o pérdida → 0', () => {
    expect(irpfAhorro(0)).toBe(0);
    expect(irpfAhorro(-1000)).toBe(0);
  });
  it('primer tramo (6.000 al 19%)', () => {
    expect(irpfAhorro(6000)).toBeCloseTo(1140, 2);
  });
  it('hasta 50.000 (19% + 21%)', () => {
    // 6000*0.19 + 44000*0.21 = 1140 + 9240 = 10380
    expect(irpfAhorro(50000)).toBeCloseTo(10380, 2);
  });
  it('tramo 23% intermedio', () => {
    // 10380 + 50000*0.23 = 10380 + 11500 = 21880 para 100.000
    expect(irpfAhorro(100000)).toBeCloseTo(21880, 2);
  });
});

describe('computeSellerNet', () => {
  it('caso completo con ganancia (Coral aprox)', () => {
    const r = computeSellerNet({ precioVenta: 190000, precioCompra: 140000, anioCompra: 2015, anioVenta: 2026 });
    expect(r.calculable).toBe(true);
    // Comisión 2% + IVA
    expect(r.comision.total).toBeCloseTo(4598, 0);
    // Plusvalía: objetivo (1260) < real (5969) → objetivo
    expect(r.plusvalia.metodo).toBe('objetivo');
    expect(r.plusvalia.importe).toBeCloseTo(1260.18, 0);
    expect(r.plusvalia.esEstimacionSuelo).toBe(true);
    // Ganancia ≈ 28.592 → IRPF ≈ 5.884
    expect(r.irpf.importe).toBeCloseTo(5884, -1);
    // Neto ≈ 178.108
    expect(r.netoVendedor).toBeCloseTo(178108, -2);
  });

  it('venta a pérdida → plusvalía no sujeta e IRPF 0', () => {
    const r = computeSellerNet({ precioVenta: 130000, precioCompra: 140000, anioCompra: 2018, anioVenta: 2026 });
    expect(r.plusvalia.metodo).toBe('no_sujeta');
    expect(r.plusvalia.importe).toBe(0);
    expect(r.irpf.importe).toBe(0);
  });

  it('sin precio de compra → no calculable, solo costes de venta', () => {
    const r = computeSellerNet({ precioVenta: 200000 });
    expect(r.calculable).toBe(false);
    expect(r.irpf.noCalculable).toBe(true);
    expect(r.comision.total).toBeCloseTo(4840, 0); // 200000*0.0242
    expect(r.advertencias.some((a) => /precio de compra/i.test(a))).toBe(true);
  });

  it('exención mayores de 65 + vivienda habitual → IRPF 0', () => {
    const r = computeSellerNet({ precioVenta: 300000, precioCompra: 100000, anioCompra: 2000, anioVenta: 2026, esViviendaHabitual: true, vendedorMayor65: true });
    expect(r.irpf.importe).toBe(0);
    expect(r.irpf.exento).toMatch(/65/);
  });

  it('valor catastral del suelo aportado → plusvalía no marcada como estimación', () => {
    const r = computeSellerNet({ precioVenta: 190000, precioCompra: 140000, anioCompra: 2015, anioVenta: 2026, valorCatastralSuelo: 30000, valorCatastralTotal: 70000 });
    expect(r.plusvalia.esEstimacionSuelo).toBe(false);
  });

  it('comisión configurable', () => {
    const r = computeSellerNet({ precioVenta: 100000, comisionPct: 3 });
    expect(r.comision.base).toBeCloseTo(3000, 2);
    expect(r.comision.total).toBeCloseTo(3630, 2); // 3000*1.21
  });

  it('con hipoteca → añade cancelación y líquido tras capital pendiente', () => {
    const r = computeSellerNet({ precioVenta: 200000, precioCompra: 150000, anioCompra: 2016, anioVenta: 2026, tieneHipoteca: true, capitalPendiente: 50000 });
    expect(r.cancelacionHipoteca).toBe(900);
    expect(r.netoLiquidoTrasHipoteca).toBeCloseTo(r.netoVendedor - 50000, 0);
  });
});
