/**
 * Tests de los parsers del Catastro para el autocompletado de la web (Brief #017 T1).
 *
 * Fixtures CAPTURADOS DE LLAMADAS REALES al servicio JSON del Catastro
 * (COVCCallejero.svc) el 2026-06-14, recortados a los campos relevantes:
 *  - ObtenerCallejero  (NomVia=AGUAMARINA / XKZQWZZZ)
 *  - Consulta_DNPLOC   (CL GRANATE 8 → multi; + Es/Pl/Pt → single; nº inexistente → error)
 *
 * El Catastro anida raro y alterna entre caso único (bico.bi) y múltiple
 * (lrcdnp.rcdnp[]); estos tests fijan ese comportamiento contra datos reales.
 */

import { parseViasResponse, parseInmuebleResponse } from '../catastroLookup';

// ─── Fixtures reales ────────────────────────────────────────────────────────

const VIAS_OK = {
  consulta_callejeroResult: {
    control: { cuca: 1 },
    callejero: { calle: [{ dir: { cv: '2776', tv: 'CL', nv: 'AGUAMARINA' } }] },
  },
};

// El Catastro a veces devuelve `calle` como OBJETO (un solo resultado) en vez de array.
const VIAS_OK_OBJETO = {
  consulta_callejeroResult: {
    callejero: { calle: { dir: { tv: 'AV', nv: 'LA BORBOLLA' } } },
  },
};

const VIAS_ERROR = {
  consulta_callejeroResult: {
    control: { cuerr: 1 },
    lerr: { err: [{ cod: '10', des: 'NO HAY COINCIDENCIAS EN LA BÚSQUEDA DE VÍAS' }] },
  },
};

const INMUEBLE_MULTI = {
  consulta_dnplocResult: {
    control: { cudnp: 20 },
    lrcdnp: {
      rcdnp: [
        {
          rc: { pc1: '5847402', pc2: 'TG3454N', car: '0001', cc1: 'R', cc2: 'T' },
          dt: { np: 'SEVILLA', nm: 'SEVILLA', locs: { lous: { lourb: {
            dir: { tv: 'CL', nv: 'GRANATE', pnp: '8', snp: '0' },
            loint: { es: '1', pt: '00', pu: 'A' }, dp: '41009', dm: '2',
          } } } },
        },
        {
          rc: { pc1: '5847402', pc2: 'TG3454N', car: '0002', cc1: 'T', cc2: 'Y' },
          dt: { np: 'SEVILLA', nm: 'SEVILLA', locs: { lous: { lourb: {
            dir: { tv: 'CL', nv: 'GRANATE', pnp: '8', snp: '0' },
            loint: { es: '1', pt: '00', pu: 'B' }, dp: '41009', dm: '2',
          } } } },
        },
      ],
    },
  },
};

const INMUEBLE_SINGLE = {
  consulta_dnplocResult: {
    control: { cudnp: 1, cucons: 1 },
    bico: { bi: {
      idbi: { cn: 'UR', rc: { pc1: '5847402', pc2: 'TG3454N', car: '0001', cc1: 'R', cc2: 'T' } },
      dt: { np: 'SEVILLA', nm: 'SEVILLA', locs: { lous: { lourb: {
        dir: { tv: 'CL', nv: 'GRANATE', pnp: '8', snp: '0' },
        loint: { es: '1', pt: '00', pu: 'A' }, dp: '41009', dm: '2',
      } } } },
    } },
  },
};

const INMUEBLE_ERROR = {
  consulta_dnplocResult: {
    control: { cuerr: 1 },
    lerr: [{ cod: '42', des: 'EL NÚMERO DEBE SER UNA SECUENCIA DE HASTA 4 DÍGITOS.' }],
  },
};

// ─── parseViasResponse ──────────────────────────────────────────────────────

