/**
 * Estimación rápida y barata de rango de precio para la web pública de valoración.
 * NO usa IA ni red — aritmética local sobre una tabla de €/m² por zona.
 * El informe preciso lo genera Álvaro con el motor IA del CRM (Brief #016).
 *
 * ⚠️ TABLA A CALIBRAR POR ÁLVARO: los €/m² son orientativos 2025-2026.
 *    El rango ancho (±12%) absorbe imprecisión; aun así Álvaro debe revisar los valores.
 */

// €/m² de referencia por código postal de Sevilla capital + pueblos.
// VALORES INICIALES ORIENTATIVOS — Álvaro debe calibrarlos.
export const ZONE_PRICES_M2: Record<string, number> = {
  // Sevilla capital
  '41001': 3400, '41002': 2600, '41003': 2700, '41004': 3300,
  '41005': 2500, '41006': 1700, '41007': 1900, '41008': 1700,
  '41009': 1900, '41010': 2500, '41011': 3000, '41012': 1700,
  '41013': 2600, '41014': 1900, '41018': 2800, '41019': 1500,
  '41020': 1700,
  // Aljarafe / pueblos (ejemplos — completar)
  '41940': 2300, // Tomares
  '41927': 1800, // Mairena del Aljarafe
  '41930': 2000, // Bormujos
  '41700': 1500, // Dos Hermanas
  '41900': 1700, // Camas
  // ...
};

const FALLBACK_M2 = 1700;          // Sevilla provincia genérico
const FALLBACK_CAPITAL = 2200;     // si CP empieza por 410xx pero no está mapeado

// Factor por estado (alineado con ESTADO_AJUSTE de valuation.ts).
const ESTADO_FACTOR: Record<string, number> = {
  reformar: 0.82,
  bueno: 1.0,
  reformado: 1.12,
};

export interface QuickRangeInput {
  zipcode?: string;
  sqm: number;
  condition?: string;        // 'reformar' | 'bueno' | 'reformado'
  hasElevator?: boolean;
  hasTerrace?: boolean;
  hasGarage?: boolean;
}

export interface QuickRange {
  low: number;
  high: number;
  central: number;
  pricePerM2: number;
  confidence: 'orientativa';
}

export function computeQuickRange(input: QuickRangeInput): QuickRange | null {
  if (!input.sqm || input.sqm <= 0) return null;
  const cp = (input.zipcode || '').trim();
  const base =
    ZONE_PRICES_M2[cp] ??
    (cp.startsWith('410') || cp.startsWith('411') ? FALLBACK_CAPITAL : FALLBACK_M2);

  const estado = ESTADO_FACTOR[input.condition || 'bueno'] ?? 1.0;
  // Extras: pequeños bumps acotados (no inflar).
  let extras = 1;
  if (input.hasGarage) extras += 0.04;
  if (input.hasTerrace) extras += 0.02;
  if (input.hasElevator) extras += 0.01;

  const central = base * input.sqm * estado * extras;
  const round = (n: number) => Math.round(n / 1000) * 1000;
  return {
    central: round(central),
    low: round(central * 0.88),
    high: round(central * 1.12),
    pricePerM2: Math.round(base * estado),
    confidence: 'orientativa',
  };
}
