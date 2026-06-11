import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "crypto";
import { mapDocumensoEvent } from "@/lib/documenso";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
// Función pura compartida con el CRM: mismo criterio de categoría en client
// y server (F4.2 paso 0 lo exige así).
import { detectKind } from "@/components/admin/sections/DocumentsManager.utils";
import type { DocumentTemplate } from "@/components/admin/sections/DocumentsManager.types";

/** Comparación en tiempo constante (evita timing attacks). */
function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
);

/**
 * POST /api/webhooks/documenso
 * Recibe eventos de Documenso y actualiza generated_documents.signature_status.
 *
 * Verificación: cabecera con el secreto compartido configurado en Documenso
 * (DOCUMENSO_WEBHOOK_SECRET). Se aceptan variantes comunes del nombre de cabecera.
 */
export async function POST(req: NextRequest) {
  const expected = process.env.DOCUMENSO_WEBHOOK_SECRET || "";
  if (!expected) {
    return NextResponse.json({ error: "Webhook no configurado" }, { status: 503 });
  }

  // Documenso envía el secreto en la cabecera X-Documenso-Secret (texto plano).
  const provided = req.headers.get("x-documenso-secret") || "";
  if (!secretsMatch(provided, expected)) {
    return NextResponse.json({ error: "Firma de webhook inválida" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const event: string = body?.event || "";
  const documensoId = body?.payload?.id ?? body?.data?.id;
  const status = mapDocumensoEvent(event);

  if (!documensoId || !status) {
    // Evento que no nos interesa: respondemos 200 para que Documenso no reintente.
    return NextResponse.json({ ok: true, ignored: true });
  }

  try {
    // Dos consultas independientes (no hay FK declarada template_id→document_templates
    // que PostgREST pueda embedar de forma fiable — igual que en /api/documents/send).
    const { data: docRow, error: fetchErr } = await supabaseAdmin
      .from("generated_documents")
      .select("id, template_id, seller_lead_id, buyer_id, property_id")
      .eq("documenso_id", String(documensoId))
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!docRow) return NextResponse.json({ ok: true, ignored: true });

    let tplRow: { name: string | null; category: string | null } | null = null;
    if (docRow.template_id) {
      const { data: t } = await supabaseAdmin
        .from("document_templates")
        .select("name, category")
        .eq("id", docRow.template_id)
        .maybeSingle();
      tplRow = t ?? null;
    }

    // F4.2: bifurcar status ANTES de escribir.
    // Propuesta + DOCUMENT_COMPLETED → buyer_signed (D7: solo el comprador firma).
    // Cualquier otro caso → status sin cambios.
    let finalStatus = status;
    if (status === "completed" && tplRow) {
      const cat = (tplRow.category || "").toLowerCase();
      if (cat.includes("propuesta")) {
        finalStatus = "buyer_signed";
      }
    }

    const { error } = await supabaseAdmin
      .from("generated_documents")
      .update({ signature_status: finalStatus, updated_at: new Date().toISOString() })
      .eq("documenso_id", String(documensoId));
    if (error) throw error;

    // Aviso a Álvaro + auto-eventos F3.4 cuando el evento Documenso es 'completed'.
    // El aviso a Álvaro se mantiene incluso para buyer_signed (necesita saber que
    // el comprador firmó la propuesta y puede ir al CRM a aceptarla).
    if (status === "completed") {
      const advisor = process.env.ADVISOR_WHATSAPP_PHONE;
      if (advisor) {
        const docName = tplRow?.name || "Documento";
        const msg = finalStatus === "buyer_signed"
          ? `📝 El comprador firmó la propuesta: "${docName}". Revísala en el CRM y acepta la propuesta para continuar.`
          : `✅ Documento firmado en Documenso: "${docName}". Ya puedes consultarlo en el CRM.`;
        await sendWhatsAppMessage(advisor, msg, { normalize: true }).catch(() => {});
      }

      // F3.4: auto-eventos de firma en los timelines.
      // Fire-and-soft. Idempotente (dedupe por ref doc en notes).
      const completedDoc: CompletedDocRow = {
        id: docRow.id,
        seller_lead_id: docRow.seller_lead_id,
        buyer_id: docRow.buyer_id,
        property_id: docRow.property_id,
        document_templates: tplRow,
      };
      await insertSignatureEvents(completedDoc).catch((err) =>
        console.warn("[Documenso webhook] auto-eventos de firma fallaron:", err?.message || err),
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[Documenso webhook] error:", err?.message);
    return NextResponse.json({ error: "Error procesando webhook" }, { status: 500 });
  }
}

interface CompletedDocRow {
  id: string;
  seller_lead_id: string | null;
  buyer_id: string | null;
  property_id: string | null;
  document_templates: { name: string | null; category: string | null } | null;
}

/**
 * F3.4: eventos de firma por categoría de plantilla (criterio detectKind):
 *   nota      → 'Nota de Encargo firmada'   → timeline del vendedor
 *   propuesta → 'Propuesta firmada'         → comprador + vendedor
 *   contrato  → 'Contrato privado firmado'  → comprador + vendedor
 * Los eventos del vendedor llevan lead_id + property_id (filtro del encargo, F3.3).
 */
async function insertSignatureEvents(doc: CompletedDocRow): Promise<void> {
  const tpl = doc.document_templates;
  const kind = detectKind({ name: tpl?.name || "", category: tpl?.category || "" } as DocumentTemplate);

  const marker = `ref doc: ${doc.id}`;
  const events: { table: "buyer_activity_logs" | "seller_activity_logs"; eventType: string; title: string }[] = [];

  if (kind === "nota" && doc.seller_lead_id) {
    events.push({ table: "seller_activity_logs", eventType: "Nota de Encargo firmada", title: tpl?.name || "Nota de Encargo firmada" });
  } else if (kind === "propuesta" || kind === "contrato") {
    const eventType = kind === "propuesta" ? "Propuesta firmada" : "Contrato privado firmado";
    const title = tpl?.name || eventType;
    if (doc.buyer_id) events.push({ table: "buyer_activity_logs", eventType, title });
    if (doc.seller_lead_id) events.push({ table: "seller_activity_logs", eventType, title });
  }

  for (const ev of events) {
    const ownerColumn = ev.table === "buyer_activity_logs" ? "buyer_id" : "lead_id";
    const ownerId = ev.table === "buyer_activity_logs" ? doc.buyer_id! : doc.seller_lead_id!;

    // Dedupe ante reintentos del webhook: mismo doc + mismo tipo + mismo dueño.
    const { data: existing } = await supabaseAdmin
      .from(ev.table)
      .select("id")
      .eq(ownerColumn, ownerId)
      .eq("event_type", ev.eventType)
      .ilike("notes", `%${marker}%`)
      .limit(1);
    if (existing && existing.length > 0) continue;

    const { error } = await supabaseAdmin.from(ev.table).insert({
      [ownerColumn]: ownerId,
      event_type: ev.eventType,
      title: ev.title,
      notes: `Firmado en Documenso (${marker}).`,
      event_date: new Date().toISOString(),
      property_id: doc.property_id || null,
    });
    if (error) console.warn(`[Documenso webhook] insert evento en ${ev.table} falló:`, error.message);
  }
}

// Algunos paneles validan el endpoint con un GET.
export async function GET() {
  return NextResponse.json({ ok: true, service: "documenso-webhook" });
}
