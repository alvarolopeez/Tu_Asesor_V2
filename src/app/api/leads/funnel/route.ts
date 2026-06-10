import { NextRequest, NextResponse } from "next/server";
import { advanceLeadStatus, revertVisitStatus } from "@/lib/leadFunnel";

/**
 * POST /api/leads/funnel
 *
 * Puente cliente → helper de funnel (Brief #007 T2.3/T6.2). El CRM corre en
 * el navegador con el cliente anon y el helper necesita service-role, así
 * que las transiciones manuales (cancelar cita desde el calendario, log de
 * 'Valoración' en el timeline del vendedor) pasan por aquí.
 *
 * Body: { leadId: string, action: 'revert_visit' }
 *     | { leadId: string, action: 'advance', target: 'contacted' | 'qualified' }
 *
 * Mismo patrón de acceso que POST /api/encargos (sin API key; el helper es
 * forward-only/idempotente y no expone datos — solo mueve status dentro del
 * funnel, nunca a closed/lost).
 */

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

type FunnelBody = {
  leadId?: string;
  action?: "revert_visit" | "advance";
  target?: "contacted" | "qualified";
};

export async function POST(req: NextRequest) {
  if (!SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor." },
      { status: 503 },
    );
  }

  let body: FunnelBody;
  try {
    body = (await req.json()) as FunnelBody;
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  if (!body.leadId || typeof body.leadId !== "string") {
    return NextResponse.json({ error: "Falta leadId" }, { status: 400 });
  }

  if (body.action === "revert_visit") {
    await revertVisitStatus(body.leadId);
    return NextResponse.json({ ok: true, action: "revert_visit" });
  }

  if (body.action === "advance") {
    if (body.target !== "contacted" && body.target !== "qualified") {
      return NextResponse.json(
        { error: "target debe ser 'contacted' o 'qualified'" },
        { status: 400 },
      );
    }
    await advanceLeadStatus(body.leadId, body.target);
    return NextResponse.json({ ok: true, action: "advance", target: body.target });
  }

  return NextResponse.json(
    { error: "action debe ser 'revert_visit' o 'advance'" },
    { status: 400 },
  );
}
