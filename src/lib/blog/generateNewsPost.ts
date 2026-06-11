/**
 * Generador automático de posts de noticias del sector — Brief #010 T1.
 *
 * Llama a Gemini con la tool de búsqueda de Google (grounding) para que
 * encuentre noticias reales y recientes del sector inmobiliario en Sevilla y
 * redacte un artículo ORIGINAL. Devuelve `null` ante cualquier fallo (HTTP,
 * JSON inválido, validación) — el caller decide no publicar ese día.
 *
 * ⚠️ Modelo: `BLOG_LLM_MODEL` (default `gemini-2.5-flash`) — separado del
 * modelo del chatbot (`LLM_MODEL` en engine.ts, que NO se toca). Los modelos
 * 1.5 NO soportan la tool `google_search` (en 1.5 era `google_search_retrieval`);
 * si se cambia el modelo, revisar el campo de la tool AQUÍ (un solo sitio).
 */

import { generateSlug } from './slug';
import { buildBlogPrompt } from './blogPrompt';
import { validateDraft } from './validateDraft';

export interface DraftPost {
  title: string;
  slug: string;
  excerpt: string;
  content: string;       // markdown
  seo_title: string;
  seo_description: string;
  source_urls: string[]; // noticias usadas (trazabilidad/log, NO se copian literal)
}

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Parseo por niveles (mismo espíritu que parseLLMResponse en engine.ts):
 * 1. strip de fences ```json ... ``` si los trae;
 * 2. JSON.parse directo;
 * 3. rescate: recorte del primer '{' al último '}' (preámbulos/postámbulos);
 * 4. si nada funciona → null.
 */
function parseDraftJson(raw: string): Record<string, unknown> | null {
  let jsonStr = (raw || '').trim();
  const codeFence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeFence) jsonStr = codeFence[1];

  try {
    return JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    const start = jsonStr.indexOf('{');
    const end = jsonStr.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(jsonStr.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

/** URLs de las fuentes que usó el grounding (groundingMetadata de Gemini 2.x). */
function extractGroundingUrls(data: Record<string, any>): string[] {
  const chunks = data?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks)) return [];
  const urls = chunks
    .map((c: any) => c?.web?.uri)
    .filter((u: unknown): u is string => typeof u === 'string' && u.length > 0);
  return Array.from(new Set(urls));
}

/**
 * Genera un borrador de post buscando noticias recientes. `recentTitles` son
 * los títulos publicados en los últimos días (anti-repetición de tema).
 * Devuelve null si Gemini falla, no hay JSON válido o no pasa validación.
 */
export async function generateNewsPost(recentTitles: string[]): Promise<DraftPost | null> {
  const apiKey = process.env.GEMINI_API_KEY || '';
  const model = process.env.BLOG_LLM_MODEL || 'gemini-2.5-flash';
  if (!apiKey) {
    console.error('[blog] GEMINI_API_KEY no configurada — generación cancelada');
    return null;
  }

  let data: Record<string, any>;
  try {
    const res = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildBlogPrompt(recentTitles) }] }],
        // Grounding con Google Search — sintaxis de modelos 2.x. ⚠️ No es
        // compatible con responseMimeType: application/json → el JSON se
        // exige por prompt y se parsea con parseDraftJson.
        tools: [{ google_search: {} }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 8192,
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[blog] Gemini HTTP ${res.status}:`, body.slice(0, 500));
      return null;
    }
    data = await res.json();
  } catch (err) {
    console.error('[blog] fallo de red llamando a Gemini:', err);
    return null;
  }

  // El texto puede venir repartido en varios parts cuando hay grounding.
  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map((p: any) => p?.text)
    .filter(Boolean)
    .join('\n');

  const parsed = parseDraftJson(text);
  if (!parsed) {
    console.warn('[blog] respuesta de Gemini sin JSON válido — no se publica hoy');
    return null;
  }

  const title = String(parsed.title || '').trim();
  const excerpt = String(parsed.excerpt || '').trim();
  const content = String(parsed.content || '').trim();

  // Fuentes: preferimos las del grounding (verificables); si no, las que
  // declare el modelo en el JSON.
  const groundingUrls = extractGroundingUrls(data);
  const declaredUrls = Array.isArray(parsed.source_urls)
    ? (parsed.source_urls as unknown[]).filter((u): u is string => typeof u === 'string')
    : [];
  const source_urls = groundingUrls.length > 0 ? groundingUrls : declaredUrls;

  const draft: DraftPost = {
    title,
    slug: generateSlug(title),
    excerpt,
    content,
    // Fallbacks SEO desde title/excerpt si el modelo los dejó vacíos.
    seo_title: String(parsed.seo_title || '').trim() || title,
    seo_description: String(parsed.seo_description || '').trim() || excerpt,
    source_urls,
  };

  const validation = validateDraft(draft);
  if (!validation.ok) {
    console.warn(`[blog] borrador rechazado por validación: ${validation.reason}`);
    return null;
  }

  return draft;
}
