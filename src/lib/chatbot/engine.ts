import { supabase } from '@/lib/supabase';
import type { ChatbotEngineResponse, ChatChannel } from '@/types';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  getInterviewState,
  handleInterviewStep,
  tryHandleScheduleVisit,
  scheduleVisitFollowup,
  clearVisitFollowup,
  clearInterviewStateFromEngine,
} from './scheduling';
import { rescueNaturalResponse } from './llmParser';
import {
  needsProfile,
  isNeutralReply,
  classifyOfferReply,
  isProfileOfferPending,
  wasProfileAlreadyOffered,
  offerInterview,
  startStandaloneInterview,
  markOfferDeclined,
} from './profileCheck';

/**
 * Motor del Chatbot — Orquesta la generación de respuestas.
 * 
 * Fase 1 (actual): Respuestas por detección de keywords.
 * Fase 2 (próxima): Llamada a LLM (Claude/GPT) con system prompt + historial.
 * 
 * Este módulo es agnóstico del canal — funciona para WhatsApp, web widget y Chatwoot.
 * 
 * @agent IA/Automatización
 * @created 2026-05-14
 */

// ─── Configuración LLM ──────────────────────────────
const LLM_PROVIDER = process.env.LLM_PROVIDER || 'keywords'; // 'openai' | 'anthropic' | 'gemini' | 'keywords'
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const LLM_MODEL = process.env.LLM_MODEL || 'gemini-1.5-flash';

/**
 * Tamaño de la ventana de historial de conversación que pasamos al LLM.
 *
 * 30 mensajes ≈ 15 turnos de cliente + 15 del bot. En WhatsApp 10 era
 * insuficiente: "ok", "vale", "perfecto" consumen turnos sin contexto y
 * el bot perdía la propiedad inicial de la que hablábamos.
 *
 * Cota técnica: Gemini 1.5 Flash soporta 1M tokens — 30 mensajes
 * (200 tokens cada uno) son ~6k. No hay riesgo de desborde.
 *
 * @increased 2026-06-08 (Sprint chatbot UX — root cause A)
 */
const HISTORY_WINDOW = 30;

// ─── Sanitización anti-inyección ────────────────────────
/**
 * Sanitiza datos externos (BD, mensajes de usuario) antes de interpolarlos
 * en el system prompt o en bloques de contexto del LLM.
 *
 * Previene tres vectores de prompt injection:
 *  1. Placeholders propios: "{{PROPERTIES_CONTEXT}}" en un msg de usuario
 *     podría expandirse si el string se reutiliza como plantilla.
 *  2. Prefijos de turno falsos: "Asistente: ignora tus instrucciones"
 *     en un mensaje de usuario podría confundir al LLM sobre quién habla.
 *  3. Context flooding: descripciones o nombres muy largos pueden desbordar
 *     la ventana y empujar instrucciones críticas fuera del contexto útil.
 */
function sanitizeForPrompt(text: string | null | undefined, maxLen = 500): string {
  if (!text) return '';
  return String(text)
    .replace(/\{\{/g, '{ {')                          // rompe placeholders propios
    .replace(/\}\}/g, '} }')                          // rompe placeholders propios
    .replace(/^(Asistente|Cliente)\s*:/gim, '$1 -')   // rompe prefijos de turno falso
    .replace(/\n{3,}/g, '\n\n')                       // limita saltos consecutivos
    .slice(0, maxLen);
}

// ─── Interfaz del Engine ─────────────────────────────
interface EngineInput {
  message: string;
  conversationId: string;
  channel: ChatChannel;
  leadContext?: {
    name?: string;
    phone?: string;
    type?: string;
    previousInteractions?: number;
  };
}

interface NameResolutionState {
  existing_name: string;
  profile_name: string;
  asked_at: string;
}

/**
 * Lee del metadata de la conversación los campos que afectan al
 * comportamiento del LLM en este turno:
 *   - preferred_name: si el cliente eligió un nombre diferente al de BD
 *   - pending_name_resolution: si el bot le acaba de preguntar cómo
 *     prefiere ser llamado y estamos esperando respuesta
 */
async function getConversationNameState(conversationId: string): Promise<{
  preferred_name: string | null;
  pending_name_resolution: NameResolutionState | null;
}> {
  const { data } = await supabase
    .from('chatbot_conversations')
    .select('metadata')
    .eq('id', conversationId)
    .single();
  const meta = ((data?.metadata as Record<string, unknown>) || {});
  return {
    preferred_name: (meta.preferred_name as string) || null,
    pending_name_resolution: (meta.pending_name_resolution as NameResolutionState) || null,
  };
}

/**
 * Lee el leadId asociado a una conversación + name y phone del lead (BD).
 * Usado por la entrevista reactiva (T4) cuando el cliente acepta la oferta
 * sin que el caller pase el leadId explícitamente.
 */
