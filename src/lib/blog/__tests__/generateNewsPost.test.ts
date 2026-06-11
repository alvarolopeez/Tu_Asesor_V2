/**
 * Tests para generateNewsPost / validateDraft / slug — Brief #010.
 * Mock de global.fetch (sin red).
 */

import { generateNewsPost, type DraftPost } from '../generateNewsPost';
import { validateDraft } from '../validateDraft';
import { generateSlug } from '../slug';

// ─── Fixtures ──────────────────────────────────────────────────────────────

const VALID_TITLE = 'Cómo está el mercado inmobiliario en Sevilla este año';

function longContent(): string {
  const p = 'El mercado inmobiliario sevillano mantiene su dinamismo en este arranque de mes, con una demanda sostenida en barrios como Nervión, Triana y La Macarena que sigue presionando los precios al alza pese a la moderación del euríbor. '.repeat(3);
  return `${p}\n\n## Qué significa para los propietarios\n\n${p}\n\n## Qué significa para los compradores\n\n${p}\n\nSi estás pensando en vender, pide tu valoración gratuita.`;
}

function validGeminiJson(overrides: Partial<Record<string, unknown>> = {}): string {
  return JSON.stringify({
    title: VALID_TITLE,
    excerpt: 'La demanda sostenida y la moderación del euríbor marcan el mercado sevillano esta semana.',
    content: longContent(),
    seo_title: 'Mercado inmobiliario Sevilla: claves de la semana',
    seo_description: 'Análisis local de las últimas noticias del sector inmobiliario en Sevilla.',
    source_urls: ['https://ejemplo.com/noticia-modelo'],
    ...overrides,
  });
}

function geminiResponse(text: string, groundingUrls: string[] = []) {
  return {
    candidates: [
      {
        content: { parts: [{ text }] },
        ...(groundingUrls.length > 0
          ? {
              groundingMetadata: {
                groundingChunks: groundingUrls.map((uri) => ({ web: { uri, title: 'fuente' } })),
              },
            }
          : {}),
      },
    ],
  };
}

function mockFetchOnce(payload: unknown, ok = true, status = 200) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  });
}

beforeEach(() => {
  global.fetch = jest.fn();
  process.env.GEMINI_API_KEY = 'test-key';
  delete process.env.BLOG_LLM_MODEL;
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── generateNewsPost ──────────────────────────────────────────────────────

describe('generateNewsPost', () => {
  it('JSON válido + grounding → DraftPost con slug correcto y fuentes del grounding', async () => {
    mockFetchOnce(geminiResponse(validGeminiJson(), ['https://fuente-real.es/noticia']));

    const draft = await generateNewsPost([]);

    expect(draft).not.toBeNull();
    expect(draft!.title).toBe(VALID_TITLE);
    // El slug elimina acentos, ñ y mayúsculas (también valida la util compartida).
    expect(draft!.slug).toBe('como-esta-el-mercado-inmobiliario-en-sevilla-este-ano');
    expect(draft!.source_urls).toEqual(['https://fuente-real.es/noticia']);
    expect(draft!.seo_title.length).toBeGreaterThan(0);
  });

  it('JSON envuelto en fences ```json``` → se parsea igual', async () => {
    mockFetchOnce(geminiResponse('```json\n' + validGeminiJson() + '\n```', ['https://f.es/n']));
    const draft = await generateNewsPost([]);
    expect(draft).not.toBeNull();
  });

  it('respuesta no-JSON → null (no rompe)', async () => {
    mockFetchOnce(geminiResponse('Lo siento, no he podido encontrar noticias hoy.'));
    const draft = await generateNewsPost([]);
    expect(draft).toBeNull();
  });

  it('JSON truncado → null (no rompe)', async () => {
    mockFetchOnce(geminiResponse('{"title": "Mercado de Sevilla al alza", "content": "Era una vez'));
    const draft = await generateNewsPost([]);
    expect(draft).toBeNull();
  });

  it('HTTP error de Gemini → null', async () => {
    mockFetchOnce({ error: 'quota' }, false, 429);
    const draft = await generateNewsPost([]);
    expect(draft).toBeNull();
  });

  it('sin GEMINI_API_KEY → null sin llamar a fetch', async () => {
    delete process.env.GEMINI_API_KEY;
    const draft = await generateNewsPost([]);
    expect(draft).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('borrador sin fuentes (ni grounding ni declaradas) → null por validación', async () => {
    mockFetchOnce(geminiResponse(validGeminiJson({ source_urls: [] })));
    const draft = await generateNewsPost([]);
    expect(draft).toBeNull();
  });

  it('anti-repetición: los recentTitles llegan al prompt enviado a Gemini', async () => {
    mockFetchOnce(geminiResponse(validGeminiJson(), ['https://f.es/n']));
    const recentTitle = 'El euríbor baja por tercera semana consecutiva';

    await generateNewsPost([recentTitle]);

    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body as string);
    const promptText = body.contents[0].parts[0].text as string;
    expect(promptText).toContain(recentTitle);
    expect(promptText).toContain('PROHIBIDO repetirlos');
    // La tool de grounding va en la request (modelos 2.x).
    expect(body.tools).toEqual([{ google_search: {} }]);
  });
});

// ─── validateDraft ─────────────────────────────────────────────────────────

describe('validateDraft', () => {
  const base: DraftPost = {
    title: VALID_TITLE,
    slug: 'slug',
    excerpt: 'Un resumen suficientemente largo para pasar el mínimo de cuarenta caracteres.',
    content: longContent(),
    seo_title: 'seo',
    seo_description: 'seo desc',
    source_urls: ['https://f.es/n'],
  };

  it('borrador correcto → ok', () => {
    expect(validateDraft(base)).toEqual({ ok: true });
  });

  it('content < 800 chars → rechazado', () => {
    const r = validateDraft({ ...base, content: 'Demasiado corto.\n\nDe verdad.\n\nMucho.' });
    expect(r.ok).toBe(false);
  });

  it('content sin párrafos → rechazado', () => {
    const r = validateDraft({ ...base, content: 'x'.repeat(900) });
    expect(r.ok).toBe(false);
  });

  it('content que parece JSON crudo → rechazado', () => {
    const r = validateDraft({ ...base, content: '{"response": "' + 'x'.repeat(900) + '"}\n\na\n\nb' });
    expect(r.ok).toBe(false);
  });

  it('title con restos de JSON → rechazado', () => {
    expect(validateDraft({ ...base, title: 'Título con {llaves} sospechosas' }).ok).toBe(false);
  });

  it('title demasiado corto → rechazado', () => {
    expect(validateDraft({ ...base, title: 'Corto' }).ok).toBe(false);
  });

  it('excerpt fuera de rango → rechazado', () => {
    expect(validateDraft({ ...base, excerpt: 'mini' }).ok).toBe(false);
  });

  it('sin source_urls → rechazado', () => {
    expect(validateDraft({ ...base, source_urls: [] }).ok).toBe(false);
  });
});

// ─── generateSlug (util compartida) ────────────────────────────────────────

describe('generateSlug', () => {
  it('elimina acentos, eñes, símbolos y espacios', () => {
    expect(generateSlug('¿Subirán los precios en Triana? ¡Análisis 2026!')).toBe(
      'subiran-los-precios-en-triana-analisis-2026',
    );
  });

  it('colapsa guiones múltiples y recorta extremos', () => {
    expect(generateSlug('  --Hola -- Mundo--  ')).toBe('hola-mundo');
  });
});
