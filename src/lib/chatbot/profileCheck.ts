/**
 * Entrevista reactiva — perfil del comprador (T4).
 *
 * Contexto:
 *   Tras una reserva web o un primer contacto WhatsApp sin perfil completo,
 *   el bot debe OFRECER (no imponer) una mini-entrevista de 3 preguntas
 *   para conocer al cliente y poder avisarle de inmuebles que encajen.
 *
 * Tono:
 *   Educado, opcional, nunca insistente. Si el cliente declina, no se
 *   vuelve a preguntar en la misma conversación.
 *
 * Triggers:
 *   (a) primer mensaje del cliente en la conversación + needsProfile
 *   (b) mensaje neutro ("perfecto", "vale", "ok", "gracias", "👍")
 *       + needsProfile + !profile_offered
 *
 * Estado en metadata:
 *   profile_offered          — true cuando ya hemos ofrecido y no insistimos
 *   profile_offer_pending    — true mientras esperamos su respuesta sí/no
 *
 * @added 2026-06-08 Sprint chatbot UX — T4
 */

import { createClient } from '@supabase/supabase-js';
import { normalizeEsPhone } from '@/lib/phone';
import type { ChatbotEngineResponse } from '@/types';
import type { InterviewState } from './scheduling';
import { parseWithLLM } from './llmParser';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);

// ─── Detección de necesidad de perfil ──────────────────────────────────────

/**
 * Devuelve true si el lead necesita una entrevista de perfil:
 *  - No existe buyers_demands para su phone, O
 *  - Existe pero `savings_contribution` y `funding_type` están en defaults
 *    (savings=0 y funding='Contado'), lo que significa que nunca se
 *    rellenaron de verdad — son los valores default del INSERT inicial.
 *
 * Se llama mucho (cada mensaje en el peor caso), por eso es una sola query
 * indexada por phone.
 */
export async function needsProfile(phone: string | null | undefined): Promise<boolean> {
  if (!phone) return false;
  const normalized = normalizeEsPhone(phone);
  if (!normalized) return false;

  const { data } = await supabaseAdmin
    .from('buyers_demands')
    .select('savings_contribution, funding_type')
    .eq('phone', normalized)
    .limit(1);

  if (!data || data.length === 0) return true; // no hay registro → necesita

  const d = data[0];
  const savings = Number(d.savings_contribution || 0);
  const funding = String(d.funding_type || '').toLowerCase();
  // "Contado" es el default del INSERT (column default); si el cliente nunca
  // respondió la entrevista, ambos siguen en defaults.
  const stillDefault = savings === 0 && (funding === 'contado' || funding === '');
  return stillDefault;
}

// ─── Detección de mensaje neutro ───────────────────────────────────────────

const NEUTRAL_REPLY_REGEX = /^(?:\s*(?:perfecto|perfect@|vale|ok|okay|okey|👍|🙌|👌|✌️|👏|de\s*acuerdo|genial|estupendo|gracias|muchas\s*gracias|mil\s*gracias|grax|gx|si\s*gracias|guay|fantastico|fantástico|bien|esta\s*bien|está\s*bien|claro|sip|yep|ya)[\s.!¡¿?😊🙂😀😃😄]*)+$/i;

export function isNeutralReply(message: string): boolean {
  if (!message) return false;
  const trimmed = message.trim();
  if (trimmed.length === 0 || trimmed.length > 60) return false;
  return NEUTRAL_REPLY_REGEX.test(trimmed);
}

// ─── Detección de respuesta sí/no a la oferta ──────────────────────────────

const AFFIRM_REGEX = /^\s*(?:s[ií]+|sí|si|claro|venga|vale|ok|okay|okey|dale|por\s*supuesto|adelante|hagamos|cuenta|cuéntame|cu[eé]ntame|pregunta|preg[uú]ntame|tira|sigue|por\s*favor|empez(?:amos|emos|ar)|empezamos|sí\s*claro|sí\s*por\s*favor|estaría\s*bien|me\s*parece\s*bien|me\s*viene\s*bien)[\s.!¡¿?😊🙂👍🙌]*$/i;
const REJECT_REGEX = /^\s*(?:no|nop|ahora\s*no|otro\s*d[ií]a|otra\s*vez|paso|otro\s*momento|no\s*gracias|m[aá]s\s*tarde|luego|tal\s*vez\s*despu[eé]s|d[eé]jame\s*pensarlo)[\s.!¡¿?😊🙂]*$/i;

