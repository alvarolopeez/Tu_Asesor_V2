/**
 * Lógica de agendamiento del chatbot — Paula.
 *
 * Antes (brief #002 T4) el bot detectaba `schedule_visit` y se limitaba a un
 * texto genérico "pásame tu nombre y cuándo te viene bien"; nunca consultaba
 * disponibilidad real, nunca creaba un appointment, nunca pedía perfil al
 * comprador. Resultado: 0 citas creadas vía bot y 0 datos rellenos en
 * buyers_demands para esos leads.
 *
 * Este módulo encapsula:
 *  1. Verificación de `properties.features.visitable_slots`.
 *  2. Detección de slot ocupado vs slot libre (cruza con `appointments`).
 *  3. Lanzamiento de una entrevista de 3 preguntas al lead NUEVO antes de
 *     confirmar la cita (ahorros, financiación, vivienda/inversión).
 *  4. Persistencia del estado de la entrevista en
 *     `chatbot_conversations.metadata.interview_state` para sobrevivir a
 *     turnos sucesivos del LLM.
 *  5. Creación atómica de la cita + UPSERT de `buyers_demands` con los
 *     datos del perfil.
 *  6. Escalación a Álvaro cuando la propiedad NO tiene slots configurados.
 *
 * Mantiene `engine.ts` enfocado en LLM/parseo. Toda la lógica de negocio
 * de scheduling vive aquí.
 *
 * @created 2026-06-06 brief #002 T4
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Cliente con service-role para poder insertar en `appointments` y
// `buyers_demands` saltándose las RLS (el bot corre server-side).
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type InterviewStep = 1 | 2 | 3;

export interface InterviewAnswers {
  /** Aportación de ahorros propia, en €. */
  savings?: number;
  /** Mapea al schema de BuyerRegistrationModal: 'Necesito estudio' | 'Estudio hecho' | 'Preconcedida' | 'Al contado' */
  funding?: 'Necesito estudio' | 'Estudio hecho' | 'Preconcedida' | 'Al contado';
  /** Vivienda habitual vs inversión. */
  tipo_compra?: 'habitual' | 'inversion';
}

export interface InterviewState {
  step: InterviewStep;
  answers: InterviewAnswers;
  target: {
    propertyId: string;
    propertyTitle: string;
    scheduledAt: string; // ISO
    leadId: string;
    leadName: string;
    leadPhone: string;
  };
  startedAt: string;
}

export interface VisitableSlot {
  date: string;             // 'YYYY-MM-DD'
  slots: string[];          // ['10:00', '12:00', '17:00']
}

export interface SchedulingHookInput {
  conversationId: string;
  leadName?: string;
  leadPhone?: string;
  /** Texto literal del mensaje del usuario (para parsear fecha/hora si el LLM falló). */
  userMessage: string;
  /** Lo que el LLM extrajo en data_extracted. */
  extracted: {
    name?: string | null;
    phone?: string | null;
    preferred_date?: string | null;
    property_interest?: string | null;
  };
}

export interface SchedulingHookResult {
  /** Respuesta final al usuario que reemplaza la del LLM. */
  response: string;
  /** Marcar la conversación como escalated. */
  shouldEscalate: boolean;
  /** Para guardarlo como intent en chatbot_messages. */
  intent: 'schedule_visit' | 'schedule_visit_interview' | 'schedule_visit_confirmed' | 'schedule_visit_unavailable' | 'ESCALATE';
}

// ─── Helpers de metadata de la conversación ────────────────────────────────

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

// ─── Resolución de la propiedad de interés ──────────────────────────────────

