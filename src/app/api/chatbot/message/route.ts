import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { processMessage } from '@/lib/chatbot/engine';
import type { ChatChannel } from '@/types';

/**
 * Endpoint del chatbot para el widget web y llamadas directas.
 * 
 * Recibe mensajes del usuario, los guarda en BD,
 * los procesa con el motor del chatbot (keywords o LLM)
 * y devuelve la respuesta.
 * 
 * @agent IA/Automatización
 * @created 2026-05-14
 * @updated 2026-05-14 — Conectado al chatbot engine real
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, conversation_id, visitor_name } = body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ error: 'Missing or empty message' }, { status: 400 });
    }

    // 1. Buscar o crear conversación
    let convId = conversation_id;

    if (!convId) {
      const { data: newConv } = await supabase
        .from('chatbot_conversations')
        .insert({
          channel: 'web_widget' as ChatChannel,
          status: 'active',
          metadata: { visitor_name: visitor_name || 'Visitante Web' },
        })
        .select('id')
        .single();

      convId = newConv?.id;
    }

    if (!convId) {
      return NextResponse.json({ error: 'Could not create conversation' }, { status: 500 });
    }

    // 2. Guardar mensaje del usuario
    await supabase.from('chatbot_messages').insert({
      conversation_id: convId,
      role: 'user',
      content: message.trim(),
    });

    // 3. Procesar con el motor del chatbot
    const result = await processMessage({
      message: message.trim(),
      conversationId: convId,
      channel: 'web_widget',
      leadContext: visitor_name ? { name: visitor_name } : undefined,
    });

    // 4. Guardar respuesta del asistente
    await supabase.from('chatbot_messages').insert({
      conversation_id: convId,
      role: 'assistant',
      content: result.response,
      intent_detected: result.intent,
      confidence: result.confidence,
    });

    // 5. Si hay escalación, actualizar conversación
    if (result.should_escalate) {
      await supabase
        .from('chatbot_conversations')
        .update({ status: 'escalated', escalated_to: 'alvaro' })
        .eq('id', convId);
    }

    return NextResponse.json({
      response: result.response,
      intent: result.intent,
      confidence: result.confidence,
      conversation_id: convId,
      should_escalate: result.should_escalate,
    });
  } catch (error) {
    console.error('[Chatbot Message] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
