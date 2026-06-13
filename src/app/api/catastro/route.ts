import { NextRequest, NextResponse } from 'next/server';
import { parseViasResponse, parseInmuebleResponse } from '@/lib/catastroLookup';

/**
 * Proxy server-side del Catastro para el autocompletado de dirección de la web
 * pública de valoración (Brief #017 T1). El Catastro NO permite CORS desde el
 * browser, por eso pasa por aquí.
 *
 * Dos modos vía ?action=:
 *  - action=vias      → autocompleta nombres de calle (ObtenerCallejero).
 *  - action=inmueble  → resuelve la referencia catastral de una dirección (Consulta_DNPLOC).
 *
 * Degradación elegante SIEMPRE: si el Catastro falla/timeout, devolvemos un
 * resultado vacío (NUNCA 500) para que el wizard caiga a input libre. El
 * Catastro es una ayuda, nunca un bloqueo.
 *
 * GET /api/catastro?action=vias&municipio=SEVILLA&q=AGUAMARINA
 * GET /api/catastro?action=inmueble&municipio=SEVILLA&tipoVia=CL&nombreVia=GRANATE&numero=8
 */

const CALLEJERO_BASE =
  'https://ovc.catastro.meh.es/OVCServWeb/OVCWcfCallejero/COVCCallejero.svc/json';

/** fetch con timeout que devuelve el JSON parseado o null (patrón de catastro.ts). */
async function fetchJsonWithTimeout(url: string, ms: number): Promise<unknown | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const action = params.get('action');
  const provincia = (params.get('provincia') || 'SEVILLA').toUpperCase();
  const municipio = (params.get('municipio') || 'SEVILLA').toUpperCase();

  // ── Modo VÍAS: autocompletado de nombres de calle ──
  if (action === 'vias') {
    const q = (params.get('q') || '').trim();
    if (q.length < 3) return NextResponse.json([]); // mismo umbral que el front

    const url =
      `${CALLEJERO_BASE}/ObtenerCallejero` +
      `?Provincia=${encodeURIComponent(provincia)}` +
      `&Municipio=${encodeURIComponent(municipio)}` +
      `&TipoVia=&NomVia=${encodeURIComponent(q)}`;

    const json = await fetchJsonWithTimeout(url, 6000);
    return NextResponse.json(parseViasResponse(json)); // [] si null/error
  }

  // ── Modo INMUEBLE: resolver referencia catastral de una dirección ──
  if (action === 'inmueble') {
    const tipoVia = (params.get('tipoVia') || '').trim().toUpperCase();
    const nombreVia = (params.get('nombreVia') || '').trim();
    const numero = (params.get('numero') || '').trim();
    if (!nombreVia || !numero) {
      return NextResponse.json({ referencia_catastral: null, multiple: false });
    }

    const url =
      `${CALLEJERO_BASE}/Consulta_DNPLOC` +
      `?Provincia=${encodeURIComponent(provincia)}` +
      `&Municipio=${encodeURIComponent(municipio)}` +
      `&Sigla=${encodeURIComponent(tipoVia)}` +
      `&Calle=${encodeURIComponent(nombreVia)}` +
      `&Numero=${encodeURIComponent(numero)}`;

    const json = await fetchJsonWithTimeout(url, 6000);
    return NextResponse.json(parseInmuebleResponse(json));
  }

  return NextResponse.json({ error: 'action no soportada (usa vias | inmueble)' }, { status: 400 });
}
