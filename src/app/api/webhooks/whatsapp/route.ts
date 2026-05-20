import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * Webhook receptor de WhatsApp Cloud API (Meta Business).
 * 
 * GET  → Verificación del webhook (Meta envía un challenge al configurar la app)
 * POST → Recepción de mensajes entrantes desde la API oficial de Meta
 * 
 * Requisitos:
 * - App creada en Facebook Developers (developers.facebook.com)
 * - WhatsApp Business API configurada
 * - Webhook URL registrada: https://tuasesoralvaro.es/api/webhooks/whatsapp
 * - WHATSAPP_VERIFY_TOKEN configurado en .env.local
 * - WHATSAPP_ACCESS_TOKEN configurado en .env.local (para enviar respuestas)
 * - WHATSAPP_PHONE_NUMBER_ID configurado en .env.local
 * 
 * @agent IA/Automatización
 * @created 2026-05-14
 * @updated 2026-05-19 — Limpiado a solo Meta Cloud API oficial
 */

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || '';
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || '';
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';

// ─── GET: Verificación del Webhook por Meta ──────────
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[WhatsApp Webhook] ✅ Verificación Meta exitosa');
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn('[WhatsApp Webhook] ❌ Verificación fallida — Token inválido');
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// ─── POST: Recepción de Mensajes Entrantes ───────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Log de auditoría
    await supabase.from('n8n_webhook_logs').insert({
      webhook_name: 'whatsapp_incoming',
      source: 'whatsapp',
      payload: body,
      response_status: 200,
    });

    // Extraer datos del formato Meta Cloud API
    const parsed = parseMetaPayload(body);

    if (!parsed) {
      // No es un mensaje procesable (status update, read receipt, etc.)
      return NextResponse.json({ status: 'ok', type: 'non_message_event' });
    }

    console.log(`[WhatsApp] 📱 ${parsed.contactName} (${parsed.phoneNumber}): ${parsed.messageText}`);

    // 1. Buscar o crear lead por teléfono
    const leadId = await findOrCreateLead(parsed.phoneNumber, parsed.contactName);

    // 2. Buscar o crear conversación activa
    const conversationId = await findOrCreateConversation(
      parsed.phoneNumber, leadId, parsed.contactName
    );

    // 3. Guardar el mensaje del usuario
    if (conversationId) {
      await supabase.from('chatbot_messages').insert({
        conversation_id: conversationId,
        role: 'user',
        content: parsed.messageText,
        wa_message_id: parsed.messageId,
      });
    }

    // 4. Generar respuesta del chatbot (keywords hasta que se active LLM)
    const chatbotResponse = generateChatbotResponse(parsed.messageText);

    // 5. Guardar respuesta del asistente en BD
    if (conversationId) {
      await supabase.from('chatbot_messages').insert({
        conversation_id: conversationId,
        role: 'assistant',
        content: chatbotResponse.response,
        intent_detected: chatbotResponse.intent,
        confidence: chatbotResponse.confidence,
      });
    }

    // 6. Enviar respuesta por WhatsApp Cloud API
    if (ACCESS_TOKEN && PHONE_NUMBER_ID) {
      await sendWhatsAppMessage(parsed.phoneNumber, chatbotResponse.response);
    }

    return NextResponse.json({
      status: 'ok',
      lead_id: leadId,
      conversation_id: conversationId,
      message_received: parsed.messageText,
      reply: chatbotResponse.response,
      intent: chatbotResponse.intent,
      confidence: chatbotResponse.confidence,
    });
  } catch (error) {
    console.error('[WhatsApp Webhook] Error:', error);

    await supabase.from('n8n_webhook_logs').insert({
      webhook_name: 'whatsapp_incoming',
      source: 'whatsapp',
      payload: { error: String(error) },
      response_status: 500,
      error_message: String(error),
    });

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════
// FUNCIONES AUXILIARES
// ═══════════════════════════════════════════════════════

interface ParsedMessage {
  phoneNumber: string;
  contactName: string;
  messageText: string;
  messageId: string;
  messageType: string;
}

/**
 * Parsea el payload de WhatsApp Cloud API (Meta).
 * Formato: entry[].changes[].value.messages[]
 * 
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
 */
function parseMetaPayload(body: Record<string, unknown>): ParsedMessage | null {
  if (!body.entry) return null;

  const entry = (body.entry as Array<Record<string, unknown>>)?.[0];
  if (!entry?.changes) return null;

  const changes = (entry.changes as Array<Record<string, unknown>>)?.[0];
  const value = changes?.value as Record<string, unknown> | undefined;
  if (!value) return null;

  // Verificar que hay mensajes (no solo status updates)
  const messages = value.messages as Array<Record<string, unknown>> | undefined;
  if (!messages || messages.length === 0) return null;

  const message = messages[0];
  const contacts = value.contacts as Array<Record<string, unknown>> | undefined;
  const contact = contacts?.[0];

  // Extraer texto según el tipo de mensaje
  const messageType = String(message.type || 'text');
  let messageText = '';

  switch (messageType) {
    case 'text': {
      const textObj = message.text as Record<string, string> | undefined;
      messageText = textObj?.body || '';
      break;
    }
    case 'image':
    case 'video':
    case 'document': {
      const mediaObj = message[messageType] as Record<string, string> | undefined;
      messageText = mediaObj?.caption
        ? `[📎 ${messageType}] ${mediaObj.caption}`
        : `[📎 ${messageType} recibido]`;
      break;
    }
    case 'location': {
      const locObj = message.location as Record<string, number> | undefined;
      messageText = locObj
        ? `[📍 Ubicación: ${locObj.latitude}, ${locObj.longitude}]`
        : '[📍 Ubicación recibida]';
      break;
    }
    case 'audio':
      messageText = '[🎤 Audio recibido]';
      break;
    case 'sticker':
      messageText = '[🏷️ Sticker recibido]';
      break;
    case 'reaction': {
      const reactionObj = message.reaction as Record<string, string> | undefined;
      messageText = `[Reacción: ${reactionObj?.emoji || '👍'}]`;
      break;
    }
    default:
      messageText = `[${messageType} no soportado]`;
  }

  const profileObj = contact?.profile as Record<string, string> | undefined;

  return {
    phoneNumber: String(message.from || ''),
    contactName: profileObj?.name || 'Desconocido',
    messageText,
    messageId: String(message.id || ''),
    messageType,
  };
}

/**
 * Envía un mensaje de texto por WhatsApp Cloud API.
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/messages
 */
async function sendWhatsAppMessage(to: string, text: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'text',
          text: { body: text },
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[WhatsApp Cloud API] Error enviando:', response.status, errorBody);
      return false;
    }

    console.log(`[WhatsApp Cloud API] ✅ Mensaje enviado a ${to}`);
    return true;
  } catch (error) {
    console.error('[WhatsApp Cloud API] Error de red:', error);
    return false;
  }
}

