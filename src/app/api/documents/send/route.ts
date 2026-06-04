import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  isDocumensoConfigured,
  buildSimplePdf,
  sendForSignature,
  type DocumensoRecipient,
} from "@/lib/documenso";
import { docLayout } from "@/lib/brandedDoc";

// El service role key es obligatorio: las tablas `generated_documents` /
// `document_templates` tienen RLS que solo permite el rol `authenticated`. Si
// el servidor cae al anon key, las lecturas devuelven 0 filas y el flujo falla
// con un confuso "Documento generado no encontrado". Por eso NO hacemos
// fallback al anon key aquí; exigimos el service role.
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const HAS_SERVICE_ROLE = Boolean(SERVICE_ROLE_KEY);

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
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

  if (!HAS_SERVICE_ROLE) {
    return NextResponse.json(
      { error: "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor (Netlify). Sin ella, las políticas RLS impiden leer el documento. Añádela en las variables de entorno de Netlify y vuelve a desplegar." },
      { status: 503 },
    );
  }

  if (!isDocumensoConfigured()) {
    return NextResponse.json(
      { error: "Documenso no está configurado. Añade DOCUMENSO_API_URL y DOCUMENSO_API_TOKEN en Netlify y .env.local." },
      { status: 503 },
    );
  }

  try {
    // Dos consultas independientes (sin embed PostgREST): no existe FK declarada
    // entre generated_documents.template_id y document_templates.id, así que el
    // join embebido falla. Esto es más robusto y no depende del schema.
    const { data: doc, error } = await supabaseAdmin
      .from("generated_documents")
      .select("id, merged_data, template_id")
      .eq("id", generatedDocumentId)
      .single();
    if (error || !doc) throw new Error("Documento generado no encontrado");

    if (!doc.template_id) throw new Error("El documento no tiene plantilla asociada");
    const { data: template, error: tplError } = await supabaseAdmin
      .from("document_templates")
      .select("name, body, category")
      .eq("id", doc.template_id)
      .single();
    if (tplError || !template?.body) throw new Error("La plantilla asociada ya no existe");

    const merged = (doc.merged_data || {}) as Record<string, any>;
    const ctx = merged as Record<string, string>;
    const text = mergeBody(template.body, ctx);

    // Firmantes: preferimos la lista explícita guardada al generar (varios
    // propietarios); si no existe, caemos a vendedor/comprador del contexto.
    const recipients: DocumensoRecipient[] = [];
    const explicit = Array.isArray(merged.__recipients) ? merged.__recipients : [];
    for (const r of explicit) {
      if (r && EMAIL_RE.test(r.email || "")) recipients.push({ name: r.name || "Firmante", email: r.email });
    }
    if (recipients.length === 0) {
      if (EMAIL_RE.test(ctx["vendedor.email"] || "")) {
        recipients.push({ name: ctx["vendedor.nombre"] || "Vendedor", email: ctx["vendedor.email"] });
      }
      if (EMAIL_RE.test(ctx["comprador.email"] || "")) {
        recipients.push({ name: ctx["comprador.nombre"] || "Comprador", email: ctx["comprador.email"] });
      }
    }
    if (recipients.length === 0) {
      return NextResponse.json(
        { error: "El documento no tiene ningún email válido (vendedor/comprador) para enviar a firmar." },
        { status: 422 },
      );
    }

    const clientLabel = ctx["comprador.nombre"] || ctx["vendedor.nombre"] || undefined;
    const sellerName = (merged as any).__sellers?.[0]?.nombre || ctx["vendedor.nombre"];
    const buyerName = (merged as any).__owners?.[0]?.nombre || ctx["comprador.nombre"];
    const layout = docLayout(template.category, clientLabel, { sellerName, buyerName });
    const { bytes: pdfBytes, signatureBoxes } = await buildSimplePdf(template.name || "Documento", text, layout);
    const { documentId } = await sendForSignature({
      title: template.name || "Documento",
      pdfBytes,
      recipients,
      // La firma del asesor (Álvaro) se prepend AUTOMÁTICAMENTE como
      // signingOrder: 1 dentro de `sendForSignature`, salvo en documentos
      // unilaterales del comprador (KYC / Parte de Visita), donde la
      // categoría dispara la exclusión.
      documentCategory: template.category,
      // Coordenadas reales de las líneas de firma → campos bien colocados (#1).
      signatureBoxes,
    });

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
