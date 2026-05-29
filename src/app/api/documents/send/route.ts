import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  isDocumensoConfigured,
  buildSimplePdf,
  sendForSignature,
  type DocumensoRecipient,
} from "@/lib/documenso";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Re-combina la plantilla con el snapshot guardado en merged_data. */
function mergeBody(body: string, ctx: Record<string, string>): string {
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => ctx[key] ?? "________");
}

/**
 * POST /api/documents/send  { generatedDocumentId }
 * Genera el PDF del documento, lo sube a Documenso y lo envía a firmar.
 */
export async function POST(req: NextRequest) {
  let generatedDocumentId: string | undefined;
  try {
    ({ generatedDocumentId } = await req.json());
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }
  if (!generatedDocumentId) {
    return NextResponse.json({ error: "Falta generatedDocumentId" }, { status: 400 });
  }

  if (!isDocumensoConfigured()) {
    return NextResponse.json(
      { error: "Documenso no está configurado. Añade DOCUMENSO_API_URL y DOCUMENSO_API_TOKEN en Netlify y .env.local." },
      { status: 503 },
    );
  }

  try {
    const { data: doc, error } = await supabaseAdmin
      .from("generated_documents")
      .select("id, merged_data, template_id, document_templates(name, body)")
      .eq("id", generatedDocumentId)
      .single();
    if (error || !doc) throw new Error("Documento generado no encontrado");

    const template = (doc as any).document_templates;
    if (!template?.body) throw new Error("La plantilla asociada ya no existe");

    const ctx = (doc.merged_data || {}) as Record<string, string>;
    const text = mergeBody(template.body, ctx);

    // Destinatarios firmantes: vendedor y, si aplica, comprador (emails válidos)
    const recipients: DocumensoRecipient[] = [];
    if (EMAIL_RE.test(ctx["vendedor.email"] || "")) {
      recipients.push({ name: ctx["vendedor.nombre"] || "Vendedor", email: ctx["vendedor.email"] });
    }
    if (EMAIL_RE.test(ctx["comprador.email"] || "")) {
      recipients.push({ name: ctx["comprador.nombre"] || "Comprador", email: ctx["comprador.email"] });
    }
    if (recipients.length === 0) {
      return NextResponse.json(
        { error: "El documento no tiene ningún email válido (vendedor/comprador) para enviar a firmar." },
        { status: 422 },
      );
    }

    const pdfBytes = await buildSimplePdf(template.name || "Documento", text);
    const { documentId } = await sendForSignature({ title: template.name || "Documento", pdfBytes, recipients });

    await supabaseAdmin
      .from("generated_documents")
      .update({ documenso_id: documentId, signature_status: "sent", updated_at: new Date().toISOString() })
      .eq("id", generatedDocumentId);

    return NextResponse.json({ ok: true, documenso_id: documentId });
  } catch (err: any) {
    console.error("[Documenso send] error:", err?.message);
    return NextResponse.json({ error: err?.message || "Error enviando a firmar" }, { status: 500 });
  }
}
