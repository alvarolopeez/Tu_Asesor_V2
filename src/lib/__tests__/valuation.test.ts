/**
 * Tests para parseValuationResponse y buildValuationPrompt (Brief #016).
 */

import { parseValuationResponse, buildValuationPrompt } from '../valuation';
import type { ValuationInputs } from '../valuation';

// ─── parseValuationResponse ───────────────────────────────────────────────────

describe('parseValuationResponse', () => {
  const validResult = {
    precio_m2_zona: 2800,
    precio_m2_zona_rango: { min: 2600, max: 3100 },
    estado_ajuste_pct: 0,
    rangos: {
      venta_rapida: { precio: 253000, precio_m2: 2700, dias_estimados: 20, justificacion: 'Rebaja 5%' },
      mercado:      { precio: 266000, precio_m2: 2830, dias_estimados: 35, justificacion: 'Precio realista' },
      premium:      { precio: 285000, precio_m2: 3030, dias_estimados: 60, justificacion: 'Con extras' },
    },
    confianza: 'alta',
    comparables: [{ fuente: 'Idealista', precio_m2: 2850, url: 'https://idealista.com/test' }],
    factores: ['cocina reformada +200 €/m²'],
    supuestos: ['m² útiles = 90% construidos'],
    advertencias: [],
  };

  it('parsea respuesta con code fence json', () => {
    const raw = `Análisis de la zona.\n\`\`\`json\n${JSON.stringify(validResult)}\n\`\`\``;
    const result = parseValuationResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.rangos.mercado.precio).toBe(266000);
    expect(result!.confianza).toBe('alta');
    expect(result!.comparables).toHaveLength(1);
  });

  it('parsea respuesta con code fence sin "json"', () => {
    const raw = `\`\`\`\n${JSON.stringify(validResult)}\n\`\`\``;
    const result = parseValuationResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.rangos.mercado.precio).toBe(266000);
  });

  it('parsea JSON plano sin fences', () => {
    const raw = JSON.stringify(validResult);
    const result = parseValuationResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.rangos.premium.dias_estimados).toBe(60);
  });

  it('rescata JSON embebido en texto de grounding', () => {
    const raw = `Fuentes consultadas: Idealista, Fotocasa.\nHe analizado la zona.\n${JSON.stringify(validResult)}\nFin del informe.`;
    const result = parseValuationResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.precio_m2_zona).toBe(2800);
  });

  it('devuelve null si no hay JSON', () => {
    expect(parseValuationResponse('Solo texto sin JSON')).toBeNull();
    expect(parseValuationResponse('')).toBeNull();
  });

  it('devuelve null si rangos.mercado.precio === 0 (gate del parser)', () => {
    const noMercado = {
      ...validResult,
      rangos: {
        ...validResult.rangos,
        mercado: { precio: 0, precio_m2: 0, dias_estimados: 0, justificacion: '' },
      },
    };
    const raw = `\`\`\`json\n${JSON.stringify(noMercado)}\n\`\`\``;
    expect(parseValuationResponse(raw)).toBeNull();
  });

  it('devuelve null si no hay rangos', () => {
    const noRangos = { precio_m2_zona: 2800, confianza: 'alta' };
    const raw = `\`\`\`json\n${JSON.stringify(noRangos)}\n\`\`\``;
    expect(parseValuationResponse(raw)).toBeNull();
  });

  it('devuelve null si JSON incompleto / inválido', () => {
    expect(parseValuationResponse('```json\n{ precio_m2_zona: 2800 ')).toBeNull();
  });

  it('normaliza confianza desconocida a "baja"', () => {
    const weirdConf = { ...validResult, confianza: 'muy_alta' };
    const raw = `\`\`\`json\n${JSON.stringify(weirdConf)}\n\`\`\``;
    const result = parseValuationResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.confianza).toBe('baja');
  });

  it('incluye supuestos y advertencias si los hay', () => {
    const result = parseValuationResponse(`\`\`\`json\n${JSON.stringify(validResult)}\n\`\`\``);
    expect(result!.supuestos).toEqual(['m² útiles = 90% construidos']);
    expect(result!.advertencias).toEqual([]);
  });

  it('supuestos y advertencias son undefined si no vienen en el JSON', () => {
    const noExtras = { ...validResult };
    delete (noExtras as any).supuestos;
    delete (noExtras as any).advertencias;
    const result = parseValuationResponse(`\`\`\`json\n${JSON.stringify(noExtras)}\n\`\`\``);
    expect(result!.supuestos).toBeUndefined();
    expect(result!.advertencias).toBeUndefined();
  });

  it('precio_m2_zona_rango es undefined si no viene', () => {
    const noRango = { ...validResult };
    delete (noRango as any).precio_m2_zona_rango;
    const result = parseValuationResponse(`\`\`\`json\n${JSON.stringify(noRango)}\n\`\`\``);
    expect(result).not.toBeNull();
    expect(result!.precio_m2_zona_rango).toBeUndefined();
  });
});