async function resolveTargetProperty(
  conversationId: string,
  extracted: SchedulingHookInput['extracted'],
): Promise<{ id: string; title: string; visitable_slots: VisitableSlot[] | null } | null> {
  const meta = await getConversationMetadata(conversationId);

  // 1. Si la metadata tiene un last_property_id ya resuelto, usarlo.
  const lastId: string | undefined = meta?.context_property_id || meta?.last_property_id;
  if (lastId) {
    const { data } = await supabaseAdmin
      .from('properties')
      .select('id, title, features')
      .eq('id', lastId)
      .single();
    if (data) {
      const slots = ((data.features as any)?.visitable_slots as VisitableSlot[] | undefined) || null;
      return { id: data.id, title: data.title, visitable_slots: slots };
    }
  }

  // 2. Si la conversación está atada a un lead, mirar `leads.property_id`.
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
      const { data: prop } = await supabaseAdmin
        .from('properties')
        .select('id, title, features')
        .eq('id', lead.property_id)
        .single();
      if (prop) {
        const slots = ((prop.features as any)?.visitable_slots as VisitableSlot[] | undefined) || null;
        await setConversationMetadata(conversationId, { context_property_id: prop.id });
        return { id: prop.id, title: prop.title, visitable_slots: slots };
      }
    }
  }

  // 3. Si el LLM extrajo property_interest, buscar por título (ILIKE).
  const hint = extracted.property_interest?.trim();
  if (hint && hint.length >= 3) {
    const { data: matches } = await supabaseAdmin
      .from('properties')
      .select('id, title, features')
      .eq('status', 'active')
      .ilike('title', `%${hint}%`)
      .limit(1);
    if (matches && matches.length > 0) {
      const m = matches[0];
      const slots = ((m.features as any)?.visitable_slots as VisitableSlot[] | undefined) || null;
      await setConversationMetadata(conversationId, { context_property_id: m.id });
      return { id: m.id, title: m.title, visitable_slots: slots };
    }
  }

  return null;
}

// ─── Parsing de fecha/hora ──────────────────────────────────────────────────

function pad2(n: number): string { return n < 10 ? `0${n}` : String(n); }

/**
 * Intenta parsear una fecha+hora del texto del usuario o del valor que el LLM
 * extrajo. Devuelve {dateKey:'YYYY-MM-DD', timeKey:'HH:MM'} o null.
 *
 * Heurística sencilla — el LLM debe devolver ISO en `preferred_date`, así
 * que el camino feliz es ese. Sólo usamos regex como red de seguridad.
 */
export function parseDateTime(input: string | null | undefined): { dateKey: string; timeKey: string } | null {
  if (!input) return null;
  const txt = input.trim();

  // Camino feliz: ISO o ISO sin segundos.
  const iso = new Date(txt);
  if (!isNaN(iso.getTime()) && /\d{4}-\d{2}-\d{2}/.test(txt)) {
    return { dateKey: txt.slice(0, 10), timeKey: `${pad2(iso.getHours())}:${pad2(iso.getMinutes())}` };
  }

  // Fallback: "el 12/06 a las 17:00" o "12-06-2026 17:00".
  const dateRe = /(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/;
  const timeRe = /(\d{1,2})[:\.h](\d{2})/;
  const dm = txt.match(dateRe);
  const tm = txt.match(timeRe);
  if (!dm || !tm) return null;
  const day = Number(dm[1]);
  const month = Number(dm[2]);
  const year = dm[3] ? (dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3])) : new Date().getFullYear();
  const hour = Number(tm[1]);
  const minute = Number(tm[2]);
  if (!day || !month || !hour) return null;
  const dateKey = `${year}-${pad2(month)}-${pad2(day)}`;
  const timeKey = `${pad2(hour)}:${pad2(minute)}`;
  return { dateKey, timeKey };
}

// ─── Disponibilidad ─────────────────────────────────────────────────────────

async function getOccupiedTimes(propertyId: string, dateKey: string): Promise<Set<string>> {
  const start = `${dateKey}T00:00:00.000Z`;
  // Truco simple: cargamos todas las del día tomando un intervalo amplio.
  const { data } = await supabaseAdmin
    .from('appointments')
    .select('scheduled_at, status')
    .eq('property_id', propertyId)
    .gte('scheduled_at', start)
    .lt('scheduled_at', `${dateKey}T23:59:59.999Z`)
    .neq('status', 'cancelled');

  const set = new Set<string>();
  ((data as { scheduled_at: string }[]) || []).forEach((a) => {
    const d = new Date(a.scheduled_at);
    set.add(`${pad2(d.getHours())}:${pad2(d.getMinutes())}`);
  });
  return set;
}

function freeSlotsForDate(slots: VisitableSlot[], dateKey: string, occupied: Set<string>): string[] {
  const day = slots.find((s) => s.date === dateKey);
  if (!day) return [];
  return day.slots.filter((t) => !occupied.has(t));
}

