/**
 * Netlify Background Function — genera la portada IA de un post del blog.
 *
 * El sufijo "-background" hace que Netlify la invoque de forma ASÍNCRONA:
 * responde 202 al instante y corre hasta 15 min en segundo plano. Imprescindible
 * aquí porque el cron del blog ya consume ~21 s solo en generar el TEXTO (Gemini
 * + grounding); sumar la imagen (~6 s) + watermark + upload superaría el límite
 * de 26 s de las funciones síncronas en Netlify Pro (medido: ~28 s). Sacando la
 * imagen a esta función, el cron publica el post y delega la portada sin riesgo.
 *
 * La dispara `POST /api/cron/generate-blog` tras insertar el post (que ya está
 * publicado con cover_image=null). Esta función rellena cover_image después.
 *
 * Protegida por un secreto compartido (service role key) para evitar disparos
 * públicos de /.netlify/functions/blog-cover-background.
 *
 * @created 2026-06-14 brief #018
 */

import { storeCoverImage } from '../../src/lib/blog/storeCoverImage';

export default async (req: Request): Promise<Response> => {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!secret || req.headers.get('x-internal-secret') !== secret) {
    return new Response('Forbidden', { status: 403 });
  }

  let body: { slug?: string; title?: string; excerpt?: string };
  try {
    body = await req.json();
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const { slug, title, excerpt } = body;
  if (!slug || !title) {
    return new Response('Missing slug/title', { status: 400 });
  }

  // Background function: await mantiene viva la ejecución hasta terminar (el
  // invocador ya recibió 202). Graceful: si falla, el post se queda sin portada.
  const ok = await storeCoverImage(slug, title, excerpt || '');
  return new Response(ok ? 'cover-generated' : 'cover-skipped');
};
