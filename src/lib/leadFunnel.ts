/**
 * Helper de funnel de leads — Brief #007 T1.2.
 *
 * Centraliza las transiciones automáticas de `leads.status` para el funnel
 * del COMPRADOR (6 estados): new → contacted → qualified → visit_scheduled,
 * con `closed` y `lost` como TERMINALES que este módulo no toca jamás.
 *
 * El funnel del VENDEDOR (4 estados manuales, decisión 3 del brief) NO usa
 * estas funciones salvo `advanceLeadStatus(id, 'contacted')` (T6.2).
 *
 * ⚠️ Reversión de visita: el estado previo se guarda en
 * `preferences._visit_prev_status` — NO en `_prev_status`, que ya usa el
 * flujo de encargos (POST /api/encargos y DELETE /api/encargos/[id]) para
 * SU propia reversión. Ver SYNC_AI.md 2026-06-10.
 *
 * Todas las funciones son fire-and-soft: capturan errores con console.warn
 * y nunca rompen el flujo llamante (reservas, chatbot, webhooks).
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);

export const FUNNEL_ORDER = ['new', 'contacted', 'qualified', 'visit_scheduled'] as const;
// closed y lost son TERMINALES: ninguna función de este helper los toca jamás.
const TERMINAL_STATUSES = ['closed', 'lost'];

const VISIT_PREV_KEY = '_visit_prev_status';

type LeadRow = {
  status: string | null;
  preferences: Record<string, unknown> | null;
};

async function fetchLead(
  db: SupabaseClient,
  leadId: string,
): Promise<LeadRow | null> {
  const { data, error } = await db
    .from('leads')
    .select('status, preferences')
    .eq('id', leadId)
    .single();
  if (error || !data) {
    console.warn(`[leadFunnel] no se pudo leer lead ${leadId}:`, error?.message);
    return null;
  }
  return data as LeadRow;
}

/**
 * Avanza el lead solo hacia delante (nunca degrada). No-op si el status
 * actual es terminal (closed/lost) o ya está en `target` o más avanzado.
 */
export async function advanceLeadStatus(
  leadId: string,
  target: 'contacted' | 'qualified',
  client?: SupabaseClient,
): Promise<void> {
  const db = client || supabaseAdmin;
  try {
    const lead = await fetchLead(db, leadId);
    if (!lead) return;

    const current = lead.status || 'new';
    if (TERMINAL_STATUSES.includes(current)) return;

    const currentIdx = FUNNEL_ORDER.indexOf(current as (typeof FUNNEL_ORDER)[number]);
    const targetIdx = FUNNEL_ORDER.indexOf(target);
    if (currentIdx >= targetIdx) return; // forward-only: nunca degrada

    const { error } = await db
      .from('leads')
      .update({ status: target, updated_at: new Date().toISOString() })
      .eq('id', leadId);
    if (error) {
      console.warn(`[leadFunnel] advance ${leadId} → ${target} falló:`, error.message);
    }
  } catch (err) {
    console.warn(`[leadFunnel] advanceLeadStatus(${leadId}) threw:`, err);
  }
}

/**
 * Pasa el lead a visit_scheduled guardando el estado actual en
 * `preferences._visit_prev_status`. No-op si ya está en
 * visit_scheduled/closed/lost.
 */
export async function setVisitScheduled(
  leadId: string,
  client?: SupabaseClient,
): Promise<void> {
  const db = client || supabaseAdmin;
  try {
    const lead = await fetchLead(db, leadId);
    if (!lead) return;

    const current = lead.status || 'new';
    if (current === 'visit_scheduled' || TERMINAL_STATUSES.includes(current)) return;

    const newPrefs = {
      ...(lead.preferences ?? {}),
      [VISIT_PREV_KEY]: current,
    };
    const { error } = await db
      .from('leads')
      .update({
        status: 'visit_scheduled',
        preferences: newPrefs,
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId);
    if (error) {
      console.warn(`[leadFunnel] setVisitScheduled ${leadId} falló:`, error.message);
    }
  } catch (err) {
    console.warn(`[leadFunnel] setVisitScheduled(${leadId}) threw:`, err);
  }
}

/**
 * Revierte visit_scheduled → `preferences._visit_prev_status` (default
 * 'contacted' si no hay clave). SOLO si el status actual es visit_scheduled
 * Y el lead no tiene OTRA cita activa (appointments pending/confirmed con
 * scheduled_at >= ahora). Limpia la clave tras revertir.
 */
export async function revertVisitStatus(
  leadId: string,
  client?: SupabaseClient,
): Promise<void> {
  const db = client || supabaseAdmin;
  try {
    const lead = await fetchLead(db, leadId);
    if (!lead) return;

    if (lead.status !== 'visit_scheduled') return;

    // ¿Sigue habiendo otra cita activa futura? Entonces el estado es correcto.
    const { data: active } = await db
      .from('appointments')
      .select('id')
      .eq('lead_id', leadId)
      .in('status', ['pending', 'confirmed'])
      .gte('scheduled_at', new Date().toISOString())
      .limit(1);
    if (active && active.length > 0) return;

    const prefs = (lead.preferences ?? {}) as Record<string, unknown>;
    const storedPrev = prefs[VISIT_PREV_KEY] as string | undefined;
    const prevStatus =
      storedPrev && FUNNEL_ORDER.includes(storedPrev as (typeof FUNNEL_ORDER)[number])
        ? storedPrev
        : 'contacted';

    const { [VISIT_PREV_KEY]: _stripped, ...remainingPrefs } = prefs;
    const { error } = await db
      .from('leads')
      .update({
        status: prevStatus,
        preferences: remainingPrefs,
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId);
    if (error) {
      console.warn(`[leadFunnel] revertVisitStatus ${leadId} falló:`, error.message);
    }
  } catch (err) {
    console.warn(`[leadFunnel] revertVisitStatus(${leadId}) threw:`, err);
  }
}
