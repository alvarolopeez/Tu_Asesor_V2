import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { parseDoc, BRAND, type SignSlot, type AcceptanceBlock, type DocVariant } from "./brandedDoc";
import { BRAND_LOGO_PNG_BASE64 } from "./brandLogo";

export interface PdfLayout {
  signatures?: SignSlot[];
  acceptance?: AcceptanceBlock;
  /** "corporate" (default, con marca) o "legal" (sobrio, serif, sin logo). */
  variant?: DocVariant;
}

/**
 * Cliente mínimo de Documenso Cloud (Fase 4c).
 *
 * ✅ Usa la API v1 (verificada end-to-end contra la cuenta real el 2026-05-30:
 * create→upload→send devuelven 200 con la forma esperada). La v2/v2-beta NO
 * está disponible en esta cuenta (404). Flujo: POST /documents devuelve
 * {documentId, uploadUrl, recipients} → PUT del PDF a uploadUrl → POST
 * /documents/{id}/send.
 *
 * Variables de entorno (NO commitear; añadir en Netlify + .env.local):
 *   - DOCUMENSO_API_URL      (= https://app.documenso.com/api/v1)
 *   - DOCUMENSO_API_TOKEN    (api_xxx)
 *   - DOCUMENSO_WEBHOOK_SECRET
 */

const API_URL = (process.env.DOCUMENSO_API_URL || "").replace(/\/$/, "");
const API_TOKEN = process.env.DOCUMENSO_API_TOKEN || "";

export function isDocumensoConfigured(): boolean {
  return Boolean(API_URL && API_TOKEN);
}

export interface DocumensoRecipient {
  name: string;
  email: string;
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  // Documenso usa la API key directamente en Authorization (sin "Bearer").
  return { Authorization: API_TOKEN, ...extra };
}

// Paleta de marca en rgb() de pdf-lib (0-1).
const C = {
  navy: rgb(0x0f / 255, 0x17 / 255, 0x2a / 255),
  gold: rgb(0xfb / 255, 0xbf / 255, 0x24 / 255),
  goldDark: rgb(0xb8 / 255, 0x86 / 255, 0x0b / 255),
  ink: rgb(0x28 / 255, 0x30 / 255, 0x42 / 255),
  muted: rgb(0x8a / 255, 0x93 / 255, 0xa3 / 255),
  line: rgb(0xe7 / 255, 0xea / 255, 0xf0 / 255),
  fill: rgb(0xaa / 255, 0xb2 / 255, 0xc0 / 255),
  white: rgb(1, 1, 1),
};

/**
 * Genera el PDF A4 con la identidad de marca de Tu Asesor Álvaro a partir del
 * cuerpo de plantilla ya combinado. Comparte el parser (`parseDoc`) con la vista
 * previa HTML, de modo que el PDF firmado y la previsualización son coherentes.
 * pdf-lib + Helvetica (WinAnsi cubre acentos y €) → serverless-safe.
 */
