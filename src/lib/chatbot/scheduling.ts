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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

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
  target: {
    propertyId: string;
    propertyTitle: string;
    scheduledAt: string;
    leadId: string;
    leadName: string;
    leadPhone: string;
  };
  startedAt: string;
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

/** Devuelve YYYY-MM-DD para HOY en Europa/Madrid (sin tocar runtime). */
function todayDateKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}-${pad2(now.getUTCDate())}`;
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
  const dt = new Date(Date.UTC(y, m - 1, d));
  return SPANISH_DAYS_ORDER[dt.getUTCDay()];
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
 * Parsea fecha + hora del input. Prioridad:
 *   1. ISO completo (`2026-06-10T11:30`).
 *   2. dd/mm o dd-mm (+ opcional año + hora hh:mm).
 *   3. Día semana español ("martes", "el próximo martes", "mañana") + hora opcional.
 *   4. Solo hora hh:mm → devuelve {dateKey:null, timeKey}.
 */
export function parseDateTime(input: string | null | undefined): ParsedDateTime | null {
  if (!input) return null;
  const txt = input.trim();

  // 1. ISO.
  const isoMatch = txt.match(/(\d{4}-\d{2}-\d{2})[T\s](\d{1,2}):(\d{2})/);
  if (isoMatch) {
    return { dateKey: isoMatch[1], timeKey: `${pad2(Number(isoMatch[2]))}:${isoMatch[3]}` };
  }
  const isoDateOnly = txt.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (isoDateOnly) return { dateKey: isoDateOnly[1], timeKey: null };

  // 2. dd/mm[/yyyy] + hh:mm.
  const dmMatch = txt.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
  const hmMatch = txt.match(/\b(\d{1,2})[:\.h](\d{2})\b/);
  let dateKey: string | null = null;
  let timeKey: string | null = null;

  if (dmMatch) {
    const day = Number(dmMatch[1]);
    const month = Number(dmMatch[2]);
    const year = dmMatch[3]
      ? (dmMatch[3].length === 2 ? 2000 + Number(dmMatch[3]) : Number(dmMatch[3]))
      : Number(todayDateKey().slice(0, 4));
    dateKey = `${year}-${pad2(month)}-${pad2(day)}`;
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
): Promise<{ id: string; title: string; price: number; schedule: VisitableSchedule | null } | null> {
  const meta = await getConversationMetadata(conversationId);

  async function fetchById(id: string) {
    const { data } = await supabaseAdmin
      .from('properties')
      .select('id, title, price, features')
      .eq('id', id)
      .single();
    if (!data) return null;
    const slots = (data.features as any)?.visitable_slots as VisitableSchedule | undefined;
    return {
      id: data.id,
      title: data.title,
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
  if (hint && hint.length >= 3) {
    const { data: matches } = await supabaseAdmin
      .from('properties')
      .select('id, title, price, features')
      .eq('status', 'active')
      .ilike('title', `%${hint}%`)
      .limit(1);
    if (matches && matches.length > 0) {
      const m = matches[0];
      const slots = (m.features as any)?.visitable_slots as VisitableSchedule | undefined;
      await setConversationMetadata(conversationId, { context_property_id: m.id });
      return {
        id: m.id,
        title: m.title,
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
  const start = `${dateKey}T00:00:00.000Z`;
  const end = `${dateKey}T23:59:59.999Z`;
  const { data } = await supabaseAdmin
    .from('appointments')
    .select('scheduled_at, status')
    .eq('property_id', propertyId)
    .gte('scheduled_at', start)
    .lt('scheduled_at', end)
    .neq('status', 'cancelled');

  const set = new Set<string>();
  ((data as { scheduled_at: string }[]) || []).forEach((a) => {
    const d = new Date(a.scheduled_at);
    set.add(`${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`);
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
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dayName = SPANISH_DAYS_ORDER[dt.getUTCDay()];
  return `${dayName} ${pad2(d)}/${pad2(m)}`;
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

export async function handleInterviewStep(
  state: InterviewState,
  userMessage: string,
  conversationId: string,
): Promise<SchedulingHookResult> {
  const answers = { ...state.answers };

  if (state.step === 1) {
    const s = parseSavings(userMessage);
    if (s === null) {
      return {
        response: 'No he sabido leer la cifra. ¿Me pones la cantidad de ahorros que aportarías en euros? (ej.: 30000)',
        shouldEscalate: false,
        intent: 'schedule_visit_interview',
      };
    }
    answers.savings = s;
    const next: InterviewState = { ...state, step: 2, answers };
    await setConversationMetadata(conversationId, { interview_state: next });
    return { response: INTERVIEW_QUESTIONS[2], shouldEscalate: false, intent: 'schedule_visit_interview' };
  }

  if (state.step === 2) {
    const f = parseFunding(userMessage);
    if (!f) {
      return {
        response: 'No lo he pillado. Dime cómo vas con la financiación: *sin estudiar*, *estudio hecho*, *hipoteca preconcedida* o *al contado*.',
        shouldEscalate: false,
        intent: 'schedule_visit_interview',
      };
    }
    answers.funding = f;
    const next: InterviewState = { ...state, step: 3, answers };
    await setConversationMetadata(conversationId, { interview_state: next });
    return { response: INTERVIEW_QUESTIONS[3], shouldEscalate: false, intent: 'schedule_visit_interview' };
  }

  const tc = parseTipoCompra(userMessage);
  if (!tc) {
    return {
      response: 'Para terminar: ¿es para *vivir tú* o como *inversión* (alquilar/revender)?',
      shouldEscalate: false,
      intent: 'schedule_visit_interview',
    };
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
  });

  await clearInterviewState(conversationId);
  await setSchedulingHint(conversationId, { pending_day: null });

  const when = new Date(state.target.scheduledAt).toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return {
    response:
      `✅ ¡Listo! Visita reservada para *${when}* en "${state.target.propertyTitle}". ` +
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
  if (!schedule || !schedule.schedule || Object.keys(schedule.schedule).length === 0) {
    return {
      response:
        `Para visitar "${property.title}" necesito consultar a Álvaro directamente. Le aviso ahora mismo y te contactará personalmente.`,
      shouldEscalate: true,
      intent: 'schedule_visit_unavailable',
    };
  }

  // Parse fecha+hora: primero del campo del LLM, luego del texto del usuario.
  let parsed = parseDateTime(input.extracted.preferred_date) || parseDateTime(input.userMessage);

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
        response: `Por desgracia ahora mismo no me quedan huecos libres para visitar "${property.title}". Aviso a Álvaro para que te proponga alternativa.`,
        shouldEscalate: true,
        intent: 'schedule_visit_unavailable',
      };
    }
    return {
      response: `¿Qué día y hora te vendría bien? Estos son los próximos huecos para "${property.title}":\n${formatDaysPreview(preview)}`,
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
        response: `No me quedan huecos libres próximos para "${property.title}". Aviso a Álvaro para que te proponga otra fecha.`,
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

  const scheduledAt = new Date(`${dateKey}T${timeKey}:00.000Z`).toISOString();
  const hasDemand = await buyerDemandExists(phone);

  if (!hasDemand) {
    const state: InterviewState = {
      step: 1,
      answers: {},
      target: {
        propertyId: property.id,
        propertyTitle: property.title,
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
      scheduledAt,
      leadId,
      leadName: name || 'Lead chatbot',
      leadPhone: phone,
    },
    startedAt: new Date().toISOString(),
  };
  return await finalizeScheduling(fakeState, {}, input.conversationId);
}
