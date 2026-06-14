import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';
import { generateNewsPost } from '@/lib/blog/generateNewsPost';
import { validateDraft } from '@/lib/blog/validateDraft';
import { sendWhatsAppTemplate } from '@/lib/whatsapp';

/**
 * POST /api/cron/generate-blog — Brief #010 T2.
 *
 * Generación automática diaria de un post de noticias del sector (Gemini +
 * Google Search grounding). Lo dispara el workflow n8n `Blog Diario Noticias`
 * (Schedule 08:00 Europe/Madrid). Publica DIRECTO (`is_published=true`,
 * decisión 1 de Álvaro) → guardarraíl duro: si la generación no pasa la
 * validación (`validateDraft`), responde 422 y NO inserta nada ese día.
 *
 * Auth: header `x-cron-secret` comparado en tiempo constante contra
 * `process.env.CRON_SECRET` (mismo patrón que /api/webhooks/documenso).
 *
 * Respuestas:
 *  - 401 sin secreto / secreto incorrecto · 503 sin CRON_SECRET configurado
 *  - 200 { skipped: true }  si ya hay post generado hoy (idempotencia)
 *  - 422 { published: false, reason }  si Gemini falla o el draft no valida
 *  - 200 { published: true, slug, title }  si se publicó
 */

export const dynamic = 'force-dynamic';

/** Comparación en tiempo constante (evita timing attacks). */
function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
);

const ADVISOR_PHONE = process.env.ADVISOR_WHATSAPP_PHONE || '';

/** Log de trazabilidad en n8n_webhook_logs (fire-and-soft). */
async function logResult(payload: Record<string, unknown>, status: number): Promise<void> {
  try {
    await supabaseAdmin.from('n8n_webhook_logs').insert({
      webhook_name: 'cron_generate_blog',
      source: 'cron',
      payload,
      response_status: status,
    });
  } catch (err) {
    console.warn('[cron blog] no se pudo registrar el log:', err);
  }
}

/**
 * Dispara la Background Function que genera la portada (Brief #018). Devuelve
 * true si quedó encolada (202/2xx). En dev local (sin runtime de funciones
 * Netlify) el endpoint no existe → devuelve false y el caller cae al fallback
 * inline. Protegida con el service role como secreto compartido.
 */
async function triggerCoverBackground(
  req: NextRequest,
  slug: string,
  title: string,
  excerpt: string,
): Promise<boolean> {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!secret) return false;
  try {
    const origin = process.env.URL || process.env.DEPLOY_PRIME_URL || new URL(req.url).origin;
    const res = await fetch(`${origin}/.netlify/functions/blog-cover-background`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
      body: JSON.stringify({ slug, title, excerpt }),
    });
    return res.status === 202 || res.ok;
  } catch (err) {
    console.warn('[cron blog] trigger background de portada falló, fallback inline:', String(err));
    return false;
  }
}

