/**
 * Utilidades compartidas del proyecto.
 * Centraliza helpers reutilizados en múltiples componentes.
 */

/**
 * Formatea un número como moneda EUR (sin céntimos).
 * Acepta null/undefined devolviendo "0 €" como fallback.
 * @example formatCurrency(125000) → "125.000 €"
 * @example formatCurrency(null) → "0 €"
 */
export const formatCurrency = (val: number | null | undefined): string => {
  if (val === null || val === undefined || isNaN(Number(val))) return "0 €";
  return Number(val).toLocaleString("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
};
