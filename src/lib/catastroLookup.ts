/**
 * Parsers del Catastro para el autocompletado de dirección de la web pública
 * de valoración (Brief #017 T1). Módulo PURO (sin red): la ruta server-side
 * `/api/catastro` hace el fetch y delega aquí el parseo.
 *
 * Hermano de `catastro.ts` (resolveCatastro, lado CRM) — NO lo modifica.
 *
 * Servicio JSON del Catastro (sin API key, sin CORS desde browser → proxy server):
 *  - ObtenerCallejero → lista de vías que matchean un texto (autocompletado).
 *  - Consulta_DNPLOC  → referencia(s) catastral(es) de una dirección.
 *
 * El JSON anida raro y ALTERNA entre caso único (`bico.bi`) y múltiple
 * (`lrcdnp.rcdnp[]`), y a veces devuelve un nodo como objeto en vez de array.
 * Estructuras fijadas contra llamadas reales (ver catastroLookup.test.ts).
 */

export interface ViaSugerencia {
  tipoVia: string;   // "CL", "AV", "PZ"...
  nombreVia: string; // "AGUAMARINA"
  label: string;     // "CL AGUAMARINA"
}

export interface InmuebleOpcion {
  refcat: string;     // referencia catastral completa (20 chars) de esta vivienda
  escalera?: string;
  planta?: string;
  puerta?: string;
}

export interface InmuebleResult {
  /** Refcat completa (20) si hay vivienda única; parcela (14) si hay varias sin elegir; null si falla. */
  referencia_catastral: string | null;
  direccion_oficial?: string;
  multiple: boolean;
  /** Solo presente cuando hay varias viviendas en el número (multiple === true). */
  opciones?: InmuebleOpcion[];
}

/** Normaliza un nodo del Catastro que puede venir como array, objeto único o ausente. */
function asArray<T>(x: T | T[] | null | undefined): T[] {
  if (Array.isArray(x)) return x;
  if (x === null || x === undefined) return [];
  return [x];
}

interface RcParts {
  pc1?: string; pc2?: string; car?: string; cc1?: string; cc2?: string;
}

/** Referencia catastral completa (20 chars): parcela + cargo + control. */
function rcToFull(rc: RcParts | undefined): string {
  if (!rc) return '';
  return `${rc.pc1 ?? ''}${rc.pc2 ?? ''}${rc.car ?? ''}${rc.cc1 ?? ''}${rc.cc2 ?? ''}`;
}

/** Referencia a nivel de parcela (14 chars): suficiente para coords/CP en resolveCatastro. */
function rcToParcela(rc: RcParts | undefined): string {
  if (!rc) return '';
  return `${rc.pc1 ?? ''}${rc.pc2 ?? ''}`;
}

/** Construye la dirección oficial legible desde el bloque `lourb` + `dt`. */
function buildDireccion(lourb: any, dt: any, includeUnit: boolean): string {
  const dir = lourb?.dir ?? {};
  const loint = lourb?.loint ?? {};
  const parts: string[] = [];
  const tvnv = `${dir.tv ?? ''} ${dir.nv ?? ''}`.trim();
  if (tvnv) parts.push(tvnv);
  if (dir.pnp) parts.push(String(dir.pnp));
  if (includeUnit) {
    if (loint.es) parts.push(`Es:${loint.es}`);
    if (loint.pt) parts.push(`Pl:${loint.pt}`);
    if (loint.pu) parts.push(`Pt:${loint.pu}`);
  }
  if (lourb?.dp) parts.push(String(lourb.dp));
  if (dt?.nm) parts.push(String(dt.nm));
  return parts.join(' ').trim();
}

/**
 * Parsea la respuesta de ObtenerCallejero a una lista de sugerencias de vía.
 * Degradación: ante error/null/vacío devuelve [] (el front cae a input libre).
 */
export function parseViasResponse(json: any): ViaSugerencia[] {
  const root = json?.consulta_callejeroResult;
  if (!root || root.control?.cuerr) return [];
  const calles = asArray<any>(root.callejero?.calle);
  return calles
    .map((c) => {
      const tipoVia = String(c?.dir?.tv ?? '').trim();
      const nombreVia = String(c?.dir?.nv ?? '').trim();
      return { tipoVia, nombreVia, label: `${tipoVia} ${nombreVia}`.trim() };
    })
    .filter((v) => v.nombreVia)
    .slice(0, 8);
}

/**
 * Parsea la respuesta de Consulta_DNPLOC.
 * - Caso único (`bico.bi`): refcat completa (20) + dirección con escalera/planta/puerta.
 * - Caso múltiple (`lrcdnp.rcdnp[]`): parcela (14) + hasta 30 opciones para que el usuario elija.
 * - Un único elemento en `lrcdnp` se trata como caso único.
 * Degradación: ante error/null devuelve { referencia_catastral: null, multiple: false }.
 */
export function parseInmuebleResponse(json: any): InmuebleResult {
  const root = json?.consulta_dnplocResult;
  if (!root || root.control?.cuerr) {
    return { referencia_catastral: null, multiple: false };
  }

  // ── Caso único: bico.bi ──
  const bi = root.bico?.bi;
  if (bi) {
    const rc = bi.idbi?.rc as RcParts | undefined;
    const lourb = bi.dt?.locs?.lous?.lourb;
    return {
      referencia_catastral: rc ? rcToFull(rc) : null,
      direccion_oficial: buildDireccion(lourb, bi.dt, true),
      multiple: false,
    };
  }

  // ── Caso múltiple: lrcdnp.rcdnp[] ──
  const rcdnp = asArray<any>(root.lrcdnp?.rcdnp);
  if (rcdnp.length === 0) {
    return { referencia_catastral: null, multiple: false };
  }

  if (rcdnp.length === 1) {
    const r = rcdnp[0];
    const lourb = r.dt?.locs?.lous?.lourb;
    return {
      referencia_catastral: r.rc ? rcToFull(r.rc) : null,
      direccion_oficial: buildDireccion(lourb, r.dt, true),
      multiple: false,
    };
  }

  const first = rcdnp[0];
  const lourb0 = first.dt?.locs?.lous?.lourb;
  const opciones: InmuebleOpcion[] = rcdnp
    .slice(0, 30)
    .map((r) => {
      const loint = r.dt?.locs?.lous?.lourb?.loint ?? {};
      return {
        refcat: r.rc ? rcToFull(r.rc) : '',
        escalera: loint.es ? String(loint.es) : undefined,
        planta: loint.pt ? String(loint.pt) : undefined,
        puerta: loint.pu ? String(loint.pu) : undefined,
      };
    })
    .filter((o) => o.refcat);

  return {
    referencia_catastral: first.rc ? rcToParcela(first.rc) : null,
    direccion_oficial: buildDireccion(lourb0, first.dt, false),
    multiple: true,
    opciones,
  };
}
