/**
 * Tests para generateCoverImage / buildImagePrompt — Brief #018 T1.
 * Mock de global.fetch (sin red).
 */

import { buildImagePrompt, generateCoverImage } from '../generateCoverImage';

const TITLE = 'Cómo está el mercado inmobiliario en Sevilla este año';
const EXCERPT = 'La demanda sostenida y la moderación del euríbor marcan el mercado sevillano.';

/** Un PNG 1x1 en base64 (suficiente para validar que vuelve un Buffer). */
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function geminiImageResponse(b64: string) {
  return {
    candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: b64 } }] } }],
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
  delete process.env.BLOG_IMAGE_MODEL;
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── buildImagePrompt (pura) ─────────────────────────────────────────────────

describe('buildImagePrompt', () => {
  it('incluye el título y el excerpt del artículo', () => {
    const p = buildImagePrompt(TITLE, EXCERPT);
    expect(p).toContain(TITLE);
    expect(p).toContain(EXCERPT);
  });

  it('pide composición 16:9 y deja hueco en la parte inferior para la banda', () => {
    const p = buildImagePrompt(TITLE, EXCERPT);
    expect(p).toContain('16:9');
    expect(p.toLowerCase()).toContain('inferior');
  });

  it('prohíbe texto, logos y caras (la IA falla ahí; la marca se compone en código)', () => {
    const p = buildImagePrompt(TITLE, EXCERPT).toLowerCase();
    expect(p).toContain('sin texto');
    expect(p).toContain('sin logos');
    expect(p).toMatch(/rostros|caras|personas/);
  });

  it('pide ilustración editorial, NO fotorrealismo', () => {
    const p = buildImagePrompt(TITLE, EXCERPT).toLowerCase();
    expect(p).toContain('editorial');
    expect(p).toContain('no fotorrealista');
  });
});

// ─── generateCoverImage ──────────────────────────────────────────────────────

describe('generateCoverImage', () => {
  it('respuesta con inlineData → devuelve un Buffer con los bytes de la imagen', async () => {
    mockFetchOnce(geminiImageResponse(TINY_PNG_B64));
    const buf = await generateCoverImage(TITLE, EXCERPT);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf!.equals(Buffer.from(TINY_PNG_B64, 'base64'))).toBe(true);
  });

  it('el aspect ratio 16:9 viaja anidado en imageConfig (no suelto → evita el HTTP 400)', async () => {
    mockFetchOnce(geminiImageResponse(TINY_PNG_B64));
    await generateCoverImage(TITLE, EXCERPT);

    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body as string);
    // Forma confirmada con la API real: imageConfig.aspectRatio.
    expect(body.generationConfig.imageConfig.aspectRatio).toBe('16:9');
    expect(body.generationConfig.responseModalities).toEqual(['IMAGE']);
    // Regresión: NO debe existir aspectRatio suelto (devolvía 400).
    expect(body.generationConfig.aspectRatio).toBeUndefined();
    expect(body.contents[0].parts[0].text).toContain(TITLE);
  });

  it('usa BLOG_IMAGE_MODEL si está definido', async () => {
    process.env.BLOG_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
    mockFetchOnce(geminiImageResponse(TINY_PNG_B64));
    await generateCoverImage(TITLE, EXCERPT);

    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain('gemini-3.1-flash-image-preview:generateContent');
  });

  it('HTTP error de Gemini → null (no rompe)', async () => {
    mockFetchOnce({ error: 'quota' }, false, 429);
    expect(await generateCoverImage(TITLE, EXCERPT)).toBeNull();
  });

  it('respuesta sin inlineData → null', async () => {
    mockFetchOnce({ candidates: [{ content: { parts: [{ text: 'no image' }] } }] });
    expect(await generateCoverImage(TITLE, EXCERPT)).toBeNull();
  });

  it('sin GEMINI_API_KEY → null sin llamar a fetch', async () => {
    delete process.env.GEMINI_API_KEY;
    expect(await generateCoverImage(TITLE, EXCERPT)).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
