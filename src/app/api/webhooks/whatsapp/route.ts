import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { processMessage } from '@/lib/chatbot/engine';
import { sendWhatsAppMessage, sendWhatsAppTemplate, markWhatsAppRead } from '@/lib/whatsapp';
import { normalizeEsPhone } from '@/lib/phone';
import { advanceLeadStatus } from '@/lib/leadFunnel';

/**
 * Webhook receptor de WhatsApp Cloud API (Meta Business).
 * 
 * GET  → Verificación del webhook (Meta envía un challenge al configurar la app)
 * POST → Recepción de mensajes entrantes desde la API oficial de Meta
 * 
 * Requisitos:
 * - App creada en Facebook Developers (developers.facebook.com)
 * - WhatsApp Business API configurada
 * - Webhook URL registrada: https://tuasesoralvaro.com/api/webhooks/whatsapp
 * - WHATSAPP_VERIFY_TOKEN configurado en .env.local
 * - WHATSAPP_ACCESS_TOKEN configurado en .env.local (para enviar respuestas)
 * - WHATSAPP_PHONE_NUMBER_ID configurado en .env.local
 * 
 * @agent IA/Automatización
 * @created 2026-05-14
 * @updated 2026-05-19 — Limpiado a solo Meta Cloud API oficial
 */

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || '';
const ADVISOR_PHONE = process.env.ADVISOR_WHATSAPP_PHONE || ''; // Teléfono de Álvaro para escalaciones

