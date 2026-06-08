/**
 * Lógica de agendamiento del chatbot — Paula.
 *
 * @rewritten 2026-06-06 brief #002 T4 FIX: shape real de visitable_slots
 *
 * IMPORTANTE — shape REAL de `properties.features.visitable_slots`:
 *
 *   {
 *     "days":  ["Lunes","Martes",…],              // catálogo de días activos
 *     "slots": ["10:00","10:30",…],               // catálogo global de horas
 *     "schedule": {
 *       "Lunes":     ["10:00","11:00","12:00","16:00","17:00","18:00"],
 *       "Martes":    [...], "Miércoles": [...], "Jueves": [...],
 *       "Viernes":   [...], "Sábado": [], "Domingo": []
 *     }
 *   }
 *
 * Es un schedule **recurrente por día de la semana**, NO una lista de fechas
 * concretas. La versión anterior asumía `[{date, slots[]}]` y rompía con
 * `slice is not a function` → el .catch del engine devolvía null y la
 * respuesta del LLM (que no es fiable para horas reales) salía al cliente.
 *
 * Capacidades:
 *   1. Verifica que el inmueble tenga `schedule` configurado; si no, escala.
 *   2. Parsea día (lunes/martes/.../mañana/dd-mm) + hora del mensaje (o de
 *      `data_extracted.preferred_date` ISO si el LLM colaboró).
 *   3. Recuerda en `metadata.scheduling.pending_day` el día ya mencionado
 *      para resolver respuestas tipo "11:30" en el siguiente turno.
 *   4. Si la hora cae en `schedule[díaSemana]` y NO hay appointment
 *      colisionando → crea la cita (con entrevista si lead nuevo).
 *   5. Si la hora no está en el schedule del día → ofrece las libres del
 *      mismo día. Si el día no tiene ninguna libre → ofrece próximos 3 días.
 *   6. Mantiene la entrevista de 3 preguntas con `interview_state`.
 */

import { createClient } from '@supabase/supabase-js';
import { sendWhatsAppTemplate } from '@/lib/whatsapp';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ADVISOR_PHONE = process.env.ADVISOR_WHATSAPP_PHONE || '';
const PUBLIC_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://tuasesoralvaro.com';

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);

// ─── Tipos del shape REAL ──────────────────────────────────────────────────

export type SpanishDay = 'Lunes' | 'Martes' | 'Miércoles' | 'Jueves' | 'Viernes' | 'Sábado' | 'Domingo';

export interface VisitableSchedule {
  days?: string[];
  slots?: string[];
  schedule?: Partial<Record<SpanishDay, string[]>>;
}

export type InterviewStep = 1 | 2 | 3;

export interface InterviewAnswers {
  savings?: number;
  funding?: 'Necesito estudio' | 'Estudio hecho' | 'Preconcedida' | 'Al contado';
  tipo_compra?: 'habitual' | 'inversion';
}

export interface InterviewState {
  step: InterviewStep;
  answers: InterviewAnswers;
  /** Reintentos consumidos por respuestas no parseables. Tras 3 → ESCALATE. */
  attempts?: number;
  target: {
    propertyId: string;
    propertyTitle: string;
    /** "Utrera, Sevilla" extraído de features.address. Puede ser null. */
    propertyZone?: string | null;
    scheduledAt: string;
    leadId: string;
    leadName: string;
    leadPhone: string;
  };
  startedAt: string;
}

/**
 * Extrae zona corta legible desde un address tipo
 * "Calle Goya, Utrera, Sevilla, Andalucía, 41710, España" → "Utrera, Sevilla".
 * Devuelve null si no hay address o no se puede inferir.
 */
export function shortZoneFromAddress(address?: string | null): string | null {
  if (!address || typeof address !== 'string') return null;
  const parts = address.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const out: string[] = [];
  for (let i = 1; i < parts.length && out.length < 2; i++) {
    const p = parts[i];
    if (/^\d{4,5}$/.test(p)) continue;
    if (/^(Andaluc[ií]a|Espa[ñn]a)$/i.test(p)) continue;
    out.push(p);
  }
  return out.length > 0 ? out.join(', ') : null;
}

/**
 * Formatea el nombre de una propiedad para los mensajes del bot.
 * Cumple la regla del system prompt: NUNCA mencionar título sin zona.
 */
export function formatPropertyName(title: string, zone?: string | null): string {
  return zone ? `"${title}, en ${zone}"` : `"${title}"`;
}

export interface SchedulingHookInput {
  conversationId: string;
  leadName?: string;
  leadPhone?: string;
  userMessage: string;
  extracted: {
    name?: string | null;
    phone?: string | null;
    preferred_date?: string | null;
    property_interest?: string | null;
  };
}

export interface SchedulingHookResult {
  response: string;
  shouldEscalate: boolean;
  intent:
    | 'schedule_visit'
    | 'schedule_visit_interview'
    | 'schedule_visit_confirmed'
    | 'schedule_visit_unavailable'
    | 'ESCALATE';
}

// ─── Helpers de fecha/día ──────────────────────────────────────────────────

const SPANISH_DAYS_ORDER: SpanishDay[] = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** Mapa texto normalizado → SpanishDay canónico. Tolera tildes y minúsculas. */
const DAY_LOOKUP: Record<string, SpanishDay> = {
  lunes: 'Lunes',
  martes: 'Martes',
  miercoles: 'Miércoles',
  miércoles: 'Miércoles',
  jueves: 'Jueves',
  viernes: 'Viernes',
  sabado: 'Sábado',
  sábado: 'Sábado',
  domingo: 'Domingo',
};