export async function buildSimplePdf(title: string, body: string, layout: PdfLayout = {}): Promise<Uint8Array> {
  const variant: DocVariant = layout.variant ?? "corporate";
  const pdf = await PDFDocument.create();
  // Para la variante "legal" usamos Times (serif) para acercarnos al papel
  // notarial; corporate sigue con Helvetica para coherencia con la marca.
  const font = await pdf.embedFont(variant === "legal" ? StandardFonts.TimesRoman : StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(variant === "legal" ? StandardFonts.TimesRomanBold : StandardFonts.HelveticaBold);
  const logo = variant === "corporate"
    ? await pdf.embedPng(Buffer.from(BRAND_LOGO_PNG_BASE64, "base64"))
    : null;

  const W = 595.28, H = 841.89; // A4 pt
  const MX = 48; // margen lateral
  const top = H - 44;
  const bottom = 60;
  const maxW = W - MX * 2;
  // WinAnsi (CP-1252) cubre ASCII + Latin-1 + algunos chars con codepoint Unicode
  // >0xFF (€, smart quotes, etc.). El reemplazo simple por /[^\x00-\xFF]/ rompía
  // el símbolo € (U+20AC) y lo convertía en "?". Lista blanca de extras:
  const WINANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
  const sanitize = (s: string) => s.split("").map((c) => {
    const code = c.charCodeAt(0);
    if (code <= 0xFF) return c;
    if (WINANSI_EXTRA.has(c)) return c;
    return "?";
  }).join("");

  let page = pdf.addPage([W, H]);
  let y = top;
  let pageNo = 0;

  const drawFooter = (p: PDFPage) => {
    if (variant === "legal") {
      p.drawLine({ start: { x: MX, y: bottom - 6 }, end: { x: W - MX, y: bottom - 6 }, thickness: 0.4, color: rgb(0.85, 0.85, 0.85) });
      const txt = `Tu Asesor Álvaro  ·  ${BRAND.web}  ·  Documento confidencial`;
      const tw = font.widthOfTextAtSize(txt, 7.4);
      p.drawText(txt, { x: (W - tw) / 2, y: bottom - 18, size: 7.4, font, color: rgb(0.5, 0.5, 0.5) });
      return;
    }
    p.drawLine({ start: { x: MX, y: bottom - 6 }, end: { x: W - MX, y: bottom - 6 }, thickness: 0.6, color: C.line });
    p.drawText(`${BRAND.name}  ·  ${BRAND.web}  ·  ${BRAND.email}`, { x: MX, y: bottom - 18, size: 7, font, color: C.muted });
    p.drawText("Documento confidencial", { x: W - MX - 92, y: bottom - 18, size: 7, font, color: C.muted });
  };

  const newPage = () => {
    drawFooter(page);
    page = pdf.addPage([W, H]);
    pageNo += 1;
    y = top;
  };
  const ensure = (need: number) => { if (y - need < bottom + 10) newPage(); };

  // Ajuste de línea con soporte de tramos en negrita (segmentos).
  const wrap = (text: string, f: PDFFont, size: number, width: number): string[] => {
    const words = sanitize(text).split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const wd of words) {
      const test = line ? `${line} ${wd}` : wd;
      if (f.widthOfTextAtSize(test, size) > width && line) { lines.push(line); line = wd; }
      else line = test;
    }
    if (line) lines.push(line);
    return lines;
  };

  const para = (text: string, opts: { size?: number; f?: PDFFont; color?: any; gap?: number; indent?: number } = {}) => {
    const size = opts.size ?? 9.5;
    const f = opts.f ?? font;
    const indent = opts.indent ?? 0;
    const lh = size * 1.42;
    for (const ln of wrap(text, f, size, maxW - indent)) {
      ensure(lh);
      page.drawText(ln, { x: MX + indent, y: y - size, size, font: f, color: opts.color ?? C.ink });
      y -= lh;
    }
    y -= opts.gap ?? 2;
  };

  // ═══ CABECERA ═══
  if (variant === "legal") {
    // Título centrado en mayúsculas, sin logo ni cabecera con marca.
    const T = sanitize(title.toUpperCase());
    const tW = fontBold.widthOfTextAtSize(T, 14);
    page.drawText(T, { x: (W - tW) / 2, y: y - 14, size: 14, font: fontBold, color: rgb(0, 0, 0) });
    y -= 24;
    if (layout && (title || layout)) {
      // "En Sevilla, a [fecha]." lo escribe el cuerpo (primera línea de la plantilla).
    }
  } else {
    // Cabecera corporate con logo + título + franja dorada.
    const logoH = 30;
    const logoW = logo ? (logo.width / logo.height) * logoH : 0;
    if (logo) page.drawImage(logo, { x: MX, y: y - logoH, width: logoW, height: logoH });
    page.drawText(BRAND.name, { x: MX + logoW + 10, y: y - 13, size: 13, font: fontBold, color: C.navy });
    page.drawText(BRAND.tagline.toUpperCase(), { x: MX + logoW + 10, y: y - 25, size: 6.5, font, color: C.muted });
    // Título a la derecha. Reducimos tamaño si no cabe en el ancho disponible
    // (evita solape sobre el nombre de marca con títulos largos como
    // "Ficha Informativa y Nota Explicativa del Precio").
    const brandW = fontBold.widthOfTextAtSize(BRAND.name, 13);
    const titleStartMin = MX + logoW + 10 + brandW + 22;
    const titleMaxW = W - MX - titleStartMin;
    const safeTitle = sanitize(title);
    let tSize = 15;
    let tW = fontBold.widthOfTextAtSize(safeTitle, tSize);
    while (tW > titleMaxW && tSize > 9.5) {
      tSize -= 0.5;
      tW = fontBold.widthOfTextAtSize(safeTitle, tSize);
    }
    page.drawText(safeTitle, { x: W - MX - tW, y: y - 14, size: tSize, font: fontBold, color: C.navy });
    page.drawRectangle({ x: W - MX - 46, y: y + 4, width: 46, height: 2, color: C.gold });
    y -= logoH + 6;
    page.drawLine({ start: { x: MX, y }, end: { x: W - MX, y }, thickness: 0.8, color: C.line });
    y -= 12;
    // Banda de datos del asesor
    const advisor = `Asesor: ${BRAND.advisor}   ·   DNI: ${BRAND.dni}   ·   ${BRAND.fiscalAddress}   ·   Tel.: ${BRAND.phone}   ·   ${BRAND.email}`;
    para(advisor, { size: 7.4, color: C.muted, gap: 6 });
  }

  // ═══ CUERPO ═══
  if (variant === "legal") {
    // Render jurídico: Reunidos/Manifiestan/Estipulaciones centrados; resto párrafo justificado.
    const PILLAR = /^(reunidos|manifiestan|estipulaciones)$/i;
    for (const b of parseDoc(body)) {
      if (b.type === "section") {
        ensure(28);
        y -= 8;
        const isPillar = PILLAR.test(b.text.trim());
        const txt = sanitize(b.text.toUpperCase());
        const size = isPillar ? 11.5 : 10.5;
        const tW = fontBold.widthOfTextAtSize(txt, size);
        const x = isPillar ? (W - tW) / 2 : MX;
        page.drawText(txt, { x, y: y - size, size, font: fontBold, color: rgb(0, 0, 0) });
        y -= size + 8;
      } else if (b.type === "bullet") {
        para(b.text, { size: 10.2, indent: 16, gap: 1, color: rgb(0, 0, 0) });
      } else if (b.type === "row") {
        para(`${b.label}: ${b.value}`, { size: 10.5, gap: 3, color: rgb(0, 0, 0) });
      } else {
        para(b.text, { size: 10.5, gap: 4, color: rgb(0, 0, 0) });
      }
    }
  } else {
    // Render corporate (con secciones numeradas y filas k/v resaltadas).
    let sec = 0;
    for (const b of parseDoc(body)) {
      if (b.type === "section") {
        sec += 1;
        ensure(20);
        y -= 4;
        const num = String(sec).padStart(2, "0");
        page.drawText(num, { x: MX, y: y - 9, size: 9, font: fontBold, color: C.goldDark });
        page.drawText(sanitize(b.text.toUpperCase()), { x: MX + 20, y: y - 9, size: 9, font: fontBold, color: C.navy });
        y -= 16;
      } else if (b.type === "row") {
        ensure(13);
        const labelColor = b.emphasis ? C.goldDark : C.muted;
        const valColor = b.emphasis ? C.navy : C.ink;
        const valFont = b.emphasis ? fontBold : font;
        if (b.emphasis) page.drawRectangle({ x: MX, y: y - 11, width: 2, height: 12, color: C.gold });
        page.drawText(sanitize(b.label), { x: MX + 6, y: y - 9, size: 8.4, font, color: labelColor });
        const vx = MX + 6 + maxW * 0.32;
        for (const ln of wrap(b.value, valFont, 8.6, maxW - (vx - MX) - 6)) {
          ensure(12);
          page.drawText(ln, { x: vx, y: y - 9, size: 8.6, font: valFont, color: valColor });
          y -= 12;
        }
        y -= 2;
      } else if (b.type === "bullet") {
        para(b.text, { size: 9.3, indent: 14, gap: 1 });
      } else {
        para(b.text, { size: 9.5, gap: 4 });
      }
    }
  }

  // Dibuja una fila de N casillas de firma (1-3) a la altura actual de `y`.
  // Color y tipografía se ajustan a la variante (legal = negro; corporate = navy).
  const drawSignRow = (slots: SignSlot[]) => {
    ensure(90);
    y -= 18;
    const lineY = y - 34;
    const n = Math.min(3, slots.length || 1);
    const gap = 24;
    const colW = (maxW - gap * (n - 1)) / n;
    const lineColor = variant === "legal" ? rgb(0, 0, 0) : C.navy;
    const labelColor = variant === "legal" ? rgb(0, 0, 0) : C.navy;
    const subColor = variant === "legal" ? rgb(0.4, 0.4, 0.4) : C.muted;
    slots.slice(0, n).forEach((s, i) => {
      const x0 = MX + i * (colW + gap);
      const x1 = x0 + colW;
      page.drawLine({ start: { x: x0, y: lineY }, end: { x: x1, y: lineY }, thickness: 0.8, color: lineColor });
      page.drawText(sanitize(s.who.toUpperCase()), { x: x0, y: lineY - 11, size: 8, font: fontBold, color: labelColor });
      if (s.sub) page.drawText(sanitize(s.sub), { x: x0, y: lineY - 21, size: 7.4, font, color: subColor });
    });
    y = lineY - 30;
  };
  const colW = (maxW - 40) / 2; // (legacy) usado solo por el bloque de aceptación corporate

  // ── Firmas principales ──
  const sigs: SignSlot[] = layout.signatures ?? [
    { who: "El Asesor", sub: BRAND.advisor },
    { who: "El Cliente", sub: "La parte firmante" },
  ];
  drawSignRow(sigs);

  // ── Bloque de aceptación (propuesta) ──
  if (layout.acceptance) {
    const a = layout.acceptance;
    ensure(210);
    y -= 12;
    const boxTop = y;
    const innerX = MX + 12;
    const innerW = maxW - 24;
    y -= 14;
    page.drawText(sanitize(a.heading.toUpperCase()), { x: innerX, y: y - 8, size: 8.4, font: fontBold, color: C.navy });
    y -= 18;
    for (const ln of wrap(a.body, font, 8.6, innerW)) {
      page.drawText(ln, { x: innerX, y: y - 8, size: 8.6, font, color: C.ink });
      y -= 12;
    }
    for (const opt of a.options || []) {
      y -= 2;
      page.drawRectangle({ x: innerX, y: y - 9, width: 8, height: 8, borderColor: C.navy, borderWidth: 1 });
      page.drawText(sanitize(opt), { x: innerX + 13, y: y - 8, size: 8.4, font, color: C.ink });
      y -= 13;
    }
    drawSignRow([a.sign]);
    const boxBottom = y - 4;
    // marco dorado del bloque
    page.drawRectangle({
      x: MX, y: boxBottom, width: maxW, height: boxTop - boxBottom,
      borderColor: C.gold, borderWidth: 1,
    });
    y = boxBottom - 8;
  }

  ensure(16);
  para("Documento firmado digitalmente mediante Documenso · validez legal eIDAS.", { size: 7.2, color: C.muted });

  drawFooter(page);
  return pdf.save();
}

