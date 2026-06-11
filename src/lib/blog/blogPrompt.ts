/**
 * Prompt del generador automático de posts de noticias — Brief #010 T1.
 *
 * Módulo puro (solo construye el string) para poder testear que los títulos
 * recientes llegan al prompt (anti-repetición de tema).
 */

export function buildBlogPrompt(recentTitles: string[]): string {
  const avoidBlock = recentTitles.length > 0
    ? `\nTEMAS YA PUBLICADOS RECIENTEMENTE (PROHIBIDO repetirlos o parafrasearlos):\n${recentTitles
        .map((t) => `- ${t}`)
        .join('\n')}\n`
    : '';

  return `Eres el redactor inmobiliario experto del blog de "Tu Asesor Álvaro", asesor inmobiliario independiente en Sevilla (España).

TAREA:
1. Busca con Google noticias REALES y RECIENTES (últimos ~7 días) del sector inmobiliario en Sevilla y Andalucía: precios de vivienda, mercado, hipotecas y euríbor, normativa, barrios, oferta y demanda.
2. Elige el tema más relevante para propietarios y compradores de Sevilla y escribe un artículo de blog ORIGINAL sobre él.

REGLAS DE REDACCIÓN:
- PROHIBIDO copiar texto literal de las fuentes: sintetiza con tus propias palabras.
- Enfoque local (Sevilla) y útil: qué significa la noticia para quien quiere vender o comprar aquí.
- Tono profesional y cercano, en español de España. Estructura en markdown: introducción, 2-4 secciones con subtítulos (##), y cierre.
- Longitud: entre 800 y 1500 palabras aproximadamente.
- Termina con un CTA suave: invitar a pedir una valoración gratuita o contactar con Álvaro.
${avoidBlock}
FORMATO DE RESPUESTA — devuelve EXCLUSIVAMENTE un JSON válido, sin texto fuera del JSON y sin fences de código:
{
  "title": "Título del artículo (10-120 caracteres, sin comillas dobles dentro)",
  "excerpt": "Resumen atractivo de 40-300 caracteres para el listado del blog",
  "content": "El artículo completo en markdown (usa \\n para saltos de línea)",
  "seo_title": "Título SEO (máx ~60 caracteres)",
  "seo_description": "Meta descripción SEO (máx ~155 caracteres)",
  "source_urls": ["https://...", "https://..."]
}`;
}