// ─── UX de chats escalados (Modo Humano) ─────────────
// Días sin actividad humana tras los que la IA retoma el control automáticamente.
const AUTO_REACTIVATE_DAYS = Number(process.env.ESCALATION_AUTO_REACTIVATE_DAYS || 3);
// Minutos mínimos entre avisos al asesor por mensajes en un mismo chat escalado (anti-spam).
const NOTIFY_THROTTLE_MIN = Number(process.env.ESCALATION_NOTIFY_THROTTLE_MIN || 15);

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

    // T1+T2: marcar como leído + activar typing indicator (fire-and-forget).
    if (parsed.messageId) {
      void markWhatsAppRead(parsed.messageId, true).catch((e) =>
        console.warn('[webhook] markWhatsAppRead threw:', e),
      );
    }

    console.log(`[WhatsApp] 📱 ${parsed.contactName} (${parsed.phoneNumber}): ${parsed.messageText}`);

    // 1. Buscar o crear lead por teléfono (phone se normaliza dentro a E.164).
    const leadInfo = await findOrCreateLead(parsed.phoneNumber, parsed.contactName);
    const leadId = leadInfo?.id ?? null;

    // 2. Buscar o crear conversación activa/escalada (también normaliza phone)
    const convInfo = await findOrCreateConversation(
      parsed.phoneNumber, leadId, parsed.contactName
    );

    if (!convInfo) {
      return NextResponse.json({ error: 'Could not create or find conversation' }, { status: 500 });
    }

    const { id: conversationId } = convInfo;
    let conversationStatus = convInfo.status;

    // 2b. Colisión de nombre (T2.3): el cliente ya existe en BD con un nombre
    //     distinto al que Meta nos pasa en este mensaje. SOLO si la
    //     conversación se acaba de crear: si ya había historial, asumimos que
    //     la cuestión ya se cerró antes y no preguntamos otra vez.
    if (
      leadInfo?.existing &&
      leadInfo.existingName &&
      parsed.contactName &&
      parsed.contactName !== 'Desconocido' &&
      normalizeForNameCompare(leadInfo.existingName) !== normalizeForNameCompare(parsed.contactName) &&
      convInfo.isNew
    ) {
      const collisionPrompt =
        `¡Hola! 👋 Soy Paula, la asistente de Álvaro. ` +
        `Veo que ya te tengo guardado como *${leadInfo.existingName}*, ` +
        `pero ahora me escribes como *${parsed.contactName}*. ` +
        `¿Prefieres que te llame *${leadInfo.existingName}* o *${parsed.contactName}*? 🙂`;

      // Persistimos los dos nombres en metadata para que el siguiente turno
      // del bot pueda extraer la preferencia y limpiarla.
      await supabase
        .from('chatbot_conversations')
        .update({
          metadata: {
            ...(convInfo.metadata || {}),
            pending_name_resolution: {
              existing_name: leadInfo.existingName,
              profile_name: parsed.contactName,
              asked_at: new Date().toISOString(),
            },
          },
        })
        .eq('id', conversationId);

      // Registrar el mensaje del cliente Y nuestra respuesta directa.
      await supabase.from('chatbot_messages').insert({
        conversation_id: conversationId,
        role: 'user',
        content: parsed.messageText,
        wa_message_id: parsed.messageId,
      });
      await supabase.from('chatbot_messages').insert({
        conversation_id: conversationId,
        role: 'assistant',
        content: collisionPrompt,
        intent_detected: 'name_resolution_requested',
        confidence: 0.99,
      });

      await sendWhatsAppMessage(parsed.phoneNumber, collisionPrompt, { logTag: '[WhatsApp name-collision]' });
      console.log(`[WhatsApp] 🪪 Colisión de nombre — preguntando preferencia (${leadInfo.existingName} ↔ ${parsed.contactName})`);
      return NextResponse.json({
        status: 'ok',
        type: 'name_collision_asked',
        lead_id: leadId,
        conversation_id: conversationId,
      });
    }

    // 3. Guardar el mensaje del usuario
    await supabase.from('chatbot_messages').insert({
      conversation_id: conversationId,
      role: 'user',
      content: parsed.messageText,
      wa_message_id: parsed.messageId,
    });

    // 4. Generar respuesta del chatbot (usando el motor oficial de IA) si no está en modo humano
    let chatbotResponseText = '';
    let chatbotIntent: string | null = null;
    let chatbotConfidence = 0.5;
    let shouldEscalate = false;

    if (conversationStatus === 'escalated') {
      // (1) El cliente puede recuperar a la IA escribiendo "/bot".
      if (isBotReactivationCommand(parsed.messageText)) {
        await reactivateConversation(conversationId, 'client_command');
        const reply =
          '🤖 ¡Listo! Vuelvo a estar yo, *Paula*, la asistente de Álvaro. ¿En qué puedo ayudarte? ' +
          '(Si en cualquier momento quieres hablar de nuevo con Álvaro, solo tienes que pedírmelo.)';
        await supabase.from('chatbot_messages').insert({
          conversation_id: conversationId,
          role: 'assistant',
          content: reply,
          intent_detected: 'bot_reactivated',
          confidence: 1,
        });
        await sendWhatsAppMessage(parsed.phoneNumber, reply, { logTag: '[WhatsApp /bot]' });
        console.log(`[WhatsApp] 🤖 Chat reactivado por el cliente (${parsed.phoneNumber}) vía comando /bot.`);
        return NextResponse.json({ status: 'ok', type: 'reactivated_by_client' });
      }

      // (2) Auto-desescalado: si el humano lleva N días sin intervenir, la IA retoma el control.
      const idleDays = await daysSinceLastHumanActivity(conversationId);
      if (idleDays >= AUTO_REACTIVATE_DAYS) {
        await reactivateConversation(conversationId, 'auto_timeout');
        conversationStatus = 'active';
        console.log(`[WhatsApp] ♻️ Auto-desescalado de ${parsed.phoneNumber} tras ${idleDays.toFixed(1)} días sin actividad humana. La IA retoma el control.`);
        // No retornamos: cae al flujo normal del bot más abajo.
      } else {
        // (3) Sigue en Modo Humano → avisar a Álvaro del mensaje entrante (con throttle) y no autoresponder.
        await notifyAdvisorOfEscalatedMessage(parsed, conversationId);
        console.log(`[WhatsApp] 🚫 Chat en "Modo Humano" (escalado) para ${parsed.phoneNumber}. Omitiendo respuesta automática de la IA.`);
        return NextResponse.json({
          status: 'ok',
          type: 'escalated_to_agent',
          message_received: parsed.messageText,
        });
      }
    }

    if (conversationId) {
      // Si el lead ya existía en BD, usamos su nombre canónico (puede ser
      // distinto del que Meta nos pasa en este mensaje). El engine, además,
      // mirará metadata.preferred_name y lo priorizará. T3.
      const canonicalName = leadInfo?.existingName || parsed.contactName;
      const normalizedPhone = normalizeEsPhone(parsed.phoneNumber) || parsed.phoneNumber;

      const chatbotResult = await processMessage({
        message: parsed.messageText,
        conversationId: conversationId,
        channel: 'whatsapp',
        leadContext: {
          name: canonicalName,
          phone: normalizedPhone,
          // existing=true → lead creado por BuyerRegistrationModal (bienvenida HSM ya enviada)
          was_welcomed: leadInfo?.existing ?? false,
        },
      });

      chatbotResponseText = chatbotResult.response;
      chatbotIntent = chatbotResult.intent;
      chatbotConfidence = chatbotResult.confidence;
      shouldEscalate = chatbotResult.should_escalate;
    } else {
      // Fallback por keywords
      const chatbotResponse = generateChatbotResponse(parsed.messageText);
      chatbotResponseText = chatbotResponse.response;
      chatbotIntent = chatbotResponse.intent;
      chatbotConfidence = chatbotResponse.confidence;
    }

    // Si el motor decide escalar, informamos al cliente de cómo volver con la IA.
    if (shouldEscalate) {
      chatbotResponseText +=
        '\n\n_ℹ️ A partir de ahora te atenderá Álvaro personalmente. Cuando quieras volver a hablar conmigo (Paula), escribe *bot*._';
    }

    // 5. Guardar respuesta del asistente en BD
    if (conversationId) {
      await supabase.from('chatbot_messages').insert({
        conversation_id: conversationId,
        role: 'assistant',
        content: chatbotResponseText,
        intent_detected: chatbotIntent,
        confidence: chatbotConfidence,
      });

      // Si hay escalación, actualizar conversación y notificar a Álvaro
      if (shouldEscalate) {
        await markEscalated(conversationId);

        // 🔔 Notificación de escalación al asesor vía plantilla HSM (fuera de ventana 24h → texto libre rechazado con 131047)
        if (ADVISOR_PHONE) {
          const snippet = parsed.messageText.length > 120
            ? parsed.messageText.slice(0, 120) + '…'
            : parsed.messageText;
          const p1 = `Escalación: ${parsed.contactName} (${parsed.phoneNumber})`;
          const p2 = `Pide hablar contigo. Último msg: "${snippet}". Responde en WA.`;
          await sendWhatsAppTemplate(ADVISOR_PHONE, 'aviso_alvaro', [p1, p2], { logTag: '[WhatsApp Escalation]' });
          console.log(`[WhatsApp] 🔔 Escalación enviada a Álvaro por lead ${parsed.contactName}`);
        }
      }
    }

    // 6. Enviar respuesta por WhatsApp Cloud API
    if (chatbotResponseText) {
      await sendWhatsAppMessage(parsed.phoneNumber, chatbotResponseText);

      // Funnel (Brief #007 T2.4): la respuesta de Paula es el primer contacto
      // saliente → new → contacted (forward-only, no-op si está más avanzado).
      if (leadId) {
        await advanceLeadStatus(leadId, 'contacted');
      }
    }

    return NextResponse.json({
      status: 'ok',
      lead_id: leadId,
      conversation_id: conversationId,
      message_received: parsed.messageText,
      reply: chatbotResponseText,
      intent: chatbotIntent,
      confidence: chatbotConfidence,
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
 * Busca un lead por teléfono o crea uno nuevo.
 *
 * Bug histórico (resuelto 2026-06-08): Meta envía el phone sin `+` (ej:
 * `34674924499`), mientras que el formulario web lo guarda normalizado
 * (`+34674924499`). El `.eq('phone', phone)` fallaba y se creaba un
 * duplicado. Ahora normalizamos SIEMPRE con `normalizeEsPhone` antes
 * del lookup y del INSERT — y un `UNIQUE INDEX leads_phone_unique` en
 * BD nos cubre como red de seguridad.
 *
 * Devuelve `{ id, existing }` para que el caller pueda detectar si era
 * un lead conocido (necesario para la lógica de colisión de nombre
 * T2.3 en findOrCreateConversation).
 */
async function findOrCreateLead(
  phone: string,
  name: string,
): Promise<{ id: string; existing: boolean; existingName: string | null } | null> {
  const normalized = normalizeEsPhone(phone);
  if (!normalized) {
    console.warn('[WhatsApp] findOrCreateLead: phone vacío tras normalizar', phone);
    return null;
  }

  const { data: existing } = await supabase
    .from('leads')
    .select('id, name')
    .eq('phone', normalized)
    .limit(1);

  if (existing && existing.length > 0) {
    return { id: existing[0].id, existing: true, existingName: existing[0].name || null };
  }

  const { data: newLead, error } = await supabase
    .from('leads')
    .insert({
      name,
      phone: normalized,
      type: 'buyer',
      source: 'whatsapp',
      status: 'new',
    })
    .select('id, name')
    .single();

  if (error) {
    // Si el UNIQUE INDEX salta (race condition: dos webhooks simultáneos del
    // mismo cliente), reintentar el SELECT.
    if ((error as { code?: string }).code === '23505') {
      const { data: retry } = await supabase
        .from('leads')
        .select('id, name')
        .eq('phone', normalized)
        .limit(1);
      if (retry && retry.length > 0) {
        return { id: retry[0].id, existing: true, existingName: retry[0].name || null };
      }
    }
    console.error('[WhatsApp] findOrCreateLead insert error:', error);
    return null;
  }

  return newLead ? { id: newLead.id, existing: false, existingName: null } : null;
}

/**
 * Busca una conversación activa o escalada, o crea una nueva.
 *
 * Devuelve también `isNew` para que el caller pueda decidir si esta es la
 * primera interacción (necesario para la lógica de colisión de nombre T2.3
 * — solo preguntamos en la primera vez).
 * Y `metadata` para no perder otras claves al actualizarla.
 *
 * @updated 2026-06-08 normaliza phone y devuelve isNew + metadata
 */
async function findOrCreateConversation(
  phone: string,
  leadId: string | null,
  contactName: string
): Promise<{ id: string; status: string; isNew: boolean; metadata: Record<string, unknown> } | null> {
  const normalized = normalizeEsPhone(phone) || phone;

  const { data: existing } = await supabase
    .from('chatbot_conversations')
    .select('id, status, metadata')
    .eq('wa_phone_number', normalized)
    .in('status', ['active', 'escalated'])
    .limit(1);

  if (existing && existing.length > 0) {
    return {
      id: existing[0].id,
      status: existing[0].status,
      isNew: false,
      metadata: (existing[0].metadata as Record<string, unknown>) || {},
    };
  }

  const { data: newConv } = await supabase
    .from('chatbot_conversations')
    .insert({
      lead_id: leadId,
      channel: 'whatsapp',
      wa_phone_number: normalized,
      status: 'active',
      metadata: { contact_name: contactName },
    })
    .select('id, status, metadata')
    .single();

  return newConv
    ? {
        id: newConv.id,
        status: newConv.status,
        isNew: true,
        metadata: (newConv.metadata as Record<string, unknown>) || {},
      }
    : null;
}

/**
 * Normaliza un nombre para compararlo case/diacritic-insensible.
 * Evita falsos positivos como "miriam" vs "Miriam" o "Jose" vs "José".
 */
function normalizeForNameCompare(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

// ═══════════════════════════════════════════════════════
// GESTIÓN DE CHATS ESCALADOS (Modo Humano)
// ═══════════════════════════════════════════════════════

/**
 * ¿El cliente está pidiendo recuperar la IA? (comando "/bot" y variantes).
 */
function isBotReactivationCommand(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/^[/#!.]+/, '').trim();
  return ['bot', 'paula', 'volver al bot', 'activar bot', 'reactivar bot', 'asistente virtual'].includes(normalized);
}

/**
 * Devuelve la conversación a modo IA (status='active') y registra el motivo en metadata.
 */
async function reactivateConversation(conversationId: string, reason: string): Promise<void> {
  const { data } = await supabase
    .from('chatbot_conversations')
    .select('metadata')
    .eq('id', conversationId)
    .single();
  const metadata = {
    ...((data?.metadata as Record<string, unknown>) || {}),
    reactivated_at: new Date().toISOString(),
    reactivated_reason: reason,
  };
  await supabase
    .from('chatbot_conversations')
    .update({ status: 'active', escalated_to: null, metadata })
    .eq('id', conversationId);
}

/**
 * Marca una conversación como escalada, registrando `escalated_at` en metadata
 * (no existe columna dedicada → reutilizamos el jsonb existente).
 */
async function markEscalated(conversationId: string): Promise<void> {
  const { data } = await supabase
    .from('chatbot_conversations')
    .select('metadata')
    .eq('id', conversationId)
    .single();
  const metadata = {
    ...((data?.metadata as Record<string, unknown>) || {}),
    escalated_at: new Date().toISOString(),
  };
  await supabase
    .from('chatbot_conversations')
    .update({ status: 'escalated', escalated_to: 'alvaro', metadata })
    .eq('id', conversationId);
}

/**
 * Días transcurridos desde la última actividad HUMANA en la conversación.
 * Humana = mensaje del agente (`intent_detected='agent_reply'`). Si no hay ninguno,
 * cae a `metadata.escalated_at` y, en último término, a `started_at`.
 * Los mensajes del cliente NO cuentan como actividad humana (no resetean el reloj).
 */
async function daysSinceLastHumanActivity(conversationId: string): Promise<number> {
  const { data: lastAgent } = await supabase
    .from('chatbot_messages')
    .select('created_at')
    .eq('conversation_id', conversationId)
    .eq('intent_detected', 'agent_reply')
    .order('created_at', { ascending: false })
    .limit(1);

  let ref: string | null = lastAgent?.[0]?.created_at ?? null;

  if (!ref) {
    const { data: conv } = await supabase
      .from('chatbot_conversations')
      .select('metadata, started_at')
      .eq('id', conversationId)
      .single();
    const meta = (conv?.metadata as Record<string, unknown>) || {};
    ref = (meta.escalated_at as string) ?? conv?.started_at ?? null;
  }

  if (!ref) return 0;
  return (Date.now() - new Date(ref).getTime()) / 86_400_000;
}

/**
 * Avisa a Álvaro por WhatsApp de un mensaje entrante en un chat escalado.
 * Throttle por conversación (`metadata.last_escalation_notify_at`) para no saturar.
 */
async function notifyAdvisorOfEscalatedMessage(
  parsed: ParsedMessage,
  conversationId: string
): Promise<void> {
  if (!ADVISOR_PHONE) return;

  const { data: conv } = await supabase
    .from('chatbot_conversations')
    .select('metadata')
    .eq('id', conversationId)
    .single();
  const metadata = (conv?.metadata as Record<string, unknown>) || {};
  const lastNotify = metadata.last_escalation_notify_at
    ? new Date(metadata.last_escalation_notify_at as string).getTime()
    : 0;

  if (Date.now() - lastNotify < NOTIFY_THROTTLE_MIN * 60_000) return; // throttle anti-spam

  // Plantilla HSM — texto libre rechazado con 131047 fuera de ventana 24h
  const snippet = parsed.messageText.length > 120
    ? parsed.messageText.slice(0, 120) + '…'
    : parsed.messageText;
  const p1 = `Mensaje de ${parsed.contactName} (${parsed.phoneNumber})`;
  const p2 = `"${snippet}". Estás en Modo Humano; el cliente puede escribir 'bot'.`;
  await sendWhatsAppTemplate(ADVISOR_PHONE, 'aviso_alvaro', [p1, p2], { logTag: '[WhatsApp Escalation Msg]' });

  await supabase
    .from('chatbot_conversations')
    .update({
      metadata: { ...metadata, last_escalation_notify_at: new Date().toISOString() },
    })
    .eq('id', conversationId);
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
      response: '📊 ¡Genial! Puedes obtener una valoración orientativa gratuita aquí:\n👉 https://tuasesoralvaro.com/valoracion\n\nSi prefieres una valoración presencial más precisa, Álvaro puede visitarte sin compromiso. ¿Qué prefieres?',
      intent: 'valuation',
      confidence: 0.90,
    };
  }

  if (lower.includes('plusvalia') || lower.includes('plusvalía') || lower.includes('impuesto')) {
    return {
      response: '🧮 Tenemos una calculadora de plusvalía municipal gratuita:\n👉 https://tuasesoralvaro.com/plusvalia\n\nTe calcula exactamente lo que tendrías que pagar. ¿Necesitas ayuda con algo más?',
      intent: 'general_inquiry',
      confidence: 0.85,
    };
  }

  if (lower.includes('hola') || lower.includes('buenas') || lower.includes('buenos')) {
    return {
      response: '¡Hola! 👋 Soy Paula, la asesora virtual de Álvaro, tu asesor inmobiliario en Sevilla. Puedo responder tus dudas sobre inmuebles, valoraciones o impuestos, o bien ponerte en contacto con Álvaro si lo prefieres. ¿En qué puedo ayudarte hoy?\n\n🏠 Ver propiedades\n📊 Valorar tu vivienda\n🧮 Calcular plusvalía o impuestos\n📅 Agendar una visita',
      intent: 'general_inquiry',
      confidence: 0.95,
    };
  }

  return {
    response: '👋 ¡Gracias por tu mensaje! Soy Paula, la asesora virtual de Álvaro. Puedo responder tus dudas sobre inmuebles, valoraciones o impuestos, o bien ponerte en contacto con Álvaro si lo prefieres.\n\n¿Qué te gustaría consultar hoy?\n\n🏠 Ver propiedades\n📊 Valorar tu vivienda\n🧮 Calcular plusvalía o impuestos\n📅 Agendar una visita',
    intent: 'general_inquiry',
    confidence: 0.60,
  };
}
