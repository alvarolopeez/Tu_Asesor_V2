/**
 * Orígenes (source) canónicos de los leads.
 *
 * Antes cada formulario guardaba un slug crudo distinto ('valoracion',
 * 'plusvalia_fiscal', 'buyer_registration'…) que en el CRM se mostraba tal
 * cual, inconsistente. Aquí centralizamos:
 *   • LEAD_SOURCE  → la etiqueta legible que se guarda en `leads.source`.
 *   • displaySource(raw) → normaliza CUALQUIER valor (incluidos los legacy)
 *     a una etiqueta legible para mostrar en el CRM.
 *
 * @created 2026-06-04 (fix #7: origen del lead mal registrado)
 */

export const LEAD_SOURCE = {
  VALORACION: "Calculadora Valoración",
  PLUSVALIA: "Calculadora Plusvalía",
  RENTABILIDAD: "Calculadora Rentabilidad",
  COMPRADOR: "Formulario Comprador",
  RESERVA_WEB: "Reserva Web",
  WHATSAPP: "Paula WhatsApp",
  META_ADS: "Meta Ads",
  MANUAL: "Alta Manual",
  WEB: "Formulario Web",
} as const;

/** Etiquetas seleccionables en el CRM (alta manual / edición). */
export const LEAD_SOURCE_OPTIONS: string[] = [
  LEAD_SOURCE.VALORACION,
  LEAD_SOURCE.PLUSVALIA,
  LEAD_SOURCE.RENTABILIDAD,
  LEAD_SOURCE.COMPRADOR,
  LEAD_SOURCE.RESERVA_WEB,
  LEAD_SOURCE.WHATSAPP,
  LEAD_SOURCE.META_ADS,
  LEAD_SOURCE.MANUAL,
  LEAD_SOURCE.WEB,
];

// Mapa de valores legacy (slugs crudos) → etiqueta legible.
const LEGACY_MAP: Record<string, string> = {
  valoracion: LEAD_SOURCE.VALORACION,
  plusvalia: LEAD_SOURCE.PLUSVALIA,
  plusvalia_fiscal: LEAD_SOURCE.PLUSVALIA,
  rentabilidad: LEAD_SOURCE.RENTABILIDAD,
  buyer_registration: LEAD_SOURCE.COMPRADOR,
  web_public: LEAD_SOURCE.RESERVA_WEB,
  web: LEAD_SOURCE.WEB,
  whatsapp: LEAD_SOURCE.WHATSAPP,
  paula: LEAD_SOURCE.WHATSAPP,
  meta_ads: LEAD_SOURCE.META_ADS,
  manual: LEAD_SOURCE.MANUAL,
};

/**
 * Devuelve una etiqueta legible para cualquier valor de `source`.
 * Si ya es una etiqueta canónica, la devuelve tal cual; si es un slug legacy
 * lo traduce; si es desconocido lo devuelve capitalizado; vacío → 'Origen desconocido'.
 */
export function displaySource(raw: string | null | undefined): string {
  if (!raw) return "Origen desconocido";
  const trimmed = raw.trim();
  if (LEAD_SOURCE_OPTIONS.includes(trimmed)) return trimmed;
  const mapped = LEGACY_MAP[trimmed.toLowerCase()];
  if (mapped) return mapped;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}