export async function classifyOfferReply(message: string): Promise<'yes' | 'no' | 'unsure'> {
  if (!message) return 'unsure';
  const t = message.trim();
  if (AFFIRM_REGEX.test(t)) return 'yes';
  if (REJECT_REGEX.test(t)) return 'no';

  // Fallback al LLM si la respuesta es natural / ambigua.
  const llm = await parseWithLLM<string>(
    '¿Quieres responder ahora 3 preguntas rápidas sobre lo que buscas?',
    message,
    { type: 'enum', enumValues: ['yes', 'no', 'unsure'] },
  );
  if (llm === 'yes' || llm === 'no') return llm;
  return 'unsure';
}

// ─── Construcción de la oferta ─────────────────────────────────────────────

export function buildInterviewOfferText(name: string | null | undefined): string {
  const greeting = name ? `Por cierto ${name}` : 'Por cierto';
  return (
    `${greeting}, ¿te puedo hacer 3 preguntas rápidas para entender mejor qué buscas y avisarte si entra algo bueno? ` +
    `Tarda menos de 30 segundos 🙂 (Si prefieres ahora no, sin problema — me lo dices y seguimos).`
  );
}

// ─── Helpers de metadata ──────────────────────────────────────────────────

async function getConversationMetadataInternal(conversationId: string): Promise<Record<string, unknown>> {
  const { data } = await supabaseAdmin
    .from('chatbot_conversations')
    .select('metadata')
    .eq('id', conversationId)
    .single();
  return (data?.metadata as Record<string, unknown>) || {};
}

async function setConversationMetadataInternal(
  conversationId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const current = await getConversationMetadataInternal(conversationId);
  await supabaseAdmin
    .from('chatbot_conversations')
    .update({ metadata: { ...current, ...patch } })
    .eq('id', conversationId);
}

export async function isProfileOfferPending(conversationId: string): Promise<boolean> {
  const meta = await getConversationMetadataInternal(conversationId);
  return Boolean(meta.profile_offer_pending);
}

export async function wasProfileAlreadyOffered(conversationId: string): Promise<boolean> {
  const meta = await getConversationMetadataInternal(conversationId);
  return Boolean(meta.profile_offered);
}

// ─── Oferta de entrevista ──────────────────────────────────────────────────

export interface OfferInterviewInput {
  conversationId: string;
  leadId: string;
  leadName: string;
  phone: string;
  /** Mensaje del cliente que activó la oferta (para logging). */
  userMessage: string;
}

/**
 * Ofrece la entrevista. Marca profile_offer_pending=true en metadata para
 * que el siguiente mensaje del cliente sea interpretado como respuesta.
 * NO inicia la entrevista — solo pide permiso.
 */
export async function offerInterview(input: OfferInterviewInput): Promise<ChatbotEngineResponse> {
  const text = buildInterviewOfferText(input.leadName);
  await setConversationMetadataInternal(input.conversationId, {
    profile_offer_pending: {
      lead_id: input.leadId,
      lead_name: input.leadName,
      phone: input.phone,
      asked_at: new Date().toISOString(),
    },
  });
  return {
    response: text,
    intent: 'general_inquiry',
    confidence: 0.95,
    data_extracted: {},
    conversation_id: input.conversationId,
    should_escalate: false,
  };
}

// ─── Arranque de la entrevista standalone ──────────────────────────────────

const STANDALONE_FIRST_QUESTION =
  '¡Genial! 💰 Empezamos. ¿Qué ahorros tendrías aproximadamente para aportar a la compra? (la cifra que prefieras — "30 mil", "50.000€" o lo que sea)';

/**
 * Inicializa el interview_state en mode='standalone' (sin cita ni inmueble
 * objetivo). El siguiente mensaje del cliente entra ya en la máquina de
 * estados normal de scheduling.handleInterviewStep.
 */
export async function startStandaloneInterview(input: {
  conversationId: string;
  leadId: string;
  leadName: string;
  phone: string;
}): Promise<ChatbotEngineResponse> {
  const state: InterviewState = {
    step: 1,
    answers: {},
    attempts: 0,
    mode: 'standalone',
    target: {
      propertyId: '',
      propertyTitle: '',
      propertyZone: null,
      scheduledAt: '',
      leadId: input.leadId,
      leadName: input.leadName,
      leadPhone: normalizeEsPhone(input.phone) || input.phone,
    },
    startedAt: new Date().toISOString(),
  };
  await setConversationMetadataInternal(input.conversationId, {
    interview_state: state,
    profile_offer_pending: null,
    profile_offered: true,
  });

  return {
    response: STANDALONE_FIRST_QUESTION,
    intent: 'general_inquiry',
    confidence: 0.95,
    data_extracted: {},
    conversation_id: input.conversationId,
    should_escalate: false,
  };
}

// ─── Cierre de oferta declinada ────────────────────────────────────────────

export async function markOfferDeclined(conversationId: string): Promise<void> {
  await setConversationMetadataInternal(conversationId, {
    profile_offer_pending: null,
    profile_offered: true,
  });
}
