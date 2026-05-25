import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || '';
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const ADMIN_API_SECRET = process.env.ADMIN_API_SECRET || process.env.NEXT_PUBLIC_ADMIN_API_SECRET || '';

/**
 * API para el envío de mensajes manuales del agente.
 * 
 * POST /api/admin/chat/send
 * Headers: X-Admin-Key: <ADMIN_API_SECRET>
 * 
 * @payload { conversation_id: string, message: string }
 * @agent IA/Automatización
 * @created 2026-05-23
 * @security Requiere cabecera X-Admin-Key válida (ADMIN_API_SECRET)
 */
export async function POST(request: NextRequest) {
  try {
    // ── Auth: validar API key del administrador ──
    const adminKey = request.headers.get('X-Admin-Key') || '';
    if (!ADMIN_API_SECRET || adminKey !== ADMIN_API_SECRET) {
      return NextResponse.json(
        { error: 'Unauthorized — invalid or missing X-Admin-Key' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { conversation_id, message } = body;

    if (!conversation_id || !message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ error: 'Missing conversation_id or message' }, { status: 400 });
    }

    // 1. Obtener los detalles de la conversación
    const { data: conv, error: convError } = await supabase
      .from('chatbot_conversations')
      .select('*')
      .eq('id', conversation_id)
      .single();

    if (convError || !conv) {
      console.error('[Agent Send API] Error fetching conversation:', convError);
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // 2. Si la conversación no está en modo escalado (humano), pasarla a escalada automáticamente
    if (conv.status !== 'escalated') {
      const { error: updateError } = await supabase
        .from('chatbot_conversations')
        .update({ status: 'escalated', escalated_to: 'alvaro' })
        .eq('id', conversation_id);

      if (updateError) {
        console.error('[Agent Send API] Error escalating conversation:', updateError);
      } else {
        console.log(`[Agent Send API] 🚨 Chat de ${conv.wa_phone_number || conv.channel} escalado automáticamente a Álvaro (Modo Humano Activo)`);
      }
    }

    // 3. Guardar el mensaje del agente en base de datos
    const { data: loggedMessage, error: insertError } = await supabase
      .from('chatbot_messages')
      .insert({
        conversation_id,
        role: 'assistant', // Logeado como asistente para renderizarse en el panel del cliente
        content: message.trim(),
        intent_detected: 'agent_reply',
        confidence: 1.0,
      })
      .select('*')
      .single();

    if (insertError) {
      console.error('[Agent Send API] Error inserting message:', insertError);
      return NextResponse.json({ error: 'Failed to log message to database' }, { status: 500 });
    }

    // 4. Si el canal es WhatsApp, enviar mensaje real usando la API de Meta
    if (conv.channel === 'whatsapp' && conv.wa_phone_number) {
      if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) {
        console.warn('[Agent Send API] ⚠️ Credenciales de WhatsApp no configuradas en servidor local. Mensaje guardado en BD, pero no transmitido.');
        return NextResponse.json({
          success: true,
          status: 'logged_only',
          warning: 'WhatsApp credentials not loaded on server',
          message: loggedMessage,
        });
      }

      const success = await sendWhatsAppMessage(conv.wa_phone_number, message.trim());
      if (!success) {
        return NextResponse.json({ error: 'Failed to send message via WhatsApp Cloud API' }, { status: 502 });
      }
    }

    return NextResponse.json({
      success: true,
      status: 'sent',
      message: loggedMessage,
    });

  } catch (error) {
    console.error('[Agent Send API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Llama a la API oficial de Meta Cloud para enviar el mensaje por WhatsApp.
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
      console.error('[Agent Send API][WhatsApp] Error Meta:', response.status, errorBody);
      return false;
    }

    console.log(`[Agent Send API][WhatsApp] ✅ Mensaje manual transmitido con éxito a ${to}`);
    return true;
  } catch (error) {
    console.error('[Agent Send API][WhatsApp] Error de red:', error);
    return false;
  }
}