// ─── Lead / buyers_demands ──────────────────────────────────────────────────

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
  propertyZone?: string | null;
}): Promise<void> {
  const fundingTypeForCRM =
    input.answers.funding === 'Al contado' ? 'Al contado' : 'Hipoteca';

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
    preferred_zones: input.propertyZone ? [input.propertyZone] : [],
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

// ─── Entrevista (3 preguntas) ───────────────────────────────────────────────

const INTERVIEW_QUESTIONS: Record<InterviewStep, string> = {
  1: '¡Genial! Antes de confirmar la cita necesito 3 datos breves para preparar la visita correctamente. 💰 ¿Qué ahorros aportarías a la compra? (en €, una cifra aproximada me vale)',
  2: '👍 Anotado. ¿Y cómo vas con la financiación? Indícame una opción:\n• *Sin estudiar*\n• *Estudio hecho*\n• *Hipoteca preconcedida*\n• *Pago al contado*',
  3: '🏠 Última pregunta: ¿la compra sería para vivir tú o para invertir/alquilar?',
};

function parseSavings(text: string): number | null {
  const cleaned = text.replace(/[\.\s€]/g, '').replace(/,/g, '.');
  const num = Number(cleaned.match(/\d+(?:\.\d+)?/)?.[0]);
  if (!isNaN(num) && num >= 0) return Math.round(num);
  // Maneja "20k", "30 mil"
  const k = text.match(/(\d+)\s*k/i);
  if (k) return Number(k[1]) * 1000;
  const mil = text.match(/(\d+)\s*mil/i);
  if (mil) return Number(mil[1]) * 1000;
  return null;
}

function parseFunding(text: string): InterviewAnswers['funding'] | null {
  const t = text.toLowerCase();
  if (/contado|cash|sin hipoteca/.test(t)) return 'Al contado';
  if (/preconcedid|aprobad|concedid/.test(t)) return 'Preconcedida';
  if (/estudio\s*hecho|hecho|ya\s*lo\s*he\s*estudiado|presentad/.test(t)) return 'Estudio hecho';
  if (/sin\s*estudi|necesito|no\s*he|todav[ií]a|aun\s*no|aún\s*no/.test(t)) return 'Necesito estudio';
  return null;
}

function parseTipoCompra(text: string): InterviewAnswers['tipo_compra'] | null {
  const t = text.toLowerCase();
  if (/invers|alquil|rentab|renta/.test(t)) return 'inversion';
  if (/vivir|habitual|primera\s*viv|para\s*m[ií]|propia/.test(t)) return 'habitual';
  return null;
}

/**
 * Procesa la respuesta del usuario cuando hay una entrevista activa.
 * - Si la respuesta no se parsea, vuelve a preguntar la misma pregunta.
 * - Si ya es la última, crea cita + upsert demand y limpia el estado.
 */
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

  // step === 3 → última
  const tc = parseTipoCompra(userMessage);
  if (!tc) {
    return {
      response: 'Para terminar: ¿es para *vivir tú* o como *inversión* (alquilar/revender)?',
      shouldEscalate: false,
      intent: 'schedule_visit_interview',
    };
  }
  answers.tipo_compra = tc;

  // Finalizar: crear appointment + upsert buyers_demands.
  return await finalizeScheduling(state, answers, conversationId);
}

// ─── Finalización ───────────────────────────────────────────────────────────

