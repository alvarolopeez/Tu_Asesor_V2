import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * PATCH /api/encargos/[id]   { ...fields }
 * DELETE /api/encargos/[id]
 *
 * PATCH actualiza un encargo (status, fechas, anexos vinculados, notes…).
 *
 * DELETE elimina el encargo y, si tenía vínculo a lead, **revierte la
 * transición**: el lead recupera el `_prev_status` que guardamos al crear el
 * encargo (vuelve a aparecer en el módulo Vendedores). Cascade en BD elimina
 * `encargo_documents`; quitamos manualmente el back-link en
 * `generated_documents.encargo_id` (la columna usa ON DELETE SET NULL, pero
 * lo hacemos explícito para que el efecto sea inmediato).
 *
 * @created 2026-06-03 — refactor CRM, parte de T11 (auto-transición lead).
 */

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
);

function noServiceRole() {
  return NextResponse.json(
    { error: "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor." },
    { status: 503 },
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!SERVICE_ROLE_KEY) return noServiceRole();
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

  let body: Record<string, any> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  // Whitelist de campos editables. Ignoramos cualquier intento de cambiar
  // seller_lead_id (eso requeriría re-disparar la lógica de transición).
  const ALLOWED = [
    "nota_encargo_doc_id",
    "property_id",
    "direccion",
    "ref_catastral",
    "sqm",
    "rooms",
    "baths",
    "precio_captacion",
    "honorarios_pct",
    "fecha_firma",
    "duracion_meses",
    "status",
    "notes",
  ] as const;
  const update: Record<string, unknown> = {};
  for (const k of ALLOWED) if (k in body) update[k] = body[k];
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("encargos")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Si se cambia la Nota de Encargo vinculada, actualizar el back-reference.
  if ("nota_encargo_doc_id" in body) {
    // Limpia el vínculo anterior y aplica el nuevo.
    await supabaseAdmin
      .from("generated_documents")
      .update({ encargo_id: null })
      .eq("encargo_id", id);
    if (body.nota_encargo_doc_id) {
      await supabaseAdmin
        .from("generated_documents")
        .update({ encargo_id: id })
        .eq("id", body.nota_encargo_doc_id);
    }
  }

  return NextResponse.json({ ok: true, encargo: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!SERVICE_ROLE_KEY) return noServiceRole();
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

  // 1. Leer el encargo para conocer su lead asociado (si lo hay).
  const { data: encargo, error: readErr } = await supabaseAdmin
    .from("encargos")
    .select("id, seller_lead_id")
    .eq("id", id)
    .single();
  if (readErr || !encargo) {
    return NextResponse.json({ error: "Encargo no encontrado" }, { status: 404 });
  }

  // 2. Si hay lead asociado, revertir status='closed' → prev_status.
  if (encargo.seller_lead_id) {
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("id, status, preferences")
      .eq("id", encargo.seller_lead_id)
      .single();
    if (lead) {
      const prefs = (lead.preferences as Record<string, unknown> | null) ?? {};
      const prevStatus = (prefs._prev_status as string) || "new";
      const { _prev_status, ...remainingPrefs } = prefs; // strip
      // Sólo revertimos si seguimos en 'closed' (defensa: si el usuario
      // cambió a otro estado manualmente, respetamos su elección).
      const update: Record<string, unknown> = {
        preferences: remainingPrefs,
        updated_at: new Date().toISOString(),
      };
      if (lead.status === "closed") update.status = prevStatus;
      await supabaseAdmin.from("leads").update(update).eq("id", lead.id);
    }
  }

  // 3. Limpiar back-reference de generated_documents (ON DELETE SET NULL ya
  //    lo hace en cascada, pero lo hacemos explícito por claridad).
  await supabaseAdmin
    .from("generated_documents")
    .update({ encargo_id: null })
    .eq("encargo_id", id);

  // 4. Borrar el encargo (cascade limpia encargo_documents).
  const { error: delErr } = await supabaseAdmin.from("encargos").delete().eq("id", id);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