/**
 * Crea el documento en Documenso, sube el PDF y lo envía a firmar.
 * Devuelve el id del documento en Documenso.
 */
export async function sendForSignature(opts: {
  title: string;
  pdfBytes: Uint8Array;
  recipients: DocumensoRecipient[];
}): Promise<{ documentId: string }> {
  if (!isDocumensoConfigured()) {
    throw new Error("Documenso no está configurado (faltan DOCUMENSO_API_URL / DOCUMENSO_API_TOKEN).");
  }
  if (opts.recipients.length === 0) {
    throw new Error("No hay destinatarios con email válido para enviar a firmar.");
  }

  // 1) Crear el documento (borrador) con título + destinatarios.
  const createRes = await fetch(`${API_URL}/documents`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      title: opts.title,
      recipients: opts.recipients.map((r, i) => ({ name: r.name, email: r.email, role: "SIGNER", signingOrder: i + 1 })),
    }),
  });
  if (!createRes.ok) {
    throw new Error(`Documenso create document falló (${createRes.status}): ${await safeText(createRes)}`);
  }
  const created = await createRes.json();
  const documentId: string = String(created.id ?? created.documentId ?? created.document?.id ?? "");
  const uploadUrl: string | undefined = created.uploadUrl ?? created.upload?.url;
  if (!documentId) throw new Error("Documenso no devolvió un id de documento.");

  // Documenso v1 devuelve los recipients creados (con su recipientId), en el
  // mismo orden en que los enviamos. Los necesitamos para anclar el campo de
  // firma a cada uno.
  const createdRecipients: Array<{ recipientId: number }> = Array.isArray(created.recipients)
    ? created.recipients
    : [];

  // 2) Subir el PDF (la respuesta trae una URL de subida tipo S3 prefirmada).
  if (uploadUrl) {
    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      body: Buffer.from(opts.pdfBytes),
    });
    if (!putRes.ok) {
      throw new Error(`Documenso upload PDF falló (${putRes.status}).`);
    }
  }

  // 3) Crear un campo de FIRMA por cada destinatario. Documenso rechaza el
  //    envío si algún firmante no tiene al menos un campo de firma
  //    ("Signers must have at least one signature field"). Colocamos el campo
  //    en la última página (donde está el bloque de firmas del PDF de marca),
  //    en columnas alternas para no solaparse cuando hay varios firmantes.
  const pageCount = (await PDFDocument.load(opts.pdfBytes)).getPageCount();
  for (let i = 0; i < createdRecipients.length; i++) {
    const recipientId = createdRecipients[i]?.recipientId;
    if (!recipientId) continue;
    const col = i % 2; // 0 = izquierda, 1 = derecha
    const row = Math.floor(i / 2);
    const fieldRes = await fetch(`${API_URL}/documents/${documentId}/fields`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        recipientId,
        type: "SIGNATURE",
        pageNumber: pageCount,
        pageX: 12 + col * 45,
        pageY: Math.min(88, 82 - row * 10),
        pageWidth: 28,
        pageHeight: 6,
      }),
    });
    if (!fieldRes.ok) {
      throw new Error(`Documenso crear campo de firma falló (${fieldRes.status}): ${await safeText(fieldRes)}`);
    }
  }

  // 4) Enviar a firmar.
  const sendRes = await fetch(`${API_URL}/documents/${documentId}/send`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ sendEmail: true }),
  });
  if (!sendRes.ok) {
    throw new Error(`Documenso send falló (${sendRes.status}): ${await safeText(sendRes)}`);
  }

  return { documentId };
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "";
  }
}

/**
 * Mapea un evento de webhook de Documenso a nuestro `signature_status`.
 * Acepta tanto DOCUMENT_COMPLETED como document.completed por robustez.
 */
export function mapDocumensoEvent(event: string): string | null {
  const e = (event || "").toUpperCase().replace(/\./g, "_");
  switch (e) {
    case "DOCUMENT_SENT":
      return "sent";
    case "DOCUMENT_OPENED":
    case "DOCUMENT_SIGNED":
      return "viewed";
    case "DOCUMENT_COMPLETED":
      return "completed";
    case "DOCUMENT_REJECTED":
    case "DOCUMENT_CANCELLED":
      return "rejected";
    default:
      return null;
  }
}
