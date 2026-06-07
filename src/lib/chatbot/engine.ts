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

/**
 * Punto de entrada principal del motor del chatbot.
 * Gestiona historial, contexto y delegación al LLM o fallback.
 */
export async function processMessage(input: EngineInput): Promise<ChatbotEngineResponse> {
  // -1. El cliente acaba de escribir → si tenía un follow-up programado,
  //     lo cancelamos para no enviar el ping de 30 min redundante. FIX-G.
  void clearVisitFollowup(input.conversationId).catch(() => {});

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

  // 1. Recuperar historial de la conversación (últimos 10 mensajes)
  const history = await getConversationHistory(input.conversationId, 10);

  // 2. Recuperar propiedades activas para contexto
  const properties = await getActiveProperties();

  // 3. Generar respuesta según el provider configurado
  let result: ChatbotEngineResponse;

  switch (LLM_PROVIDER) {
    case 'gemini':
      result = await callGemini(input.message, history, properties, input.leadContext);
      break;
    case 'openai':
      result = await callOpenAI(input.message, history, properties, input.leadContext);
      break;
    case 'anthropic':
      result = await callAnthropic(input.message, history, properties, input.leadContext);
      break;
    default:
      // Fallback: detección por keywords (Fase 1)
      result = keywordFallback(input.message, input.conversationId);
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
      const headline = zone
        ? `${p.title} (${zone})`
        : p.title;
      const price = p.price?.toLocaleString('es-ES') + '€';
      const specs = [
        rooms ? `${rooms} hab` : null,
        sqm ? `${sqm} m²` : null,
        features.elevator === true ? 'con ascensor' : (features.elevator === false ? 'sin ascensor' : null),
      ].filter(Boolean).join(' · ');
      return `${i + 1}. ${headline} — ${price}${specs ? ' · ' + specs : ''}\n   Ficha: ${url}\n   ${p.description || ''}`.trim();
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

function buildSystemPrompt(propertiesContext: string, history: Array<{ role: string; content: string }>) {
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

  // Sustituir placeholders
  const historyText = history
    .map(m => `${m.role === 'user' ? 'Cliente' : 'Asistente'}: ${m.content}`)
    .join('\n');

  const todayCtx = buildTodayContext();

  return systemPrompt
    .replace('{{TODAY}}', todayCtx.today)
    .replace('{{TOMORROW}}', todayCtx.tomorrow)
    .replace('{{NEXT_7_DAYS}}', todayCtx.next7)
    .replace('{{PROPERTIES_CONTEXT}}', propertiesContext)
    .replace('{{CONVERSATION_HISTORY}}', historyText || '(Primera interacción)');
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

  const systemPrompt = buildSystemPrompt(properties, history);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user' as const, content: message },
  ];

  if (leadContext?.name) {
    messages.splice(1, 0, {
      role: 'system' as const,
      content: `Contexto del cliente: Nombre: ${leadContext.name}, Teléfono: ${leadContext.phone || 'desconocido'}, Tipo: ${leadContext.type || 'desconocido'}, Interacciones previas: ${leadContext.previousInteractions || 0}`,
    });
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

  const systemPrompt = buildSystemPrompt(properties, history);
  let systemContent = systemPrompt;

  if (leadContext?.name) {
    systemContent += `\n\nContexto del cliente: Nombre: ${leadContext.name}, Teléfono: ${leadContext.phone || 'desconocido'}`;
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

  const systemPrompt = buildSystemPrompt(properties, history);

  // Mapear historial al formato de Gemini (roles: user / model)
  const geminiMessages = history.map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }]
  }));

  // Agregar contexto del cliente si existe
  if (leadContext?.name) {
    geminiMessages.unshift({
      role: 'user',
      parts: [{
        text: `Contexto del cliente actual: Nombre: ${leadContext.name}, Teléfono: ${leadContext.phone || 'desconocido'}, Tipo: ${leadContext.type || 'desconocido'}. Por favor, asume esta identidad en la conversación.`
      }]
    });
    geminiMessages.unshift({
      role: 'model',
      parts: [{ text: 'Entendido. Tengo el contexto del cliente y responderé de forma personalizada.' }]
    });
  }

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
            parts: [{ text: systemPrompt }]
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
 * Estrategia en cascada:
 *  1. JSON.parse directo (camino feliz).
 *  2. Si falla (LLM truncado por maxOutputTokens, sintaxis defectuosa, etc.),
 *     intentar rescatar el campo `response` con regex — así el usuario ve
 *     texto útil en vez del JSON crudo.
 *  3. Si todo falla, devolver un mensaje neutro. NUNCA mostrar JSON al usuario.
 */
function parseLLMResponse(raw: string, conversationId: string): ChatbotEngineResponse {
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

    // 4. Último recurso: ni JSON válido ni regex encontró "response"
    console.error('[parseLLMResponse] No se pudo extraer respuesta del LLM. Raw:', raw?.slice(0, 200));
    return {
      response: 'Disculpa, he tenido un problema procesando tu mensaje. ¿Puedes reformularlo? Si lo prefieres, dime "hablar con Álvaro" y te pongo en contacto con él.',
      intent: null,
      confidence: 0.2,
      data_extracted: {},
      conversation_id: conversationId,
      should_escalate: false,
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
