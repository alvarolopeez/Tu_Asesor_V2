import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "crypto";
import { mapDocumensoEvent } from "@/lib/documenso";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

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
    const { data: updated, error } = await supabaseAdmin
      .from("generated_documents")
      .update({ signature_status: status, updated_at: new Date().toISOString() })
      .eq("documenso_id", String(documensoId))
      .select("id, template_id, document_templates(name)")
      .maybeSingle();
    if (error) throw error;

    // Aviso a Álvaro cuando un documento queda firmado
    if (status === "completed" && updated) {
      const advisor = process.env.ADVISOR_WHATSAPP_PHONE;
      if (advisor) {
        const name = (updated as any).document_templates?.name || "Documento";
        await sendWhatsAppMessage(
          advisor,
          `✅ Documento firmado en Documenso: "${name}". Ya puedes consultarlo en el CRM.`,
          { normalize: true },
        ).catch(() => {});
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[Documenso webhook] error:", err?.message);
    return NextResponse.json({ error: "Error procesando webhook" }, { status: 500 });
  }
}

// Algunos paneles validan el endpoint con un GET.
export async function GET() {
  return NextResponse.json({ ok: true, service: "documenso-webhook" });
}
