/**
 * Genera la portada IA de un post, le aplica la marca de agua, la sube al
 * bucket `blog-images` y rellena `posts.cover_image` — Brief #018 T3.
 *
 * Lógica COMPARTIDA entre:
 *  - la Netlify Background Function `netlify/functions/blog-cover-background.mts`
 *    (camino de producción: 15 min de límite, sin riesgo de timeout), y
 *  - el fallback inline del cron en dev local (sin runtime de funciones Netlify).
 *
 * Todo es graceful: devuelve `false` ante cualquier fallo (sin key, IA caída,
 * upload/UPDATE con error). El post ya está publicado antes de llamar aquí, así
 * que no tener portada nunca rompe nada.
 *
 * Crea su propio cliente Supabase con el service role (bypassa RLS) para no
 * depender de un cliente externo y poder usarse desde la función Netlify.
 */

import { createClient } from '@supabase/supabase-js';
import { generateCoverImage } from './generateCoverImage';
import { applyWatermark } from './watermark';

export async function storeCoverImage(slug: string, title: string, excerpt: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !serviceKey) {
    console.warn('[blog cover] faltan credenciales Supabase — sin portada');
    return false;
  }

  const raw = await generateCoverImage(title, excerpt);
  if (!raw) return false; // generateCoverImage ya loguea el motivo

  const finalPng = await applyWatermark(raw);
  if (!finalPng) return false;

  const supabase = createClient(url, serviceKey);
  const path = `${slug}.png`;

  const { error: upErr } = await supabase.storage
    .from('blog-images')
    .upload(path, finalPng, { contentType: 'image/png', upsert: true });
  if (upErr) {
    console.warn('[blog cover] subida a Storage falló:', upErr.message);
    return false;
  }

  const publicUrl = supabase.storage.from('blog-images').getPublicUrl(path).data.publicUrl;
  const { error: updErr } = await supabase.from('posts').update({ cover_image: publicUrl }).eq('slug', slug);
  if (updErr) {
    console.warn('[blog cover] UPDATE de cover_image falló:', updErr.message);
    return false;
  }

  console.log(`[blog cover] portada lista para "${slug}": ${publicUrl}`);
  return true;
}