async function finalizeScheduling(
  state: InterviewState,
  answers: InterviewAnswers,
  conversationId: string,
): Promise<SchedulingHookResult> {
  // 1. Crear appointment.
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

  // 2. Upsert buyers_demands con el perfil recogido.
  const { data: prop } = await supabaseAdmin
    .from('properties')
    .select('price, features')
    .eq('id', state.target.propertyId)
    .single();
  const propertyMaxPrice = Number(prop?.price || 0);
  const propertyZone = ((prop?.features as any)?.location?.address as string | undefined) || null;

  await upsertBuyerDemand({
    name: state.target.leadName,
    phone: state.target.leadPhone,
    answers,
    propertyMaxPrice,
    propertyZone,
  });

  // 3. Limpiar interview_state.
  await clearInterviewState(conversationId);

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

// ─── Entrada principal: tryHandleScheduleVisit ─────────────────────────────

/**
 * Llamado desde engine.ts cuando el LLM detecta `schedule_visit`.
 * Devuelve null si no procede sobreescribir la respuesta del LLM (p.ej. no
 * tenemos teléfono — el LLM ya está pidiéndolo, deja que siga).
 */
export async function tryHandleScheduleVisit(input: SchedulingHookInput): Promise<SchedulingHookResult | null> {
  // 1. Si ya hay entrevista activa, no entrar aquí (el caller debe llamar a
  //    handleInterviewStep ANTES de tryHandleScheduleVisit).
  const active = await getInterviewState(input.conversationId);
  if (active) return null;

  // 2. Necesitamos teléfono y nombre del lead. Si el LLM aún no los tiene,
  //    deja que siga preguntando con su propio texto.
  const phone = (input.extracted.phone || input.leadPhone || '').trim();
  const name = (input.extracted.name || input.leadName || '').trim();
  if (!phone) return null; // bot widget sin teléfono → no podemos crear cita.

  // 3. Resolver inmueble.
  const property = await resolveTargetProperty(input.conversationId, input.extracted);
  if (!property) {
    return {
      response:
        'Para agendar la visita necesito saber qué inmueble te interesa. ¿Me dices el título o la dirección del piso/casa que quieres ver?',
      shouldEscalate: false,
      intent: 'schedule_visit',
    };
  }

  // 4. Inmueble SIN slots configurados → escalar.
  if (!property.visitable_slots || property.visitable_slots.length === 0) {
    return {
      response:
        `Para visitar "${property.title}" necesito consultar a Álvaro directamente. Le aviso ahora mismo y te contactará personalmente.`,
      shouldEscalate: true,
      intent: 'schedule_visit_unavailable',
    };
  }

  // 5. Necesitamos fecha/hora.
  const dt = parseDateTime(input.extracted.preferred_date) ||
    parseDateTime(input.userMessage);
  if (!dt) {
    // El LLM debería volver a preguntar. Devolvemos un texto guía pero NO
    // escalamos.
    const dayPreview = property.visitable_slots
      .slice(0, 3)
      .map((d) => `${d.date}: ${d.slots.join(', ')}`)
      .join('\n');
    return {
      response: `¿Qué día y hora te vendría bien? Estos son los huecos disponibles más próximos:\n${dayPreview}`,
      shouldEscalate: false,
      intent: 'schedule_visit',
    };
  }

  // 6. Comprobar disponibilidad.
  const occupied = await getOccupiedTimes(property.id, dt.dateKey);
  const free = freeSlotsForDate(property.visitable_slots, dt.dateKey, occupied);

  const isFree = property.visitable_slots
    .find((s) => s.date === dt.dateKey)?.slots.includes(dt.timeKey)
    && !occupied.has(dt.timeKey);

  if (!isFree) {
    if (free.length === 0) {
      // Día sin huecos: ofrecer otros días.
      const otherDays = property.visitable_slots
        .filter((d) => freeSlotsForDate(property.visitable_slots!, d.date, new Set()).length > 0)
        .slice(0, 3)
        .map((d) => `${d.date}: ${d.slots.join(', ')}`)
        .join('\n');
      return {
        response: `Esa hora ya no está disponible y para ese día no me quedan huecos. ¿Te encaja alguno de estos?\n${otherDays || '(sin huecos próximos — aviso a Álvaro)'}`,
        shouldEscalate: !otherDays,
        intent: otherDays ? 'schedule_visit' : 'schedule_visit_unavailable',
      };
    }
    return {
      response: `Para el ${dt.dateKey} tengo libres: ${free.join(', ')}. ¿Cuál te viene mejor?`,
      shouldEscalate: false,
      intent: 'schedule_visit',
    };
  }

  // 7. Hora libre → crear/recuperar lead.
  const leadId = await getOrCreateLead({ name: name || 'Lead chatbot', phone, propertyId: property.id });
  if (!leadId) {
    return {
      response: 'No he podido registrar tus datos por un problema técnico. Aviso a Álvaro.',
      shouldEscalate: true,
      intent: 'ESCALATE',
    };
  }

  const scheduledAt = new Date(`${dt.dateKey}T${dt.timeKey}:00`).toISOString();

  // 8. Si el lead NO existe aún en buyers_demands → entrevista de 3 preguntas.
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

  // 9. Lead ya conocido → crear cita directa sin entrevista.
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
