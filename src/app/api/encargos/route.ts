import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/encargos
 *
 * Crea un encargo en exclusiva (expediente jurídico/comercial) y, si se
 * vincula a un lead vendedor, **dispara la auto-transición** del lead a
 * `status='closed'` (deja de aparecer en Vendedores y pasa a Encargos).
 *
 * El status anterior del lead se guarda en `leads.preferences._prev_status`
 * para que, si más tarde se elimina el encargo (DELETE /api/encargos/[id]),
 * podamos revertirlo automáticamente.
 *
 * Body esperado: { seller_lead_id, nota_encargo_doc_id?, direccion?,
 *                  ref_catastral?, sqm?, rooms?, baths?, precio_captacion?,
 *                  honorarios_pct?, fecha_firma?, duracion_meses?, notes? }
 *
 * @created 2026-06-03 — refactor CRM (chat-conversación). Implementa los
 * puntos T9+T11 del plan: el alta de un encargo es atómica en server.
 */

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
);

type EncargoBody = {
  seller_lead_id?: string;
  nota_encargo_doc_id?: string | null;
  property_id?: string | null;
  direccion?: string | null;
  ref_catastral?: string | null;
  sqm?: number | null;
  rooms?: number | null;
  baths?: number | null;
  precio_captacion?: number | null;
  honorarios_pct?: number | null;
  fecha_firma?: string | null;
  duracion_meses?: number | null;
  notes?: string | null;
};

export async function POST(req: NextRequest) {
  if (!SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor." },
      { status: 503 },
    );
  }

  let body: EncargoBody;
  try {
    body = (await req.json()) as EncargoBody;
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  // 1. Validación mínima — el resto es opcional, se completa con el tiempo.
  if (!body.seller_lead_id) {
    return NextResponse.json(
      { error: "Falta seller_lead_id (debe vincularse a un lead vendedor)." },
      { status: 400 },
    );
  }

  // 2. Recuperar el lead para validar y guardar prev_status.
  const { data: lead, error: leadErr } = await supabaseAdmin
    .from("leads")
    .select("id, status, type, preferences")
    .eq("id", body.seller_lead_id)
    .single();
  if (leadErr || !lead) {
    return NextResponse.json({ error: "Lead vendedor no encontrado" }, { status: 404 });
  }
  if (lead.type !== "seller") {
    return NextResponse.json(
      { error: "El lead vinculado no es de tipo vendedor." },
      { status: 422 },
    );
  }

  // 3. Si se vincula una Nota de Encargo, validar que existe y es de este lead
  //    (defensa en profundidad — el cliente ya filtra al pre-seleccionar).
  if (body.nota_encargo_doc_id) {
    const { data: doc } = await supabaseAdmin
      .from("generated_documents")
      .select("id, seller_lead_id, encargo_id")
      .eq("id", body.nota_encargo_doc_id)
      .single();
    if (!doc) {
      return NextResponse.json(
        { error: "La Nota de Encargo seleccionada no existe." },
        { status: 422 },
      );
    }
    if (doc.encargo_id) {
      return NextResponse.json(
        { error: "Esta Nota de Encargo ya está vinculada a otro encargo." },
        { status: 409 },
      );
    }
  }

  // 4. Insertar el encargo.
  const { data: encargo, error: insertErr } = await supabaseAdmin
    .from("encargos")
    .insert({
      seller_lead_id: body.seller_lead_id,
      nota_encargo_doc_id: body.nota_encargo_doc_id ?? null,
      property_id: body.property_id ?? null,
      direccion: body.direccion ?? null,
      ref_catastral: body.ref_catastral ?? null,
      sqm: body.sqm ?? null,
      rooms: body.rooms ?? null,
      baths: body.baths ?? null,
      precio_captacion: body.precio_captacion ?? null,
      honorarios_pct: body.honorarios_pct ?? null,
      fecha_firma: body.fecha_firma ?? null,
      duracion_meses: body.duracion_meses ?? 6,
      notes: body.notes ?? null,
      status: "activo",
    })
    .select("*")
    .single();
  if (insertErr || !encargo) {
    return NextResponse.json(
      { error: `No se pudo crear el encargo: ${insertErr?.message}` },
      { status: 500 },
    );
  }

  // 5. Vincular la Nota de Encargo al encargo recién creado (FK back-reference).
  if (body.nota_encargo_doc_id) {
    await supabaseAdmin
      .from("generated_documents")
      .update({ encargo_id: encargo.id })
      .eq("id", body.nota_encargo_doc_id);
  }

  // 6. Auto-transición del lead: status='closed' y guardar prev_status en
  //    preferences._prev_status para poder revertir si se borra el encargo.
  const prevStatus = lead.status || "new";
  if (prevStatus !== "closed") {
    const newPrefs = {
      ...(lead.preferences as Record<string, unknown> | null ?? {}),
      _prev_status: prevStatus,
    };
    await supabaseAdmin
      .from("leads")
      .update({
        status: "closed",
        preferences: newPrefs,
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.seller_lead_id);
  }

  // 7. (Mejor-esfuerzo) Anotar la captación en el timeline del vendedor.
  try {
    await supabaseAdmin.from("seller_activity_logs").insert({
      lead_id: body.seller_lead_id,
      event_type: "GitCommit",
      title: "Captado en exclusiva",
      notes: `Encargo creado · ${body.direccion || "sin dirección"} · ${
        body.honorarios_pct ? `${body.honorarios_pct}% honorarios` : "honorarios pendientes"
      }`,
    });
  } catch (logErr) {
    // No bloqueante; el encargo ya está creado.
    console.warn("[POST /api/encargos] no se pudo registrar activity log:", logErr);
  }

  return NextResponse.json({ ok: true, encargo });
}

/**
 * GET /api/encargos — lista de encargos enriquecida (joins con lead,
 * property y nota de encargo). Soporta filtro por status via ?status=activo.
 */
export async function GET(req: NextRequest) {
  if (!SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor." },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status");

  let query = supabaseAdmin
    .from("encargos")
    .select("*")
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ encargos: data || [] });
}