function pad2(n: number): string { return n < 10 ? `0${n}` : String(n); }

function normalizeText(s: string): string {
  // Quita diacríticos (rango Unicode combining U+0300–U+036F).
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Devuelve YYYY-MM-DD para HOY en Europa/Madrid.
 * Crítico para que el bot calcule "el próximo martes" sobre HOY-Madrid,
 * no sobre la fecha UTC del runtime (que puede caer al día siguiente
 * después de las 23:00 invierno / 22:00 verano).
 */
export function todayDateKey(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  return parts; // en-CA ya devuelve YYYY-MM-DD
}

/** Avanza dateKey N días manteniendo formato YYYY-MM-DD. */
function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

function dayOfWeekFor(dateKey: string): SpanishDay {
  const [y, m, d] = dateKey.split('-').map(Number);
  // Usamos mediodía UTC del día para que el getUTCDay() no tropiece
  // con cambios de DST en los bordes 00:00.
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return SPANISH_DAYS_ORDER[dt.getUTCDay()];
}

/**
 * Construye un ISO UTC desde fecha+hora **LOCAL Madrid**.
 *
 * Fix del bug "le dije 12pm, me confirmó 13pm": antes guardábamos como
 * `${dateKey}T${timeKey}:00.000Z` (UTC literal) y al renderizar en
 * Europa/Madrid sumaba el offset (+1 en invierno, +2 en verano) → la hora
 * salía adelantada en la confirmación.
 *
 * Estrategia: probamos los dos offsets posibles de Madrid (+1 y +2) y
 * elegimos el que, al formatearse en Europa/Madrid, devuelve la hora
 * que el usuario pidió. Funciona pase lo que pase en transiciones DST.
 */
export function madridLocalToUtcIso(dateKey: string, timeKey: string): string {
  const [Y, M, D] = dateKey.split('-').map(Number);
  const [h, mm] = timeKey.split(':').map(Number);
  for (const offsetHours of [2, 1]) {
    const utc = new Date(Date.UTC(Y, M - 1, D, h - offsetHours, mm));
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Madrid',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
    if (fmt.format(utc) === `${pad2(h)}:${pad2(mm)}`) {
      return utc.toISOString();
    }
  }
  // Fallback poco probable (transición DST exacta). Asume +1.
  return new Date(Date.UTC(Y, M - 1, D, h - 1, mm)).toISOString();
}

/** Hora en Europa/Madrid (`HH:MM`) para un timestamp ISO UTC. */
function hourInMadrid(utcIso: string): string {
  const dt = new Date(utcIso);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(dt);
}

/** Próximo lunes/martes/... desde hoy (incluido HOY si coincide). */
function nextDateKeyForDay(targetDay: SpanishDay): string {
  const today = todayDateKey();
  for (let i = 0; i < 14; i++) {
    const k = addDays(today, i);
    if (dayOfWeekFor(k) === targetDay) return k;
  }
  return today; // safety
}

/** Detecta un día semana en el texto del usuario. */
function parseSpanishDayOfWeek(text: string): SpanishDay | null {
  const norm = normalizeText(text);
  // Frases relativas primero.
  if (/\bpasado\s*man[ñn]ana\b/.test(norm)) {
    return dayOfWeekFor(addDays(todayDateKey(), 2));
  }
  if (/\bman[ñn]ana\b/.test(norm)) {
    return dayOfWeekFor(addDays(todayDateKey(), 1));
  }
  if (/\bhoy\b/.test(norm)) {
    return dayOfWeekFor(todayDateKey());
  }
  for (const key of Object.keys(DAY_LOOKUP)) {
    if (new RegExp(`\\b${key}\\b`).test(norm)) return DAY_LOOKUP[key];
  }
  return null;
}

interface ParsedDateTime {
  dateKey: string;
  /** null si solo se detectó día sin hora. */
  timeKey: string | null;
}

/**
 * Sanity check: descartamos fechas pasadas o demasiado en el futuro.
 * Limita las "alucinaciones" del LLM (Gemini Flash 1.5 con cutoff 2024
 * devuelve fechas en `2024-XX-XX` como "el próximo martes").
 */
function isReasonableDateKey(dateKey: string): boolean {
  const today = todayDateKey();
  const limit = addDays(today, 90);
  return dateKey >= today && dateKey <= limit;
}

/**
 * Parsea fecha + hora del input. Prioridad:
 *   1. ISO completo (`2026-06-10T11:30`).
 *   2. dd/mm o dd-mm (+ opcional año + hora hh:mm).
 *   3. Día semana español ("martes", "el próximo martes", "mañana") + hora opcional.
 *   4. Solo hora hh:mm → devuelve {dateKey:null, timeKey}.
 */
export function parseDateTime(input: string | null | undefined): ParsedDateTime | null {
  if (!input) return null;
  const txt = input.trim();

  // 1. ISO completo o solo fecha ISO.
  const isoMatch = txt.match(/(\d{4}-\d{2}-\d{2})[T\s](\d{1,2}):(\d{2})/);
  if (isoMatch) {
    const dateKey = isoMatch[1];
    if (isReasonableDateKey(dateKey)) {
      return { dateKey, timeKey: `${pad2(Number(isoMatch[2]))}:${isoMatch[3]}` };
    }
    // Si el LLM puso un año del pasado, ignoramos la fecha y rescatamos solo la hora.
    return { dateKey: '', timeKey: `${pad2(Number(isoMatch[2]))}:${isoMatch[3]}` };
  }
  const isoDateOnly = txt.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (isoDateOnly && isReasonableDateKey(isoDateOnly[1])) return { dateKey: isoDateOnly[1], timeKey: null };

  // 2. dd/mm[/yyyy] + hh:mm.
  const dmMatch = txt.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
  const hmMatch = txt.match(/\b(\d{1,2})[:\.h](\d{2})\b/);
  let dateKey: string | null = null;
  let timeKey: string | null = null;

  if (dmMatch) {
    const day = Number(dmMatch[1]);
    const month = Number(dmMatch[2]);
    const today = todayDateKey();
    const currentYear = Number(today.slice(0, 4));
    let year = dmMatch[3]
      ? (dmMatch[3].length === 2 ? 2000 + Number(dmMatch[3]) : Number(dmMatch[3]))
      : currentYear;
    let cand = `${year}-${pad2(month)}-${pad2(day)}`;
    // Si el usuario no puso año y la fecha del año actual ya pasó,
    // asumir el año siguiente. Y si el LLM puso un año del pasado y
    // la fecha sale del rango razonable, forzamos al año actual o siguiente.
    if (cand < today) {
      year = currentYear;
      cand = `${year}-${pad2(month)}-${pad2(day)}`;
      if (cand < today) {
        year = currentYear + 1;
        cand = `${year}-${pad2(month)}-${pad2(day)}`;
      }
    }
    dateKey = isReasonableDateKey(cand) ? cand : null;
  }

  if (hmMatch) {
    timeKey = `${pad2(Number(hmMatch[1]))}:${hmMatch[2]}`;
  } else {
    // "a las 11" sin minutos → 11:00.
    const hOnly = txt.match(/\b(?:a\s*las|sobre\s*las|hacia\s*las|las)\s*(\d{1,2})\b/i);
    if (hOnly) timeKey = `${pad2(Number(hOnly[1]))}:00`;
  }

  // 3. Día semana en castellano si no encontramos fecha.
  if (!dateKey) {
    const day = parseSpanishDayOfWeek(txt);
    if (day) dateKey = nextDateKeyForDay(day);
  }

  if (!dateKey && !timeKey) return null;

  return { dateKey: dateKey || '', timeKey };
}

// ─── Metadata helpers ──────────────────────────────────────────────────────

async function getConversationMetadata(conversationId: string): Promise<Record<string, any>> {
  const { data } = await supabaseAdmin
    .from('chatbot_conversations')
    .select('metadata, lead_id, wa_phone_number')
    .eq('id', conversationId)
    .single();
  return (data?.metadata as Record<string, any>) || {};
}

async function setConversationMetadata(conversationId: string, patch: Record<string, any>): Promise<void> {
  const current = await getConversationMetadata(conversationId);
  await supabaseAdmin
    .from('chatbot_conversations')
    .update({ metadata: { ...current, ...patch } })
    .eq('id', conversationId);
}

export async function getInterviewState(conversationId: string): Promise<InterviewState | null> {
  const meta = await getConversationMetadata(conversationId);
  return (meta?.interview_state as InterviewState) || null;
}

async function clearInterviewState(conversationId: string): Promise<void> {
  await setConversationMetadata(conversationId, { interview_state: null });
}

/** Alias público para uso del engine (escape keyword durante entrevista). */
export async function clearInterviewStateFromEngine(conversationId: string): Promise<void> {
  await clearInterviewState(conversationId);
  await setSchedulingHint(conversationId, { pending_day: null });
}

async function getSchedulingHint(conversationId: string): Promise<{ pending_day?: string } | null> {
  const meta = await getConversationMetadata(conversationId);
  return (meta?.scheduling as { pending_day?: string }) || null;
}

async function setSchedulingHint(conversationId: string, patch: { pending_day?: string | null }): Promise<void> {
  const meta = await getConversationMetadata(conversationId);
  const current = (meta?.scheduling as Record<string, any>) || {};
  await setConversationMetadata(conversationId, { scheduling: { ...current, ...patch } });
}

// ─── Resolución de la propiedad de interés ─────────────────────────────────

async function resolveTargetProperty(
  conversationId: string,
  extracted: SchedulingHookInput['extracted'],
): Promise<{ id: string; title: string; zone: string | null; price: number; schedule: VisitableSchedule | null } | null> {
  const meta = await getConversationMetadata(conversationId);

  async function fetchById(id: string) {
    const { data } = await supabaseAdmin
      .from('properties')
      .select('id, title, price, features')
      .eq('id', id)
      .single();
    if (!data) return null;
    const features = (data.features as any) || {};
    const slots = features.visitable_slots as VisitableSchedule | undefined;
    return {
      id: data.id,
      title: data.title,
      zone: shortZoneFromAddress(features.address),
      price: Number(data.price || 0),
      schedule: (slots && typeof slots === 'object' ? slots : null) as VisitableSchedule | null,
    };
  }

  const lastId: string | undefined = meta?.context_property_id || meta?.last_property_id;
  if (lastId) {
    const found = await fetchById(lastId);
    if (found) return found;
  }

  const { data: convo } = await supabaseAdmin
    .from('chatbot_conversations')
    .select('lead_id')
    .eq('id', conversationId)
    .single();

  if (convo?.lead_id) {
    const { data: lead } = await supabaseAdmin
      .from('leads')
      .select('property_id')
      .eq('id', convo.lead_id)
      .single();
    if (lead?.property_id) {
      const found = await fetchById(lead.property_id);
      if (found) {
        await setConversationMetadata(conversationId, { context_property_id: found.id });
        return found;
      }
    }
  }

  const hint = extracted.property_interest?.trim();
  if (hint && hint.length >= 3 && hint.length <= 80) {
    // Escapar wildcards ILIKE (%/_) para que un cliente que escriba "Calle %"
    // no matchee cualquier inmueble. Review-MEDIUM #ilike-wildcard.
    const safeHint = hint.replace(/[\\%_]/g, '\\$&');
    const { data: matches } = await supabaseAdmin
      .from('properties')
      .select('id, title, price, features')
      .eq('status', 'active')
      .ilike('title', `%${safeHint}%`)
      .limit(1);
    if (matches && matches.length > 0) {
      const m = matches[0];
      const features = (m.features as any) || {};
      const slots = features.visitable_slots as VisitableSchedule | undefined;
      await setConversationMetadata(conversationId, { context_property_id: m.id });
      return {
        id: m.id,
        title: m.title,
        zone: shortZoneFromAddress(features.address),
        price: Number(m.price || 0),
        schedule: (slots && typeof slots === 'object' ? slots : null) as VisitableSchedule | null,
      };
    }
  }

  return null;
}

// ─── Disponibilidad ─────────────────────────────────────────────────────────

function slotsForDay(schedule: VisitableSchedule, dateKey: string): string[] {
  const dow = dayOfWeekFor(dateKey);
  return schedule.schedule?.[dow] || [];
}

async function getOccupiedTimes(propertyId: string, dateKey: string): Promise<Set<string>> {
  // Madrid 00:00 del día → UTC del día anterior 22:00/23:00 según DST.
  // Buscamos en un rango amplio (24h Madrid = 24h reales) y filtramos
  // luego por la fecha local Madrid de cada appointment.
  const dayStartMadridUtc = madridLocalToUtcIso(dateKey, '00:00');
  const nextDay = addDays(dateKey, 1);
  const dayEndMadridUtc = madridLocalToUtcIso(nextDay, '00:00');
  const { data } = await supabaseAdmin
    .from('appointments')
    .select('scheduled_at, status')
    .eq('property_id', propertyId)
    .gte('scheduled_at', dayStartMadridUtc)
    .lt('scheduled_at', dayEndMadridUtc)
    .neq('status', 'cancelled');

  const set = new Set<string>();
  ((data as { scheduled_at: string }[]) || []).forEach((a) => {
    // Hora local Madrid (no UTC) para que coincida con los slots del schedule.
    set.add(hourInMadrid(a.scheduled_at));
  });
  return set;
}

async function freeSlotsForDate(
  schedule: VisitableSchedule,
  propertyId: string,
  dateKey: string,
): Promise<string[]> {
  const all = slotsForDay(schedule, dateKey);
  if (all.length === 0) return [];
  const occupied = await getOccupiedTimes(propertyId, dateKey);
  return all.filter((t) => !occupied.has(t));
}

/** Devuelve los próximos N días que tengan al menos un slot libre. */
async function nextDaysWithFreeSlots(
  schedule: VisitableSchedule,
  propertyId: string,
  count: number,
): Promise<Array<{ dateKey: string; free: string[] }>> {
  const today = todayDateKey();
  const out: Array<{ dateKey: string; free: string[] }> = [];
  for (let i = 0; i < 14 && out.length < count; i++) {
    const k = addDays(today, i);
    const free = await freeSlotsForDate(schedule, propertyId, k);
    if (free.length > 0) out.push({ dateKey: k, free });
  }
  return out;
}

function formatDateHuman(dateKey: string): string {
  // Formato preferido por Álvaro: "Lunes 09/06/2026" (dd/mm/yyyy con día semana).
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dayName = SPANISH_DAYS_ORDER[dt.getUTCDay()];
  return `${dayName} ${pad2(d)}/${pad2(m)}/${y}`;
}

function formatDateTimeMadrid(utcIso: string): string {
  // "Lunes 09/06/2026, 12:00" — pensado para la confirmación final.
  const dt = new Date(utcIso);
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(dt); // YYYY-MM-DD en Madrid
  const hm = hourInMadrid(utcIso);
  return `${formatDateHuman(ymd)}, ${hm}`;
}

function formatDaysPreview(days: Array<{ dateKey: string; free: string[] }>): string {
  return days
    .map((d) => `• *${formatDateHuman(d.dateKey)}*: ${d.free.join(', ')}`)
    .join('\n');
}

// ─── Lead / buyers_demands ─────────────────────────────────────────────────

async function getOrCreateLead(input: { name: string; phone: string; propertyId: string }): Promise<string | null> {
  const { data: existing } = await supabaseAdmin
    .from('leads')
    .select('id')
    .eq('phone', input.phone)
    .limit(1);
  if (existing && existing.length > 0) return existing[0].id;

  const { data: created } = await supabaseAdmin
    .from('leads')
    .insert([{
      name: input.name || 'Lead chatbot',
      phone: input.phone,
      type: 'buyer',
      status: 'new',
      source: 'Chatbot WhatsApp',
      property_id: input.propertyId,
    }])
    .select('id')
    .single();
  return created?.id || null;
}

async function buyerDemandExists(phone: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('buyers_demands')
    .select('id')
    .eq('phone', phone)
    .limit(1);
  return !!(data && data.length > 0);
}

async function upsertBuyerDemand(input: {
  name: string;
  phone: string;
  answers: InterviewAnswers;
  propertyMaxPrice: number;
  /** R9 Ola 5: FK lead_id → buyers_demands. Nullable — si no se conoce, se omite. */
  leadId?: string | null;
}): Promise<void> {
  const fundingTypeForCRM = input.answers.funding === 'Al contado' ? 'Al contado' : 'Hipoteca';

  const { data: existing } = await supabaseAdmin
    .from('buyers_demands')
    .select('id')
    .eq('phone', input.phone)
    .limit(1);

  const payload: Record<string, any> = {
    name: input.name,
    phone: input.phone,
    max_budget: input.propertyMaxPrice || 0,
    min_budget: 0,
    min_sqm: 0,
    funding_type: fundingTypeForCRM,
    savings_contribution: input.answers.savings ?? 0,
    status: 'Búsqueda activa',
    last_activity_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    // Vinculamos el comprador con su lead solo cuando el ID es conocido.
    // ON DELETE SET NULL en la FK protege filas huérfanas si el lead se borra.
    ...(input.leadId ? { lead_id: input.leadId } : {}),
  };

  if (existing && existing.length > 0) {
    await supabaseAdmin.from('buyers_demands').update(payload).eq('id', existing[0].id);
  } else {
    await supabaseAdmin.from('buyers_demands').insert([{
      ...payload,
      created_at: new Date().toISOString(),
    }]);
  }
}

// ─── Entrevista ─────────────────────────────────────────────────────────────

const INTERVIEW_QUESTIONS: Record<InterviewStep, string> = {
  1: '¡Genial! Antes de confirmar la cita necesito 3 datos breves. 💰 ¿Qué ahorros aportarías a la compra? (una cifra aproximada me vale)',
  2: '👍 Anotado. ¿Y cómo vas con la financiación? Indícame una opción:\n• *Sin estudiar*\n• *Estudio hecho*\n• *Hipoteca preconcedida*\n• *Pago al contado*',
  3: '🏠 Última pregunta: ¿la compra sería para vivir tú o para invertir/alquilar?',
};

function parseSavings(text: string): number | null {
  const k = text.match(/(\d+)\s*k/i);
  if (k) return Number(k[1]) * 1000;
  const mil = text.match(/(\d+)\s*mil/i);
  if (mil) return Number(mil[1]) * 1000;
  const cleaned = text.replace(/[\.\s€]/g, '').replace(/,/g, '.');
  const num = Number(cleaned.match(/\d+(?:\.\d+)?/)?.[0]);
  if (!isNaN(num) && num >= 0) return Math.round(num);
  return null;
}

function parseFunding(text: string): InterviewAnswers['funding'] | null {
  const t = normalizeText(text);
  if (/contado|cash|sin hipoteca/.test(t)) return 'Al contado';
  if (/preconcedid|aprobad|concedid/.test(t)) return 'Preconcedida';
  if (/estudio\s*hecho|hecho|ya\s*lo\s*he\s*estudiado|presentad/.test(t)) return 'Estudio hecho';
  if (/sin\s*estudi|necesito|no\s*he|todavia|aun\s*no/.test(t)) return 'Necesito estudio';
  return null;
}

function parseTipoCompra(text: string): InterviewAnswers['tipo_compra'] | null {
  const t = normalizeText(text);
  if (/invers|alquil|rentab|renta/.test(t)) return 'inversion';
  if (/vivir|habitual|primera\s*viv|para\s*mi|propia/.test(t)) return 'habitual';
  return null;
}

const MAX_INTERVIEW_ATTEMPTS = 3;

async function bailInterview(conversationId: string): Promise<SchedulingHookResult> {
  await clearInterviewState(conversationId);
  await setSchedulingHint(conversationId, { pending_day: null });
  return {
    response:
      'Sin problema, dejo esta parte para Álvaro. Te contactará personalmente para terminar de preparar la visita 🙌',
    shouldEscalate: true,
    intent: 'ESCALATE',
  };
}

export async function handleInterviewStep(
  state: InterviewState,
  userMessage: string,
  conversationId: string,
): Promise<SchedulingHookResult> {
  const answers = { ...state.answers };
  const attempts = (state.attempts || 0);

  async function failStep(retryText: string): Promise<SchedulingHookResult> {
    const nextAttempts = attempts + 1;
    if (nextAttempts >= MAX_INTERVIEW_ATTEMPTS) {
      return await bailInterview(conversationId);
    }
    await setConversationMetadata(conversationId, {
      interview_state: { ...state, attempts: nextAttempts },
    });
    return { response: retryText, shouldEscalate: false, intent: 'schedule_visit_interview' };
  }

  if (state.step === 1) {
    const s = parseSavings(userMessage);
    if (s === null) {
      return failStep('No he sabido leer la cifra. ¿Me pones la cantidad de ahorros que aportarías en euros? (ej.: 30000)');
    }
    answers.savings = s;
    const next: InterviewState = { ...state, step: 2, answers, attempts: 0 };
    await setConversationMetadata(conversationId, { interview_state: next });
    return { response: INTERVIEW_QUESTIONS[2], shouldEscalate: false, intent: 'schedule_visit_interview' };
  }

  if (state.step === 2) {
    const f = parseFunding(userMessage);
    if (!f) {
      return failStep('No lo he pillado. Dime cómo vas con la financiación: *sin estudiar*, *estudio hecho*, *hipoteca preconcedida* o *al contado*.');
    }
    answers.funding = f;
    const next: InterviewState = { ...state, step: 3, answers, attempts: 0 };
    await setConversationMetadata(conversationId, { interview_state: next });
    return { response: INTERVIEW_QUESTIONS[3], shouldEscalate: false, intent: 'schedule_visit_interview' };
  }

  const tc = parseTipoCompra(userMessage);
  if (!tc) {
    return failStep('Para terminar: ¿es para *vivir tú* o como *inversión* (alquilar/revender)?');
  }
  answers.tipo_compra = tc;

  return await finalizeScheduling(state, answers, conversationId);
}

// ─── Finalización ───────────────────────────────────────────────────────────

async function finalizeScheduling(
  state: InterviewState,
  answers: InterviewAnswers,
  conversationId: string,
): Promise<SchedulingHookResult> {
  const { error: apptErr } = await supabaseAdmin.from('appointments').insert([{
    lead_id: state.target.leadId,
    property_id: state.target.propertyId,
    scheduled_at: state.target.scheduledAt,
    status: 'pending',
    type: 'visita',
    title: `Visita: ${state.target.propertyTitle}`,
    notes: `Agendada por Paula (chatbot). Perfil del lead: ahorros ${answers.savings ?? '?'}€ · financiación ${answers.funding ?? '?'} · ${answers.tipo_compra ?? '?'}.`,
    duration_minutes: 30,
  }]);

  if (apptErr) {
    console.error('[scheduling] insert appointment falló:', apptErr.message);
    return {
      response: 'Vaya, no he podido registrar la cita por un problema técnico. Aviso a Álvaro para que te confirme manualmente.',
      shouldEscalate: true,
      intent: 'ESCALATE',
    };
  }

  const { data: prop } = await supabaseAdmin
    .from('properties')
    .select('price')
    .eq('id', state.target.propertyId)
    .single();
  const propertyMaxPrice = Number(prop?.price || 0);

  await upsertBuyerDemand({
    name: state.target.leadName,
    phone: state.target.leadPhone,
    answers,
    propertyMaxPrice,
    leadId: state.target.leadId, // R9 Ola 5: FK lead_id
  });

  await clearInterviewState(conversationId);
  await setSchedulingHint(conversationId, { pending_day: null });

  const when = formatDateTimeMadrid(state.target.scheduledAt);

  // Aviso al asesor por la plantilla HSM (FIX-C brief #002).
  // Si la plantilla aún no está aprobada por Meta, Meta devuelve 4xx y
  // sendWhatsAppTemplate ya lo loguea sin romper este flow. La cita queda
  // creada y visible en el CRM aunque Álvaro no reciba el ping.
  if (ADVISOR_PHONE) {
    const summary = [
      state.target.leadName,
      state.target.leadPhone,
      `"${state.target.propertyTitle}"`,
      when,
    ].join(' · ');
    void sendWhatsAppTemplate(
      ADVISOR_PHONE,
      'aviso_alvaro',
      ['Nueva cita reservada por Paula', summary],
      { normalize: true, logTag: '[scheduling][aviso asesor]' },
    );
  }

  const propLabel = formatPropertyName(state.target.propertyTitle, state.target.propertyZone);
  return {
    response:
      `✅ ¡Listo! Visita reservada para *${when}* en ${propLabel}. ` +
      `Álvaro te confirmará por aquí antes de la cita. Si necesitas cambiar la hora, dímelo.`,
    shouldEscalate: false,
    intent: 'schedule_visit_confirmed',
  };
}

// ─── Entrada principal ─────────────────────────────────────────────────────

export async function tryHandleScheduleVisit(input: SchedulingHookInput): Promise<SchedulingHookResult | null> {
  const active = await getInterviewState(input.conversationId);
  if (active) return null;

  const phone = (input.extracted.phone || input.leadPhone || '').trim();
  const name = (input.extracted.name || input.leadName || '').trim();
  if (!phone) return null; // Sin teléfono no podemos crear cita; deja al LLM pedirlo.

  const property = await resolveTargetProperty(input.conversationId, input.extracted);
  if (!property) {
    return {
      response:
        'Para agendar la visita necesito saber qué inmueble te interesa. ¿Me dices el título o la dirección del piso/casa que quieres ver?',
      shouldEscalate: false,
      intent: 'schedule_visit',
    };
  }

  const schedule = property.schedule;
  const propLabel = formatPropertyName(property.title, property.zone);
  if (!schedule || !schedule.schedule || Object.keys(schedule.schedule).length === 0) {
    return {
      response:
        `Para visitar ${propLabel} necesito consultar a Álvaro directamente. Le aviso ahora mismo y te contactará personalmente.`,
      shouldEscalate: true,
      intent: 'schedule_visit_unavailable',
    };
  }

  // Parse fecha+hora: PRIMERO el texto del usuario (usa nuestra fecha de
  // servidor, no la del LLM), DESPUÉS el preferred_date del LLM como
  // último recurso. Gemini Flash 1.5 con cutoff 2024 devuelve fechas
  // del pasado al calcular "el próximo martes" → confiar en él como
  // primera opción metía citas en noviembre 2024.
  let parsed = parseDateTime(input.userMessage) || parseDateTime(input.extracted.preferred_date);

  // Si parseDateTime pasó un dateKey rescatado pero descartó por out-of-range,
  // intentamos combinar con el día detectado en el texto.
  if (parsed && !parsed.dateKey) {
    const fromText = parseDateTime(input.userMessage);
    if (fromText?.dateKey) parsed = { dateKey: fromText.dateKey, timeKey: parsed.timeKey };
  }

  // Si el user dio solo hora sin día, recuperar día pendiente del contexto.
  if (parsed && !parsed.dateKey && parsed.timeKey) {
    const hint = await getSchedulingHint(input.conversationId);
    if (hint?.pending_day) {
      parsed = { dateKey: hint.pending_day, timeKey: parsed.timeKey };
    }
  }
  // Si dio solo día (sin hora), recordarlo para el próximo turno.
  if (parsed && parsed.dateKey && !parsed.timeKey) {
    await setSchedulingHint(input.conversationId, { pending_day: parsed.dateKey });
  }

  // CASO A — no tenemos fecha → ofrecer próximos 3 días con huecos.
  if (!parsed || !parsed.dateKey) {
    const preview = await nextDaysWithFreeSlots(schedule, property.id, 3);
    if (preview.length === 0) {
      return {
        response: `Por desgracia ahora mismo no me quedan huecos libres para visitar ${propLabel}. Aviso a Álvaro para que te proponga alternativa.`,
        shouldEscalate: true,
        intent: 'schedule_visit_unavailable',
      };
    }
    return {
      response: `¿Qué día y hora te vendría bien? Estos son los próximos huecos para ${propLabel}:\n${formatDaysPreview(preview)}`,
      shouldEscalate: false,
      intent: 'schedule_visit',
    };
  }

  const dateKey = parsed.dateKey;
  const free = await freeSlotsForDate(schedule, property.id, dateKey);

  // CASO B — ese día no admite visitas o no le quedan huecos.
  if (free.length === 0) {
    const preview = await nextDaysWithFreeSlots(schedule, property.id, 3);
    if (preview.length === 0) {
      return {
        response: `No me quedan huecos libres próximos para ${propLabel}. Aviso a Álvaro para que te proponga otra fecha.`,
        shouldEscalate: true,
        intent: 'schedule_visit_unavailable',
      };
    }
    return {
      response: `El ${formatDateHuman(dateKey)} no tengo huecos libres. ¿Te encaja alguno de estos?\n${formatDaysPreview(preview)}`,
      shouldEscalate: false,
      intent: 'schedule_visit',
    };
  }

  // CASO C — tenemos día pero no hora → ofrecer los libres de ese día.
  if (!parsed.timeKey) {
    return {
      response: `Para el ${formatDateHuman(dateKey)} tengo libres: *${free.join(', ')}*. ¿Cuál te viene mejor?`,
      shouldEscalate: false,
      intent: 'schedule_visit',
    };
  }

  // CASO D — fecha + hora.
  const timeKey = parsed.timeKey;
  if (!free.includes(timeKey)) {
    return {
      response: `Las *${timeKey}* del ${formatDateHuman(dateKey)} no están disponibles. Para ese día tengo libres: *${free.join(', ')}*. ¿Cuál te encaja?`,
      shouldEscalate: false,
      intent: 'schedule_visit',
    };
  }

  // Hora libre → crear/recuperar lead y arrancar entrevista o cita directa.
  const leadId = await getOrCreateLead({ name: name || 'Lead chatbot', phone, propertyId: property.id });
  if (!leadId) {
    return {
      response: 'No he podido registrar tus datos por un problema técnico. Aviso a Álvaro.',
      shouldEscalate: true,
      intent: 'ESCALATE',
    };
  }

  // FIX: tratar dateKey+timeKey como hora LOCAL Madrid, no UTC. Antes el
  // ISO `${dateKey}T${timeKey}:00.000Z` se guardaba como UTC literal y al
  // renderizar en Madrid (CET +1 / CEST +2) sumaba 1-2 horas → "le dije
  // 12pm y me confirmó 13pm".
  const scheduledAt = madridLocalToUtcIso(dateKey, timeKey);
  const hasDemand = await buyerDemandExists(phone);

  if (!hasDemand) {
    const state: InterviewState = {
      step: 1,
      answers: {},
      attempts: 0,
      target: {
        propertyId: property.id,
        propertyTitle: property.title,
        propertyZone: property.zone,
        scheduledAt,
        leadId,
        leadName: name || 'Lead chatbot',
        leadPhone: phone,
      },
      startedAt: new Date().toISOString(),
    };
    await setConversationMetadata(input.conversationId, { interview_state: state });
    return {
      response: INTERVIEW_QUESTIONS[1],
      shouldEscalate: false,
      intent: 'schedule_visit_interview',
    };
  }

  const fakeState: InterviewState = {
    step: 3,
    answers: {},
    target: {
      propertyId: property.id,
      propertyTitle: property.title,
      propertyZone: property.zone,
      scheduledAt,
      leadId,
      leadName: name || 'Lead chatbot',
      leadPhone: phone,
    },
    startedAt: new Date().toISOString(),
  };
  return await finalizeScheduling(fakeState, {}, input.conversationId);
}

// ─── Follow-up 30 min (FIX-G) ───────────────────────────────────────────────

/**
 * Marca la conversación con un timestamp objetivo para que, pasados N
 * minutos sin respuesta del cliente, un cron envíe un follow-up
 * preguntándole si quiere agendar una visita.
 *
 * El envío del follow-up lo dispara un workflow n8n contra
 * `POST /api/webhooks/n8n` action=`get_pending_visit_followups`.
 *
 * Si el cliente responde antes de que el cron pase, el bot vuelve a
 * llamar a `clearVisitFollowup` (al detectar respuesta) para no enviar
 * el follow-up redundante.
 */
export async function scheduleVisitFollowup(conversationId: string, minutes: number): Promise<void> {
  const at = new Date(Date.now() + minutes * 60_000).toISOString();
  await setConversationMetadata(conversationId, {
    followup_visit: { pending_until: at, sent: false },
  });
}

/**
 * Limpia el follow-up cuando el cliente responde antes de que toque
 * enviarlo. Llamado por el engine al recibir un mensaje del usuario.
 */
export async function clearVisitFollowup(conversationId: string): Promise<void> {
  await setConversationMetadata(conversationId, { followup_visit: null });
}

// ─── Reserva web → entrevista WhatsApp (FIX-F) ──────────────────────────────

/**
 * Cuando el cliente reserva visita desde la web pública, si tiene una
 * conversación WhatsApp activa con Paula la "engancha" para completar el
 * perfil que la web no recoge (ahorros + financiación + tipo de compra).
 *
 * Cómo funciona:
 *   1. Busca `chatbot_conversations` whatsapp activas para el teléfono.
 *   2. Si existe, registra un mensaje del asistente en BD con la
 *      confirmación de la cita + pregunta inicial de la entrevista.
 *   3. Setea `metadata.interview_state` step=1 con la cita ya como target.
 *      Si el cliente NO escribe en respuesta, la cita queda creada
 *      normalmente — solo perdemos la oportunidad de enriquecer su perfil.
 *
 * NO envía WhatsApp directamente desde aquí: el envío lo hace el caller
 * (`appointmentService.bookPublicAppointment`) con su lógica de
 * plantillas HSM, que ya gestiona la ventana 24h.
 *
 * @returns conversationId si encadenó la entrevista, null si no había
 *   conversación activa.
 */
export type WebBookingHookOutcome =
  | { kind: 'no_conversation' }
  | { kind: 'spoofing_blocked'; conversationId: string }   // FIX HIGH #1
  | { kind: 'already_has_interview'; conversationId: string }
  | { kind: 'already_has_demand'; conversationId: string }
  | { kind: 'started'; conversationId: string };

export async function startInterviewFromWebBooking(params: {
  phone: string;
  leadName: string;
  leadId: string;
  propertyId: string;
  propertyTitle: string;
  propertyZone?: string | null;
  scheduledAt: string; // ISO UTC del appointment
}): Promise<WebBookingHookOutcome> {
  const { data: convos } = await supabaseAdmin
    .from('chatbot_conversations')
    .select('id, metadata, lead_id')
    .eq('channel', 'whatsapp')
    .eq('wa_phone_number', params.phone)
    .eq('status', 'active')
    .order('started_at', { ascending: false })
    .limit(1);

  if (!convos || convos.length === 0) return { kind: 'no_conversation' };
  const conversationId = convos[0].id;
  const convoLeadId = convos[0].lead_id as string | null;

  // FIX HIGH #1 (security review): si la conversación WhatsApp activa para
  // este teléfono está atada a OTRO lead, NO la encadenamos. Sin esto, un
  // atacante que reserve por la web inventando el teléfono de una víctima
  // que esté hablando con Paula puede secuestrar la conversación.
  if (convoLeadId && convoLeadId !== params.leadId) {
    console.warn('[scheduling][spoof-block]', { conversationId, convoLeadId, paramsLeadId: params.leadId });
    return { kind: 'spoofing_blocked', conversationId };
  }

  // Si la convo ya está en una entrevista activa, no la pisamos.
  const meta = (convos[0].metadata as Record<string, any>) || {};
  if (meta.interview_state) return { kind: 'already_has_interview', conversationId };

  const propLabel = formatPropertyName(params.propertyTitle, params.propertyZone);

  // Si ya hay buyers_demand completo, no tiene sentido la entrevista.
  const hasDemand = await buyerDemandExists(params.phone);
  if (hasDemand) {
    await supabaseAdmin.from('chatbot_messages').insert({
      conversation_id: conversationId,
      role: 'assistant',
      content: `🎉 ¡Genial ${params.leadName}! Tu visita a ${propLabel} ya está reservada para ${formatDateTimeMadrid(params.scheduledAt)}. Álvaro te confirmará por aquí antes de la cita. ¿Algo más en lo que pueda ayudarte?`,
      intent_detected: 'schedule_visit_confirmed',
      confidence: 0.95,
    });
    return { kind: 'already_has_demand', conversationId };
  }

  const state: InterviewState = {
    step: 1,
    answers: {},
    attempts: 0,
    target: {
      propertyId: params.propertyId,
      propertyTitle: params.propertyTitle,
      propertyZone: params.propertyZone || null,
      scheduledAt: params.scheduledAt,
      leadId: params.leadId,
      leadName: params.leadName,
      leadPhone: params.phone,
    },
    startedAt: new Date().toISOString(),
  };
  await setConversationMetadata(conversationId, { interview_state: state });

  await supabaseAdmin.from('chatbot_messages').insert({
    conversation_id: conversationId,
    role: 'assistant',
    content:
      `¡Hola ${params.leadName}! Soy Paula 👋, la asesora virtual de Álvaro. ` +
      `Acabas de reservar tu visita a ${propLabel} para ${formatDateTimeMadrid(params.scheduledAt)} 🎉. ` +
      `Para que la prepare a tu medida, ¿me ayudas con 3 datos rápidos? ` +
      `Si prefieres no responder, no pasa nada — él te contactará antes de la cita igualmente. ` +
      `💰 La primera: ¿qué ahorros aportarías a la compra? (una cifra aproximada vale).`,
    intent_detected: 'schedule_visit_interview',
    confidence: 0.95,
  });

  return { kind: 'started', conversationId };
}
