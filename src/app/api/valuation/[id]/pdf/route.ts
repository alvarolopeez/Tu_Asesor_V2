/**
 * POST /api/valuation/[id]/pdf
 *
 * Genera el informe de valoración en PDF (client-facing, para enseñar al vendedor).
 * Lee de valuation_reports por id (single source of truth — UI y PDF siempre coinciden).
 * Plantilla de marca: portada + datos del inmueble + 3 rangos de precio (hero) +
 * comparables con fuentes + narrativa IA + confianza + firma del asesor.
 *
 * ⚠️ Fetch de properties es CONDICIONAL a que exista property_id (la valoración
 *    puede ser totalmente input-driven sin vínculo a un inmueble del CRM).
 *
 * @created 2026-06-13 brief #016
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { PDFDocument, rgb, StandardFonts, PDFPage } from 'pdf-lib';
import { BRAND } from '@/lib/brandedDoc';
import type { ValuationInputs, ValuationResult } from '@/lib/valuation';

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

// ─── Constantes de layout (A4) ────────────────────────────────────────────────
const W = 595.28;
const H = 841.89;
const MARGIN = 50;
const CONTENT_W = W - MARGIN * 2;
const GOLD = rgb(251 / 255, 191 / 255, 36 / 255);
const NAVY = rgb(15 / 255, 23 / 255, 42 / 255);
const SLATE = rgb(100 / 255, 116 / 255, 139 / 255);
const GREEN = rgb(34 / 255, 197 / 255, 94 / 255);
const BLUE = rgb(59 / 255, 130 / 255, 246 / 255);
const AMBER = rgb(245 / 255, 158 / 255, 11 / 255);

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

// ─── POST handler ─────────────────────────────────────────────────────────────

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

  if (!report) {
    return NextResponse.json({ error: 'Valoración no encontrada' }, { status: 404 });
  }

  const inputs = report.inputs as ValuationInputs;
  const result = report.result as ValuationResult | null;
  const markdown = report.markdown as string | null;
  const groundingUrls = (report.grounding_urls as string[] | null) || [];
  const propertyId = report.property_id as string | null;

  // Fetch de inmueble solo si hay vínculo
  let propTitle: string | null = null;
  if (propertyId) {
    const { data: prop } = await db
      .from('properties')
      .select('title')
      .eq('id', propertyId)
      .single();
    propTitle = prop?.title ?? null;
  }

  const doc = await PDFDocument.create();
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await doc.embedFont(StandardFonts.Helvetica);
  const pages: PDFPage[] = [];

  // ─── Portada ──────────────────────────────────────────────────────────────

  const cover = doc.addPage([W, H]);
  pages.push(cover);

  cover.drawRectangle({ x: 0, y: H - 80, width: W, height: 80, color: NAVY });
  cover.drawText(BRAND.name, { x: MARGIN, y: H - 48, size: 18, font: boldFont, color: GOLD });
  cover.drawText(BRAND.tagline.toUpperCase(), { x: MARGIN, y: H - 66, size: 8, font: regularFont, color: rgb(1, 1, 1) });

  const dateStr = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
  cover.drawText(dateStr, { x: W - MARGIN - 100, y: H - 48, size: 9, font: regularFont, color: rgb(1, 1, 1) });

  cover.drawRectangle({ x: MARGIN, y: H - 180, width: CONTENT_W, height: 4, color: GOLD });
  cover.drawText('INFORME DE VALORACIÓN', { x: MARGIN, y: H - 140, size: 14, font: boldFont, color: NAVY });

  const headingLabel = propTitle || inputs.direccion || inputs.zona || 'Inmueble sin publicar';
  cover.drawText(headingLabel.slice(0, 60), { x: MARGIN, y: H - 162, size: 11, font: regularFont, color: SLATE });

  // Cifra hero: rango mercado
  if (result?.rangos?.mercado?.precio) {
    const m = result.rangos.mercado;
    cover.drawRectangle({ x: MARGIN, y: H - 330, width: CONTENT_W, height: 110, color: rgb(0.94, 0.97, 1) });
    cover.drawRectangle({ x: MARGIN, y: H - 224, width: CONTENT_W, height: 4, color: BLUE });
    cover.drawText('PRECIO DE MERCADO ESTIMADO', { x: MARGIN + 15, y: H - 248, size: 8, font: boldFont, color: BLUE });
    cover.drawText(`${m.precio.toLocaleString()} €`, { x: MARGIN + 15, y: H - 272, size: 22, font: boldFont, color: NAVY });
    cover.drawText(`${m.precio_m2.toLocaleString()} €/m²  ·  Cierre estimado: ${m.dias_estimados} días`, {
      x: MARGIN + 15, y: H - 298, size: 10, font: regularFont, color: SLATE,
    });
    if (result.confianza) {
      const confColor = result.confianza === 'alta' ? GREEN : result.confianza === 'media' ? AMBER : SLATE;
      cover.drawText(`Confianza: ${result.confianza.toUpperCase()}`, { x: MARGIN + 15, y: H - 316, size: 9, font: boldFont, color: confColor });
    }
  }

  cover.drawText(`Asesor: ${BRAND.advisor}`, { x: MARGIN, y: 120, size: 9, font: regularFont, color: SLATE });
  cover.drawText(`Tel.: ${BRAND.phone}  ·  Email: ${BRAND.email}`, { x: MARGIN, y: 104, size: 9, font: regularFont, color: SLATE });
  cover.drawText(BRAND.web, { x: MARGIN, y: 88, size: 9, font: regularFont, color: SLATE });
  cover.drawLine({ start: { x: MARGIN, y: 80 }, end: { x: W - MARGIN, y: 80 }, thickness: 0.5, color: GOLD });
  cover.drawText('Documento confidencial · Preparado por Tu Asesor Álvaro', { x: MARGIN, y: 64, size: 8, font: regularFont, color: SLATE });

  // ─── Ficha del inmueble ───────────────────────────────────────────────────

  let page = doc.addPage([W, H]);
  pages.push(page);
  let y = H - MARGIN;

  const drawHeader = (p: PDFPage, title: string) => {
    p.drawRectangle({ x: 0, y: H - 30, width: W, height: 30, color: NAVY });
    p.drawText(`${BRAND.name} · ${title}`, { x: MARGIN, y: H - 20, size: 9, font: regularFont, color: GOLD });
  };

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

  drawHeader(page, 'Datos del inmueble');
  y -= 20;
  y = drawSectionTitle(page, 'Características del inmueble', y);

  if (inputs.direccion) y = drawRow(page, 'Dirección', inputs.direccion, y);
  if (inputs.referencia_catastral) y = drawRow(page, 'Ref. catastral', inputs.referencia_catastral, y);
  if (inputs.zona) y = drawRow(page, 'Zona', inputs.zona, y);
  y = drawRow(page, 'Superficie', `${inputs.m2} m²`, y);
  if (inputs.habitaciones) y = drawRow(page, 'Habitaciones', String(inputs.habitaciones), y);
  if (inputs.banos) y = drawRow(page, 'Baños', String(inputs.banos), y);
  y = drawRow(page, 'Estado', inputs.estado, y);
  if (inputs.tipo) y = drawRow(page, 'Tipo', inputs.tipo, y);
  if (inputs.planta) y = drawRow(page, 'Planta', inputs.planta, y);
  if (inputs.ascensor !== undefined) y = drawRow(page, 'Ascensor', inputs.ascensor ? 'Sí' : 'No', y);
  if (inputs.ano) y = drawRow(page, 'Año construcción', String(inputs.ano), y);
  if (inputs.reformas_extras) {
    y -= 4;
    page.drawText('Reformas y extras:', { x: MARGIN, y, size: 9, font: boldFont, color: SLATE });
    y -= 14;
    const reformaLines = wrapText(inputs.reformas_extras, CONTENT_W, regularFont, 8.5);
    for (const line of reformaLines) {
      ({ page, y } = ensurePage(doc, pages, y, 16));
      page.drawText(line, { x: MARGIN + 12, y, size: 8.5, font: regularFont, color: NAVY });
      y -= 13;
    }
  }

  // ─── Los 3 rangos de precio ───────────────────────────────────────────────

  if (result?.rangos) {
    y -= 20;
    ({ page, y } = ensurePage(doc, pages, y, 220));
    drawHeader(page, 'Rangos de precio');
    y = H - MARGIN - 20;
    y = drawSectionTitle(page, 'Estrategia de precio de salida', y);

    const ranges = [
      { key: 'venta_rapida', label: 'Venta rápida', color: GREEN, bgColor: rgb(0.94, 1, 0.96) },
      { key: 'mercado', label: 'Precio de mercado', color: BLUE, bgColor: rgb(0.94, 0.97, 1) },
      { key: 'premium', label: 'Premium', color: AMBER, bgColor: rgb(1, 0.97, 0.9) },
    ] as const;

    for (const { key, label, color, bgColor } of ranges) {
      const rng = result.rangos[key];
      if (!rng) continue;
      ({ page, y } = ensurePage(doc, pages, y, 80));
      page.drawRectangle({ x: MARGIN, y: y - 68, width: CONTENT_W, height: 78, color: bgColor });
      page.drawRectangle({ x: MARGIN, y: y + 6, width: CONTENT_W, height: 4, color });
      page.drawText(label.toUpperCase(), { x: MARGIN + 14, y: y - 12, size: 8, font: boldFont, color });
      page.drawText(`${rng.precio.toLocaleString()} €`, { x: MARGIN + 14, y: y - 30, size: 18, font: boldFont, color: NAVY });
      page.drawText(`${rng.precio_m2.toLocaleString()} €/m²  ·  ~${rng.dias_estimados} días`, { x: MARGIN + 14, y: y - 48, size: 9, font: regularFont, color: SLATE });
      if (rng.justificacion) {
        const justLines = wrapText(rng.justificacion, CONTENT_W - 28, regularFont, 8);
        page.drawText(justLines[0]?.slice(0, 80) || '', { x: MARGIN + 14, y: y - 62, size: 8, font: regularFont, color: SLATE });
      }
      y -= 88;
    }
  }

  // ─── Comparables ──────────────────────────────────────────────────────────

  if (result?.comparables && result.comparables.length > 0) {
    y -= 10;
    ({ page, y } = ensurePage(doc, pages, y, 100));
    drawHeader(page, 'Comparables de mercado');
    y -= 20;
    y = drawSectionTitle(page, 'Fuentes consultadas', y);

    const colX = [MARGIN, MARGIN + 210, MARGIN + 320];
    page.drawText('Fuente', { x: colX[0], y, size: 8, font: boldFont, color: NAVY });
    page.drawText('€/m²', { x: colX[1], y, size: 8, font: boldFont, color: NAVY });
    y -= 14;

    for (const comp of result.comparables.slice(0, 12)) {
      ({ page, y } = ensurePage(doc, pages, y, 22));
      page.drawText((comp.fuente || '').slice(0, 38), { x: colX[0], y, size: 8, font: regularFont, color: NAVY });
      page.drawText(comp.precio_m2 > 0 ? `${comp.precio_m2.toLocaleString()} €` : '—', { x: colX[1], y, size: 8, font: boldFont, color: NAVY });
      if (comp.url) {
        page.drawText(comp.url.slice(0, 60), { x: colX[0], y: y - 10, size: 6, font: regularFont, color: rgb(0, 0, 0.7) });
        y -= 10;
      }
      page.drawLine({ start: { x: MARGIN, y: y - 4 }, end: { x: W - MARGIN, y: y - 4 }, thickness: 0.3, color: rgb(0.92, 0.93, 0.96) });
      y -= 16;
    }

    if (groundingUrls.length > 0) {
      y -= 8;
      ({ page, y } = ensurePage(doc, pages, y, 30));
      page.drawText('Otras fuentes consultadas (grounding IA):', { x: MARGIN, y, size: 8, font: boldFont, color: SLATE });
      y -= 12;
      for (const url of groundingUrls.slice(0, 6)) {
        ({ page, y } = ensurePage(doc, pages, y, 14));
        page.drawText(`· ${url.slice(0, 75)}`, { x: MARGIN + 8, y, size: 6.5, font: regularFont, color: rgb(0, 0, 0.7) });
        y -= 12;
      }
    }
  }

  // ─── Análisis narrativo ───────────────────────────────────────────────────

  if (markdown) {
    const newPage = doc.addPage([W, H]);
    pages.push(newPage);
    page = newPage;
    y = H - MARGIN;
    drawHeader(page, 'Análisis detallado');
    y -= 20;
    y = drawSectionTitle(page, 'Análisis generado por IA', y);

    const plainText = markdown
      .replace(/#{1,6}\s+/g, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .replace(/^[-*]\s+/gm, '· ')
      .replace(/\n{3,}/g, '\n\n');

    for (const para of plainText.split('\n\n').filter(Boolean)) {
      const lines = wrapText(para.replace(/\n/g, ' '), CONTENT_W, regularFont, 8.5);
      for (const line of lines) {
        ({ page, y } = ensurePage(doc, pages, y, 16));
        page.drawText(line, { x: MARGIN, y, size: 8.5, font: regularFont, color: NAVY });
        y -= 13;
      }
      y -= 6;
    }
  }

  // ─── Factores y supuestos ─────────────────────────────────────────────────

  if (result?.factores?.length || result?.supuestos?.length || result?.advertencias?.length) {
    y -= 16;
    ({ page, y } = ensurePage(doc, pages, y, 80));
    y = drawSectionTitle(page, 'Factores del inmueble y supuestos asumidos', y);

    if (result.factores?.length) {
      page.drawText('Factores considerados:', { x: MARGIN, y, size: 9, font: boldFont, color: NAVY });
      y -= 14;
      for (const f of result.factores) {
        ({ page, y } = ensurePage(doc, pages, y, 16));
        const lines = wrapText(`· ${f}`, CONTENT_W - 12, regularFont, 8.5);
        for (const line of lines) {
          page.drawText(line, { x: MARGIN + 8, y, size: 8.5, font: regularFont, color: SLATE });
          y -= 13;
        }
      }
      y -= 6;
    }

    if (result.supuestos?.length) {
      ({ page, y } = ensurePage(doc, pages, y, 40));
      page.drawText('Supuestos asumidos por la IA:', { x: MARGIN, y, size: 9, font: boldFont, color: NAVY });
      y -= 14;
      for (const s of result.supuestos) {
        ({ page, y } = ensurePage(doc, pages, y, 14));
        page.drawText(`· ${s.slice(0, 90)}`, { x: MARGIN + 8, y, size: 8, font: regularFont, color: SLATE });
        y -= 13;
      }
      y -= 4;
    }

    if (result.advertencias?.length) {
      ({ page, y } = ensurePage(doc, pages, y, 40));
      page.drawText('⚠ Advertencias:', { x: MARGIN, y, size: 9, font: boldFont, color: AMBER });
      y -= 14;
      for (const a of result.advertencias) {
        ({ page, y } = ensurePage(doc, pages, y, 14));
        page.drawText(`· ${a.slice(0, 90)}`, { x: MARGIN + 8, y, size: 8, font: regularFont, color: AMBER });
        y -= 13;
      }
    }
  }

  // ─── Firmas ───────────────────────────────────────────────────────────────

  ({ page, y } = ensurePage(doc, pages, y, 120));
  y -= 40;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + 160, y }, thickness: 0.5, color: NAVY });
  page.drawLine({ start: { x: W - MARGIN - 160, y }, end: { x: W - MARGIN, y }, thickness: 0.5, color: NAVY });
  page.drawText('Firma del Asesor', { x: MARGIN, y: y - 14, size: 8, font: regularFont, color: SLATE });
  page.drawText(BRAND.advisor, { x: MARGIN, y: y - 26, size: 8, font: boldFont, color: NAVY });
  page.drawText('Conformidad del Propietario', { x: W - MARGIN - 160, y: y - 14, size: 8, font: regularFont, color: SLATE });

  // Footer en todas las páginas
  for (const p of pages) {
    p.drawLine({ start: { x: MARGIN, y: 32 }, end: { x: W - MARGIN, y: 32 }, thickness: 0.5, color: GOLD });
    p.drawText(`${BRAND.name} · ${BRAND.web} · Documento confidencial`, { x: MARGIN, y: 18, size: 7, font: regularFont, color: SLATE });
  }

  const pdfBytes = await doc.save();
  const safeName = headingLabel.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="valoracion_${safeName}.pdf"`,
    },
  });
}
