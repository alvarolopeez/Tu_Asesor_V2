# Executor Brief #010 — Generación automática de blog con noticias del sector (cron 08:00)

**Fecha**: 2026-06-10
**Origen**: Petición de Álvaro. Los temas del blog son muy limitados y el contenido se queda
desactualizado. Quiere que cada mañana a las 08:00 un proceso busque noticias recientes del sector
inmobiliario en Sevilla y **publique automáticamente** un post nuevo, para tener siempre material fresco.

## Decisiones ya tomadas por Álvaro
1. **Publicación: AUTOMÁTICA** (`is_published=true` directo, sin revisión humana). → Por eso los
   **guardarraíles de calidad son obligatorios** (ver T3): si la generación no pasa validación, NO se
   publica nada ese día (mejor saltar un día que publicar basura indexable en Google).
2. **Fuente de noticias: Gemini + Google Search grounding** (reutiliza `GEMINI_API_KEY` ya configurada,
   sin claves nuevas).
3. **Disparador: n8n** Schedule Trigger a las 08:00 Europe/Madrid → HTTP POST a una ruta del propio app
   (mismo patrón que `/api/n8n/*`). La lógica de contenido vive en el código, no en n8n.

## Contexto verificado del sistema actual
- **Tabla `posts`** (Supabase): `id, title, slug, content (markdown), excerpt, cover_image, is_published,
  seo_title, seo_description, created_at, updated_at`. Definición en `src/lib/blogService.ts`.
- `src/components/admin/sections/BlogManager.tsx` crea posts a mano. Tiene `generateSlug(text)` (línea ~15)
  — **extráela** a util compartida `src/lib/blog/slug.ts` y reúsala en ambos sitios (no dupliques).
- `/blog` lista `is_published=true` (`getPublishedPosts`); `/blog/[slug]` es `force-dynamic` → un post
  nuevo aparece sin rebuild.
- Gemini hoy: `gemini-1.5-flash` vía `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key=...`
  (ver `src/app/api/ai/zones/route.ts` y `src/lib/chatbot/engine.ts` `callGemini`). **1.5-flash NO hace
  grounding de búsqueda** → para el blog usa un modelo 2.x con la tool `google_search`.
- Patrones de auth de rutas existentes: `x-api-key` (`/api/webhooks/n8n`), `x-documenso-secret` con
  comparación tiempo-constante (`/api/webhooks/documenso`), `X-Admin-Key` (`/api/admin/chat/send`).
- Reglas de oro: `gitnexus_impact` antes de editar símbolos, `gitnexus_detect_changes` antes de commit,
  `npm run build` + `npm test` verdes, no tocar workflows n8n de producción (duplicar a test).

---

## T1 — Helper de generación `src/lib/blog/generateNewsPost.ts`

Aislado de la ruta para poder testearlo.

```ts
export interface DraftPost {
  title: string;
  slug: string;
  excerpt: string;
  content: string;       // markdown
  seo_title: string;
  seo_description: string;
  source_urls: string[]; // noticias usadas (para trazabilidad/log, NO se copian literal)
}

// Devuelve null si Gemini falla, no devuelve noticias, o el contenido no pasa validación.
export async function generateNewsPost(recentTitles: string[]): Promise<DraftPost | null>
```

- Llama a Gemini (modelo de `process.env.BLOG_LLM_MODEL` con default `gemini-2.5-flash`) con la tool de
  búsqueda: `tools: [{ google_search: {} }]`. ⚠️ Confirma el nombre exacto del campo de la tool contra la
  doc vigente de Gemini para el modelo elegido (`google_search` en 2.x vs `google_search_retrieval` en 1.5)
  — está aislado aquí para corregir en un solo sitio.