// ─── buildValuationPrompt ─────────────────────────────────────────────────────

describe('buildValuationPrompt', () => {
  const baseInputs: ValuationInputs = {
    m2: 85,
    estado: 'Buen estado',
    direccion: 'Calle Sierpes 12',
    zona: 'Nervión',
    habitaciones: 3,
    banos: 1,
  };

  it('incluye los m² en el prompt', () => {
    const prompt = buildValuationPrompt(baseInputs);
    expect(prompt).toContain('85 m²');
  });

  it('incluye el estado en el prompt', () => {
    const prompt = buildValuationPrompt(baseInputs);
    expect(prompt).toContain('Buen estado');
  });

  it('incluye dirección y zona', () => {
    const prompt = buildValuationPrompt(baseInputs);
    expect(prompt).toContain('Sierpes 12');
    expect(prompt).toContain('Nervión');
  });

  it('incluye las reformas si se proporcionan', () => {
    const inputs = { ...baseInputs, reformas_extras: 'cocina nueva 2024, suelos madera' };
    const prompt = buildValuationPrompt(inputs);
    expect(prompt).toContain('cocina nueva 2024');
  });

  it('incluye ajuste correcto para "Para reformar"', () => {
    const inputs = { ...baseInputs, estado: 'Para reformar' as const };
    const prompt = buildValuationPrompt(inputs);
    expect(prompt).toContain('Para reformar');
    expect(prompt).toContain('−15%');
  });

  it('incluye ajuste correcto para "Reformado"', () => {
    const inputs = { ...baseInputs, estado: 'Reformado' as const };
    const prompt = buildValuationPrompt(inputs);
    expect(prompt).toContain('+5%');
  });

  it('incluye búsqueda de valor de referencia del Catastro cuando hay ref catastral', () => {
    const inputs = { ...baseInputs, referencia_catastral: '9872023VH5797S0001WX' };
    const prompt = buildValuationPrompt(inputs);
    expect(prompt).toContain('9872023VH5797S0001WX');
    expect(prompt).toContain('Catastro');
  });

  it('no menciona Catastro si no hay ref catastral', () => {
    const prompt = buildValuationPrompt(baseInputs);
    expect(prompt).not.toContain('Catastro');
  });

  it('incluye los 3 rangos en el template JSON del prompt', () => {
    const prompt = buildValuationPrompt(baseInputs);
    expect(prompt).toContain('venta_rapida');
    expect(prompt).toContain('mercado');
    expect(prompt).toContain('premium');
  });

  it('incluye supuestos y advertencias en el template JSON del prompt', () => {
    const prompt = buildValuationPrompt(baseInputs);
    expect(prompt).toContain('supuestos');
    expect(prompt).toContain('advertencias');
  });

  it('incluye instrucción de Google Search', () => {
    const prompt = buildValuationPrompt(baseInputs);
    expect(prompt).toContain('Google Search');
  });
});
