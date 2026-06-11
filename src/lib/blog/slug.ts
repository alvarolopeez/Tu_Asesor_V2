/**
 * Generación de slugs para el blog — util compartida (Brief #010 T0).
 *
 * Extraída de BlogManager.tsx para reutilizarla en la generación automática
 * de posts (`generateNewsPost`). Módulo PURO (sin dependencias) — usable en
 * cliente y servidor.
 */

/** Limpia un texto y genera un slug URL-safe (minúsculas, sin acentos, guiones). */
export function generateSlug(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD') // remove accents
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-') // replace spaces with -
    .replace(/[^\w\-]+/g, '') // remove all non-word chars
    .replace(/\-\-+/g, '-') // replace multiple - with single -
    .replace(/^-+/, '') // trim - from start
    .replace(/-+$/, ''); // trim - from end
}
