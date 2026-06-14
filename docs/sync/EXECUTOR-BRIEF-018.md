# Executor Brief #018 — Imagen de portada IA para los posts del blog (ilustración editorial + marca de agua + SEO)

**Fecha**: 2026-06-14
**Origen**: los posts del blog automático (Brief #010) se publican con `cover_image = null` → salen sin foto. Álvaro quiere una imagen de portada generada automáticamente con Gemini (apodado "nano banana"), profesional, con marca de agua de la marca, que además mejora el SEO (og:image).

## Decisiones ya tomadas (NO volver a preguntar)

1. **Dónde**: en el endpoint `src/app/api/cron/generate-blog/route.ts` (donde ya se genera el texto y se inserta el post), NO en n8n. n8n solo dispara el cron; el resto es código. La marca de agua necesita composición de imagen en Node — inviable en n8n.
2. **Estilo visual**: **ilustración editorial moderna** (tipo revista/periódico digital estilizado). NO fotorrealismo. Evita el problema de caras/manos/texto deformes de la IA.
3. **Marca de agua**: **banda inferior translúcida** con el logo (`/public/logo.png`) + el texto `tuasesoralvaro.com`.
4. **Modelo**: `gemini-2.5-flash-image` (estable, ~$0.04/img, hasta oct-2026), configurable vía env `BLOG_IMAGE_MODEL` para migrar fácil a `gemini-3.1-flash-image-preview` cuando toque.
5. **Graceful**: si la generación de imagen falla o tarda, el post se publica IGUAL con `cover_image = null`. La imagen NUNCA debe bloquear la publicación.

## Contexto crítico para el ejecutor

- `git log -3` / `git status` al arrancar. Último commit esperado: el de este brief.
- Lee `AGENTS.md`, `docs/sync/SYNC_AI.md` reciente, el Brief #010 y este brief entero.
- `gitnexus_impact` antes de editar símbolos; `gitnexus_detect_changes()` antes de commit.
- Build verde + tests verdes antes de cada commit. Commits firmados.
- **Lo que YA funciona y NO hay que tocar**: la UI del blog (`blog/[slug]/page.tsx`, `blog/page.tsx`) ya renderiza `cover_image` si existe; `generateMetadata` ya usa `cover_image` como `og:image` (1200×630) y el `alt` ya es `post.title`. Con rellenar `cover_image` con una URL, SEO y portada funcionan solos.

## Hallazgos de la investigación (ya hechos, úsalos)

- El draft de post tiene: `title, slug, content, excerpt, seo_title, seo_description, source_urls`. El insert pone `cover_image: null` (route.ts ~línea 123-133).
- Existe `/public/logo.png` (la marca).
- `sharp` NO está instalado. Buckets Storage actuales: `encargo-files`, `buyer-files`, `properties` (NO hay `blog-images`).
- Patrón de subida a Storage: `supabase.storage.from(bucket).upload(path, buffer, {contentType, upsert}) ` + `getPublicUrl(path)`.
- **Gemini Image API**: `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key=GEMINI_API_KEY`. La imagen vuelve en `candidates[0].content.parts[].inlineData = { mimeType, data(base64) }`. Aspect ratio configurable (`aspectRatio: "16:9"` en `generationConfig`); pide 16:9 para og:image. Latencia ~3-5s. Lleva SynthID invisible de Google (cumple normativa, no se ve). Prompt máx ~480 tokens.

---

## T0 — Migración: bucket de Storage `blog-images`

Crear el bucket público vía migración SQL (versionado) o `mcp__supabase__apply_migration`:

```sql
-- Bucket público de imágenes de portada del blog
insert into storage.buckets (id, name, public)
values ('blog-images', 'blog-images', true)
on conflict (id) do nothing;

-- Lectura pública (el bucket public=true ya permite getPublicUrl; política explícita por claridad)
create policy "blog-images public read"
  on storage.objects for select
  using ( bucket_id = 'blog-images' );
```

La escritura la hace el endpoint con el **service role** (bypassa RLS), así que no hace falta política de insert.

---

## T1 — Generar la imagen con Gemini

Nueva lib `src/lib/blog/generateCoverImage.ts`:

```ts
/**
 * Genera una imagen de portada para un post de blog con Gemini Image
 * ("nano banana"). Estilo: ilustración editorial moderna. 16:9 para og:image.
 * Devuelve un Buffer PNG, o null si falla (el caller publica el post sin imagen).
 */
const IMAGE_MODEL = process.env.BLOG_IMAGE_MODEL || 'gemini-2.5-flash-image';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

export function buildImagePrompt(title: string, excerpt: string): string {
  // Estilo editorial, SIN texto ni caras (la IA falla ahí). <480 tokens.
  return [
    'Ilustración editorial moderna para la portada de un artículo de un blog inmobiliario profesional sobre Sevilla, España.',
    `Tema del artículo: "${title}". ${excerpt}`,
    'Estilo: ilustración digital limpia y elegante, paleta sobria y profesional con acentos en azul marino y dorado (colores de marca inmobiliaria de gama media-alta).',
    'Composición horizontal 16:9, equilibrada, con espacio visual en la parte inferior (ahí irá una banda de marca).',
    'Elementos: arquitectura sevillana estilizada, barrios, llaves, planos, líneas de ciudad — de forma conceptual y editorial, NO fotorrealista.',
    'SIN texto, SIN letras, SIN logos, SIN personas en primer plano ni rostros. Estética de revista/periódico digital.',
  ].join(' ');
}

export async function generateCoverImage(title: string, excerpt: string): Promise<Buffer | null> {
  if (!GEMINI_API_KEY) return null;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildImagePrompt(title, excerpt) }] }],
          generationConfig: { responseModalities: ['IMAGE'], aspectRatio: '16:9' },
        }),
        // timeout defensivo (AbortController ~20s)
      },
    );
    if (!res.ok) {
      console.warn('[blog image] Gemini error', res.status, await res.text());
      return null;
    }
    const json = await res.json();
    const parts = json?.candidates?.[0]?.content?.parts ?? [];
    const imgPart = parts.find((p: any) => p?.inlineData?.data);
    if (!imgPart) {
      console.warn('[blog image] respuesta sin inlineData');
      return null;
    }
    return Buffer.from(imgPart.inlineData.data, 'base64');
  } catch (err) {
    console.warn('[blog image] generación falló:', err);
    return null;
  }
}
```

⚠️ Verifica con UNA llamada real la forma EXACTA de la respuesta y los nombres de campo de `generationConfig` (la API de Gemini cambia; `responseModalities` y `aspectRatio` deben ir donde la doc actual diga). Ajusta el parser si difiere.

Test: `buildImagePrompt` incluye el título, pide 16:9, prohíbe texto/caras, y deja hueco inferior.

---

## T2 — Marca de agua (banda inferior + logo + web)

Nueva lib `src/lib/blog/watermark.ts` que recibe el Buffer de Gemini y devuelve un PNG 1200×630 con la banda de marca.

**Recomendación de librería**: usar **`jimp`** (JavaScript puro, SIN binarios nativos) en lugar de `sharp`. Motivo: `sharp` necesita el binario nativo correcto y da problemas frecuentes en Netlify Functions; `jimp` no tiene ese riesgo. Si prefieres `sharp` por calidad de texto, verifica primero que el binario funciona en un deploy real de Netlify.

Composición:
1. Redimensionar/recortar la imagen de Gemini a **1200×630** (formato og:image).
2. Dibujar una **banda inferior translúcida** (~70-80px de alto, color azul marino de marca con ~70% opacidad) a lo ancho.
3. Componer `/public/logo.png` redimensionado (~50px alto) a la izquierda de la banda.
4. Escribir `tuasesoralvaro.com` en blanco, a la derecha del logo (fuente legible; con Jimp usar `loadFont(FONT_SANS_32_WHITE)` o similar; con sharp, un overlay SVG da texto vectorial más nítido).
5. Exportar a PNG (Buffer).

Si la composición falla, devolver la imagen original sin banda (mejor con imagen que sin ella). Si no hay imagen base, devolver null.

---

## T3 — Subir a Storage y rellenar `cover_image`

En el endpoint `generate-blog/route.ts`, tras validar el draft y calcular el `slug`, ANTES (o justo después) del insert:

```ts
// Generar portada (graceful: si algo falla, coverUrl queda null y el post se publica igual).
let coverUrl: string | null = null;
try {
  const raw = await generateCoverImage(draft.title, draft.excerpt);
  if (raw) {
    const finalPng = await applyWatermark(raw); // T2
    const path = `${slug}.png`;
    const { error: upErr } = await supabaseAdmin.storage
      .from('blog-images')
      .upload(path, finalPng, { contentType: 'image/png', upsert: true });
    if (!upErr) {
      coverUrl = supabaseAdmin.storage.from('blog-images').getPublicUrl(path).data.publicUrl;
    } else {
      console.warn('[cron blog] upload imagen falló:', upErr.message);
    }
  }
} catch (e) {
  console.warn('[cron blog] portada no generada:', e);
}
```

Y en el insert, cambiar `cover_image: null` → `cover_image: coverUrl`.

---

## ⚠️ Riesgo de timeout (Netlify)

El endpoint es síncrono. Hoy ya genera el texto con Gemini (~10-15s). Sumar imagen (~3-5s) + watermark (<1s) + upload (~1s) puede acercarse al límite de **26s** de Netlify (plan Pro).

- **Primer intento**: hacerlo inline con el fallback graceful (si la imagen tarda y el conjunto se pasa de 26s, el peor caso es que el cron falle ese día — n8n reintenta / al día siguiente se regenera). Mide el tiempo real en el primer deploy.
- **Si se ve timeout**: mover SOLO la generación de imagen a una **Netlify Background Function** (patrón ya usado en `valuation-run-background.mts` del Brief #016): el cron publica el post sin imagen y dispara la background function que genera la portada y hace UPDATE de `cover_image` después. Documenta cuál de los dos caminos quedó.

---

## SEO (ya cubierto, solo verificar)
- `og:image` y `twitter:image` ya leen `cover_image` en `generateMetadata` → con la URL real, las miniaturas en redes/Google funcionan.
- El `alt` de la imagen ya es `post.title` (suficiente). NO hace falta columna nueva.

## Dependencias / config
- **Env nueva**: `BLOG_IMAGE_MODEL=gemini-2.5-flash-image` en Netlify + `.env.local`.
- **Dependencia npm**: `jimp` (o `sharp` si verificas que funciona en Netlify).
- **Storage**: bucket `blog-images` (T0).

## Orden recomendado
1. T0 (bucket) → 2. T1 (generación, con prueba real de la API) → 3. T2 (watermark) → 4. T3 (integración + graceful) → medir timeout.

Un commit por T. Mensajes descriptivos.

## Verificación final
1. `npm run build` + `npm test` verdes.
2. Dispara el cron a mano (`POST /api/cron/generate-blog` con el `x-cron-secret`) y comprueba: post nuevo con `cover_image` poblado, imagen con banda de marca visible, y que la página del post + el og:image (inspeccionar `<meta property="og:image">`) usan esa URL.
3. `gitnexus_detect_changes()` + actualizar `docs/sync/SYNC_AI.md`.
4. `git push origin master`.

## Qué NO hacer
- NO meter la lógica de imagen en n8n.
- NO bloquear la publicación del post si la imagen falla (graceful siempre).
- NO usar fotorrealismo ni pedir texto/logos dentro de la imagen generada (la banda de marca se compone en código, no la genera la IA).
- NO exponer `GEMINI_API_KEY` al cliente (todo server-side en el cron).

## Si algo te bloquea
Reporta en `docs/sync/SYNC_AI.md` y para.
