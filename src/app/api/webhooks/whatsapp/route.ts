import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * Webhook receptor de WhatsApp Cloud API (Meta Business).
 * 
 * GET  → Verificación del webhook (Meta envía un challenge al configurar)
 * POST → Recepción de mensajes entrantes
 * 
 * Seguridad: Verificación por token de verificación (WHATSAPP_VERIFY_TOKEN)
 * 
 * @agent IA/Automatización
 * @created 2026-05-14
 */

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'tuasesor_whatsapp_verify_2026';

// ─── GET: Verificación del Webhook por Meta ──────────
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[WhatsApp Webhook] ✅ Verificación exitosa');
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn('[WhatsApp Webhook] ❌ Verificación fallida — Token inválido');
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// ─── POST: Recepción de Mensajes Entrantes ───────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Log del webhook para auditoría
    await supabase.from('n8n_webhook_logs').insert({
      webhook_name: 'whatsapp_incoming',
      source: 'whatsapp',
      payload: body,
      response_status: 200,
    });

    // Extraer datos del mensaje de WhatsApp
    const entry = body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    // Verificar que es un mensaje (no una notificación de estado)
    if (!value?.messages || value.messages.length === 0) {
      // Es una notificación de estado (delivered, read, etc.) — ignorar
      return NextResponse.json({ status: 'ok', type: 'status_update' });
    }

    const message = value.messages[0];
    const contact = value.contacts?.[0];
    const phoneNumber = message.from; // Número del remitente (formato: 34697223944)
    const messageText = message.text?.body || '';
    const messageId = message.id;
    const contactName = contact?.profile?.name || 'Desconocido';

    console.log(`[WhatsApp] 📱 Mensaje de ${contactName} (${phoneNumber}): ${messageText}`);

    // 1. Buscar o crear lead por teléfono
    let leadId: string | null = null;

    const { data: existingLeads } = await supabase
      .from('leads')
      .select('id')
      .eq('phone', phoneNumber)
      .limit(1);

    if (existingLeads && existingLeads.length > 0) {
      leadId = existingLeads[0].id;
    } else {
      const { data: newLead } = await supabase
        .from('leads')
        .insert({
          name: contactName,
          phone: phoneNumber,
          type: 'buyer',
          source: 'whatsapp',
          status: 'new',
        })
        .select('id')
        .single();

      leadId = newLead?.id || null;
    }

    // 2. Buscar o crear conversación activa
    let conversationId: string | null = null;

    const { data: existingConv } = await supabase
      .from('chatbot_conversations')
      .select('id')
      .eq('wa_phone_number', phoneNumber)
      .eq('status', 'active')
      .limit(1);

    if (existingConv && existingConv.length > 0) {
      conversationId = existingConv[0].id;
    } else {
      const { data: newConv } = await supabase
        .from('chatbot_conversations')
        .insert({
          lead_id: leadId,
          channel: 'whatsapp',
          wa_phone_number: phoneNumber,
          status: 'active',
          metadata: { contact_name: contactName },
        })
        .select('id')
        .single();

      conversationId = newConv?.id || null;
    }

    // 3. Guardar el mensaje del usuario
    if (conversationId) {
      await supabase.from('chatbot_messages').insert({
        conversation_id: conversationId,
        role: 'user',
        content: messageText,
        wa_message_id: messageId,
      });
    }

    // 4. TODO: Llamar al chatbot-engine para generar respuesta
    // Por ahora, el flujo N8N procesará el mensaje y responderá vía WhatsApp API
    // En Fase 2 se conectará la Edge Function chatbot-engine aquí

    return NextResponse.json({
      status: 'ok',
      lead_id: leadId,
      conversation_id: conversationId,
      message_received: messageText,
    });
  } catch (error) {
    console.error('[WhatsApp Webhook] Error:', error);

    // Log del error
    await supabase.from('n8n_webhook_logs').insert({
      webhook_name: 'whatsapp_incoming',
      source: 'whatsapp',
      payload: { error: String(error) },
      response_status: 500,
      error_message: String(error),
    });

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
