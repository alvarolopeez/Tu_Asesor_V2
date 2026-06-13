/**
 * POST /api/valuation/[id]/pdf  — Informe profesional de valoración (multi-página)
 *
 * v2 (2026-06-13, brief #016 fix):
 *  - sanitize(): elimina caracteres fuera de WinAnsiEncoding (€ U+20AC no está
 *    en el AFM de Helvetica → crash en widthOfTextAtSize). Causa raíz del error inicial.
 *  - try-catch devuelve el error real en JSON en lugar de crash silencioso.
 *  - Diseño multi-página: portada · ficha+zona · mercado · estrategia · análisis · firmas.
 *  - Extrae secciones estructuradas del markdown (## ANÁLISIS DE ZONA, etc.)
 *    que produce el nuevo prompt v2.
 *
 * ⚠️ NO usar € en ningún drawText. Siempre pasar texto por sanitize().
 *    Referencia: pdf-lib StandardFonts usa WinAnsiEncoding (U+0000-U+00FF);
 *    € es U+20AC, fuera de ese rango, sin entrada en el AFM de Helvetica.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { PDFDocument, rgb, StandardFonts, PDFPage } from 'pdf-lib';
import { BRAND } from '@/lib/brandedDoc';
import type { ValuationInputs, ValuationResult } from '@/lib/valuation';
import { computeSellerNet, SERVICIOS_INTERMEDIACION } from '@/lib/sellerEconomics';

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

// ─── Layout A4 ────────────────────────────────────────────────────────────────
const W = 595.28;
const H = 841.89;
const M = 50;       // margin
const CW = W - M * 2; // content width

const GOLD  = rgb(251 / 255, 191 / 255,  36 / 255);
const NAVY  = rgb( 15 / 255,  23 / 255,  42 / 255);
const SLATE = rgb(100 / 255, 116 / 255, 139 / 255);
const GREEN = rgb( 34 / 255, 197 / 255,  94 / 255);
const BLUE  = rgb( 59 / 255, 130 / 255, 246 / 255);
const AMBER = rgb(245 / 255, 158 / 255,  11 / 255);
const LIGHT = rgb(0.94, 0.97, 1.00);
const LGRN  = rgb(0.93, 1.00, 0.95);
const LAMB  = rgb(1.00, 0.97, 0.90);
const RULE  = rgb(0.91, 0.92, 0.95);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Reemplaza caracteres fuera de WinAnsiEncoding para evitar crashes en pdf-lib.
 * Aplicar a TODO el texto antes de drawText o wrapText.
 */
function sanitize(text: string): string {
  if (!text) return '';
  return text
    .replace(/[‘’ʼ]/g, "'")         // comillas simples tipográficas
    .replace(/[“”«»]/g, '"')   // comillas dobles tipográficas
    .replace(/[–—―]/g, '-')          // guiones largos
    .replace(/…/g, '...')                      // puntos suspensivos
    .replace(/•/g, '·')                        // bullet (· U+00B7 está en WinAnsi)
    .replace(/€/g, 'EUR')                      // Euro (U+20AC, fuera de WinAnsi)
    .replace(/ /g, ' ')                        // espacio no rompible
    .replace(/[^\x00-\xFF]/g, '?');                 // cualquier otro no-Latin1
}

function wrapText(text: string, maxW: number, font: any, size: number): string[] {
  const words = sanitize(text).split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    try {
      if (font.widthOfTextAtSize(test, size) <= maxW) { cur = test; }
      else { if (cur) lines.push(cur); cur = w; }
    } catch { if (cur) lines.push(cur); cur = ''; }
  }
  if (cur) lines.push(cur);
  return lines;
}

function ensurePage(
  doc: PDFDocument, pages: PDFPage[], y: number, needed = 60,
): { page: PDFPage; y: number } {
  if (y - needed < 60) {
    const p = doc.addPage([W, H]);
    pages.push(p);
    return { page: p, y: H - M };
  }
  return { page: pages[pages.length - 1], y };
}