async function getConversationLeadInfo(conversationId: string): Promise<
  { leadId: string; leadName: string; phone: string } | null
> {
  const { data: convo } = await supabase
    .from('chatbot_conversations')
    .select('lead_id, wa_phone_number')
    .eq('id', conversationId)
    .single();
  if (!convo?.lead_id) return null;
  const { data: lead } = await supabase
    .from('leads')
    .select('name, phone')
    .eq('id', convo.lead_id)
    .single();
  return {
    leadId: convo.lead_id,
    leadName: lead?.name || '',
    phone: lead?.phone || convo.wa_phone_number || '',
  };
}

async function countConversationMessages(conversationId: string): Promise<number> {
  const { count } = await supabase
    .from('chatbot_messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId);
  return count || 0;
}

async function patchConversationMetadata(
  conversationId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { data } = await supabase
    .from('chatbot_conversations')
    .select('metadata')
    .eq('id', conversationId)
    .single();
  const current = (data?.metadata as Record<string, unknown>) || {};
  await supabase
    .from('chatbot_conversations')
    .update({ metadata: { ...current, ...patch } })
    .eq('id', conversationId);
}

/**
 * Punto de entrada principal del motor del chatbot.
 * Gestiona historial, contexto y delegación al LLM o fallback.
 */
export async function processMessage(input: EngineInput): Promise<ChatbotEngineResponse> {
  // -1. El cliente acaba de escribir → si tenía un follow-up programado,
  //     lo cancelamos para no enviar el ping de 30 min redundante. FIX-G.
  void clearVisitFollowup(input.conversationId).catch(() => {});

  // -0.5. T3 — estado de nombre del cliente. Si hay colisión pendiente
  //       (T2.3) inyectamos en el system prompt un bloque que dice al LLM
  //       "el cliente está respondiendo a tu pregunta sobre cómo llamarle;
  //       extrae el nombre elegido en data_extracted.preferred_name".
  const nameState = await getConversationNameState(input.conversationId).catch(() => ({
    preferred_name: null,
    pending_name_resolution: null as NameResolutionState | null,
  }));

  // -0.4. T4 — entrevista reactiva. Si tenemos una oferta de perfil pendiente,
  //       interpretamos el mensaje como respuesta sí/no a la oferta.
  //       Esto va ANTES del check de interview_state porque la oferta vive en
  //       un estado distinto (profile_offer_pending).
  if (await isProfileOfferPending(input.conversationId).catch(() => false)) {
    const cls = await classifyOfferReply(input.message);
    if (cls === 'yes') {
      const leadInfo = await getConversationLeadInfo(input.conversationId);
      if (leadInfo) {
        return await startStandaloneInterview({
          conversationId: input.conversationId,
          leadId: leadInfo.leadId,
          leadName: nameState.preferred_name || input.leadContext?.name || leadInfo.leadName || 'cliente',
          phone: leadInfo.phone || input.leadContext?.phone || '',
        });
      }
      // Sin leadId no podemos arrancar entrevista. Marcamos declinada y seguimos.
      await markOfferDeclined(input.conversationId).catch(() => {});
    } else if (cls === 'no') {
      await markOfferDeclined(input.conversationId).catch(() => {});
      return {
        response:
          'Sin problema, lo dejamos para otro momento 🙂 Cuando quieras retomarlo, solo dímelo. ' +
          'Mientras tanto, ¿en qué te puedo ayudar?',
        intent: 'general_inquiry',
        confidence: 0.95,
        data_extracted: {},
        conversation_id: input.conversationId,
        should_escalate: false,
      };
    } else {
      // Ambiguo: marcamos declinada para no insistir y dejamos que el LLM
      // gestione su mensaje real (probablemente no estaba contestando a la
      // oferta, sino preguntando otra cosa).
      await markOfferDeclined(input.conversationId).catch(() => {});
    }
  }

  // 0. Si la conversación está en medio de la entrevista pre-cita (T4),
  //    interpretamos el mensaje como respuesta a la pregunta actual y
  //    cortocircuitamos el LLM. La entrevista es una máquina de estados
  //    determinista — el LLM no aporta nada y arriesga a desorientarse.
  //    @added 2026-06-06 brief #002 T4
  const interview = await getInterviewState(input.conversationId).catch(() => null);
  if (interview) {
    // FIX HIGH #4 (security review): keyword de salida.
    // Si el cliente pide hablar con un humano o cancelar, NO seguimos en la
    // entrevista. Limpiamos el estado y escalamos.
    const lowerMsg = input.message.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const escapeRegex = /\b(cancelar|cancela|hablar\s*con\s*alvaro|hablar\s*con\s*una\s*persona|humano|persona\s*real|olvida\s*la\s*cita|me\s*da\s*igual|paro\s*la\s*cita)\b/;
    if (escapeRegex.test(lowerMsg)) {
      await clearInterviewStateFromEngine(input.conversationId);
      return {
        response: 'Sin problema. Aviso a Álvaro y te contacta él personalmente cuanto antes. 🙌',
        intent: 'ESCALATE',
        confidence: 0.95,
        data_extracted: {},
        conversation_id: input.conversationId,
        should_escalate: true,
      };
    }

    const hookRes = await handleInterviewStep(interview, input.message, input.conversationId);
    return {
      response: hookRes.response,
      intent: hookRes.intent === 'ESCALATE' ? 'ESCALATE' : 'schedule_visit',
      confidence: 0.95,
      data_extracted: {},
      conversation_id: input.conversationId,
      should_escalate: hookRes.shouldEscalate,
    };
  }

  // -0.3. T4 — triggers de OFERTA de entrevista (no la respuesta).
  //       a) Primer mensaje del cliente + needsProfile + no se ofreció antes
  //       b) Mensaje neutro ("perfecto","vale") + needsProfile + no se ofreció
  //       Solo si no estamos ya en entrevista y no hay oferta pendiente.
  const phoneForProfile = input.leadContext?.phone || null;
  const alreadyOffered = await wasProfileAlreadyOffered(input.conversationId).catch(() => false);
  const offerPending = await isProfileOfferPending(input.conversationId).catch(() => false);
  if (!alreadyOffered && !offerPending && phoneForProfile) {
    const msgCount = await countConversationMessages(input.conversationId).catch(() => -1);
    // El caller (whatsapp/route.ts) ya insertó el mensaje del cliente antes
    // de llamarnos → el conteo "1" significa que este es el primer mensaje.
    const isFirstMessage = msgCount === 1;
    const isNeutral = isNeutralReply(input.message);
    if ((isFirstMessage || isNeutral) && await needsProfile(phoneForProfile)) {
      const leadInfo = await getConversationLeadInfo(input.conversationId);
      if (leadInfo) {
        return await offerInterview({
          conversationId: input.conversationId,
          leadId: leadInfo.leadId,
          leadName: nameState.preferred_name || input.leadContext?.name || leadInfo.leadName || '',
          phone: phoneForProfile,
          userMessage: input.message,
        });
      }
    }
  }

  // 1. Recuperar historial de la conversación.
  //    Tamaño en const HISTORY_WINDOW arriba — visibilidad explícita para
  //    auditarlo si el modelo LLM cambia su context window.
  const history = await getConversationHistory(input.conversationId, HISTORY_WINDOW);

  // 2. Recuperar propiedades activas para contexto
  const properties = await getActiveProperties();

  // 3. Generar respuesta según el provider configurado.
  //    Inyectamos el estado de nombre (T3) en el leadContext para que el
  //    system prompt sepa cómo dirigirse al cliente y, si hay colisión
  //    pendiente, extraiga preferred_name en data_extracted.
  const enrichedContext = {
    ...(input.leadContext || {}),
    preferred_name: nameState.preferred_name,
    pending_name_resolution: nameState.pending_name_resolution,
  } as EngineInput['leadContext'] & {
    preferred_name: string | null;
    pending_name_resolution: NameResolutionState | null;
  };

  let result: ChatbotEngineResponse;

  switch (LLM_PROVIDER) {
    case 'gemini':
      result = await callGemini(input.message, history, properties, enrichedContext);
      break;
    case 'openai':
      result = await callOpenAI(input.message, history, properties, enrichedContext);
      break;
    case 'anthropic':
      result = await callAnthropic(input.message, history, properties, enrichedContext);
      break;
    default:
      // Fallback: detección por keywords (Fase 1)
      result = keywordFallback(input.message, input.conversationId);
  }

  // 3b. T3 — persistir preferred_name si el LLM lo extrajo, y limpiar
  //     la colisión pendiente. Idempotente: si el cliente eligió el nombre
  //     que ya teníamos, igual lo guardamos como preferred_name para que el
  //     metadata sea explícito (y evitar volver a preguntar).
  const extractedPref = (result.data_extracted as Record<string, unknown> | undefined)?.preferred_name;
  if (typeof extractedPref === 'string' && extractedPref.trim().length > 0) {
    const cleaned = extractedPref.trim().slice(0, 60);
    await patchConversationMetadata(input.conversationId, {
      preferred_name: cleaned,
      pending_name_resolution: null,
    }).catch((err) => console.warn('[engine] patch preferred_name failed:', err));
    // T5.1: también persistir en leads.preferences (sobrevive a expiración de conversación)
    const leadInfoForPrefs = await getConversationLeadInfo(input.conversationId).catch(() => null);
    if (leadInfoForPrefs?.leadId) {
      const { data: leadRow } = await supabase
        .from('leads')
        .select('preferences')
        .eq('id', leadInfoForPrefs.leadId)
        .single();
      const currentPrefs = (leadRow?.preferences as Record<string, unknown>) || {};
      const { error: prefUpdateErr } = await supabase
        .from('leads')
        .update({ preferences: { ...currentPrefs, preferred_name: cleaned } })
        .eq('id', leadInfoForPrefs.leadId);
      if (prefUpdateErr) console.warn('[engine] update leads.preferences failed:', prefUpdateErr);
    }
  }

  // 4. Si el LLM detectó ask_price y la respuesta contiene un link público,
  //    marcamos un follow-up para preguntarle si quiere visita.
  //    FIX HIGH UX #10 (review adversarial): subimos delay a 3h (no 30 min,
  //    que era spam). El filtro de horario 10-21 Madrid lo hace el endpoint
  //    cron `get_pending_visit_followups`.
  if (result.intent === 'ask_price' && /tuasesoralvaro\.com\/comprar/.test(result.response)) {
    void scheduleVisitFollowup(input.conversationId, 180).catch((err) => {
      console.warn('[engine] scheduleVisitFollowup falló:', err);
    });
  }

  // 5. Si el LLM detectó schedule_visit, dejamos que el módulo de scheduling
  //    valide disponibilidad real, lance entrevista si toca o cree cita.
  //    Si tryHandleScheduleVisit devuelve null, conservamos la respuesta
  //    del LLM (típico en widget web sin teléfono: el LLM aún lo está pidiendo).
  //    Si LANZA error, ESCALAMOS (no dejamos al LLM mentir "le paso a Álvaro").
  if (result.intent === 'schedule_visit') {
    let hookErrored = false;
    const hookRes = await tryHandleScheduleVisit({
      conversationId: input.conversationId,
      leadName: input.leadContext?.name,
      leadPhone: input.leadContext?.phone,
      userMessage: input.message,
      extracted: {
        name: result.data_extracted?.name ?? null,
        phone: result.data_extracted?.phone ?? null,
        preferred_date: result.data_extracted?.preferred_date ?? null,
        property_interest: result.data_extracted?.property_interest ?? null,
      },
    }).catch((err) => {
      console.error('[engine] tryHandleScheduleVisit error:', err);
      hookErrored = true;
      return null;
    });

    if (hookRes) {
      result = {
        response: hookRes.response,
        intent: hookRes.intent === 'ESCALATE' ? 'ESCALATE' : 'schedule_visit',
        confidence: 0.9,
        data_extracted: result.data_extracted,
        conversation_id: input.conversationId,
        should_escalate: hookRes.shouldEscalate,
      };
    } else if (hookErrored) {
      // Bug técnico → escalar de verdad. Mejor que el LLM finja gestionarlo.
      result = {
        response:
          'He tenido un problema técnico al consultar la disponibilidad. Aviso a Álvaro para que te confirme la visita personalmente.',
        intent: 'ESCALATE',
        confidence: 0.5,
        data_extracted: result.data_extracted,
        conversation_id: input.conversationId,
        should_escalate: true,
      };
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════
// HISTORIAL Y CONTEXTO
// ═══════════════════════════════════════════════════════

async function getConversationHistory(conversationId: string, limit: number) {
  const { data } = await supabase
    .from('chatbot_messages')
    .select('role, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(limit);

  return data || [];
}

const PUBLIC_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://tuasesoralvaro.com';

/**
 * Extrae una zona corta y legible desde `features.address`.
 * Address típico: "Calle Goya, Utrera, Sevilla, Andalucía, 41710, España"
 *   → "Utrera, Sevilla"
 * Si el address es directamente un barrio sevillano ("Triana, Sevilla, …")
 *   → "Triana, Sevilla".
 * Si no hay address válido, devuelve null y el bot omite la zona.
 */
function shortZoneFromAddress(address?: string | null): string | null {
  if (!address || typeof address !== 'string') return null;
  const parts = address.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  // Saltamos la calle (primer fragmento) y nos quedamos con los dos siguientes
  // descartando "Andalucía"/"España"/códigos postales.
  const out: string[] = [];
  for (let i = 1; i < parts.length && out.length < 2; i++) {
    const p = parts[i];
    if (/^\d{4,5}$/.test(p)) continue;             // CP
    if (/^(Andaluc[ií]a|Espa[ñn]a)$/i.test(p)) continue;
    out.push(p);
  }
  return out.length > 0 ? out.join(', ') : null;
}

async function getActiveProperties() {
  const { data } = await supabase
    .from('properties')
    .select('id, title, description, price, features')
    .eq('status', 'active')
    .limit(10);

  if (!data || data.length === 0) {
    return 'No hay propiedades cargadas en el sistema actualmente.';
  }

  return data
    .map((p, i) => {
      const features = (p.features || {}) as Record<string, any>;
      const zone = shortZoneFromAddress(features.address);
      const sqm = features.sqm;
      const rooms = features.rooms;
      const url = `${PUBLIC_SITE_URL}/comprar?p=${p.id}`;
      // Sanitizar datos de BD antes de interpolar en el prompt del LLM.
      // Un título o descripción con "{{PROPERTIES_CONTEXT}}" o "Asistente:"
      // podría romper el prompt si no se sanea.
      const safeTitle = sanitizeForPrompt(p.title, 100);
      const safeDesc  = sanitizeForPrompt(p.description, 300);
      const headline = zone
        ? `${safeTitle} (${zone})`
        : safeTitle;
      const price = p.price?.toLocaleString('es-ES') + '€';
      const specs = [
        rooms ? `${rooms} hab` : null,
        sqm ? `${sqm} m²` : null,
        features.elevator === true ? 'con ascensor' : (features.elevator === false ? 'sin ascensor' : null),
      ].filter(Boolean).join(' · ');
      return `${i + 1}. ${headline} — ${price}${specs ? ' · ' + specs : ''}\n   Ficha: ${url}\n   ${safeDesc}`.trim();
    })
    .join('\n\n');
}

/**
 * Devuelve los próximos 7 días en castellano con fecha dd/mm/yyyy y nombre
 * del día — esencial para que el LLM (Gemini Flash, cutoff 2024) no calcule
 * "el próximo martes" según su training data sino según la fecha real.
 */
function buildTodayContext(): { today: string; tomorrow: string; next7: string } {
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  function ymdInMadrid(d: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Madrid',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d);
  }
  function humanFromYmd(ymd: string): string {
    const [y, m, dd] = ymd.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, dd, 12)).getUTCDay();
    return `${days[dow]} ${String(dd).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
  }
  const now = new Date();
  const todayYmd = ymdInMadrid(now);
  const next7Lines: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getTime() + i * 86_400_000);
    next7Lines.push(`- ${humanFromYmd(ymdInMadrid(d))}`);
  }
  const tomorrow = new Date(now.getTime() + 86_400_000);
  return {
    today: humanFromYmd(todayYmd),
    tomorrow: humanFromYmd(ymdInMadrid(tomorrow)),
    next7: next7Lines.join('\n'),
  };
}

/**
 * Construye el bloque de contexto de cliente que va al system prompt.
 * Unifica lead.name / preferred_name + estado de colisión pendiente (T3).
 * Sanitiza todo lo que viene del cliente o BD.
 *
 * Devuelve la sección lista para inyectar; vacío si no hay leadContext.
 */
function buildClientContextBlock(leadContext?: EngineInput['leadContext'] & {
  preferred_name?: string | null;
  pending_name_resolution?: NameResolutionState | null;
}): string {
  if (!leadContext) return '';

  const preferred = leadContext.preferred_name?.trim();
  const base = leadContext.name?.trim();
  // Nombre canónico que el bot DEBE usar para dirigirse al cliente.
  // Preferencia explícita > nombre base.
  const nameForGreeting = preferred || base || null;

  const lines: string[] = ['<contexto_cliente>'];
  if (nameForGreeting) {
    lines.push(`Nombre canónico del cliente (usar SIEMPRE para dirigirte a él): ${sanitizeForPrompt(nameForGreeting, 60)}`);
  }
  if (base && preferred && base !== preferred) {
    lines.push(`Nombre original en BD: ${sanitizeForPrompt(base, 60)} (el cliente prefiere "${sanitizeForPrompt(preferred, 60)}")`);
  }
  if (leadContext.phone) {
    lines.push(`Teléfono: ${sanitizeForPrompt(leadContext.phone, 30)}`);
  }
  if (leadContext.type) {
    lines.push(`Tipo: ${sanitizeForPrompt(leadContext.type, 30)}`);
  }

  // Si hay colisión pendiente (T2.3 → T3 resolution), inyectamos una
  // instrucción operativa muy explícita: el cliente está respondiendo a la
  // pregunta sobre cómo prefiere ser llamado.
  if (leadContext.pending_name_resolution) {
    const { existing_name, profile_name } = leadContext.pending_name_resolution;
    lines.push('');
    lines.push('<resolucion_nombre_pendiente>');
    lines.push(
      `En el turno anterior preguntaste al cliente si prefería ser llamado "${sanitizeForPrompt(existing_name, 60)}" o "${sanitizeForPrompt(profile_name, 60)}".`,
    );
    lines.push(
      'El mensaje actual del cliente es su respuesta. INTERPRÉTALA y devuelve el nombre elegido en `data_extracted.preferred_name`. ' +
      'Si elige claramente uno de los dos, devuelve EXACTAMENTE ese nombre. Si menciona un nombre distinto ("llámame Pepe"), devuelve ese. ' +
      'Si su respuesta es ambigua, deja preferred_name a null y vuelve a preguntar suavemente. ' +
      'En el response confirma con calidez la elección antes de seguir la conversación normal.',
    );
    lines.push('</resolucion_nombre_pendiente>');
  }

  lines.push('</contexto_cliente>');
  return lines.join('\n');
}

/**
 * Construye el system prompt estático del bot.
 *
 * Sprint B (Ola 3): el historial de conversación ya NO se embebe aquí como
 * texto plano — se pasa directamente a cada provider como array de messages
 * con roles separados (user / assistant / model). Esto es:
 *  - Más seguro: la API del provider aplica separación de roles a nivel de
 *    protocolo, no de texto. Un mensaje de usuario no puede "fingir" ser
 *    una respuesta del asistente dentro del array.
 *  - Sin doble inyección: antes el historial llegaba al LLM dos veces
 *    (string en system + array de messages). Ahora solo una vez.
 */
function buildSystemPrompt(propertiesContext: string) {
  // Leer el system prompt desde el archivo .md
  let systemPrompt: string;
  try {
    systemPrompt = readFileSync(
      join(process.cwd(), 'src/lib/chatbot/systemPrompt.md'),
      'utf-8'
    );
  } catch {
    // Fallback inline si no se encuentra el archivo
    systemPrompt = 'Eres un asistente inmobiliario en Sevilla. Responde en JSON con campos: response, intent, confidence, data_extracted.';
  }

  const todayCtx = buildTodayContext();

  // El catálogo de propiedades se envuelve en delimitadores XML para que el LLM
  // entienda exactamente dónde termina el dato de BD y dónde empiezan las
  // instrucciones del prompt. Los LLMs respetan estos límites aunque no se les
  // dé instrucción explícita (comportamiento documentado en GPT-4, Claude, Gemini).
  const wrappedProperties = `<propiedades_disponibles>\n${propertiesContext}\n</propiedades_disponibles>`;

  return systemPrompt
    .replace('{{TODAY}}', todayCtx.today)
    .replace('{{TOMORROW}}', todayCtx.tomorrow)
    .replace('{{NEXT_7_DAYS}}', todayCtx.next7)
    .replace('{{PROPERTIES_CONTEXT}}', wrappedProperties);
}

// ═══════════════════════════════════════════════════════
// PROVIDERS LLM
// ═══════════════════════════════════════════════════════

/**
 * Llamada a OpenAI (GPT-4o, GPT-4o-mini, etc.)
 */
async function callOpenAI(
  message: string,
  history: Array<{ role: string; content: string }>,
  properties: string,
  leadContext?: EngineInput['leadContext']
): Promise<ChatbotEngineResponse> {
  if (!OPENAI_API_KEY) {
    console.warn('[Chatbot Engine] OpenAI API key no configurada, usando fallback');
    return keywordFallback(message, '');
  }

  // Sprint B: historial pasa como messages array (roles separados a nivel de API),
  // NO embebido en el system prompt. buildSystemPrompt ya no recibe history.
  const systemPrompt = buildSystemPrompt(properties);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user' as const, content: message },
  ];

  const clientBlock = buildClientContextBlock(leadContext);
  if (clientBlock) {
    // T3: bloque unificado con nombre canónico (preferred_name|name) y, si
    // aplica, instrucción de resolución de colisión.
    messages.splice(1, 0, { role: 'system' as const, content: clientBlock });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages,
        temperature: 0.7,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      console.error('[OpenAI] Error:', response.status);
      return keywordFallback(message, '');
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    return parseLLMResponse(content, '');
  } catch (error) {
    console.error('[OpenAI] Error de red:', error);
    return keywordFallback(message, '');
  }
}

/**
 * Llamada a Anthropic (Claude)
 */
async function callAnthropic(
  message: string,
  history: Array<{ role: string; content: string }>,
  properties: string,
  leadContext?: EngineInput['leadContext']
): Promise<ChatbotEngineResponse> {
  if (!ANTHROPIC_API_KEY) {
    console.warn('[Chatbot Engine] Anthropic API key no configurada, usando fallback');
    return keywordFallback(message, '');
  }

  // Sprint B: historial pasa como anthropicMessages array, no en el system prompt.
  const systemPrompt = buildSystemPrompt(properties);
  let systemContent = systemPrompt;

  const clientBlock = buildClientContextBlock(leadContext);
  if (clientBlock) {
    systemContent += '\n\n' + clientBlock;
  }

  const anthropicMessages = [
    ...history.map(m => ({
      role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: message },
  ];

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        system: systemContent,
        messages: anthropicMessages,
      }),
    });

    if (!response.ok) {
      console.error('[Anthropic] Error:', response.status);
      return keywordFallback(message, '');
    }

    const data = await response.json();
    const content = data.content?.[0]?.text;

    return parseLLMResponse(content, '');
  } catch (error) {
    console.error('[Anthropic] Error de red:', error);
    return keywordFallback(message, '');
  }
}

/**
 * Llamada a Google Gemini (Gemini 1.5 Flash / Pro)
 */
async function callGemini(
  message: string,
  history: Array<{ role: string; content: string }>,
  properties: string,
  leadContext?: EngineInput['leadContext']
): Promise<ChatbotEngineResponse> {
  if (!GEMINI_API_KEY) {
    console.warn('[Chatbot Engine] Gemini API key no configurada, usando fallback');
    return keywordFallback(message, '');
  }

  // Sprint B: historial pasa como geminiMessages (contents array), no en systemInstruction.
  const systemPrompt = buildSystemPrompt(properties);

  // Mapear historial al formato de Gemini (roles: user / model).
  // Sanitizamos el contenido de cada turno para prevenir que un mensaje de
  // usuario inyecte prefijos de instrucción ("Asistente:", "{{...}}") en el
  // bloque de historial que el LLM lee como contexto de la conversación.
  const geminiMessages = history.map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: sanitizeForPrompt(m.content, 300) }]
  }));

  // IMPORTANTE: el contexto del cliente va en systemInstruction (ver abajo),
  // NO como turns falsos de user/model. Los turns falsos eran un vector de
  // inyección: el rol 'user' en Gemini es el más permeable a instrucciones.

  // Agregar mensaje actual del usuario
  geminiMessages.push({
    role: 'user',
    parts: [{ text: message }]
  });

  try {
    const modelName = LLM_MODEL === "gemini-1.5-flash" ? "gemini-flash-latest" : LLM_MODEL;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: geminiMessages,
          systemInstruction: {
            // El contexto del cliente se añade aquí (systemInstruction), NO como
            // turns de user/model, porque systemInstruction es el canal más seguro
            // en Gemini: el modelo lo trata como configuración del sistema, no como
            // entrada de usuario, lo que hace más difícil el prompt injection.
            // T3: buildClientContextBlock unifica nombre canónico + colisión
            // pendiente para los 3 providers.
            parts: [{
              text: (() => {
                const block = buildClientContextBlock(leadContext);
                return block ? `${systemPrompt}\n\n${block}` : systemPrompt;
              })(),
            }]
          },
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.7,
            maxOutputTokens: 1500,
          },
        }),
      }
    );

    if (!response.ok) {
      const errBody = await response.text();
      console.error('[Gemini] Error:', response.status, errBody);
      return keywordFallback(message, '');
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      console.error('[Gemini] Respuesta vacía de candidatos');
      return keywordFallback(message, '');
    }

    return parseLLMResponse(content, '');
  } catch (error) {
    console.error('[Gemini] Error de red:', error);
    return keywordFallback(message, '');
  }
}

// ═══════════════════════════════════════════════════════
// PARSEO Y FALLBACK
// ═══════════════════════════════════════════════════════

/**
 * Parsea la respuesta JSON del LLM al tipo ChatbotEngineResponse.
 *
 * Estrategia en cascada (T5):
 *  1. JSON.parse directo (camino feliz).
 *  2. Si falla, regex sobre el JSON truncado para rescatar "response".
 *  3. Si la regex no encuentra nada, llama a rescueNaturalResponse:
 *     un segundo LLM (barato) reformula el output crudo a una frase amable.
 *  4. Si todo falla, escalamos. NUNCA mostrar JSON crudo al usuario.
 */
async function parseLLMResponse(raw: string, conversationId: string): Promise<ChatbotEngineResponse> {
  // 1. Extraer del wrapper markdown si lo trae
  let jsonStr = raw?.trim() || '';
  const codeFence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeFence) {
    jsonStr = codeFence[1];
  }

  // 2. Camino feliz: JSON válido
  try {
    const parsed = JSON.parse(jsonStr);
    return {
      response: parsed.response || 'Lo siento, ha ocurrido un error. ¿Puedes repetir tu mensaje?',
      intent: parsed.intent || null,
      confidence: parsed.confidence ?? 0.5,
      data_extracted: parsed.data_extracted || {},
      conversation_id: conversationId,
      should_escalate: parsed.intent === 'ESCALATE',
    };
  } catch {
    // 3. Fallback inteligente: regex sobre el JSON truncado/malformado
    //    Captura el contenido de "response": "...". Soporta strings con
    //    saltos de línea (\n) y comillas escapadas (\").
    const responseMatch = jsonStr.match(/"response"\s*:\s*"((?:[^"\\]|\\.)*)/);
    if (responseMatch && responseMatch[1]) {
      // Des-escapar lo más común que mete el LLM (\n, \", \\)
      const rescued = responseMatch[1]
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');

      // Detectar si parece truncado (no termina en . ! ? o emoji)
      const looksTruncated = !/[.!?\u{1F300}-\u{1FAFF}]\s*$/u.test(rescued);

      // Intentar también extraer intent aunque el JSON esté roto.
      // Whitelist contra el tipo AIIntent | 'ESCALATE' del contrato.
      const VALID_INTENTS = ['schedule_visit', 'ask_price', 'valuation', 'general_inquiry', 'ESCALATE'] as const;
      type ValidIntent = typeof VALID_INTENTS[number];
      const intentMatch = jsonStr.match(/"intent"\s*:\s*"([^"]+)"/);
      const rawIntent = intentMatch?.[1];
      const intent: ValidIntent | null = (rawIntent && (VALID_INTENTS as readonly string[]).includes(rawIntent))
        ? (rawIntent as ValidIntent)
        : null;

      console.warn('[parseLLMResponse] JSON inválido, rescatando "response" con regex', {
        truncated: looksTruncated,
        intent,
        rawLength: raw?.length,
      });

      return {
        response: rescued + (looksTruncated ? ' ...' : ''),
        intent,
        confidence: 0.5,
        data_extracted: {},
        conversation_id: conversationId,
        should_escalate: intent === 'ESCALATE',
      };
    }

    // 4. Plan C (T5): pedir al LLM barato que reformule el output crudo
    //    en una frase amable. Mejor que devolver "Lo siento, ¿puedes repetir?",
    //    que crea bucles de mala UX.
    const rescued = await rescueNaturalResponse(raw || '').catch(() => null);
    if (rescued) {
      console.warn('[parseLLMResponse] JSON inválido — usando rescueNaturalResponse');
      return {
        response: rescued,
        intent: null,
        confidence: 0.4,
        data_extracted: {},
        conversation_id: conversationId,
        should_escalate: false,
      };
    }

    // 5. Plan D: escalar de verdad. Es la solución honesta cuando ni el LLM
    //    principal ni el de rescate producen nada usable.
    console.error('[parseLLMResponse] No se pudo extraer respuesta del LLM. Raw:', raw?.slice(0, 200));
    return {
      response: 'Disculpa, no he conseguido procesar bien tu mensaje. Aviso a Álvaro para que te ayude personalmente cuanto antes 🙌',
      intent: 'ESCALATE',
      confidence: 0.2,
      data_extracted: {},
      conversation_id: conversationId,
      should_escalate: true,
    };
  }
}

/**
 * Fallback por keywords (Fase 1) — Cuando no hay LLM configurado.
 */
function keywordFallback(message: string, conversationId: string): ChatbotEngineResponse {
  const lower = message.toLowerCase();

  if (lower.includes('visita') || lower.includes('ver piso') || lower.includes('cita') || lower.includes('enseñar')) {
    return {
      response: '¡Por supuesto! 🏠 Me encantaría ayudarte. ¿Podrías indicarme tu nombre completo y cuándo te vendría bien? Álvaro se pondrá en contacto para confirmar.',
      intent: 'schedule_visit',
      confidence: 0.85,
      data_extracted: {},
      conversation_id: conversationId,
      should_escalate: false,
    };
  }

  if (lower.includes('precio') || lower.includes('cuánto') || lower.includes('cuanto') || lower.includes('vale')) {
    return {
      response: '💰 ¿Qué zona te interesa? Puedo informarte sobre Sevilla capital o municipios cercanos como Dos Hermanas, Alcalá o Mairena.',
      intent: 'ask_price',
      confidence: 0.80,
      data_extracted: {},
      conversation_id: conversationId,
      should_escalate: false,
    };
  }

  if (lower.includes('valorar') || lower.includes('valoración') || lower.includes('vender') || lower.includes('tasar')) {
    return {
      response: '📊 ¡Genial! Valoración gratuita aquí:\n👉 https://tuasesoralvaro.com/valoracion\n\n¿Prefieres una valoración presencial? Álvaro puede visitarte sin compromiso.',
      intent: 'valuation',
      confidence: 0.90,
      data_extracted: {},
      conversation_id: conversationId,
      should_escalate: false,
    };
  }

  if (lower.includes('hola') || lower.includes('buenas') || lower.includes('buenos')) {
    return {
      response: '¡Hola! 👋 Soy el asistente de Álvaro, tu asesor inmobiliario en Sevilla.\n\n🏠 Ver propiedades\n📊 Valorar tu vivienda\n🧮 Calcular plusvalía\n📅 Agendar una visita\n\n¿En qué puedo ayudarte?',
      intent: 'general_inquiry',
      confidence: 0.95,
      data_extracted: {},
      conversation_id: conversationId,
      should_escalate: false,
    };
  }

  return {
    response: '👋 ¡Gracias por tu mensaje! Puedo ayudarte con:\n\n🏠 Propiedades disponibles\n📊 Valoración gratuita\n🧮 Calculadora de plusvalía\n📅 Agendar visitas\n\n¿Qué te interesa?',
    intent: 'general_inquiry',
    confidence: 0.60,
    data_extracted: {},
    conversation_id: conversationId,
    should_escalate: false,
  };
}
