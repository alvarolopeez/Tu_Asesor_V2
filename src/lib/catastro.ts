/**
 * Resolución de referencia catastral → ubicación oficial confirmada.
 *
 * Brief #016 fix (caso "calle Granate"): Gemini 2.5 Pro alucina el distrito
 * incluso con prompt reforzado (sitúa el piso en "Polígono San Pablo / CP 41007"
 * cuando el Catastro dice CP 41009, barrio Las Avenidas, Distrito Macarena, a
 * 285 m del Hospital Virgen Macarena). Su prior "Granate→San Pablo" es tan fuerte
 * que racionaliza con datos falsos. El prompt SOLO no basta.
 *
 * La ÚNICA verdad es el Catastro oficial. Resolvemos la ubicación en CÓDIGO y la
 * inyectamos como ground-truth innegociable en el prompt (buildValuationPrompt).
 *
 * Pipeline (todo con degradación elegante; APIs públicas sin auth):
 *  1. Catastro DNPRC  → dirección oficial + código postal real
 *  2. Catastro CPMRC  → coordenadas (lat/lon, EPSG:4326)
 *  3. Nominatim (OSM) → barrio + distrito (reverse geocoding desde las coords)
 *
 * Si cualquier paso falla, se devuelve lo que se haya podido obtener; si no hay
 * nada útil, null (y buildValuationPrompt cae al método de geolocalización por IA).
 */

export interface CatastroLocation {
  direccion?: string;   // "CL GRANATE 8 Es:1 Pl:00 Pt:D 41009 SEVILLA (SEVILLA)"
  via?: string;         // "CL GRANATE"
  numero?: string;      // "8"
  cp?: string;          // "41009"  ← el dato decisivo
  municipio?: string;   // "SEVILLA"
  provincia?: string;   // "SEVILLA"
  lat?: number;         // 37.4098…
  lon?: number;         // -5.9859…
  barrio?: string;      // "Las Avenidas"
  distrito?: string;    // "Distrito Macarena"
  antiguedad?: string;  // "1967"
  superficie?: string;  // "63" (m² catastral construidos)
  uso?: string;         // "Residencial"
}

const DNPRC = 'https://ovc.catastro.meh.es/OVCServWeb/OVCWcfCallejero/COVCCallejero.svc/json/Consulta_DNPRC';
const CPMRC = 'https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCoordenadas.asmx/Consulta_CPMRC';
const NOMINATIM = 'https://nominatim.openstreetmap.org/reverse';

async function fetchWithTimeout(
  url: string,
  ms: number,
  headers?: Record<string, string>,
): Promise<Response | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    const res = await fetch(url, { signal: ctrl.signal, headers });
    clearTimeout(timer);
    return res.ok ? res : null;
  } catch {
    return null;
  }
}

/**
 * Resuelve una referencia catastral a su ubicación oficial confirmada.
 * Devuelve null si no se pudo obtener absolutamente nada útil.
 */
export async function resolveCatastro(refCatRaw: string): Promise<CatastroLocation | null> {
  const refCat = (refCatRaw || '').replace(/\s+/g, '').toUpperCase();
  if (refCat.length < 14) return null;
  const rc14 = refCat.slice(0, 14); // las coordenadas usan los 14 primeros chars

  const loc: CatastroLocation = {};

  // ── 1) DNPRC: dirección oficial + código postal ──────────────────────────
  const dnRes = await fetchWithTimeout(`${DNPRC}?RefCat=${encodeURIComponent(refCat)}`, 6000);
  if (dnRes) {
    try {
      const j: any = await dnRes.json();
      const root = j?.consulta_dnprcResult;
      // Caso normal (un inmueble): bico.bi. Caso multi: lrcdnp.rcdnp[0].
      const bi = root?.bico?.bi ?? root?.lrcdnp?.rcdnp?.[0];
      const dt = bi?.dt;
      const lourb = dt?.locs?.lous?.lourb;
      if (bi?.ldt) loc.direccion = String(bi.ldt);
      if (lourb?.dp) loc.cp = String(lourb.dp);
      if (lourb?.dir?.nv) loc.via = `${lourb.dir.tv ?? ''} ${lourb.dir.nv}`.trim();
      if (lourb?.dir?.pnp) loc.numero = String(lourb.dir.pnp);
      if (dt?.nm) loc.municipio = String(dt.nm);
      if (dt?.np) loc.provincia = String(dt.np);
      if (bi?.debi?.ant) loc.antiguedad = String(bi.debi.ant);
      if (bi?.debi?.sfc) loc.superficie = String(bi.debi.sfc);
      if (bi?.debi?.luso) loc.uso = String(bi.debi.luso);
    } catch {
      /* parcial: seguimos con lo que haya */
    }
  }

  // ── 2) CPMRC: coordenadas (respuesta XML) ────────────────────────────────
  const prov = loc.provincia || 'SEVILLA';
  const muni = loc.municipio || 'SEVILLA';
  const coRes = await fetchWithTimeout(
    `${CPMRC}?Provincia=${encodeURIComponent(prov)}&Municipio=${encodeURIComponent(muni)}&SRS=EPSG:4326&RC=${encodeURIComponent(rc14)}`,
    6000,
  );
  if (coRes) {
    try {
      const xml = await coRes.text();
      const x = xml.match(/<xcen>([^<]+)<\/xcen>/)?.[1];
      const y = xml.match(/<ycen>([^<]+)<\/ycen>/)?.[1];
      if (x && y) {
        loc.lon = Number(x);
        loc.lat = Number(y);
      }
    } catch {
      /* parcial */
    }
  }

  // ── 3) Nominatim reverse: barrio + distrito ──────────────────────────────
  if (loc.lat && loc.lon) {
    const nomRes = await fetchWithTimeout(
      `${NOMINATIM}?format=jsonv2&lat=${loc.lat}&lon=${loc.lon}&zoom=16&addressdetails=1`,
      6000,
      { 'User-Agent': 'TuAsesorAlvaro/1.0 (valoracion-inmobiliaria; info@tuasesoralvaro.com)' },
    );
    if (nomRes) {
      try {
        const j: any = await nomRes.json();
        const a = j?.address ?? {};
        loc.barrio = a.neighbourhood || a.quarter || a.suburb || undefined;
        loc.distrito = a.city_district || a.suburb || a.district || undefined;
      } catch {
        /* parcial */
      }
    }
  }

  if (!loc.cp && !loc.barrio && !loc.lat) return null;
  return loc;
}

/**
 * Formatea la ubicación confirmada como bloque de texto para el prompt.
 * Devuelve '' si no hay datos relevantes.
 */
export function formatCatastroBlock(loc: CatastroLocation | null): string {
  if (!loc) return '';
  const lines: string[] = [];
  if (loc.direccion) lines.push(`- Dirección oficial (Catastro): ${loc.direccion}`);
  if (loc.cp) lines.push(`- Código postal REAL: ${loc.cp}  ← USA ESTE CP. Ignora cualquier otro que tu conocimiento previo sugiera.`);
  if (loc.barrio || loc.distrito) {
    lines.push(`- Barrio/Distrito (geocodificación oficial): ${[loc.barrio, loc.distrito].filter(Boolean).join(' · ')}`);
  }
  if (loc.lat && loc.lon) lines.push(`- Coordenadas: ${loc.lat.toFixed(6)}, ${loc.lon.toFixed(6)}`);
  if (loc.antiguedad) lines.push(`- Año de construcción (Catastro): ${loc.antiguedad}`);
  if (loc.superficie) lines.push(`- Superficie catastral construida: ${loc.superficie} m²`);
  return lines.join('\n');
}
