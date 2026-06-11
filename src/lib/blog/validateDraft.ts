/**
 * Guardarraíl anti-basura del blog automático — Brief #010 T3.
 *
 * El post se publica SIN revisión humana (decisión 1 de Álvaro), así que si
 * cualquier check falla NO se publica nada ese día: mejor saltar un día que
 * indexar basura en Google. Módulo puro, testeable sin mocks.
 */

import type { DraftPost } from './generateNewsPost';

export type DraftValidation = { ok: true } | { ok: false; reason: string };

export function validateDraft(draft: DraftPost): DraftValidation {
  const title = (draft.title || '').trim();
  if (title.length < 10 || title.length > 120) {
    return { ok: false, reason: `title fuera de rango (${title.length} chars, esperado 10-120)` };
  }
  if (/[{}`]|\\"/.test(title)) {
    return { ok: false, reason: 'title contiene restos de JSON ({, }, ` o \\")' };
  }

  const content = (draft.content || '').trim();
  if (content.length < 800) {
    return { ok: false, reason: `content demasiado corto (${content.length} chars, mínimo 800)` };
  }
  const paragraphBreaks = content.match(/\n\s*\n/g)?.length ?? 0;
  if (paragraphBreaks < 2) {
    return { ok: false, reason: `content sin estructura de párrafos (${paragraphBreaks} saltos dobles, mínimo 2)` };
  }
  if (content.includes('{"response') || content.startsWith('{')) {
    return { ok: false, reason: 'content parece JSON crudo, no markdown' };
  }

  const excerpt = (draft.excerpt || '').trim();
  if (excerpt.length < 40 || excerpt.length > 300) {
    return { ok: false, reason: `excerpt fuera de rango (${excerpt.length} chars, esperado 40-300)` };
  }

  if (!(draft.seo_title || '').trim() || !(draft.seo_description || '').trim()) {
    return { ok: false, reason: 'seo_title o seo_description vacíos' };
  }

  // Sin fuentes de grounding el contenido es sospechoso (¿alucinado?) → rechazar.
  if (!Array.isArray(draft.source_urls) || draft.source_urls.length < 1) {
    return { ok: false, reason: 'sin source_urls (el grounding no devolvió fuentes)' };
  }

  return { ok: true };
}
