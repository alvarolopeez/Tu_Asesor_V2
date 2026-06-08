/**
 * Utilidades puras para DocumentsManager.
 * Extraídas del componente monolítico en R8 Ola 5 (2026-06-08).
 * No tienen dependencias de estado React — son funciones puras y relocalizables.
 */

import type { DocumentTemplate, GenForm } from "./DocumentsManager.types";

// ─── Detección de tipo de documento ─────────────────────────────────────────

/** Categoría / nombre de plantilla → kind del formulario. */
export function detectKind(template: DocumentTemplate): GenForm["kind"] {
  const cat = (template.category || "").toLowerCase();
  const nam = template.name.toLowerCase();
  if (cat.includes("contrato") || nam.includes("contrato privado")) return "contrato";
  if (cat.includes("propuesta") || nam.includes("propuesta")) return "propuesta";
  if (
    cat.includes("ficha") ||
    cat.includes("kyc") ||
    cat.includes("pbc") ||
    cat.includes("titularidad") ||
    cat.includes("visita")
  ) return "comprador";
  return "nota";
}

/** Sub-tipo de documento del comprador (sirve para mostrar la sección correcta del form). */
export function detectBuyerDocType(
  template: DocumentTemplate,
): "ficha" | "kyc" | "visita" | "" {
  const c = `${template.category} ${template.name}`.toLowerCase();
  if (c.includes("ficha")) return "ficha";
  if (c.includes("visita")) return "visita";
  if (c.includes("kyc") || c.includes("pbc") || c.includes("titularidad")) return "kyc";
  return "";
}

// ─── Fusión de plantilla ─────────────────────────────────────────────────────

/**
 * Sustituye placeholders `{{clave}}` en el body de una plantilla por los valores
 * del diccionario de contexto.  Las claves no encontradas se reemplazan por "________".
 */
export function mergeBody(body: string, ctx: Record<string, string>): string {
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => ctx[key] ?? "________");
}
