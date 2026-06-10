import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { processMessage } from '@/lib/chatbot/engine';
import { normalizeEsPhone } from '@/lib/phone';
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
 * @updated 2026-06-10 — Brief #008 T7: captura opcional de contacto
 *   (`visitor_phone`) → crea/vincula lead source='web_widget'. Sin teléfono,
 *   el comportamiento anónimo no cambia. NO dispara bienvenida n8n (el
 *   contacto es saliente del cliente). El engine NO se toca.
 */

/**
 * Crea (o reutiliza por phone normalizado) un lead `source='web_widget'` y lo
 * vincula a la conversación si aún no tiene lead. Fire-and-soft: nunca rompe
 * el flujo del mensaje. Mismo patrón de dedupe + race 23505 que el webhook de
 * WhatsApp (findOrCreateLead, no exportable desde el route handler).
 */
async function linkVisitorLead(
  convId: string,
  rawName: string | undefined,
  rawPhone: string,
): Promise<void> {
  try {
    const phone = normalizeEsPhone(rawPhone);
    if (!phone) return;
    const cleanName = (rawName || '').trim() || 'Visitante Web';

    let leadId: string | null = null;
    const { data: existing } = await supabase
      .from('leads')
      .select('id')
      .eq('phone', phone)
      .limit(1);
    if (existing && existing.length > 0) {
      leadId = existing[0].id;
    } else {
      const { data: created, error } = await supabase
        .from('leads')
        .insert({ name: cleanName, phone, type: 'buyer', source: 'web_widget', status: 'new' })
        .select('id')
        .single();
      if (error) {
        if ((error as { code?: string }).code === '23505') {
          const { data: retry } = await supabase
            .from('leads')
            .select('id')
            .eq('phone', phone)
            .limit(1);
          leadId = retry && retry.length > 0 ? retry[0].id : null;
        }
        if (!leadId) {
          console.warn('[Chatbot Message] no se pudo crear lead web_widget:', error.message);
          return;
        }
      } else {
        leadId = created?.id ?? null;
      }
    }
    if (!leadId) return;

    // Vincular la conversación solo si aún no tiene lead (no pisar enlaces).
    const { data: conv } = await supabase
      .from('chatbot_conversations')
      .select('lead_id, metadata')
      .eq('id', convId)
      .single();
    if (conv && !conv.lead_id) {
      await supabase
        .from('chatbot_conversations')
        .update({
          lead_id: leadId,
          metadata: {
            ...((conv.metadata as Record<string, unknown>) || {}),
            visitor_name: cleanName,
            visitor_phone: phone,
          },
        })
        .eq('id', convId);
    }
  } catch (err) {
    console.warn('[Chatbot Message] linkVisitorLead falló:', err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, conversation_id, visitor_name, visitor_phone } = body;

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

    // 1.b Captura opcional de contacto (Brief #008 T7). Sin teléfono → flujo
    //     anónimo de siempre.
    if (visitor_phone && typeof visitor_phone === 'string' && visitor_phone.trim()) {
      await linkVisitorLead(convId, visitor_name, visitor_phone);
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
