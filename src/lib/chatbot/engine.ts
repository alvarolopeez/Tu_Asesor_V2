import { supabase } from '@/lib/supabase';
import type { ChatbotEngineResponse, ChatChannel } from '@/types';
import { readFileSync } from 'fs';
import { join } from 'path';

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

async function getActiveProperties() {
  const { data } = await supabase
    .from('properties')
    .select('title, description, price, features')
    .eq('status', 'active')
    .limit(10);

  if (!data || data.length === 0) {
    return 'No hay propiedades cargadas en el sistema actualmente.';
  }

  return data
    .map((p, i) => `${i + 1}. ${p.title} — ${p.price?.toLocaleString('es-ES')}€ — ${p.description || 'Sin descripción'}`)
    .join('\n');
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

  return systemPrompt
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
            maxOutputTokens: 800,
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
 */
function parseLLMResponse(raw: string, conversationId: string): ChatbotEngineResponse {
  try {
    // Intentar extraer JSON del contenido (puede venir envuelto en markdown)
    let jsonStr = raw;
    const jsonMatch = raw.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    const parsed = JSON.parse(jsonStr);

    return {
      response: parsed.response || 'Lo siento, ha ocurrido un error. ¿Puedes repetir tu mensaje?',
      intent: parsed.intent || null,
      confidence: parsed.confidence || 0.5,
      data_extracted: parsed.data_extracted || {},
      conversation_id: conversationId,
      should_escalate: parsed.intent === 'ESCALATE',
    };
  } catch {
    // Si no se puede parsear, usar la respuesta raw
    return {
      response: raw || 'Lo siento, no he podido procesar tu mensaje. ¿Puedes reformularlo?',
      intent: null,
      confidence: 0.3,
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
