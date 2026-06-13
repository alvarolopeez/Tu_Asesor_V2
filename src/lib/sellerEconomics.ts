/**
 * Liquidación neta estimada para el VENDEDOR (Brief #016, sección informe).
 *
 * Cálculo 100% DETERMINISTA en código — NUNCA lo hace el LLM (cero alucinación
 * en cifras de dinero/impuestos). Lo consume el PDF de valoración.
 *
 * Fiscalidad España 2026 (verificada por investigación, ver docs/sync/SYNC_AI.md):
 *  - Honorarios agencia: 2% + 21% IVA = 2,42% del precio de venta. Sin comisión al comprador.
 *  - Plusvalía municipal (IIVTNU): min(método objetivo, método real); 0 si no hay incremento.
 *    Tipo Sevilla 26,53% (configurable). Coeficientes RDL 8/2023 vigentes 2026 (no monótonos).
 *  - IRPF ganancia patrimonial: escala del AHORRO 2026 (19/21/23/27/30%), por tramos marginales.
 *  - Notaría/Registro/ITP de la compraventa los paga el COMPRADOR → NO reducen el neto del vendedor.
 *
 * ⚠️ ESTIMACIÓN ORIENTATIVA, no asesoramiento fiscal. Siempre con disclaimers.
 * ⚠️ Constantes propias (las de constants.ts / página /plusvalia son incorrectas).
 */

// ─── Parámetros fiscales 2026 (configurables) ───────────────────────────────────

/** Tipo de gravamen de plusvalía municipal del Ayto. de Sevilla (Ordenanza Fiscal 1.5). */
export const TIPO_PLUSVALIA_SEVILLA = 0.2653;

/**
 * Coeficientes de plusvalía municipal por años completos de tenencia.
 * RDL 8/2023 (vigentes en 2026 tras decaer el RDL 16/2025). NO son monótonos.
 * Índice = años (0 = menos de 1 año). 20 o más → 0,40.
 */
export const COEF_PLUSVALIA_2026: Record<number, number> = {
  0: 0.15, 1: 0.15, 2: 0.14, 3: 0.14, 4: 0.16, 5: 0.18, 6: 0.19, 7: 0.20,
  8: 0.19, 9: 0.15, 10: 0.12, 11: 0.10, 12: 0.09, 13: 0.09, 14: 0.09, 15: 0.09,
  16: 0.10, 17: 0.13, 18: 0.17, 19: 0.23, 20: 0.40,
};

/** Escala del ahorro IRPF 2026 (ganancia patrimonial). [ancho del tramo, tipo]. */
export const ESCALA_AHORRO_2026: ReadonlyArray<readonly [number, number]> = [
  [6000, 0.19],
  [44000, 0.21],
  [150000, 0.23],
  [100000, 0.27],
  [Infinity, 0.30],
];

// Supuestos por defecto cuando faltan datos (orientativos, marcados como tales).
const ITP_GASTOS_ADQ_PCT = 0.11;       // ITP 7% Andalucía + ~4% notaría/registro/gestoría compra
const RATIO_SUELO_DEFAULT = 0.45;      // proporción valor catastral suelo / total en piso
const VC_SUELO_EST_FACTOR = 0.25;      // valor catastral suelo ≈ 0,25 × precio si no se aporta
const CERTIFICADO_ENERGETICO = 150;    // € (rango 100-300)
const CANCELACION_HIPOTECA = 900;      // € registral (rango 600-1.000)
const COMISION_PCT_DEFAULT = 2;        // %
const IVA = 0.21;

// ─── Tipos ──────────────────────────────────────────────────────────────────────

export interface SellerNetParams {
  precioVenta: number;
  precioCompra?: number;
  anioCompra?: number;
  anioVenta?: number;
  valorCatastralSuelo?: number;
  valorCatastralTotal?: number;
  comisionPct?: number;
  gastosAdquisicionReales?: number;
  esViviendaHabitual?: boolean;
  vendedorMayor65?: boolean;
  tieneHipoteca?: boolean;
  capitalPendiente?: number;
}