/**
 * Busca un lead por teléfono o crea uno nuevo.
 */
async function findOrCreateLead(phone: string, name: string): Promise<string | null> {
  const { data: existing } = await supabase
    .from('leads')
    .select('id')
    .eq('phone', phone)
    .limit(1);

  if (existing && existing.length > 0) {
    return existing[0].id;
  }

  const { data: newLead } = await supabase
    .from('leads')
    .insert({
      name,
      phone,
      type: 'buyer',
      source: 'whatsapp',
      status: 'new',
    })
    .select('id')
    .single();

  return newLead?.id || null;
}

/**
 * Busca una conversación activa o crea una nueva.
 */
async function findOrCreateConversation(
  phone: string,
  leadId: string | null,
  contactName: string
): Promise<string | null> {
  const { data: existing } = await supabase
    .from('chatbot_conversations')
    .select('id')
    .eq('wa_phone_number', phone)
    .eq('status', 'active')
    .limit(1);

  if (existing && existing.length > 0) {
    return existing[0].id;
  }

  const { data: newConv } = await supabase
    .from('chatbot_conversations')
    .insert({
      lead_id: leadId,
      channel: 'whatsapp',
      wa_phone_number: phone,
      status: 'active',
      metadata: { contact_name: contactName },
    })
    .select('id')
    .single();

  return newConv?.id || null;
}

/**
 * Motor de respuesta del chatbot (keywords).
 * Se reemplazará por el chatbot engine con LLM cuando se configure.
 */
function generateChatbotResponse(message: string) {
  const lower = message.toLowerCase();

  if (lower.includes('visita') || lower.includes('ver piso') || lower.includes('cita') || lower.includes('enseñar')) {
    return {
      response: '¡Por supuesto! 🏠 Me encantaría ayudarte a visitar la propiedad. ¿Podrías indicarme tu nombre completo y cuándo te vendría bien? Álvaro se pondrá en contacto contigo para confirmar.',
      intent: 'schedule_visit',
      confidence: 0.85,
    };
  }

  if (lower.includes('precio') || lower.includes('cuánto') || lower.includes('cuanto') || lower.includes('vale') || lower.includes('costar')) {
    return {
      response: '💰 Para darte información precisa sobre precios, necesitaría saber qué zona te interesa. ¿Buscas en Sevilla capital o en algún municipio cercano como Dos Hermanas, Alcalá o Mairena del Aljarafe?',
      intent: 'ask_price',
      confidence: 0.80,
    };
  }

  if (lower.includes('valorar') || lower.includes('valoración') || lower.includes('vender') || lower.includes('tasar')) {
    return {
      response: '📊 ¡Genial! Puedes obtener una valoración orientativa gratuita aquí:\n👉 https://tuasesoralvaro.es/valoracion\n\nSi prefieres una valoración presencial más precisa, Álvaro puede visitarte sin compromiso. ¿Qué prefieres?',
      intent: 'valuation',
      confidence: 0.90,
    };
  }

  if (lower.includes('plusvalia') || lower.includes('plusvalía') || lower.includes('impuesto')) {
    return {
      response: '🧮 Tenemos una calculadora de plusvalía municipal gratuita:\n👉 https://tuasesoralvaro.es/plusvalia\n\nTe calcula exactamente lo que tendrías que pagar. ¿Necesitas ayuda con algo más?',
      intent: 'general_inquiry',
      confidence: 0.85,
    };
  }

  if (lower.includes('hola') || lower.includes('buenas') || lower.includes('buenos')) {
    return {
      response: '¡Hola! 👋 Soy el asistente virtual de Álvaro, tu asesor inmobiliario en Sevilla. ¿En qué puedo ayudarte?\n\n🏠 Ver propiedades\n📊 Valorar tu vivienda\n🧮 Calcular plusvalía\n📅 Agendar una visita',
      intent: 'general_inquiry',
      confidence: 0.95,
    };
  }

  return {
    response: '👋 ¡Gracias por tu mensaje! Soy el asistente de Álvaro. Puedo ayudarte con:\n\n🏠 Información sobre propiedades\n📊 Valoración gratuita de tu vivienda\n🧮 Calculadora de plusvalía\n📅 Agendar visitas\n\n¿Qué te interesa?',
    intent: 'general_inquiry',
    confidence: 0.60,
  };
}