export async function POST(request: NextRequest) {
  // ── Auth ──
  const cronSecret = process.env.CRON_SECRET || '';
  if (!cronSecret) {
    return NextResponse.json({ error: 'Falta CRON_SECRET en el servidor.' }, { status: 503 });
  }
  const provided = request.headers.get('x-cron-secret') || '';
  if (!provided || !secretsMatch(provided, cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const tStart = Date.now(); // medición de latencia total (riesgo timeout Netlify)
    // ── Paso 1: idempotencia + títulos recientes (anti-repetición) ──
    // "Hoy" en UTC: a las 08:00 Madrid (06:00/07:00 UTC) el día UTC y el día
    // Madrid coinciden, y los reintentos de n8n caen en el mismo día UTC.
    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

    const { data: recentPosts, error: recentErr } = await supabaseAdmin
      .from('posts')
      .select('title, created_at')
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(30);

    if (recentErr) {
      console.error('[cron blog] error leyendo posts recientes:', recentErr.message);
      return NextResponse.json({ error: recentErr.message }, { status: 500 });
    }

    const alreadyToday = (recentPosts || []).some((p) => p.created_at >= startOfToday);
    if (alreadyToday) {
      return NextResponse.json({ skipped: true, reason: 'already_generated_today' });
    }

    const recentTitles = (recentPosts || []).map((p) => p.title).filter(Boolean);

    // ── Paso 2: generar ──
    const draft = await generateNewsPost(recentTitles);

    // ── Paso 3: guardarraíl (T3) — sin draft válido NO se publica nada ──
    if (!draft) {
      const reason = 'generation_failed_or_invalid';
      console.warn('[cron blog] generación fallida o inválida — hoy no se publica');
      await logResult({ published: false, reason }, 422);
      return NextResponse.json({ published: false, reason }, { status: 422 });
    }
    const validation = validateDraft(draft);
    if (!validation.ok) {
      console.warn(`[cron blog] draft rechazado: ${validation.reason}`);
      await logResult({ published: false, reason: validation.reason }, 422);
      return NextResponse.json({ published: false, reason: validation.reason }, { status: 422 });
    }

    // ── Paso 4: slug único (sufija -2, -3… si colisiona) ──
    let slug = draft.slug;
    for (let i = 2; i <= 20; i++) {
      const { data: clash } = await supabaseAdmin
        .from('posts')
        .select('id')
        .eq('slug', slug)
        .limit(1);
      if (!clash || clash.length === 0) break;
      slug = `${draft.slug}-${i}`;
    }

    // ── Paso 5: insertar publicado ──
    const { error: insertErr } = await supabaseAdmin.from('posts').insert([{
      title: draft.title,
      slug,
      content: draft.content,
      excerpt: draft.excerpt,
      cover_image: null,
      is_published: true,
      seo_title: draft.seo_title,
      seo_description: draft.seo_description,
      created_at: new Date().toISOString(),
    }]);

    if (insertErr) {
      console.error('[cron blog] insert falló:', insertErr.message);
      await logResult({ published: false, reason: `insert: ${insertErr.message}` }, 500);
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    await logResult(
      { published: true, slug, title: draft.title, source_urls: draft.source_urls },
      200,
    );

    // ── Paso 6: avisar a Álvaro del nuevo post (await — en serverless un
    //    fire-and-forget se pierde al congelarse el contenedor tras el return).
    //    Plantilla aviso_alvaro (HSM) para que llegue aunque la ventana de 24h
    //    esté cerrada.
    if (ADVISOR_PHONE) {
      const detalle = `"${draft.title}" → tuasesoralvaro.com/blog/${slug}`;
      await sendWhatsAppTemplate(ADVISOR_PHONE, 'aviso_alvaro', ['Nuevo post publicado en el blog', detalle], {
        normalize: true,
        logTag: '[cron blog][HSM asesor]',
      }).catch((e) => console.warn('[cron blog] aviso a Álvaro falló:', e));
    }

    // ── Paso 7: portada IA (Brief #018) — GRACEFUL y FUERA del camino crítico.
    //    El post YA está publicado (Paso 5), así que la imagen nunca bloquea la
    //    publicación. La generación de imagen (~6s) sumada al texto (~21s ya
    //    medidos) + insert + WhatsApp superaría el límite de 26s de Netlify Pro,
    //    así que la portada se delega a una Background Function (15 min, sin
    //    timeout) que rellena cover_image con un UPDATE. En dev local (sin
    //    runtime de funciones Netlify) cae a un fallback inline para poder
    //    probar end-to-end.
    const coverQueued = await triggerCoverBackground(request, slug, draft.title, draft.excerpt);
    if (!coverQueued) {
      try {
        const { storeCoverImage } = await import('@/lib/blog/storeCoverImage');
        const ok = await storeCoverImage(slug, draft.title, draft.excerpt);
        console.log(`[cron blog] portada inline (fallback dev): ${ok ? 'OK' : 'sin imagen'}`);
      } catch (e) {
        console.warn('[cron blog] fallback inline de portada falló:', e);
      }
    }

    const totalMs = Date.now() - tStart;
    console.log(`[cron blog] publicado "${slug}" · portada encolada=${coverQueued} · total cron ${totalMs}ms`);

    return NextResponse.json({ published: true, slug, title: draft.title, coverQueued, totalMs });
  } catch (err) {
    console.error('[cron blog] error inesperado:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
