/**
 * Generador de imagen de portada para los posts del blog — Brief #018 T1.
 *
 * Llama a Gemini Image ("nano banana") para producir una ILUSTRACIÓN EDITORIAL
 * 16:9 (sin fotorrealismo → evita caras/manos/texto deformes de la IA).
 * Devuelve un Buffer con la imagen (PNG), o `null` ante cualquier fallo: el
 * caller publica el post igualmente sin portada (graceful — la imagen NUNCA
 * debe bloquear la publicación).
 *
 * ⚠️ Forma del request CONFIRMADA con una llamada real a la API (2026-06-14):
 *   - El aspect ratio va en `generationConfig.imageConfig.aspectRatio`.
 *     Ponerlo suelto en `generationConfig.aspectRatio` devuelve HTTP 400
 *     ("Unknown name aspectRatio at 'generation_config'"). NO mover sin volver
 *     a probar contra la API.
 *   - La imagen vuelve en `candidates[0].content.parts[].inlineData`
 *     = { mimeType: 'image/png', data: <base64> } (camelCase).
 *   - Salida real del modelo para 16:9 = PNG 1344×768 (el watermark lo recorta
 *     a 1200×630 para og:image).
 *
 * Modelo configurable vía `BLOG_IMAGE_MODEL` (default `gemini-2.5-flash-image`,
 * estable hasta ~oct-2026) para migrar fácil a una preview posterior.
 */

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Timeout defensivo: si Gemini tarda, se publica sin portada (no bloquea). */
const IMAGE_GEN_TIMEOUT_MS = 20_000;

/**
 * Construye el prompt de la portada. Estilo editorial, SIN texto/caras/logos
 * (la marca de agua se compone en código, no la genera la IA) y con hueco
 * inferior para la banda de marca. Se mantiene corto (< ~480 tokens).
 */
export function buildImagePrompt(title: string, excerpt: string): string {
  return [
    'Ilustración editorial moderna para la portada de un artículo de un blog inmobiliario profesional sobre Sevilla, España.',
    `Tema del artículo: "${title}". ${excerpt}`,
    'Estilo: ilustración digital limpia y elegante, paleta sobria y profesional con acentos en azul marino y dorado (colores de marca inmobiliaria de gama media-alta).',
    'Composición horizontal 16:9, equilibrada, con espacio visual libre en la parte inferior (ahí irá una banda de marca).',
    'Elementos: arquitectura sevillana estilizada, barrios, llaves, planos, líneas de ciudad — de forma conceptual y editorial, NO fotorrealista.',
    'SIN texto, SIN letras, SIN logos, SIN personas en primer plano ni rostros. Estética de revista/periódico digital.',
  ].join(' ');
}

/**
 * Genera la imagen de portada. Devuelve el Buffer de la imagen de Gemini
 * (PNG ~1344×768) o `null` si algo falla (sin key, HTTP error, timeout, o
 * respuesta sin imagen).
 */
export async function generateCoverImage(title: string, excerpt: string): Promise<Buffer | null> {
  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) {
    console.warn('[blog image] GEMINI_API_KEY no configurada — el post se publica sin portada');
    return null;
  }
  const model = process.env.BLOG_IMAGE_MODEL || 'gemini-2.5-flash-image';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_GEN_TIMEOUT_MS);
  try {
    const res = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildImagePrompt(title, excerpt) }] }],
        generationConfig: {
          responseModalities: ['IMAGE'],
          // ⚠️ aspectRatio DEBE ir anidado en imageConfig (ver cabecera).
          imageConfig: { aspectRatio: '16:9' },
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[blog image] Gemini HTTP ${res.status}:`, body.slice(0, 300));
      return null;
    }

    const json = await res.json();
    const parts = json?.candidates?.[0]?.content?.parts ?? [];
    const imgPart = parts.find((p: { inlineData?: { data?: string } }) => p?.inlineData?.data);
    if (!imgPart?.inlineData?.data) {
      console.warn('[blog image] respuesta de Gemini sin inlineData — sin portada');
      return null;
    }
    return Buffer.from(imgPart.inlineData.data, 'base64');
  } catch (err) {
    // Incluye AbortError (timeout) y fallos de red. Graceful: sin portada.
    console.warn('[blog image] generación falló:', err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