- **Prompt del sistema** (redáctalo en `src/lib/blog/blogPrompt.ts` o inline): rol = redactor inmobiliario
  experto de "Tu Asesor Álvaro" en Sevilla. Instrucciones:
  - Busca **noticias reales y recientes (últimos ~7 días)** del sector inmobiliario en Sevilla / Andalucía
    (precios, mercado, hipotecas, normativa, barrios, demanda).
  - Escribe un artículo **ORIGINAL** (NO copies texto literal de las fuentes — síntesis con tus palabras,
    enfoque local y útil para propietarios/compradores de Sevilla).
  - Tono profesional cercano. Incluye un CTA suave al final (valoración gratuita / contacto).
  - **NO repitas** ninguno de estos temas ya publicados recientemente: `{recentTitles}`.
  - Devuelve **JSON estricto** con las claves de `DraftPost` (sin texto fuera del JSON, sin ```).
- Parseo: reutiliza el patrón por niveles de `engine.ts` `parseLLMResponse` (JSON.parse → rescate regex).
  Si no hay JSON válido → `return null`.
- Genera `slug` con la util compartida `src/lib/blog/slug.ts`.

## T2 — Ruta `POST /api/cron/generate-blog`

- **Auth**: header `x-cron-secret` comparado en **tiempo constante** contra `process.env.CRON_SECRET`
  (reusa el helper de comparación de `/api/webhooks/documenso`). Sin secreto o no coincide → `401`.
- Cliente Supabase con **service role** (`SUPABASE_SERVICE_ROLE_KEY`).
- **Paso 1 — Idempotencia / dedup**: consulta `posts` de hoy (`created_at >= startOfToday`). Si ya existe
  uno → `200 { skipped: true, reason: 'already_generated_today' }` (evita duplicados si n8n reintenta).
  Además, carga los títulos de los últimos 7 días para pasárselos al generador (anti-repetición de tema).
- **Paso 2 — Generar**: `const draft = await generateNewsPost(recentTitles)`.
- **Paso 3 — Guardarraíl (T3)**: ver validación. Si `draft === null` o no valida → `422
  { published: false, reason }` y log claro. **No insertes.**
- **Paso 4 — Slug único**: si el slug ya existe en `posts`, sufija `-2`, `-3`… hasta que sea único.
- **Paso 5 — Insertar**: en `posts` con `is_published: true`, `cover_image: null` (o imagen de marca por
  defecto si decides), `excerpt`, `seo_title`, `seo_description`. Devuelve `200 { published: true, slug, title }`.
- (Opcional) registra el resultado en `n8n_webhook_logs` para trazabilidad.
- Marca la ruta como dinámica (sin cache).

## T3 — Validación dura del contenido (guardarraíl anti-basura)

Antes de insertar, valida el `draft`:
- `title`: 10–120 chars, sin `{`/`}` ni comillas raras de JSON sobrante.
- `content`: ≥ 800 chars, markdown plausible (al menos 2 saltos de párrafo), sin `{"response"` ni JSON crudo.
- `excerpt`: 40–300 chars.
- `seo_title` y `seo_description` no vacíos (genera fallback desde title/excerpt si faltan).
- `source_urls`: al menos 1 (si grounding no devolvió fuentes, sospechoso → puedes rechazar o degradar).
- Si **cualquier** check falla → NO publicar, devolver 422 con el motivo. Mejor saltar un día.

## T4 — Workflow n8n (cron 08:00)

- **NO toques los workflows de producción.** Crea uno **nuevo** (vía n8n MCP o documenta los pasos para que
  Álvaro lo monte): nombre `Blog Diario Noticias`.
  - **Schedule Trigger**: cron `0 8 * * *`, timezone `Europe/Madrid`.
  - **HTTP Request**: `POST https://tuasesoralvaro.com/api/cron/generate-blog`, header
    `x-cron-secret: {{ $env... }}` (o credencial). Body vacío `{}`.
  - (Opcional) IF: si la respuesta no es 200/`published:true`, enviar aviso a Álvaro por WhatsApp
    (`sendWhatsAppMessage` ya existe) — útil para enterarte si un día falla.
- Prueba ejecutando el workflow **manualmente una vez** y verifica que aparece el post en `/blog`.

## Env nuevos (NO commitear — sincronizar Netlify + `.env.local`)
- `CRON_SECRET` — secreto compartido n8n ↔ app.
- `BLOG_LLM_MODEL` — opcional, default `gemini-2.5-flash`.
- `GEMINI_API_KEY` — ya existe.

## Tests obligatorios (`src/lib/blog/__tests__/generateNewsPost.test.ts` + ruta)
1. Mock Gemini con JSON válido → `generateNewsPost` devuelve `DraftPost` con slug correcto.
2. Mock Gemini con JSON truncado/no-JSON → devuelve `null` (no rompe).
3. Validación: content < 800 chars → la ruta responde 422, no inserta (mock supabase).
4. Dedup: un `recentTitles` con el tema → el prompt lo recibe (verifica que se le pasa).
5. Auth: POST sin `x-cron-secret` → 401.
6. Idempotencia: si ya hay post de hoy → 200 `skipped`.

## Criterio de aceptación
- `POST /api/cron/generate-blog` con secreto correcto → crea 1 post publicado, visible en `/blog`.
- Sin secreto → 401. Segundo POST el mismo día → `skipped`, no duplica.
- Gemini falla o contenido inválido → 422, **nada publicado**, log claro.
- El post es original (no copia literal), enfocado a Sevilla, con SEO relleno.

## Orden de ejecución recomendado
1. `src/lib/blog/slug.ts` (extraer `generateSlug`, reusar en BlogManager) → commit pequeño.
2. T1 `generateNewsPost.ts` + prompt + tests de parseo.
3. T2 ruta `/api/cron/generate-blog` + T3 validación + tests de ruta.
4. `npm run build` + `npm test` verdes → `gitnexus_detect_changes` → commit + push.
5. T4 workflow n8n (nuevo, test manual) + sincronizar envs en Netlify.
6. Actualizar `docs/sync/SYNC_AI.md` con el cambio (nueva ruta cron + env + workflow).

## Qué NO hacer
- NO toques el modelo del chatbot (`engine.ts` `callGemini` / `LLM_MODEL`) — usa `BLOG_LLM_MODEL` aparte.
- NO publiques contenido que no pase la validación T3.
- NO copies texto literal de las noticias (originalidad + derechos): el prompt exige reescritura propia.
- NO toques workflows n8n de producción; crea uno nuevo y pruébalo manualmente.
- NO hardcodees `CRON_SECRET` ni lo pegues en commits.
- NO uses la `anon key` para insertar; usa service role en la ruta servidor.
