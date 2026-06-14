# Executor Brief #020 — Rediseño web "Sevilla Luz" · FASE 1: fundación + Header + Footer + Home

**Fecha**: 2026-06-15
**Modelo recomendado**: Sonnet 4.6 (frontend de calidad). Considera invocar la skill `frontend-design` si está disponible.
**Origen**: Álvaro eligió la dirección visual final del rediseño. La fuente de verdad del DISEÑO es el mockup:
**`docs/mockups/home-rediseno-v4.html`** ("Sevilla Luz" — mediterráneo, claro). **LÉELO ENTERO Y ÁBRELO en el navegador antes de empezar**: colores, tipografía, espaciados y secciones salen de ahí.

Este brief es la **Fase 1** de un rediseño por fases. Cubre la **fundación del sistema visual + Header + Footer + Home**. Las páginas secundarias van en fases posteriores (ver roadmap al final).

## Contexto técnico (ya investigado — úsalo)

- **Next.js 16 App Router + Tailwind v4** (¡v4!). NO hay `tailwind.config`; los tokens viven en `@theme` dentro de `src/app/globals.css`.
- Tokens actuales en `globals.css` `@theme`: `--color-accent:#FBBF24` (dorado, se mantiene), `--color-secondary:#2C3E50`, `--color-background:#0f172a` (dark), `--font-sans` (Lato), `--font-heading` (Montserrat). Hay clases custom: `.glass-effect`, `.hero-bg`, `.btn`, `.service-card`, etc.
- Fuentes actuales: Lato + Montserrat vía `next/font/google` en `src/app/layout.tsx`.
- **Home** `src/app/page.tsx`: server component, ~196 líneas, 6 secciones. Importa `HomeBuyerPopup`, `ReviewsGrid`, `SubscribeSection`, `SuccessStoriesCarousel`.
- **Header** `src/components/Header.tsx`: client, ~127 líneas, con dropdown "Servicios" y menú móvil. Rutas: Comprar, Vender, Servicios (→ plusvalía, rentabilidad), Blog, Contacto, CTA → `/valoracion`.
- **Footer**: inline en `layout.tsx` (no es componente).
- `LayoutWrapper` separa admin de público. **El ADMIN NO se toca** (se queda con su estilo dark actual).

## Estrategia anti-rotura (CRÍTICA): coexistencia

Cambiar los tokens globales de dark→claro rompería las páginas que aún no se migran (comprar, valoración, etc. usan fondo oscuro). Para evitarlo:

- **AÑADE los tokens y fuentes NUEVOS sin borrar los viejos.** Que convivan. Las páginas no migradas siguen usando los viejos y no se rompen.
- Las páginas que SÍ migramos en esta fase (solo la Home + Header + Footer) usan el sistema nuevo.
- La **limpieza** de tokens/clases viejas (`glass-effect`, `--color-background` dark, Lato/Montserrat) se hará en la FASE FINAL, cuando todo esté migrado. NO la hagas ahora.

⚠️ Excepción Header/Footer: son compartidos por todas las páginas. Al renovarlos, durante la migración se verá un header/footer claro sobre páginas aún oscuras. Es aceptable y temporal. Asegúrate solo de que el Header nuevo es legible y no se rompe el layout.

---

## T1 — Fundación: tipografía + tokens de color

### Fuentes (en `layout.tsx`, vía `next/font/google`)
Añadir **Playfair Display** (titulares, serif) y **Jost** (cuerpo, sans) — son las del mockup. Exponerlas como variables CSS (`--font-playfair`, `--font-jost`). Puedes dejar Lato/Montserrat de momento (coexistencia) o mapear las viejas variables a las nuevas; lo importante es que el sistema nuevo use Playfair+Jost.

### Tokens de color (en `globals.css` `@theme`)
Añadir los del mockup (no borres los viejos todavía):
```
--color-warm-white: #FFFEF9;
--color-sand:       #F2EBE0;
--color-sand-dark:  #E8DDD0;
--color-navy:       #0F172A;
--color-navy-soft:  #1E293B;
--color-gold:       #FBBF24;   /* = accent actual, ya existe */
--color-gold-pale:  #FEF3C7;
--color-ink:        #2C2015;   /* texto cálido */
--color-muted:      #7C6F63;
--color-line:       #E8DDD0;   /* bordes */
```
Define también las familias: `--font-display: var(--font-playfair)`, `--font-body: var(--font-jost)`.

Objetivo: que el ejecutor pueda usar `bg-warm-white`, `text-navy`, `text-muted`, `font-display`, etc. en la Home. Verifica cómo Tailwind v4 expone estos tokens como utilidades.

---

## T2 — Header nuevo (claro, estilo v4)

Reescribir `src/components/Header.tsx` según el `nav` del mockup:
- Fondo `warm-white` translúcido, sticky, borde inferior fino, `backdrop-blur` ligero.
- Logo: **"Tu Asesor · Álvaro"** en Playfair, con el `·` en dorado (ver `.logo`/`.logo-dot` del mockup).
- Links en Jost, color muted → navy al hover.
- CTA pill navy "Valora tu casa gratis" → `/valoracion`.
- **CONSERVA la funcionalidad real existente**: las rutas actuales (Comprar `/comprar`, Vender `/valoracion` o la que sea, Blog `/blog`, Contacto `/contacto`), el **dropdown de Servicios** (plusvalía, rentabilidad) y el **menú móvil**. El mockup simplifica el nav; tú mantén los enlaces reales pero con el estilo nuevo. El menú móvil debe seguir funcionando (adáptalo al estilo claro).

