/**
 * POST /api/properties/[id]/dossier-pdf
 *
 * Genera el dossier de rebaja en PDF real (pdf-lib, puro JS, serverless-safe).
 * Lee el último análisis guardado en rebaja_reports para ese property_id
 * (single source of truth — la cifra del panel y la del PDF siempre coinciden).
 *
 * Contenido del dossier:
 *   Portada → Ficha del inmueble → Tabla de comparables → Veredicto IA (cifra hero)
 *   → Narrativa IA completa (paginada) → Tabla de feedback de compradores → Firmas
 *
 * ⚠️ Se usa pdf-lib (ya instalado y probado serverless en documenso.ts)
 *    en lugar de @react-pdf/renderer para no añadir dependencias pesadas nuevas.
 *
 * @created 2026-06-13 brief #015
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { PDFDocument, rgb, StandardFonts, PDFPage } from 'pdf-lib';
import { BRAND } from '@/lib/brandedDoc';
import type { PriceAnalysisContext, PriceVerdicto } from '@/lib/priceAnalysis';
import { OPTIMO_CIERRE_DIAS } from '@/components/admin/sections/dashboard/operaciones/operacionesUtils';

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

// ─── Helpers de layout ───────────────────────────────────────────────────────

const W = 595.28; // A4 pts ancho
const H = 841.89; // A4 pts alto
const MARGIN = 50;
const CONTENT_W = W - MARGIN * 2;
const GOLD = rgb(251 / 255, 191 / 255, 36 / 255);
const NAVY = rgb(15 / 255, 23 / 255, 42 / 255);
const SLATE = rgb(100 / 255, 116 / 255, 139 / 255);
const RED_WARN = rgb(220 / 255, 38 / 255, 38 / 255);
const GREEN_OK = rgb(34 / 255, 197 / 255, 94 / 255);

function wrapText(text: string, maxWidth: number, font: any, size: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function ensurePage(
  doc: PDFDocument,
  pages: PDFPage[],
  y: number,
  needed = 80,
): { page: PDFPage; y: number } {
  if (y - needed < 50) {
    const page = doc.addPage([W, H]);
    pages.push(page);
    return { page, y: H - MARGIN };
  }
  return { page: pages[pages.length - 1], y };
}

// ─── POST handler ────────────────────────────────────────────────────────────

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!SERVICE_ROLE_KEY) return NextResponse.json({ error: 'Config' }, { status: 503 });
  const { id: propertyId } = await params;

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // 1. Lee el análisis guardado
  const { data: report } = await db
    .from('rebaja_reports')
    .select('markdown,veredicto,context,grounding_urls')
    .eq('property_id', propertyId)
    .single();

  if (!report) {
    return NextResponse.json({ error: 'Análisis no encontrado — genera primero el análisis de rebaja' }, { status: 404 });
  }

  const ctx = report.context as PriceAnalysisContext | null;
  const veredicto = report.veredicto as PriceVerdicto | null;
  const markdown = report.markdown as string | null;
  const groundingUrls = (report.grounding_urls as string[] | null) || [];

  // 2. Lee la propiedad para fotos
  const { data: prop } = await db
    .from('properties')
    .select('title,description,images')
    .eq('id', propertyId)
    .single();

  const doc = await PDFDocument.create();
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await doc.embedFont(StandardFonts.Helvetica);
  const pages: PDFPage[] = [];

  // ─── Portada ────────────────────────────────────────────────────────────

  const cover = doc.addPage([W, H]);
  pages.push(cover);

  // Franja navy superior
  cover.drawRectangle({ x: 0, y: H - 80, width: W, height: 80, color: NAVY });
  cover.drawText(BRAND.name, { x: MARGIN, y: H - 48, size: 18, font: boldFont, color: GOLD });
  cover.drawText(BRAND.tagline.toUpperCase(), { x: MARGIN, y: H - 66, size: 8, font: regularFont, color: rgb(1, 1, 1) });

  const dateStr = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
  cover.drawText(dateStr, { x: W - MARGIN - 100, y: H - 48, size: 9, font: regularFont, color: rgb(1, 1, 1) });

  // Título del dossier
  cover.drawRectangle({ x: MARGIN, y: H - 180, width: CONTENT_W, height: 4, color: GOLD });
  cover.drawText('INFORME DE ANÁLISIS DE REBAJA', { x: MARGIN, y: H - 140, size: 14, font: boldFont, color: NAVY });
  const propTitle = ctx?.property.title || prop?.title || 'Inmueble';
  cover.drawText(propTitle.slice(0, 60), { x: MARGIN, y: H - 162, size: 11, font: regularFont, color: SLATE });

  // Cifra hero si hay veredicto
  if (veredicto && veredicto.veredicto === 'caro') {
    cover.drawRectangle({ x: MARGIN, y: H - 340, width: CONTENT_W, height: 100, color: rgb(254 / 255, 242 / 255, 242 / 255) });
    cover.drawRectangle({ x: MARGIN, y: H - 244, width: CONTENT_W, height: 4, color: RED_WARN });
    cover.drawText('VEREDICTO IA', { x: MARGIN + 15, y: H - 265, size: 8, font: boldFont, color: RED_WARN });
    cover.drawText(`${veredicto.sobreprecio_pct.toFixed(1)}% por encima de mercado`, { x: MARGIN + 15, y: H - 285, size: 16, font: boldFont, color: RED_WARN });
    cover.drawText(`Precio recomendado: ${veredicto.precio_recomendado.toLocaleString()} € (−${veredicto.rebaja_eur.toLocaleString()} €)`, {
      x: MARGIN + 15, y: H - 310, size: 11, font: regularFont, color: NAVY,
    });
  } else if (veredicto && veredicto.veredicto === 'correcto') {
    cover.drawRectangle({ x: MARGIN, y: H - 340, width: CONTENT_W, height: 100, color: rgb(240 / 255, 253 / 255, 244 / 255) });
    cover.drawRectangle({ x: MARGIN, y: H - 244, width: CONTENT_W, height: 4, color: GREEN_OK });
    cover.drawText('VEREDICTO IA', { x: MARGIN + 15, y: H - 265, size: 8, font: boldFont, color: GREEN_OK });
    cover.drawText('Precio correcto. No se recomienda rebaja.', { x: MARGIN + 15, y: H - 290, size: 14, font: boldFont, color: GREEN_OK });
  }

  // Asesor info
  cover.drawText(`Asesor: ${BRAND.advisor}`, { x: MARGIN, y: 120, size: 9, font: regularFont, color: SLATE });
  cover.drawText(`Tel.: ${BRAND.phone}  ·  Email: ${BRAND.email}`, { x: MARGIN, y: 104, size: 9, font: regularFont, color: SLATE });
  cover.drawText(BRAND.web, { x: MARGIN, y: 88, size: 9, font: regularFont, color: SLATE });
  cover.drawLine({ start: { x: MARGIN, y: 80 }, end: { x: W - MARGIN, y: 80 }, thickness: 0.5, color: GOLD });
  cover.drawText('Documento confidencial', { x: MARGIN, y: 64, size: 8, font: regularFont, color: SLATE });

  // ─── Página 2: Ficha + Comparables ──────────────────────────────────────

  let page = doc.addPage([W, H]);
  pages.push(page);
  let y = H - MARGIN;

  const drawHeader = (p: PDFPage, title: string) => {
    p.drawRectangle({ x: 0, y: H - 30, width: W, height: 30, color: NAVY });
    p.drawText(BRAND.name + ' · ' + title, { x: MARGIN, y: H - 20, size: 9, font: regularFont, color: GOLD });
  };
  drawHeader(page, 'Ficha del inmueble');

  const drawSectionTitle = (p: PDFPage, text: string, yPos: number): number => {
    p.drawText(text.toUpperCase(), { x: MARGIN, y: yPos, size: 8, font: boldFont, color: GOLD });
    p.drawLine({ start: { x: MARGIN, y: yPos - 4 }, end: { x: W - MARGIN, y: yPos - 4 }, thickness: 0.5, color: GOLD });
    return yPos - 18;
  };

  const drawRow = (p: PDFPage, label: string, value: string, yPos: number): number => {
    p.drawText(label, { x: MARGIN, y: yPos, size: 9, font: regularFont, color: SLATE });
    p.drawText(value, { x: MARGIN + 160, y: yPos, size: 9, font: boldFont, color: NAVY });
    p.drawLine({ start: { x: MARGIN, y: yPos - 4 }, end: { x: W - MARGIN, y: yPos - 4 }, thickness: 0.3, color: rgb(0.92, 0.93, 0.96) });
    return yPos - 18;
  };

  y -= 20;
  y = drawSectionTitle(page, 'Datos del inmueble', y);

  if (ctx) {
    y = drawRow(page, 'Precio publicado', `${ctx.property.price.toLocaleString()} €`, y);
    if (ctx.property.sqm) y = drawRow(page, 'Superficie', `${ctx.property.sqm} m²`, y);
    if (ctx.property.price_per_sqm) y = drawRow(page, '€/m²', `${ctx.property.price_per_sqm.toLocaleString()} €/m²`, y);
    if (ctx.property.rooms) y = drawRow(page, 'Habitaciones', String(ctx.property.rooms), y);
    if (ctx.property.baths) y = drawRow(page, 'Baños', String(ctx.property.baths), y);
    const zonaLabel = ctx.property.zone || ctx.property.address || 'Sin especificar';
    y = drawRow(page, 'Zona', zonaLabel, y);
    if (ctx.property.days_on_market !== null) {
      y = drawRow(page, 'Días en mercado', `${ctx.property.days_on_market} (óptimo: ${OPTIMO_CIERRE_DIAS})`, y);
    }
    if (ctx.agent_valuation) {
      y = drawRow(page, 'Valoración del asesor', `${ctx.agent_valuation.toLocaleString()} €`, y);
    }
    y -= 12;
    y = drawSectionTitle(page, 'Señales de mercado', y);
    y = drawRow(page, 'Visitas físicas completadas', String(ctx.appointments.completed), y);
    y = drawRow(page, 'Visitas web', String(ctx.web_visits), y);
    y = drawRow(page, 'Impactos de difusión WhatsApp', String(ctx.diffusion_impacts), y);
  }

  // ─── Gráfico: días en mercado vs óptimo ──────────────────────────────────

  if (ctx?.property.days_on_market !== null && ctx?.property.days_on_market !== undefined) {
    y -= 20;
    ({ page, y } = ensurePage(doc, pages, y, 80));
    y = drawSectionTitle(page, 'Días en mercado vs objetivo 26 días', y);

    const barMaxW = CONTENT_W * 0.5;
    const optimo = OPTIMO_CIERRE_DIAS;
    const actual = ctx.property.days_on_market;
    const maxVal = Math.max(actual, optimo, 1);
    const actualW = Math.round((actual / maxVal) * barMaxW);
    const optimoW = Math.round((optimo / maxVal) * barMaxW);
    const isOverdue = actual > optimo;

    page.drawText('Días actuales', { x: MARGIN, y: y - 14, size: 8, font: regularFont, color: SLATE });
    page.drawRectangle({ x: MARGIN + 100, y: y - 20, width: actualW, height: 12, color: isOverdue ? RED_WARN : GREEN_OK });
    page.drawText(`${actual}d`, { x: MARGIN + 100 + actualW + 4, y: y - 16, size: 8, font: boldFont, color: isOverdue ? RED_WARN : GREEN_OK });

    page.drawText('Objetivo (26d)', { x: MARGIN, y: y - 38, size: 8, font: regularFont, color: SLATE });
    page.drawRectangle({ x: MARGIN + 100, y: y - 44, width: optimoW, height: 12, color: GOLD });
    page.drawText(`${optimo}d`, { x: MARGIN + 100 + optimoW + 4, y: y - 40, size: 8, font: boldFont, color: rgb(0.4, 0.3, 0) });

    y -= 62;
  }

  // ─── Tabla de comparables ─────────────────────────────────────────────────

  const allComparables = [
    ...(veredicto?.comparables || []).map((c) => ({ ...c, tipo: 'externo' })),
    ...((ctx?.internal_comparables || []).slice(0, 5).map((c) => ({
      fuente: 'Plataforma interna',
      precio_m2: c.price_per_sqm || 0,
      url: undefined,
      tipo: 'interno',
    }))),
  ];

  if (allComparables.length > 0) {
    y -= 20;
    ({ page, y } = ensurePage(doc, pages, y, 100));
    drawHeader(page, 'Comparables de mercado');
    y = drawSectionTitle(page, 'Comparables y fuentes', y);

    const colX = [MARGIN, MARGIN + 200, MARGIN + 310, MARGIN + 400];
    page.drawText('Fuente', { x: colX[0], y, size: 8, font: boldFont, color: NAVY });
    page.drawText('€/m²', { x: colX[1], y, size: 8, font: boldFont, color: NAVY });
    page.drawText('Tipo', { x: colX[2], y, size: 8, font: boldFont, color: NAVY });
    y -= 14;

    for (const comp of allComparables.slice(0, 10)) {
      ({ page, y } = ensurePage(doc, pages, y, 20));
      page.drawText((comp.fuente || '').slice(0, 35), { x: colX[0], y, size: 8, font: regularFont, color: NAVY });
      page.drawText(comp.precio_m2 > 0 ? `${comp.precio_m2.toLocaleString()} €` : '—', { x: colX[1], y, size: 8, font: boldFont, color: NAVY });
      page.drawText((comp as any).tipo === 'externo' ? 'Mercado' : 'Plataforma', { x: colX[2], y, size: 8, font: regularFont, color: SLATE });
      if (comp.url) {
        page.drawText(comp.url.slice(0, 45), { x: colX[0], y: y - 10, size: 6, font: regularFont, color: rgb(0, 0, 0.7) });
        y -= 10;
      }
      page.drawLine({ start: { x: MARGIN, y: y - 4 }, end: { x: W - MARGIN, y: y - 4 }, thickness: 0.3, color: rgb(0.92, 0.93, 0.96) });
      y -= 16;
    }

    // URLs de grounding adicionales
    if (groundingUrls.length > 0) {
      y -= 8;
      ({ page, y } = ensurePage(doc, pages, y, 30));
      page.drawText('Fuentes consultadas (grounding):', { x: MARGIN, y, size: 8, font: boldFont, color: SLATE });
      y -= 12;
      for (const url of groundingUrls.slice(0, 6)) {
        ({ page, y } = ensurePage(doc, pages, y, 16));
        page.drawText(`· ${url.slice(0, 75)}`, { x: MARGIN + 8, y, size: 6.5, font: regularFont, color: rgb(0, 0, 0.7) });
        y -= 12;
      }
    }
  }

  // ─── Veredicto IA ────────────────────────────────────────────────────────

  if (veredicto) {
    y -= 20;
    const newPage = doc.addPage([W, H]);
    pages.push(newPage);
    page = newPage;
    y = H - MARGIN;
    drawHeader(page, 'Veredicto IA');
    y -= 20;

    const verdColor = veredicto.veredicto === 'caro' ? RED_WARN : veredicto.veredicto === 'correcto' ? GREEN_OK : GOLD;
    page.drawRectangle({ x: MARGIN, y: y - 80, width: CONTENT_W, height: 90, color: rgb(0.97, 0.97, 0.99) });
    page.drawRectangle({ x: MARGIN, y: y + 6, width: CONTENT_W, height: 4, color: verdColor });

    page.drawText(veredicto.veredicto.toUpperCase(), { x: MARGIN + 16, y: y - 16, size: 18, font: boldFont, color: verdColor });
    if (veredicto.sobreprecio_pct > 0) {
      page.drawText(`${veredicto.sobreprecio_pct.toFixed(1)}% sobre mercado`, { x: MARGIN + 16, y: y - 36, size: 11, font: regularFont, color: NAVY });
    }
    if (veredicto.precio_recomendado > 0) {
      page.drawText(`Precio recomendado: ${veredicto.precio_recomendado.toLocaleString()} €`, { x: MARGIN + 16, y: y - 52, size: 11, font: boldFont, color: NAVY });
      page.drawText(`(rebaja de ${veredicto.rebaja_eur.toLocaleString()} €, −${veredicto.rebaja_pct_low.toFixed(1)}%…−${veredicto.rebaja_pct_high.toFixed(1)}%)`, {
        x: MARGIN + 16, y: y - 68, size: 9, font: regularFont, color: SLATE,
      });
    }
    y -= 100;

    if (veredicto.motivos.length > 0) {
      y -= 8;
      page.drawText('Motivos:', { x: MARGIN, y, size: 9, font: boldFont, color: NAVY });
      y -= 14;
      for (const motivo of veredicto.motivos) {
        ({ page, y } = ensurePage(doc, pages, y, 20));
        const lines = wrapText(`· ${motivo}`, CONTENT_W - 12, regularFont, 8.5);
        for (const line of lines) {
          page.drawText(line, { x: MARGIN + 8, y, size: 8.5, font: regularFont, color: SLATE });
          y -= 13;
        }
      }
    }
  }

  // ─── Narrativa IA ────────────────────────────────────────────────────────

  if (markdown) {
    y -= 20;
    ({ page, y } = ensurePage(doc, pages, y, 100));
    drawHeader(page, 'Análisis IA completo');
    y = drawSectionTitle(page, 'Análisis generado por IA', y);

    // Renderiza markdown plano (elimina símbolos de formato)
    const plainText = markdown
      .replace(/#{1,6}\s+/g, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .replace(/^[-*]\s+/gm, '· ')
      .replace(/\n{3,}/g, '\n\n');

    const paragraphs = plainText.split('\n\n').filter(Boolean);
    for (const para of paragraphs) {
      const lines = wrapText(para.replace(/\n/g, ' '), CONTENT_W, regularFont, 8.5);
      for (const line of lines) {
        ({ page, y } = ensurePage(doc, pages, y, 16));
        page.drawText(line, { x: MARGIN, y, size: 8.5, font: regularFont, color: NAVY });
        y -= 13;
      }
      y -= 6;
    }
  }

  // ─── Feedback de compradores ──────────────────────────────────────────────

  if (ctx && ctx.buyer_feedback.length > 0) {
    y -= 20;
    ({ page, y } = ensurePage(doc, pages, y, 80));
    drawHeader(page, 'Feedback de compradores');
    y = drawSectionTitle(page, 'Actividad y comentarios de compradores', y);

    const fColX = [MARGIN, MARGIN + 90, MARGIN + 175, MARGIN + 255];
    page.drawText('Fecha', { x: fColX[0], y, size: 8, font: boldFont, color: NAVY });
    page.drawText('Tipo', { x: fColX[1], y, size: 8, font: boldFont, color: NAVY });
    page.drawText('Título', { x: fColX[2], y, size: 8, font: boldFont, color: NAVY });
    page.drawText('Notas', { x: fColX[3], y, size: 8, font: boldFont, color: NAVY });
    y -= 14;

    for (const fb of ctx.buyer_feedback.slice(0, 15)) {
      ({ page, y } = ensurePage(doc, pages, y, 22));
      const dateLabel = new Date(fb.event_date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });
      page.drawText(dateLabel, { x: fColX[0], y, size: 7.5, font: regularFont, color: SLATE });
      page.drawText((fb.event_type || '').slice(0, 12), { x: fColX[1], y, size: 7.5, font: regularFont, color: NAVY });
      page.drawText((fb.title || '').slice(0, 18), { x: fColX[2], y, size: 7.5, font: regularFont, color: NAVY });
      page.drawText((fb.notes || '').slice(0, 40), { x: fColX[3], y, size: 7.5, font: regularFont, color: SLATE });
      page.drawLine({ start: { x: MARGIN, y: y - 4 }, end: { x: W - MARGIN, y: y - 4 }, thickness: 0.3, color: rgb(0.92, 0.93, 0.96) });
      y -= 16;
    }
  }

  // ─── Firmas ───────────────────────────────────────────────────────────────

  ({ page, y } = ensurePage(doc, pages, y, 120));
  y -= 40;
  page.drawLine({ start: { x: MARGIN, y: y }, end: { x: MARGIN + 160, y: y }, thickness: 0.5, color: NAVY });
  page.drawLine({ start: { x: W - MARGIN - 160, y: y }, end: { x: W - MARGIN, y: y }, thickness: 0.5, color: NAVY });
  page.drawText('Firma del Asesor', { x: MARGIN, y: y - 14, size: 8, font: regularFont, color: SLATE });
  page.drawText(BRAND.advisor, { x: MARGIN, y: y - 26, size: 8, font: boldFont, color: NAVY });
  page.drawText('Conformidad del Propietario', { x: W - MARGIN - 160, y: y - 14, size: 8, font: regularFont, color: SLATE });

  // Footer en todas las páginas
  for (const p of pages) {
    p.drawLine({ start: { x: MARGIN, y: 32 }, end: { x: W - MARGIN, y: 32 }, thickness: 0.5, color: GOLD });
    p.drawText(`${BRAND.name} · ${BRAND.web} · Documento confidencial`, { x: MARGIN, y: 18, size: 7, font: regularFont, color: SLATE });
  }

  const pdfBytes = await doc.save();

  const title = ctx?.property.title || prop?.title || 'inmueble';
  const safeName = title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="dossier_rebaja_${safeName}.pdf"`,
    },
  });
}
