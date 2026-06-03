import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/documents/[id]/download
 *
 * Proxy de descarga del PDF firmado de Documenso.
 *
 *  1. Recupera el `documenso_id` y el `signature_status` del documento
 *     generado, validando que esté en estado 'completed'. Si no, devuelve
 *     409 con mensaje claro (evita descargar borradores sin firmas).
 *  2. Llama a `GET {DOCUMENSO_API_URL}/documents/{documenso_id}/download`
 *     (API v1) con la API token en la cabecera Authorization.
 *  3. Reenvía el PDF al cliente con
 *       Content-Type: application/pdf
 *       Content-Disposition: attachment; filename="..."
 *
 *  Por qué un proxy y NO un link directo a Documenso:
 *   - El token de Documenso es secreto del servidor; no lo exponemos al
 *     navegador.
 *   - Permite añadir control de acceso (RLS, autenticación admin) más
 *     adelante sin re-cablear el front.
 *   - Centraliza el manejo de errores (Documenso devuelve 404 si el doc
 *     no existe / no es del owner; aquí lo convertimos a un 404 nuestro).
 *
 *  @created 2026-06-03 (tarea: botón "Descargar PDF firmado").
 */

const API_URL = (process.env.DOCUMENSO_API_URL || "").replace(/\/$/, "");
const API_TOKEN = process.env.DOCUMENSO_API_TOKEN || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
);

function sanitizeFilenameSegment(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 _.-]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Next 16: `params` es una Promise (async dynamic API).
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

  if (!SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor." },
      { status: 503 },
    );
  }
  if (!API_URL || !API_TOKEN) {
    return NextResponse.json(
      { error: "Documenso no está configurado (DOCUMENSO_API_URL / DOCUMENSO_API_TOKEN)." },
      { status: 503 },
    );
  }

  // 1) Localizar documento generado + recuperar plantilla para nombre legible.
  const { data: doc, error } = await supabaseAdmin
    .from("generated_documents")
    .select("id, documenso_id, signature_status, template_id, merged_data, created_at")
    .eq("id", id)
    .single();

  if (error || !doc) {
    return NextResponse.json({ error: "Documento generado no encontrado" }, { status: 404 });
  }
  if (!doc.documenso_id) {
    return NextResponse.json({ error: "El documento aún no ha sido enviado a firmar." }, { status: 409 });
  }
  if (doc.signature_status !== "completed") {
    return NextResponse.json(
      { error: `El documento no está firmado todavía (estado: ${doc.signature_status}).` },
      { status: 409 },
    );
  }

  let templateName = "documento";
  if (doc.template_id) {
    const { data: tpl } = await supabaseAdmin
      .from("document_templates")
      .select("name")
      .eq("id", doc.template_id)
      .single();
    if (tpl?.name) templateName = tpl.name;
  }

  // 2) Pedir el PDF firmado a Documenso v1.
  const dlRes = await fetch(`${API_URL}/documents/${doc.documenso_id}/download`, {
    method: "GET",
    headers: { Authorization: API_TOKEN },
  });

  if (!dlRes.ok) {
    const detail = await dlRes.text().catch(() => "");
    return NextResponse.json(
      { error: `Documenso devolvió ${dlRes.status}: ${detail.slice(0, 200)}` },
      { status: dlRes.status },
    );
  }

  const contentType = dlRes.headers.get("content-type") || "application/pdf";
  // Documenso a veces responde un JSON `{ downloadUrl }` (S3 prefirmada).
  // Soportamos ambos casos: si NO es PDF binario, intentamos parsear el
  // JSON y seguimos la URL.
  let pdfBytes: ArrayBuffer;
  if (contentType.includes("application/json")) {
    try {
      const json = (await dlRes.json()) as { downloadUrl?: string };
      if (!json.downloadUrl) {
        return NextResponse.json(
          { error: "Documenso devolvió JSON sin downloadUrl." },
          { status: 502 },
        );
      }
      const s3Res = await fetch(json.downloadUrl);
      if (!s3Res.ok) {
        return NextResponse.json(
          { error: `S3 prefirmada devolvió ${s3Res.status}` },
          { status: 502 },
        );
      }
      pdfBytes = await s3Res.arrayBuffer();
    } catch (e) {
      return NextResponse.json(
        { error: `No se pudo leer downloadUrl: ${(e as Error).message}` },
        { status: 502 },
      );
    }
  } else {
    pdfBytes = await dlRes.arrayBuffer();
  }

  const safeName = sanitizeFilenameSegment(templateName);
  const stamp = new Date(doc.created_at || Date.now()).toISOString().slice(0, 10);
  const filename = `${safeName}-firmado-${stamp}.pdf`;

  return new NextResponse(pdfBytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