/** Extrae el cuerpo de una sección ## del markdown, probando variantes de grafía */
function extractSection(md: string, ...headers: string[]): string {
  for (const h of headers) {
    const esc = h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = md.match(new RegExp(`##\\s+${esc}[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, 'i'));
    if (match?.[1]) return match[1].trim();
  }
  return '';
}

/** Renderiza markdown como texto plano con headers gold y body NAVY */
function renderMarkdown(
  doc: PDFDocument, pages: PDFPage[], reg: any, bold: any,
  md: string, startY: number,
): number {
  let y = startY;
  const lines = sanitize(md)
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/^[-*]\s+/gm, '- ')
    .split('\n');

  for (const raw of lines) {
    if (!raw.trim()) { y -= 5; continue; }
    if (/^#{1,3}\s+/.test(raw)) {
      const txt = raw.replace(/^#+\s+/, '');
      const r = ensurePage(doc, pages, y, 26);
      y = r.y;
      y -= 2;
      r.page.drawText(txt.toUpperCase(), { x: M, y, size: 8, font: bold, color: GOLD });
      r.page.drawLine({ start: { x: M, y: y - 4 }, end: { x: W - M, y: y - 4 }, thickness: 0.4, color: GOLD });
      y -= 16;
    } else {
      for (const line of wrapText(raw, CW, reg, 8.5)) {
        const r = ensurePage(doc, pages, y, 14);
        y = r.y;
        r.page.drawText(line, { x: M, y, size: 8.5, font: reg, color: NAVY });
        y -= 13;
      }
    }
  }
  return y;
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!SERVICE_ROLE_KEY) return NextResponse.json({ error: 'Config' }, { status: 503 });
  const { id: valuationId } = await params;

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: report } = await db
    .from('valuation_reports')
    .select('markdown,result,grounding_urls,inputs,property_id,created_at')
    .eq('id', valuationId)
    .single();

  if (!report) return NextResponse.json({ error: 'Valoración no encontrada' }, { status: 404 });

  const inputs        = report.inputs as ValuationInputs;
  const result        = report.result as ValuationResult | null;
  const rawMarkdown   = (report.markdown as string | null) || '';
  const groundingUrls = (report.grounding_urls as string[] | null) || [];
  const propertyId    = report.property_id as string | null;
  const createdAt     = new Date(report.created_at as string);

  let propTitle: string | null = null;
  if (propertyId) {
    const { data: prop } = await db.from('properties').select('title').eq('id', propertyId).single();
    propTitle = prop?.title ?? null;
  }

  // ─── Generación del PDF (todo dentro de try-catch) ─────────────────────────

  try {
    const doc   = await PDFDocument.create();
    const bold  = await doc.embedFont(StandardFonts.HelveticaBold);
    const reg   = await doc.embedFont(StandardFonts.Helvetica);
    const pages: PDFPage[] = [];

    const label   = sanitize(propTitle || inputs.direccion || inputs.zona || 'Inmueble sin publicar');
    const dateStr = createdAt.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });

    // Extraer secciones del prompt v2 (## ANÁLISIS DE ZONA, etc.)
    const zonaSection      = extractSection(rawMarkdown, 'ANÁLISIS DE ZONA', 'ANALISIS DE ZONA', 'Análisis de Zona', 'análisis de zona');
    const mercadoSection   = extractSection(rawMarkdown, 'ANÁLISIS DE MERCADO', 'ANALISIS DE MERCADO', 'Análisis de Mercado');
    const factoresSection  = extractSection(rawMarkdown, 'FACTORES DEL INMUEBLE', 'FACTORES', 'Factores del Inmueble');
    const conclusionSection = extractSection(rawMarkdown, 'CONCLUSIÓN', 'CONCLUSION', 'Conclusión', 'RECOMENDACIÓN', 'Recomendación');
    const hasStructured    = !!(zonaSection || mercadoSection || conclusionSection);

    // ── Funciones locales con refs a fonts ─────────────────────────────────────

    const pageHeader = (p: PDFPage, title: string) => {
      p.drawRectangle({ x: 0, y: H - 28, width: W, height: 28, color: NAVY });
      p.drawText(sanitize(`${BRAND.name}  ·  ${title}`), { x: M, y: H - 18, size: 8, font: bold, color: GOLD });
    };

    const sectionTitle = (p: PDFPage, text: string, y: number): number => {
      p.drawText(sanitize(text).toUpperCase(), { x: M, y, size: 8, font: bold, color: GOLD });
      p.drawLine({ start: { x: M, y: y - 4 }, end: { x: W - M, y: y - 4 }, thickness: 0.5, color: GOLD });
      return y - 18;
    };

    const drawRow = (p: PDFPage, labelStr: string, valueStr: string, y: number): number => {
      p.drawText(sanitize(labelStr), { x: M, y, size: 9, font: reg, color: SLATE });
      const vLines = wrapText(valueStr, CW - 165, bold, 9);
      for (let i = 0; i < vLines.length; i++) {
        p.drawText(vLines[i], { x: M + 160, y: y - i * 12, size: 9, font: bold, color: NAVY });
      }
      const rowH = Math.max(1, vLines.length) * 12;
      p.drawLine({ start: { x: M, y: y - rowH + 4 }, end: { x: W - M, y: y - rowH + 4 }, thickness: 0.3, color: RULE });
      return y - rowH - 6;
    };

    // ─── PORTADA ──────────────────────────────────────────────────────────────

    const cover = doc.addPage([W, H]);
    pages.push(cover);

    // Header navy
    cover.drawRectangle({ x: 0, y: H - 90, width: W, height: 90, color: NAVY });
    cover.drawText(sanitize(BRAND.name), { x: M, y: H - 46, size: 24, font: bold, color: GOLD });
    cover.drawText('EXPERTOS EN COMPRAVENTA INMOBILIARIA EN SEVILLA', { x: M, y: H - 66, size: 8, font: reg, color: rgb(1, 1, 1) });
    cover.drawText(sanitize(dateStr), { x: W - M - 120, y: H - 52, size: 9, font: reg, color: rgb(1, 1, 1) });

    // Título
    cover.drawText('INFORME DE VALORACION', { x: M, y: H - 134, size: 20, font: bold, color: NAVY });
    cover.drawText('INMOBILIARIA', { x: M, y: H - 158, size: 20, font: bold, color: NAVY });
    cover.drawRectangle({ x: M, y: H - 171, width: 90, height: 4, color: GOLD });

    // Inmueble
    cover.drawText('INMUEBLE VALORADO', { x: M, y: H - 198, size: 8, font: bold, color: SLATE });
    cover.drawText(label.slice(0, 65), { x: M, y: H - 216, size: 12, font: bold, color: NAVY });
    if (inputs.referencia_catastral) {
      cover.drawText(sanitize(`Ref. catastral: ${inputs.referencia_catastral}`), { x: M, y: H - 234, size: 9, font: reg, color: SLATE });
    }
    const ficha = [
      inputs.m2 ? `${inputs.m2} m2` : null,
      inputs.habitaciones ? `${inputs.habitaciones} hab.` : null,
      inputs.banos ? `${inputs.banos} ban.` : null,
      inputs.estado ? sanitize(inputs.estado) : null,
      inputs.zona ? sanitize(inputs.zona) : null,
    ].filter(Boolean).join('  ·  ');
    if (ficha) cover.drawText(ficha, { x: M, y: H - 252, size: 9, font: reg, color: SLATE });

    // Hero: precio de mercado
    if (result?.rangos?.mercado) {
      const m_ = result.rangos.mercado;
      cover.drawRectangle({ x: M, y: H - 400, width: CW, height: 115, color: LIGHT });
      cover.drawRectangle({ x: M, y: H - 288, width: CW, height: 4, color: BLUE });
      cover.drawText('PRECIO DE SALIDA RECOMENDADO', { x: M + 16, y: H - 310, size: 8, font: bold, color: BLUE });
      cover.drawText(sanitize(`${m_.precio.toLocaleString('es-ES')} EUR`), { x: M + 16, y: H - 344, size: 30, font: bold, color: NAVY });
      cover.drawText(sanitize(`${m_.precio_m2.toLocaleString('es-ES')} EUR/m2  ·  Cierre est.: ${m_.dias_estimados} dias`), {
        x: M + 16, y: H - 370, size: 10, font: reg, color: SLATE,
      });
      if (result.confianza) {
        const cc = result.confianza === 'alta' ? GREEN : result.confianza === 'media' ? AMBER : SLATE;
        cover.drawText(sanitize(`Nivel de confianza: ${result.confianza.toUpperCase()}`), { x: M + 16, y: H - 390, size: 9, font: bold, color: cc });
      }
    }

    // Rangos secundarios (venta_rapida + premium)
    if (result?.rangos?.venta_rapida && result?.rangos?.premium) {
      const vr = result.rangos.venta_rapida;
      const pr = result.rangos.premium;
      const cw2 = (CW - 12) / 2;

      cover.drawRectangle({ x: M, y: H - 490, width: cw2, height: 70, color: LGRN });
      cover.drawRectangle({ x: M, y: H - 423, width: cw2, height: 3, color: GREEN });
      cover.drawText('VENTA RAPIDA', { x: M + 12, y: H - 438, size: 7, font: bold, color: GREEN });
      cover.drawText(sanitize(`${vr.precio.toLocaleString('es-ES')} EUR`), { x: M + 12, y: H - 455, size: 14, font: bold, color: NAVY });
      cover.drawText(sanitize(`${vr.precio_m2.toLocaleString('es-ES')} EUR/m2 · ~${vr.dias_estimados} dias`), { x: M + 12, y: H - 472, size: 8, font: reg, color: SLATE });

      const px = M + cw2 + 12;
      cover.drawRectangle({ x: px, y: H - 490, width: cw2, height: 70, color: LAMB });
      cover.drawRectangle({ x: px, y: H - 423, width: cw2, height: 3, color: AMBER });
      cover.drawText('PREMIUM', { x: px + 12, y: H - 438, size: 7, font: bold, color: AMBER });
      cover.drawText(sanitize(`${pr.precio.toLocaleString('es-ES')} EUR`), { x: px + 12, y: H - 455, size: 14, font: bold, color: NAVY });
      cover.drawText(sanitize(`${pr.precio_m2.toLocaleString('es-ES')} EUR/m2 · ~${pr.dias_estimados} dias`), { x: px + 12, y: H - 472, size: 8, font: reg, color: SLATE });
    }

    // Alcance
    let sy = H - 520;
    cover.drawText('ALCANCE DEL INFORME', { x: M, y: sy, size: 8, font: bold, color: SLATE });
    sy -= 14;
    for (const line of [
      sanitize(`Informe orientativo elaborado por ${BRAND.name} con herramientas de inteligencia artificial`),
      'con acceso a datos de mercado en tiempo real. No sustituye a una tasacion oficial',
      '(Orden ECO/805/2003) ni puede usarse para financiacion hipotecaria.',
    ]) {
      cover.drawText(line, { x: M, y: sy, size: 8, font: reg, color: SLATE });
      sy -= 13;
    }

    // Footer portada
    cover.drawLine({ start: { x: M, y: 130 }, end: { x: W - M, y: 130 }, thickness: 0.5, color: GOLD });
    cover.drawText('ELABORADO POR', { x: M, y: 114, size: 7, font: reg, color: SLATE });
    cover.drawText(sanitize(BRAND.advisor), { x: M, y: 98, size: 12, font: bold, color: NAVY });
    cover.drawText(sanitize(`Tel. ${BRAND.phone}  |  ${BRAND.email}`), { x: M, y: 80, size: 9, font: reg, color: SLATE });
    cover.drawText(sanitize(BRAND.web), { x: M, y: 64, size: 9, font: reg, color: BLUE });

    // ─── P.2: DATOS DEL INMUEBLE + ANÁLISIS DE ZONA ───────────────────────────

    let page = doc.addPage([W, H]);
    pages.push(page);
    let y = H - 55;
    pageHeader(page, 'Datos del inmueble');

    y = sectionTitle(page, 'Ficha del inmueble', y);

    if (inputs.direccion)           y = drawRow(page, 'Direccion', inputs.direccion, y);
    if (inputs.referencia_catastral) y = drawRow(page, 'Ref. catastral', inputs.referencia_catastral, y);
    if (inputs.zona)                y = drawRow(page, 'Zona / Barrio', inputs.zona, y);
    y = drawRow(page, 'Superficie', `${inputs.m2} m2`, y);
    y = drawRow(page, 'Estado', inputs.estado, y);
    if (inputs.tipo)                y = drawRow(page, 'Tipo de inmueble', inputs.tipo, y);
    if (inputs.habitaciones)        y = drawRow(page, 'Habitaciones', String(inputs.habitaciones), y);
    if (inputs.banos)               y = drawRow(page, 'Banos', String(inputs.banos), y);
    if (inputs.planta)              y = drawRow(page, 'Planta', inputs.planta, y);
    if (inputs.ascensor !== undefined) y = drawRow(page, 'Ascensor', inputs.ascensor ? 'Si' : 'No', y);
    if (inputs.ano)                 y = drawRow(page, 'Ano de construccion', String(inputs.ano), y);

    if (inputs.reformas_extras) {
      y -= 8;
      let r = ensurePage(doc, pages, y, 40);
      page = r.page; y = r.y;
      y = sectionTitle(page, 'Reformas y extras declaradas', y);
      for (const ln of wrapText(inputs.reformas_extras, CW, reg, 9)) {
        r = ensurePage(doc, pages, y, 14);
        page = r.page; y = r.y;
        page.drawText(ln, { x: M, y, size: 9, font: reg, color: NAVY });
        y -= 14;
      }
    }

    // Zona analysis
    if (zonaSection) {
      y -= 18;
      let r = ensurePage(doc, pages, y, 60);
      page = r.page; y = r.y;
      if (page !== pages[1]) { pageHeader(page, 'Análisis de zona'); y = H - 55; }
      y = sectionTitle(page, 'Análisis de zona y entorno', y);
      y = renderMarkdown(doc, pages, reg, bold, zonaSection, y);
    }

    // ─── P.3: ANÁLISIS DE MERCADO ─────────────────────────────────────────────

    page = doc.addPage([W, H]);
    pages.push(page);
    y = H - 55;
    pageHeader(page, 'Análisis de mercado');

    y = sectionTitle(page, 'Precios de zona (datos 2025-2026)', y);

    if (result?.precio_m2_zona && result.precio_m2_zona > 0) {
      y = drawRow(page, 'Precio medio zona (EUR/m2)', result.precio_m2_zona.toLocaleString('es-ES'), y);
      if (result.precio_m2_zona_rango) {
        y = drawRow(page, 'Rango zona (EUR/m2)',
          sanitize(`${result.precio_m2_zona_rango.min.toLocaleString('es-ES')} - ${result.precio_m2_zona_rango.max.toLocaleString('es-ES')}`), y);
      }
      const adjPct = result.estado_ajuste_pct !== 0
        ? `${result.estado_ajuste_pct > 0 ? '+' : ''}${(result.estado_ajuste_pct * 100).toFixed(0)}%`
        : 'Sin ajuste';
      y = drawRow(page, sanitize(`Ajuste estado (${inputs.estado})`), adjPct, y);
    }

    // Comparables
    if (result?.comparables && result.comparables.length > 0) {
      y -= 14;
      let r = ensurePage(doc, pages, y, 50);
      page = r.page; y = r.y;
      y = sectionTitle(page, 'Comparables consultados', y);

      const cX = [M, M + 205, M + 285];
      page.drawText('Fuente', { x: cX[0], y, size: 8, font: bold, color: SLATE });
      page.drawText('EUR/m2', { x: cX[1], y, size: 8, font: bold, color: SLATE });
      page.drawText('URL', { x: cX[2], y, size: 8, font: bold, color: SLATE });
      y -= 14;

      for (const c of result.comparables.slice(0, 10)) {
        r = ensurePage(doc, pages, y, 24);
        page = r.page; y = r.y;
        page.drawText(sanitize((c.fuente || '').slice(0, 34)), { x: cX[0], y, size: 8, font: reg, color: NAVY });
        page.drawText(c.precio_m2 > 0 ? c.precio_m2.toLocaleString('es-ES') : '-', { x: cX[1], y, size: 8, font: bold, color: NAVY });
        if (c.url) {
          page.drawText(sanitize(c.url.slice(0, 50)), { x: cX[2], y, size: 6.5, font: reg, color: rgb(0, 0.1, 0.7) });
        }
        page.drawLine({ start: { x: M, y: y - 5 }, end: { x: W - M, y: y - 5 }, thickness: 0.3, color: RULE });
        y -= 18;
      }
    }

    // Market narrative
    if (mercadoSection) {
      y -= 14;
      let r = ensurePage(doc, pages, y, 50);
      page = r.page; y = r.y;
      y = sectionTitle(page, 'Contexto y evolución de mercado', y);
      y = renderMarkdown(doc, pages, reg, bold, mercadoSection, y);
    }

    // Grounding URLs
    if (groundingUrls.length > 0) {
      y -= 10;
      let r = ensurePage(doc, pages, y, 40);
      page = r.page; y = r.y;
      page.drawText('Fuentes consultadas por IA (grounding):', { x: M, y, size: 8, font: bold, color: SLATE });
      y -= 13;
      for (const url of groundingUrls.slice(0, 5)) {
        r = ensurePage(doc, pages, y, 13);
        page = r.page; y = r.y;
        page.drawText(sanitize(`· ${url.slice(0, 82)}`), { x: M + 8, y, size: 6.5, font: reg, color: rgb(0, 0.1, 0.7) });
        y -= 12;
      }
    }

    // ─── P.4: ESTRATEGIA DE PRECIO ────────────────────────────────────────────

    page = doc.addPage([W, H]);
    pages.push(page);
    y = H - 55;
    pageHeader(page, 'Estrategia de precio');

    y = sectionTitle(page, 'Estrategia de precio de salida', y);

    if (result?.rangos) {
      const cardH = 112;
      const cardW = (CW - 16) / 3;
      const rdefs = [
        { key: 'venta_rapida' as const, label: 'VENTA RAPIDA',      color: GREEN, bg: LGRN  },
        { key: 'mercado'      as const, label: 'PRECIO DE MERCADO', color: BLUE,  bg: LIGHT },
        { key: 'premium'      as const, label: 'PREMIUM',           color: AMBER, bg: LAMB  },
      ];
      for (let i = 0; i < rdefs.length; i++) {
        const { key, label, color, bg } = rdefs[i];
        const rng = result.rangos[key];
        if (!rng) continue;
        const cx = M + i * (cardW + 8);
        page.drawRectangle({ x: cx, y: y - cardH, width: cardW, height: cardH, color: bg });
        page.drawRectangle({ x: cx, y, width: cardW, height: 3, color });
        page.drawText(label, { x: cx + 12, y: y - 16, size: 7, font: bold, color });
        page.drawText(sanitize(`${rng.precio.toLocaleString('es-ES')} EUR`), { x: cx + 12, y: y - 38, size: 15, font: bold, color: NAVY });
        page.drawText(sanitize(`${rng.precio_m2.toLocaleString('es-ES')} EUR/m2`), { x: cx + 12, y: y - 56, size: 9, font: reg, color: SLATE });
        page.drawText(sanitize(`~${rng.dias_estimados} dias de venta`), { x: cx + 12, y: y - 70, size: 8, font: reg, color: SLATE });
        if (rng.justificacion) {
          const jLines = wrapText(rng.justificacion, cardW - 24, reg, 7.5);
          for (let j = 0; j < Math.min(jLines.length, 2); j++) {
            page.drawText(jLines[j], { x: cx + 12, y: y - 84 - j * 11, size: 7.5, font: reg, color: NAVY });
          }
        }
      }
      y -= cardH + 20;

      // Factores
      const factoresList = result.factores?.length ? result.factores : null;
      if (factoresList) {
        y -= 8;
        let r = ensurePage(doc, pages, y, 50);
        page = r.page; y = r.y;
        y = sectionTitle(page, 'Factores que inciden en el precio', y);
        for (const f of factoresList) {
          for (const ln of wrapText(`· ${f}`, CW, reg, 8.5)) {
            r = ensurePage(doc, pages, y, 14);
            page = r.page; y = r.y;
            page.drawText(ln, { x: M, y, size: 8.5, font: reg, color: NAVY });
            y -= 13;
          }
        }
      } else if (factoresSection) {
        y -= 8;
        let r = ensurePage(doc, pages, y, 50);
        page = r.page; y = r.y;
        y = sectionTitle(page, 'Factores del inmueble', y);
        y = renderMarkdown(doc, pages, reg, bold, factoresSection, y);
      }
    }

    // ─── P.5: ANÁLISIS COMPLETO + CONCLUSIÓN ─────────────────────────────────

    const analysisContent = conclusionSection || (!hasStructured && rawMarkdown ? rawMarkdown : '');
    if (analysisContent || result?.supuestos?.length || result?.advertencias?.length) {
      page = doc.addPage([W, H]);
      pages.push(page);
      y = H - 55;
      pageHeader(page, 'Análisis y conclusiones');

      if (conclusionSection) {
        y = sectionTitle(page, 'Conclusión y recomendación', y);
        y = renderMarkdown(doc, pages, reg, bold, conclusionSection, y);
      } else if (!hasStructured && rawMarkdown) {
        y = sectionTitle(page, 'Análisis generado por IA', y);
        y = renderMarkdown(doc, pages, reg, bold, rawMarkdown, y);
      }

      if (result?.supuestos?.length) {
        y -= 10;
        let r = ensurePage(doc, pages, y, 40);
        page = r.page; y = r.y;
        y = sectionTitle(page, 'Supuestos asumidos', y);
        for (const s of result.supuestos) {
          r = ensurePage(doc, pages, y, 13);
          page = r.page; y = r.y;
          page.drawText(sanitize(`· ${s}`).slice(0, 90), { x: M, y, size: 8, font: reg, color: SLATE });
          y -= 13;
        }
      }

      if (result?.advertencias?.length) {
        y -= 6;
        let r = ensurePage(doc, pages, y, 40);
        page = r.page; y = r.y;
        y = sectionTitle(page, 'Advertencias', y);
        for (const a of result.advertencias) {
          r = ensurePage(doc, pages, y, 13);
          page = r.page; y = r.y;
          page.drawText(sanitize(`· ${a}`).slice(0, 90), { x: M, y, size: 8, font: reg, color: AMBER });
          y -= 13;
        }
      }
    }

    // ─── SERVICIOS DE INTERMEDIACIÓN + LIQUIDACIÓN DEL VENDEDOR ─────────────────

    {
      page = doc.addPage([W, H]);
      pages.push(page);
      y = H - 55;
      pageHeader(page, 'Servicios y liquidación');

      // Servicios de intermediación
      y = sectionTitle(page, 'Mis servicios de intermediación', y);
      for (const ln of wrapText(SERVICIOS_INTERMEDIACION.honorarios, CW, bold, 9.5)) {
        page.drawText(ln, { x: M, y, size: 9.5, font: bold, color: NAVY });
        y -= 14;
      }
      y -= 4;
      page.drawText('Incluido en mis honorarios, sin coste adicional para el vendedor:', { x: M, y, size: 9, font: bold, color: SLATE });
      y -= 15;
      for (const s of SERVICIOS_INTERMEDIACION.incluidos) {
        for (const ln of wrapText(`-  ${s}`, CW - 10, reg, 9)) {
          const rr = ensurePage(doc, pages, y, 14); page = rr.page; y = rr.y;
          page.drawText(ln, { x: M + 6, y, size: 9, font: reg, color: NAVY });
          y -= 14;
        }
      }

      // Liquidación estimada para el vendedor
      const precioVenta = result?.rangos?.mercado?.precio ?? 0;
      if (precioVenta > 0) {
        const net = computeSellerNet({
          precioVenta,
          precioCompra: inputs.precio_compra,
          anioCompra: inputs.anio_compra,
          valorCatastralSuelo: inputs.valor_catastral_suelo,
          comisionPct: inputs.comision_pct,
        });

        y -= 16;
        let rr = ensurePage(doc, pages, y, 60); page = rr.page; y = rr.y;
        y = sectionTitle(page, sanitize(`Estimación de liquidación para el vendedor (precio objetivo ${precioVenta.toLocaleString('es-ES')} EUR)`), y);

        const drawMoney = (label: string, amount: number, kind: 'resta' | 'neto' | 'sub', nota?: string) => {
          const isNeto = kind === 'neto';
          const needed = isNeto ? 30 : (nota ? 26 : 16);
          rr = ensurePage(doc, pages, y, needed); page = rr.page; y = rr.y;
          const fSize = isNeto ? 11 : (kind === 'sub' ? 10 : 9);
          const fnt = isNeto || kind === 'sub' ? bold : reg;
          const col = isNeto ? NAVY : (kind === 'sub' ? NAVY : SLATE);
          if (isNeto) {
            page.drawRectangle({ x: M, y: y - 6, width: CW, height: 22, color: LIGHT });
            page.drawRectangle({ x: M, y: y - 6, width: 3, height: 22, color: BLUE });
          }
          page.drawText(sanitize(label), { x: M + (isNeto ? 10 : 0), y, size: fSize, font: fnt, color: col });
          const amtStr = sanitize(`${amount < 0 ? '- ' : ''}${Math.abs(Math.round(amount)).toLocaleString('es-ES')} EUR`);
          const w = (isNeto || kind === 'sub' ? bold : reg).widthOfTextAtSize(amtStr, fSize);
          page.drawText(amtStr, { x: W - M - w - (isNeto ? 10 : 0), y, size: fSize, font: isNeto || kind === 'sub' ? bold : reg, color: isNeto ? NAVY : (amount < 0 ? rgb(0.7, 0.2, 0.2) : NAVY) });
          y -= isNeto ? 24 : 14;
          if (nota) {
            for (const ln of wrapText(nota, CW - 12, reg, 7.5)) {
              rr = ensurePage(doc, pages, y, 11); page = rr.page; y = rr.y;
              page.drawText(ln, { x: M + 8, y, size: 7.5, font: reg, color: SLATE });
              y -= 10;
            }
          }
          page.drawLine({ start: { x: M, y: y + 2 }, end: { x: W - M, y: y + 2 }, thickness: 0.3, color: RULE });
          y -= 4;
        };

        for (const l of net.lineas) drawMoney(l.label, l.amount, l.kind, l.nota);

        if (!net.calculable) {
          y -= 6;
          rr = ensurePage(doc, pages, y, 28); page = rr.page; y = rr.y;
          for (const ln of wrapText('Para el desglose completo (IRPF y plusvalía), indica el precio y el año de compra al generar la valoración.', CW, reg, 8)) {
            page.drawText(ln, { x: M, y, size: 8, font: reg, color: AMBER });
            y -= 12;
          }
        }

        // Disclaimers fiscales
        y -= 8;
        rr = ensurePage(doc, pages, y, 40); page = rr.page; y = rr.y;
        page.drawText('Notas fiscales:', { x: M, y, size: 8, font: bold, color: SLATE });
        y -= 12;
        for (const d of net.disclaimers) {
          for (const ln of wrapText(`· ${d}`, CW - 8, reg, 7)) {
            rr = ensurePage(doc, pages, y, 11); page = rr.page; y = rr.y;
            page.drawText(ln, { x: M + 6, y, size: 7, font: reg, color: SLATE });
            y -= 10;
          }
        }
      }
    }

    // ─── FIRMAS ───────────────────────────────────────────────────────────────

    {
      const r = ensurePage(doc, pages, y, 220);
      page = r.page; y = r.y;
      y -= 30;
      y = sectionTitle(page, 'Aviso legal y limitaciones', y);
      const disc = [
        sanitize(`Este documento es un informe orientativo elaborado por ${BRAND.name}.`),
        'Las estimaciones se basan en comparables de mercado y portales inmobiliarios.',
        'No sustituye a una tasacion oficial homologada (Orden ECO/805/2003).',
        sanitize(`${BRAND.name} no se responsabiliza de decisiones basadas exclusivamente en este informe.`),
      ];
      for (const ln of disc) {
        page.drawText(ln, { x: M, y, size: 8, font: reg, color: SLATE });
        y -= 13;
      }
      y -= 40;
      page.drawLine({ start: { x: M, y }, end: { x: M + 175, y }, thickness: 0.5, color: NAVY });
      page.drawLine({ start: { x: W - M - 175, y }, end: { x: W - M, y }, thickness: 0.5, color: NAVY });
      page.drawText('Firma del Asesor Inmobiliario', { x: M, y: y - 14, size: 8, font: reg, color: SLATE });
      page.drawText(sanitize(BRAND.advisor), { x: M, y: y - 28, size: 10, font: bold, color: NAVY });
      page.drawText('Conformidad del Propietario / Consultante', { x: W - M - 175, y: y - 14, size: 8, font: reg, color: SLATE });
    }

    // ─── Footer en todas las páginas ──────────────────────────────────────────

    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      p.drawLine({ start: { x: M, y: 32 }, end: { x: W - M, y: 32 }, thickness: 0.5, color: GOLD });
      p.drawText(sanitize(`${BRAND.name}  ·  ${BRAND.web}  ·  Documento confidencial`), {
        x: M, y: 18, size: 7, font: reg, color: SLATE,
      });
      p.drawText(`${i + 1} / ${pages.length}`, { x: W - M - 22, y: 18, size: 7, font: reg, color: SLATE });
    }

    const pdfBytes = await doc.save();
    const safeName = sanitize(label).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="valoracion_${safeName}.pdf"`,
      },
    });

  } catch (err) {
    console.error('[valuation/pdf] Error generating PDF:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
