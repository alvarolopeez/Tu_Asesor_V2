/**
 * Normalización de teléfonos españoles a formato E.164 (`+34XXXXXXXXX`).
 *
 * Módulo PURO (sin secretos ni env) para poder importarse tanto en cliente
 * (formularios) como en servidor. Meta acepta el número con o sin `+`, pero
 * guardamos SIEMPRE con `+34` en la BD para que los workflows n8n y la
 * difusión reciban un formato consistente y Meta no rechace en silencio.
 *
 * @created 2026-06-04 (fix #3/#9: leads con teléfono local no recibían WhatsApp)
 */

/**
 * Devuelve el teléfono en E.164 español si reconoce el patrón; si no, hace el
 * mejor esfuerzo (limpia separadores y antepone `+` si ya trae prefijo país).
 *
 *  - "697223944"      → "+34697223944"
 *  - "34697223944"    → "+34697223944"
 *  - "+34 697 223 944"→ "+34697223944"
 *  - "0034697223944"  → "+34697223944"
 *  - extranjeros / no reconocidos → se limpia y se conserva (con `+` si trae país)
 */
export function normalizeEsPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = raw.trim().replace(/[\s\-().]/g, "");

  // Prefijo internacional 00 → +
  if (s.startsWith("00")) s = "+" + s.slice(2);

  // Ya viene en E.164 con +
  if (s.startsWith("+")) return s;

  // 34XXXXXXXXX (11 díg, móvil/fijo ES sin +)
  if (/^34[6789]\d{8}$/.test(s)) return "+" + s;

  // Móvil/fijo ES local de 9 dígitos
  if (/^[6789]\d{8}$/.test(s)) return "+34" + s;

  // Desconocido: si son solo dígitos largos, asumimos que ya trae país.
  if (/^\d{10,15}$/.test(s)) return "+" + s;

  return s;
}