describe('parseViasResponse', () => {
  it('extrae tipoVia + nombreVia + label de un resultado real', () => {
    const r = parseViasResponse(VIAS_OK);
    expect(r).toEqual([{ tipoVia: 'CL', nombreVia: 'AGUAMARINA', label: 'CL AGUAMARINA' }]);
  });

  it('normaliza `calle` como objeto único (no array) a una lista', () => {
    const r = parseViasResponse(VIAS_OK_OBJETO);
    expect(r).toHaveLength(1);
    expect(r[0]).toEqual({ tipoVia: 'AV', nombreVia: 'LA BORBOLLA', label: 'AV LA BORBOLLA' });
  });

  it('devuelve [] cuando el Catastro responde error (cuerr)', () => {
    expect(parseViasResponse(VIAS_ERROR)).toEqual([]);
  });

  it('devuelve [] ante JSON nulo o vacío (degradación)', () => {
    expect(parseViasResponse(null)).toEqual([]);
    expect(parseViasResponse({})).toEqual([]);
  });

  it('limita a un máximo de 8 sugerencias', () => {
    const many = {
      consulta_callejeroResult: { callejero: { calle: Array.from({ length: 20 }, (_, i) => ({ dir: { tv: 'CL', nv: `VIA ${i}` } })) } },
    };
    expect(parseViasResponse(many)).toHaveLength(8);
  });
});

// ─── parseInmuebleResponse ──────────────────────────────────────────────────

describe('parseInmuebleResponse', () => {
  it('caso ÚNICO (bico.bi): refcat de 20 chars + dirección con planta/puerta', () => {
    const r = parseInmuebleResponse(INMUEBLE_SINGLE);
    expect(r.multiple).toBe(false);
    expect(r.referencia_catastral).toBe('5847402TG3454N0001RT');
    expect(r.referencia_catastral).toHaveLength(20);
    expect(r.direccion_oficial).toBe('CL GRANATE 8 Es:1 Pl:00 Pt:A 41009 SEVILLA');
  });

  it('caso MÚLTIPLE (lrcdnp.rcdnp[]): parcela 14 chars + opciones con planta/puerta', () => {
    const r = parseInmuebleResponse(INMUEBLE_MULTI);
    expect(r.multiple).toBe(true);
    // Sin elegir vivienda: refcat parcial a nivel de parcela (14 chars) sirve para coords/CP.
    expect(r.referencia_catastral).toBe('5847402TG3454N');
    expect(r.referencia_catastral).toHaveLength(14);
    // Dirección a nivel de número, SIN unidad.
    expect(r.direccion_oficial).toBe('CL GRANATE 8 41009 SEVILLA');
    expect(r.opciones).toHaveLength(2);
    expect(r.opciones![0]).toEqual({ refcat: '5847402TG3454N0001RT', escalera: '1', planta: '00', puerta: 'A' });
    expect(r.opciones![1].puerta).toBe('B');
    expect(r.opciones![1].refcat).toBe('5847402TG3454N0002TY');
  });

  it('un solo inmueble en lrcdnp se trata como caso único (refcat 20)', () => {
    const single = {
      consulta_dnplocResult: { lrcdnp: { rcdnp: [INMUEBLE_MULTI.consulta_dnplocResult.lrcdnp.rcdnp[0]] } },
    };
    const r = parseInmuebleResponse(single);
    expect(r.multiple).toBe(false);
    expect(r.referencia_catastral).toBe('5847402TG3454N0001RT');
  });

  it('opciones se limitan a 30 como máximo', () => {
    const base = INMUEBLE_MULTI.consulta_dnplocResult.lrcdnp.rcdnp[0];
    const big = {
      consulta_dnplocResult: { lrcdnp: { rcdnp: Array.from({ length: 50 }, () => base) } },
    };
    expect(parseInmuebleResponse(big).opciones!.length).toBe(30);
  });

  it('caso ERROR (cuerr) → referencia_catastral null, no rompe', () => {
    const r = parseInmuebleResponse(INMUEBLE_ERROR);
    expect(r.referencia_catastral).toBeNull();
    expect(r.multiple).toBe(false);
  });

  it('JSON nulo/vacío → referencia_catastral null (degradación)', () => {
    expect(parseInmuebleResponse(null).referencia_catastral).toBeNull();
    expect(parseInmuebleResponse({}).referencia_catastral).toBeNull();
  });
});
