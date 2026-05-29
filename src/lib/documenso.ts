import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * Cliente mínimo de Documenso Cloud (Fase 4c).
 *
 * ⚠️ Endpoints/shapes basados en la API pública v2 de Documenso
 * (https://openapi.documenso.com). Confírmalos contra tu cuenta antes de
 * pasar a producción real; están aislados aquí para corregirlos en un sitio.
 *
 * Variables de entorno (NO commitear; añadir en Netlify + .env.local):
 *   - DOCUMENSO_API_URL      (ej. https://app.documenso.com/api/v2)
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

/**
 * Genera un PDF A4 sencillo a partir de texto plano (cuerpo ya combinado).
 * Helvetica (WinAnsi) cubre acentos castellanos y el símbolo €.
 */
export async function buildSimplePdf(title: string, body: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const [w, h] = [595.28, 841.89]; // A4
  const margin = 56;
  const size = 11;
  const lh = 16;
  const maxWidth = w - margin * 2;

  let page = pdf.addPage([w, h]);
  let y = h - margin;

  const sanitize = (s: string) => s.replace(/[^\x00-\xFF]/g, "?"); // fuera de WinAnsi → '?'

  page.drawText(sanitize(title), { x: margin, y, size: 16, font: fontBold, color: rgb(0, 0, 0) });
  y -= lh * 2;

  const drawLine = (text: string) => {
    if (y < margin) {
      page = pdf.addPage([w, h]);
      y = h - margin;
    }
    page.drawText(sanitize(text), { x: margin, y, size, font });
    y -= lh;
  };

  for (const rawLine of body.split("\n")) {
    if (rawLine.trim() === "") {
      y -= lh;
      continue;
    }
    const words = rawLine.split(" ");
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(sanitize(test), size) > maxWidth) {
        if (line) drawLine(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) drawLine(line);
  }

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

  // 2) Subir el PDF (Documenso v2 devuelve una URL de subida tipo S3).
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

  // 3) Enviar a firmar.
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