---

## T3 — Footer nuevo (navy, estilo v4)

Extraer el footer a un componente `src/components/Footer.tsx` (mejor que inline) y montarlo en `layout.tsx`. Diseño = `footer` del mockup:
- Fondo navy, 3 columnas (marca + descripción + WhatsApp / Navega / Contacto), barra inferior con copyright y enlaces legales.
- **Datos reales**: WhatsApp `+34 697 223 944` (link `https://wa.me/34697223944`), email y dominio reales, enlaces legales a las páginas existentes (`/aviso-legal`, `/politica-privacidad`, `/politica-cookies`), enlaces de navegación a las rutas reales.

---

## T4 — Home (`src/app/page.tsx`) según v4

Reescribir la home con las secciones del mockup, EN ORDEN, pero con **DATOS REALES** (el mockup usa fotos de Unsplash y texto de ejemplo — en producción van datos de Supabase y copy real):

1. **Hero**: texto ("Vende tu casa en Sevilla por solo un 2%") + **mosaico de 3 fotos**. Para las fotos usa imágenes de **inmuebles reales destacados** (de `properties` activas con imágenes); si no hay suficientes, una imagen de Sevilla de respaldo. El badge de precio del mosaico, con un inmueble real si lo hay. Mantén los 2 CTA (Valoración `/valoracion`, Ver inmuebles `/comprar`). La social proof ("+40 familias…") puede quedar como copy fijo por ahora.
2. **Stats band** (arena): 2% · 0% · +40 familias · 5★. Copy fijo.
3. **Process**: 4 pasos (tal cual el mockup).
4. **Statement 2%** (navy, impacto tipográfico): tal cual.
5. **Inmuebles destacados**: 3 `prop-card` con **datos REALES** de Supabase (3 propiedades activas más recientes: foto, precio, título, zona, m²/hab/baños). Enlazan al detalle real. Si hay 0 propiedades, oculta la sección o muestra un estado vacío elegante.
6. **Valuation** (arena): bloque "¿Cuánto vale tu casa?" → `/valoracion`.
7. **Testimonials**: usa **reseñas reales publicadas** (`reviews` con `is_published=true`) si las hay (reaprovecha `ReviewsGrid` o su fuente de datos); si no, los 3 del mockup como fallback.
8. **Blog**: 3 posts reales recientes (reutiliza `getPublishedPostsPage(1,3)` que ya existe) con su `cover_image`.
9. **CTA final** (navy con anillos dorados) + botón WhatsApp.
10. Mantén **`HomeBuyerPopup`** (el popup de captación a los 3s) — no lo quites.

Notas:
- Como es server component, carga los datos reales con fetch/servicios server-side (propiedades, reseñas, posts). Hay servicios ya hechos (`blogService`, etc.); para propiedades y reseñas, reutiliza lo que usan `SuccessStoriesCarousel`/`ReviewsGrid` o consulta Supabase directamente en el server component.
- Respeta el responsive del mockup (ya trae media queries; tradúcelas a clases Tailwind).
- `loading="lazy"` en las imágenes below-the-fold.

---

## Verificación
1. `npm run build` verde.
2. Abre la home en local (`npm run dev`) y compárala lado a lado con `home-rediseno-v4.html`: debe sentirse igual (tipografía, colores, secciones, espaciados).
3. Comprueba que las **demás páginas públicas no se han roto** (siguen con su estilo viejo, pero funcionan) — abre `/comprar`, `/valoracion`, `/blog`.
4. Móvil: revisa el responsive de la home y el menú móvil del Header.
5. `gitnexus_detect_changes()` + actualizar `docs/sync/SYNC_AI.md`.
6. Commit por tarea (T1 tokens, T2 header, T3 footer, T4 home) y `git push`.

## Qué NO hacer
- NO tocar el admin (`/admin/*`, `LayoutWrapper` rama admin).
- NO borrar tokens/clases viejas todavía (coexistencia — limpieza en fase final).
- NO usar las fotos de Unsplash del mockup en producción: datos e imágenes REALES de Supabase (con fallback elegante si no hay).
- NO cambiar rutas, formularios ni lógica de negocio: esto es SOLO capa visual.
- NO romper `HomeBuyerPopup` ni la captación de leads.

## Roadmap de fases siguientes (NO en este brief — solo para contexto)
- **Fase 2 (Brief #021)**: `/comprar` (catálogo + tarjetas + modal detalle) y `/blog` + `/blog/[slug]` al nuevo estilo.
- **Fase 3 (Brief #022)**: `/valoracion`, `/plusvalia`, `/rentabilidad`, `/contacto`, `/dejar-resena` (formularios y calculadoras) al nuevo estilo.
- **Fase 4 (Brief #023)**: limpieza — eliminar tokens/clases/fuentes viejas (`glass-effect`, `--color-background` dark, Lato/Montserrat) una vez todo migrado, y QA visual final.

## Si algo te bloquea
Reporta en `docs/sync/SYNC_AI.md` y para.
