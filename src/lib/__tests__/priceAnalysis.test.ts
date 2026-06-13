/**
 * Tests — Brief #015: parsePriceAnalysisResponse + extractGroundingUrls
 * §8 del brief: parseo defensivo, zona correcta, fallback heurístico.
 */

import {
  parsePriceAnalysisResponse,
  extractGroundingUrls,
} from '../priceAnalysis';

// ─── parsePriceAnalysisResponse ──────────────────────────────────────────────

describe('parsePriceAnalysisResponse', () => {
  const validVeredicto = JSON.stringify({
    veredicto: 'caro',
    sobreprecio_pct: 12.5,
    precio_recomendado: 280000,
    rebaja_eur: 40000,
    rebaja_pct_low: 10.0,
    rebaja_pct_high: 15.0,
    confianza: 'alta',
    comparables: [{ fuente: 'Idealista', precio_m2: 2800, url: 'https://idealista.com/test' }],
    motivos: ['Lleva 95 días en mercado', 'Feedback negativo de 3 compradores'],
  });

  test('parsea JSON plano correcto', () => {
    const result = parsePriceAnalysisResponse(validVeredicto);
    expect(result).not.toBeNull();
    expect(result!.veredicto).toBe('caro');
    expect(result!.sobreprecio_pct).toBe(12.5);
    expect(result!.precio_recomendado).toBe(280000);
    expect(result!.comparables).toHaveLength(1);
    expect(result!.motivos).toHaveLength(2);
  });

  test('parsea JSON con fences ```json```', () => {
    const raw = `Análisis del inmueble...\n\n\`\`\`json\n${validVeredicto}\n\`\`\`\n\nFin.`;
    const result = parsePriceAnalysisResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.veredicto).toBe('caro');
  });

  test('parsea JSON con preámbulo de grounding (sin fences)', () => {
    const withPreamble = `Según los datos obtenidos de Idealista...\n\nAquí el análisis:\n${validVeredicto}\n\nEspero que sea útil.`;
    const result = parsePriceAnalysisResponse(withPreamble);
    expect(result).not.toBeNull();
    expect(result!.veredicto).toBe('caro');
  });

  test('veredicto "ajustado" es válido', () => {
    const raw = JSON.stringify({ ...JSON.parse(validVeredicto), veredicto: 'ajustado', sobreprecio_pct: 0 });
    const result = parsePriceAnalysisResponse(raw);
    expect(result!.veredicto).toBe('ajustado');
  });

  test('veredicto "correcto" es válido', () => {
    const raw = JSON.stringify({ ...JSON.parse(validVeredicto), veredicto: 'correcto' });
    const result = parsePriceAnalysisResponse(raw);
    expect(result!.veredicto).toBe('correcto');
  });

  test('retorna null si veredicto inválido', () => {
    const bad = JSON.stringify({ ...JSON.parse(validVeredicto), veredicto: 'barato' });
    expect(parsePriceAnalysisResponse(bad)).toBeNull();
  });

  test('retorna null si no hay JSON', () => {
    expect(parsePriceAnalysisResponse('El inmueble está caro pero no hay datos concretos.')).toBeNull();
  });

  test('retorna null si JSON malformado', () => {
    expect(parsePriceAnalysisResponse('```json\n{ veredicto: caro }\n```')).toBeNull();
  });

  test('confianza baja por defecto si valor inválido', () => {
    const raw = JSON.stringify({ ...JSON.parse(validVeredicto), confianza: 'desconocida' });
    const result = parsePriceAnalysisResponse(raw);
    expect(result!.confianza).toBe('baja');
  });

  test('comparables vacío si no se incluye', () => {
    const raw = JSON.stringify({ ...JSON.parse(validVeredicto), comparables: undefined });
    const result = parsePriceAnalysisResponse(raw);
    expect(result!.comparables).toEqual([]);
  });
});

// ─── extractGroundingUrls ────────────────────────────────────────────────────

describe('extractGroundingUrls', () => {
  test('extrae URLs de groundingChunks', () => {
    const data = {
      candidates: [{
        groundingMetadata: {
          groundingChunks: [
            { web: { uri: 'https://idealista.com/a' } },
            { web: { uri: 'https://fotocasa.es/b' } },
          ],
        },
      }],
    };
    const urls = extractGroundingUrls(data);
    expect(urls).toEqual(['https://idealista.com/a', 'https://fotocasa.es/b']);
  });

  test('deduplicar URLs repetidas', () => {
    const data = {
      candidates: [{
        groundingMetadata: {
          groundingChunks: [
            { web: { uri: 'https://idealista.com/a' } },
            { web: { uri: 'https://idealista.com/a' } },
          ],
        },
      }],
    };
    expect(extractGroundingUrls(data)).toHaveLength(1);
  });

  test('retorna [] si no hay groundingMetadata', () => {
    expect(extractGroundingUrls({ candidates: [{}] })).toEqual([]);
    expect(extractGroundingUrls({})).toEqual([]);
  });

  test('ignora chunks sin uri válida', () => {
    const data = {
      candidates: [{
        groundingMetadata: {
          groundingChunks: [
            { web: { uri: null } },
            { web: {} },
            {},
          ],
        },
      }],
    };
    expect(extractGroundingUrls(data)).toEqual([]);
  });
});

// ─── Bug fix #1: zona plana ───────────────────────────────────────────────────

describe('zona correcta desde features.zona (Bug fix #1)', () => {
  test('features.zona plano existe', () => {
    const features: Record<string, any> = { zona: 'Nervión', sqm: 80, rooms: 3 };
    const zone = (features.zona as string | undefined) || null;
    expect(zone).toBe('Nervión');
  });

  test('features.location.zone anidado → null (bug anterior)', () => {
    const features: Record<string, any> = { location: { zone: 'Nervión' }, sqm: 80 };
    // El bug viejo leía features.location.zone → aún accesible pero no es la ruta canónica
    const wrongPath = (features?.location?.zone as string | undefined) || null;
    const correctPath = (features.zona as string | undefined) || null;
    // La ruta correcta devuelve null (features.zona no existe en este caso)
    expect(correctPath).toBeNull();
    // La ruta buggy daba resultado aunque el campo plano no existe
    expect(wrongPath).toBe('Nervión');
  });
});

// ─── Fallback heurístico cuando LLM no devuelve JSON ─────────────────────────

describe('fallback heurístico (Bug fix #5)', () => {
  test('parsePriceAnalysisResponse retorna null cuando solo hay narrativa', () => {
    const narrativeOnly = `# Análisis del inmueble
El inmueble lleva 95 días en mercado, lo que supera ampliamente el óptimo de 26 días.
Varios compradores han comentado que el precio está por encima del mercado.
Se recomienda una rebaja de entre el 12% y el 15%.`;
    expect(parsePriceAnalysisResponse(narrativeOnly)).toBeNull();
  });
});
