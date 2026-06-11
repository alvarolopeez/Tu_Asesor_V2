import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildSimplePdf, sendForSignature } from "@/lib/documenso";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
);

/**
 * POST /api/proposals/[proposalId]/accept
 *
 * F4.3: Álvaro acepta una propuesta buyer_signed → genera el doc "Aceptación de
 * Propuesta" para firma del vendedor en Documenso.
 *
 * Body: { encargoId, sellerLeadId, sellerName, sellerEmail, propertyId? }
 *
 * Flujo:
 *   1. Verifica que la propuesta existe y está en buyer_signed.
 *   2. Genera un PDF mínimo de aceptación (variant legal).
 *   3. Envía a Documenso con el vendedor como único firmante.
 *   4. Inserta generated_document con __source_proposal_id en merged_data.
 *   5. El webhook manejará DOCUMENT_COMPLETED para marcar la propuesta como
 *      completed + evento 'Propuesta aceptada'.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ proposalId: string }> },
) {
  const { proposalId } = await params;
  if (!proposalId) {
    return NextResponse.json({ error: "Falta proposalId" }, { status: 400 });
  }

  let body: {
    encargoId?: string;
    sellerLeadId?: string;
    sellerName?: string;
    sellerEmail?: string;
    propertyId?: string | null;
    direccion?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { encargoId, sellerLeadId, sellerName, sellerEmail, propertyId, direccion } = body;

  if (!sellerEmail || !sellerName) {
    return NextResponse.json(
      { error: "El vendedor no tiene email registrado. Añádelo en su ficha." },
      { status: 422 },
    );
  }

  // 1. Verificar propuesta
  const { data: proposal, error: fetchErr } = await supabaseAdmin
    .from("generated_documents")
    .select("id, buyer_id, seller_lead_id, merged_data, signature_status, created_at")
    .eq("id", proposalId)
    .maybeSingle();
  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!proposal) {
    return NextResponse.json({ error: "Propuesta no encontrada" }, { status: 404 });
  }
  if (proposal.signature_status !== "buyer_signed") {
    return NextResponse.json(
      { error: `La propuesta no está pendiente de aceptar (estado: ${proposal.signature_status})` },
      { status: 409 },
    );
  }

  // Idempotencia: si ya existe una aceptación para esta propuesta, devolver ok.
  const { data: existing } = await supabaseAdmin
    .from("generated_documents")
    .select("id, documenso_id")
    .contains("merged_data", { __source_proposal_id: proposalId })
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ ok: true, acceptanceDocId: existing.id, alreadyExists: true });
  }

  const mergedData = (proposal.merged_data as Record<string, any>) || {};
  const buyerName: string =
    mergedData["comprador.nombre"] ||
    mergedData.__buyerName ||
    "el comprador";
  const propDate = proposal.created_at
    ? new Date(proposal.created_at).toLocaleDateString("es-ES")
    : "fecha desconocida";
  const inmueble = direccion || mergedData["inmueble.direccion"] || "el inmueble";

  // 2. Generar PDF de aceptación (variant legal, firma solo vendedor)
  const title = "Aceptación de Propuesta de Compraventa";
  const today = new Date().toLocaleDateString("es-ES");
  const pdfBody = `En Sevilla, a ${today}.

REUNIDOS

De una parte, D./Dña. ${sellerName}, en adelante «el/la Vendedor/a».

De otra parte, ${buyerName}, en adelante «el/la Comprador/a».

MANIFIESTAN

Que el/la Comprador/a presentó propuesta de compraventa sobre el inmueble sito en ${inmueble}, firmada el ${propDate}.

Que el/la Vendedor/a, tras revisar los términos y condiciones recogidos en dicha propuesta, presta su conformidad y ACEPTA la misma en todos sus términos.

ESTIPULACIONES

Primera. Ambas partes se comprometen a formalizar el correspondiente contrato privado de compraventa en el plazo acordado, según las condiciones estipuladas en la propuesta.

Segunda. La presente aceptación queda condicionada a la obtención de financiación por parte del/la Comprador/a, si así consta en la propuesta.

En prueba de conformidad, el/la Vendedor/a firma el presente documento.`;

  let pdfBytes: Uint8Array;
  let signatureBoxes: import("@/lib/documenso").SignatureBox[];
  try {
    const built = await buildSimplePdf(title, pdfBody, {
      variant: "legal",
      signatures: [{ who: "El/La Vendedor/a", sub: sellerName }],
    });
    pdfBytes = built.bytes;
    signatureBoxes = built.signatureBoxes;
  } catch (err: any) {
    return NextResponse.json({ error: `Error generando PDF: ${err.message}` }, { status: 500 });
  }

  // 3. Enviar a Documenso
  let documentId: string;
  try {
    const result = await sendForSignature({
      title,
      pdfBytes,
      recipients: [{ name: sellerName, email: sellerEmail }],
      documentCategory: "aceptacion_propuesta",
      signatureBoxes,
    });
    documentId = result.documentId;
  } catch (err: any) {
    return NextResponse.json({ error: `Error enviando a Documenso: ${err.message}` }, { status: 502 });
  }

  // 4. Insertar generated_document
  const { data: newDoc, error: insertErr } = await supabaseAdmin
    .from("generated_documents")
    .insert({
      template_id: null,
      seller_lead_id: sellerLeadId || proposal.seller_lead_id || null,
      buyer_id: proposal.buyer_id || null,
      property_id: propertyId || null,
      encargo_id: encargoId || null,
      merged_data: {
        __source_proposal_id: proposalId,
        __category: "aceptacion_propuesta",
        "vendedor.nombre": sellerName,
        "vendedor.email": sellerEmail,
      },
      documenso_id: documentId,
      signature_status: "sent",
    })
    .select("id")
    .single();

  if (insertErr) {
    console.error("[accept-proposal] insert generated_document:", insertErr.message);
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, acceptanceDocId: newDoc.id, documentId });
}
