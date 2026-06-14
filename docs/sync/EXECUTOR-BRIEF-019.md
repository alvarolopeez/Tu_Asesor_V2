# Executor Brief #019 — Mockup visual del rediseño de la home (throwaway, NO producción)

**Fecha**: 2026-06-14
**Tipo**: boceto de diseño desechable para DECIDIR una dirección visual. NO es código de producción.
**Modelo recomendado para ejecutarlo**: Sonnet 4.6 (diseño visual de calidad sin coste de Opus).

## Objetivo

Crear **un mockup HTML autónomo** de la página de inicio (home) de la web inmobiliaria "Tu Asesor Álvaro", rediseñada en un estilo **minimalista moderno**, para que Álvaro vea la dirección visual antes de comprometer ningún cambio en producción.

El entregable es **un único archivo HTML** que Álvaro pueda abrir en el navegador con doble clic. Throwaway: se evalúa, se itera, y si gusta se traducirá luego a los componentes reales en otro brief.

## Contexto del proyecto (el agente arranca en frío — léelo)

- **Negocio**: asesor inmobiliario **independiente, en solitario**, en Sevilla (España). Modelo "lean": **vende por solo un 2% de comisión** (vs 3-5% de agencias tradicionales), 0% al comprador. Propuesta = ahorro + cercanía + honestidad.
- **Marca**: se MANTIENE el nombre "Tu Asesor Álvaro" y el dominio `tuasesoralvaro.com` (decisión tomada — es marca personal a propósito). NO inventar otro nombre.
- **Tono**: cercano, profesional, honesto. NO lujo frío ni ultra-premium. El referente de marca es una boutique **cercana y moderna**, no Sotheby's.
- La web real es Next.js + Tailwind, pero **este mockup es HTML+CSS standalone** (no tocar el proyecto).

## Dirección de diseño acordada (el corazón del brief)

El estilo ACTUAL de la web es dark (fondo navy `#0F172A` en todo) con mucho **glassmorphism** (blur, gradientes, tarjetas translúcidas). Se ve recargado y algo anticuado (~2021).

El rediseño debe ir al **minimalismo moderno**, inspirado en **the barrio (thebarrio.house)** — boutique cercana, no lujo distante:

1. **Fondo claro**: blanco / hueso (`#FAFAF8` o similar) como base, NO dark. El navy y el dorado pasan a ser **acentos puntuales**, no el fondo de todo.
2. **Fotografía protagonista**: imágenes grandes, a sangre, de inmuebles y de Sevilla. Menos tarjetas con bordes; más foto.
3. **Mucho espacio en blanco**: que respire. Secciones amplias.
4. **Tipografía**: sans-serif moderna y limpia, titulares grandes y con peso (usa fuentes de Google Fonts vía `<link>`, p. ej. "Inter", "Manrope", "Plus Jakarta Sans" o similar). Jerarquía clara.
5. **CERO glassmorphism**: nada de blur decorativo ni gradientes recargados. Sombras sutiles, bordes finos, planos limpios.
6. **Microinteracciones sutiles**: hover suave en tarjetas/botones, nada estridente.

## Paleta (mantener la identidad, cambiar el uso)

- **Base/fondo**: blanco `#FFFFFF` y hueso `#FAFAF8`.
- **Texto**: casi-negro `#1A1A1A` / gris `#475569`.
- **Acento principal (navy de marca)**: `#0F172A` / `#1E293B` — para titulares, footer, botones secundarios.
- **Acento dorado de marca**: `#FBBF24` — uso con cuentagotas (CTA principal, detalles, subrayados). NO inundar de dorado.

La gracia es demostrar que con **fondo claro + navy y dorado bien dosificados** se ve premium y moderno, no como el dark recargado actual.

## Secciones de la home a incluir (con contenido REAL, no lorem ipsum)

1. **Header / nav**: logo "Tu Asesor Álvaro" (texto estilizado vale), links (Comprar, Vender, Valoración, Blog, Contacto), botón CTA "Valora tu casa gratis".
2. **Hero**: titular potente sobre el 2%. Ej: *"Vende tu casa en Sevilla por solo un 2%"* + subtítulo (ahorra miles, asesoramiento cercano de principio a fin) + 2 CTAs ("Valoración gratuita" / "Ver inmuebles") + una foto/imagen grande de fondo o lateral.
3. **Franja de propuesta de valor / cómo funciona**: 3-4 puntos (2% de comisión · 0% al comprador · valoración con IA · acompañamiento personal). Iconos simples y limpios.
4. **Inmuebles destacados**: grid de 3 tarjetas de inmueble **rediseñadas** (foto grande arriba, precio, título, zona, m²/hab/baños, sin blur). Es clave ver la tarjeta nueva vs la actual.
5. **Sección "Valoración IA gratuita"**: bloque que invite a tasar la vivienda (la web ya tiene esta función). CTA claro.
6. **Prueba social / reseñas**: 2-3 testimonios cortos (placeholder realista).
7. **Teaser del blog**: 3 artículos recientes (la web tiene blog con portadas). Tarjetas limpias con imagen.
8. **Footer**: navy, datos de contacto, WhatsApp, enlaces legales, "Tu Asesor Álvaro · Sevilla".

## Detalles técnicos del entregable

- **Un solo archivo**: `docs/mockups/home-rediseno-v1.html` (crea la carpeta `docs/mockups/` si no existe). CSS dentro de `<style>` o Tailwind por CDN (`<script src="https://cdn.tailwindcss.com">`) — lo que sea más rápido y limpio.
- **Responsive**: que se vea bien en móvil y escritorio (el tráfico inmobiliario es muy móvil).
- **Imágenes**: usa placeholders reales de inmuebles/ciudad vía Unsplash source o `picsum.photos` (p. ej. fotos de arquitectura/Sevilla/interiores). Que parezca real.
- **Fuentes**: Google Fonts vía `<link>`.
- **Opcional (suma puntos)**: una **segunda variante** `home-rediseno-v2.html` con una alternativa (p. ej. una versión que conserve un hero oscuro navy pero el resto claro, para comparar). Solo si da tiempo; la v1 (clara minimalista) es la prioridad.

## Qué NO hacer

- NO tocar nada en `src/` ni en el proyecto real. Es un mockup aislado en `docs/mockups/`.
- NO instalar dependencias npm (usa CDNs).
- NO cambiar el nombre de la marca ni el dominio.
- NO usar estética de ultra-lujo (Sotheby's/John Taylor): el referente es *the barrio* (cercano + moderno).
- NO rellenar con lorem ipsum: usa textos reales del negocio (2%, Sevilla, valoración IA, etc.).
- NO meter glassmorphism/blur (es justo lo que queremos dejar atrás).

## Entrega

Cuando termines, haz commit del/los archivo(s) HTML en `docs/mockups/` y push. Indica la ruta para que Álvaro lo abra en el navegador. Un par de frases resumiendo las decisiones de diseño que tomaste y en qué se diferencia del estilo actual.

No hace falta build ni tests (es HTML estático aislado). No toca BD, API ni automatización.