export interface SellerLine {
  label: string;
  amount: number;            // valor con signo (negativo = resta)
  kind: 'resta' | 'neto' | 'sub';
  nota?: string;
}

export interface SellerNetResult {
  calculable: boolean;       // true si hay precioCompra (liquidación completa)
  precioVenta: number;
  comision: { base: number; iva: number; total: number; pct: number };
  plusvalia: { importe: number; metodo: 'objetivo' | 'real' | 'no_sujeta' | 'n/d'; esEstimacionSuelo: boolean; cuotaObjetivo: number | null; cuotaReal: number | null };
  certificadoEnergetico: number;
  cancelacionHipoteca: number;
  irpf: { importe: number; ganancia: number | null; valorTransmision: number | null; valorAdquisicion: number | null; noCalculable: boolean; exento: string | null; esEstimacionGastos: boolean };
  netoVendedor: number;
  netoLiquidoTrasHipoteca: number | null;
  lineas: SellerLine[];
  advertencias: string[];
  disclaimers: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────────

export function coefPlusvalia(anios: number): number {
  const a = Math.max(0, Math.floor(anios));
  if (a >= 20) return COEF_PLUSVALIA_2026[20];
  return COEF_PLUSVALIA_2026[a] ?? COEF_PLUSVALIA_2026[0];
}

/** Cuota IRPF del ahorro por tramos marginales. */
export function irpfAhorro(ganancia: number): number {
  if (ganancia <= 0) return 0;
  let g = ganancia;
  let cuota = 0;
  for (const [ancho, tipo] of ESCALA_AHORRO_2026) {
    const x = Math.min(g, ancho);
    cuota += x * tipo;
    g -= x;
    if (g <= 0) break;
  }
  return cuota;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

// ─── Cálculo principal ───────────────────────────────────────────────────────────

export function computeSellerNet(params: SellerNetParams): SellerNetResult {
  const advertencias: string[] = [];
  const precioVenta = params.precioVenta;
  const comisionPct = params.comisionPct ?? COMISION_PCT_DEFAULT;
  const anioVenta = params.anioVenta ?? 2026;

  // PASO 1 — Comisión agencia (2% + IVA)
  const comisionBase = precioVenta * (comisionPct / 100);
  const ivaComision = comisionBase * IVA;
  const comisionTotal = comisionBase + ivaComision;

  // PASO 2 — Costes fijos del vendedor
  const certificadoEnergetico = CERTIFICADO_ENERGETICO;
  const cancelacionHipoteca = params.tieneHipoteca ? CANCELACION_HIPOTECA : 0;

  const hayPrecioCompra = typeof params.precioCompra === 'number' && params.precioCompra > 0;
  const precioCompra = hayPrecioCompra ? (params.precioCompra as number) : 0;

  // PASO 3 — Años de tenencia
  const aniosTenencia = params.anioCompra ? Math.max(0, anioVenta - params.anioCompra) : 0;

  // PASO 4-6 — Plusvalía municipal (min objetivo vs real; 0 si no hay incremento)
  const incrementoReal = hayPrecioCompra ? precioVenta - precioCompra : null;
  let plusvaliaImporte = 0;
  let metodo: SellerNetResult['plusvalia']['metodo'] = 'n/d';
  let cuotaObjetivo: number | null = null;
  let cuotaReal: number | null = null;
  let esEstimacionSuelo = false;

  if (incrementoReal !== null && incrementoReal <= 0) {
    plusvaliaImporte = 0;
    metodo = 'no_sujeta';
  } else if (params.anioCompra) {
    // valor catastral del suelo (aportado o estimado)
    let vcSuelo = params.valorCatastralSuelo ?? 0;
    if (!vcSuelo) {
      vcSuelo = precioVenta * VC_SUELO_EST_FACTOR;
      esEstimacionSuelo = true;
    }
    const ratioSuelo = params.valorCatastralSuelo && params.valorCatastralTotal
      ? params.valorCatastralSuelo / params.valorCatastralTotal
      : RATIO_SUELO_DEFAULT;

    cuotaObjetivo = vcSuelo * coefPlusvalia(aniosTenencia) * TIPO_PLUSVALIA_SEVILLA;
    cuotaReal = incrementoReal !== null
      ? Math.max(0, incrementoReal) * ratioSuelo * TIPO_PLUSVALIA_SEVILLA
      : null;

    if (cuotaReal !== null && cuotaReal < cuotaObjetivo) {
      plusvaliaImporte = cuotaReal;
      metodo = 'real';
    } else {
      plusvaliaImporte = cuotaObjetivo;
      metodo = 'objetivo';
    }
    if (esEstimacionSuelo) advertencias.push('Plusvalía municipal estimada: falta el valor catastral del suelo (consúltalo en el recibo del IBI para afinar).');
  } else {
    advertencias.push('Plusvalía municipal no calculada: falta el año de compra.');
  }

  // PASO 7-11 — IRPF ganancia patrimonial
  let irpfImporte = 0;
  let ganancia: number | null = null;
  let valorTransmision: number | null = null;
  let valorAdquisicion: number | null = null;
  let noCalculable = false;
  let exento: string | null = null;
  let esEstimacionGastos = false;

  if (!hayPrecioCompra) {
    noCalculable = true;
    advertencias.push('IRPF no calculable: falta el precio de compra original.');
  } else {
    valorTransmision = precioVenta - comisionTotal - plusvaliaImporte - certificadoEnergetico - cancelacionHipoteca;
    if (typeof params.gastosAdquisicionReales === 'number' && params.gastosAdquisicionReales > 0) {
      valorAdquisicion = precioCompra + params.gastosAdquisicionReales;
    } else {
      valorAdquisicion = precioCompra * (1 + ITP_GASTOS_ADQ_PCT);
      esEstimacionGastos = true;
    }
    ganancia = valorTransmision - valorAdquisicion;

    if (params.esViviendaHabitual && params.vendedorMayor65) {
      irpfImporte = 0;
      exento = 'Exento: vivienda habitual de mayor de 65 años.';
    } else if (ganancia <= 0) {
      irpfImporte = 0;
    } else {
      irpfImporte = irpfAhorro(ganancia);
    }
    if (params.anioCompra && params.anioCompra < 1995) {
      advertencias.push('Comprado antes de 1995: pueden aplicar coeficientes de abatimiento que reducen el IRPF (dependen del historial del contribuyente; consultar asesor).');
    }
    if (esEstimacionGastos) advertencias.push('Gastos de compra estimados al 11% del precio de compra (ITP + notaría/registro/gestoría); si los conoces con factura, el IRPF se afina.');
  }

  // PASO 12 — Neto al vendedor
  const netoVendedor = precioVenta - comisionTotal - plusvaliaImporte - certificadoEnergetico - cancelacionHipoteca - irpfImporte;
  const capitalPendiente = params.tieneHipoteca && params.capitalPendiente ? params.capitalPendiente : 0;
  const netoLiquidoTrasHipoteca = params.tieneHipoteca ? netoVendedor - capitalPendiente : null;

  // PASO 13 — Líneas del desglose
  const lineas: SellerLine[] = [];
  lineas.push({ label: 'Precio de venta objetivo', amount: r2(precioVenta), kind: 'sub' });
  lineas.push({ label: `Honorarios de intermediación (${comisionPct}% + IVA 21%)`, amount: -r2(comisionTotal), kind: 'resta' });
  if (metodo === 'no_sujeta') {
    lineas.push({ label: 'Plusvalía municipal (IIVTNU)', amount: 0, kind: 'resta', nota: 'No sujeta: no hay incremento de valor (venta ≤ compra).' });
  } else if (metodo !== 'n/d') {
    lineas.push({ label: `Plusvalía municipal (IIVTNU, método ${metodo})`, amount: -r2(plusvaliaImporte), kind: 'resta', nota: esEstimacionSuelo ? 'Estimación (falta valor catastral del suelo).' : undefined });
  } else {
    lineas.push({ label: 'Plusvalía municipal (IIVTNU)', amount: 0, kind: 'resta', nota: 'No calculada (falta año de compra).' });
  }
  lineas.push({ label: 'Certificado de eficiencia energética', amount: -r2(certificadoEnergetico), kind: 'resta' });
  if (cancelacionHipoteca > 0) {
    lineas.push({ label: 'Cancelación registral de hipoteca', amount: -r2(cancelacionHipoteca), kind: 'resta' });
  }
  if (noCalculable) {
    lineas.push({ label: 'IRPF (ganancia patrimonial)', amount: 0, kind: 'resta', nota: 'No calculable: falta el precio de compra.' });
  } else if (exento) {
    lineas.push({ label: 'IRPF (ganancia patrimonial)', amount: 0, kind: 'resta', nota: exento });
  } else if (ganancia !== null && ganancia <= 0) {
    lineas.push({ label: 'IRPF (ganancia patrimonial)', amount: 0, kind: 'resta', nota: 'Pérdida patrimonial: sin IRPF.' });
  } else {
    lineas.push({ label: 'IRPF (ganancia patrimonial, escala del ahorro)', amount: -r2(irpfImporte), kind: 'resta' });
  }
  lineas.push({ label: 'NETO ESTIMADO PARA EL VENDEDOR', amount: r2(netoVendedor), kind: 'neto' });
  if (netoLiquidoTrasHipoteca !== null) {
    lineas.push({ label: 'Capital pendiente de hipoteca', amount: -r2(capitalPendiente), kind: 'resta' });
    lineas.push({ label: 'LÍQUIDO TRAS CANCELAR HIPOTECA', amount: r2(netoLiquidoTrasHipoteca), kind: 'neto' });
  }

  const disclaimers = [
    'Estimación orientativa y NO vinculante. No constituye asesoramiento fiscal: la cuota real depende de circunstancias personales del vendedor. Consulte con un asesor o gestor.',
    'La notaría, el registro, el ITP y la gestoría de la compraventa los paga el COMPRADOR: no reducen lo que recibe el vendedor.',
    'El IRPF se estima asumiendo que la ganancia es la única renta del ahorro del año y que el vendedor es residente fiscal en España.',
    'Si es vivienda habitual y el vendedor tiene más de 65 años, o reinvierte en otra vivienda habitual, la ganancia puede quedar exenta.',
  ];

  return {
    calculable: hayPrecioCompra,
    precioVenta,
    comision: { base: r2(comisionBase), iva: r2(ivaComision), total: r2(comisionTotal), pct: comisionPct },
    plusvalia: { importe: r2(plusvaliaImporte), metodo, esEstimacionSuelo, cuotaObjetivo: cuotaObjetivo !== null ? r2(cuotaObjetivo) : null, cuotaReal: cuotaReal !== null ? r2(cuotaReal) : null },
    certificadoEnergetico,
    cancelacionHipoteca,
    irpf: { importe: r2(irpfImporte), ganancia: ganancia !== null ? r2(ganancia) : null, valorTransmision: valorTransmision !== null ? r2(valorTransmision) : null, valorAdquisicion: valorAdquisicion !== null ? r2(valorAdquisicion) : null, noCalculable, exento, esEstimacionGastos },
    netoVendedor: r2(netoVendedor),
    netoLiquidoTrasHipoteca: netoLiquidoTrasHipoteca !== null ? r2(netoLiquidoTrasHipoteca) : null,
    lineas,
    advertencias,
    disclaimers,
  };
}

// ─── Servicios de intermediación (contenido estático del informe) ───────────────

export const SERVICIOS_INTERMEDIACION = {
  honorarios: 'Honorarios del 2% + IVA sobre el precio de venta. Sin comisión para el comprador.',
  incluidos: [
    'Sesión de fotografía profesional',
    'Tour virtual del inmueble',
    'Anuncios personalizados en redes sociales',
    'Difusión con base de datos inteligente mediante inteligencia artificial',
    'Filtración y cualificación de cada solicitud de visita',
    'Apoyo financiero a través de empresa especializada en tramitación de hipotecas',
    'Tirada superior a 1.000 flyers personalizados por semana',
  ],
} as const;
