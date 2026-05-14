import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * Webhook receptor para Chatwoot.
 * Recibe eventos y sincroniza con nuestra BD.
 * 
 * @agent IA/Automatización
 * @created 2026-05-14
 */

const CHATWOOT_API_KEY = process.env.CHATWOOT_WEBHOOK_KEY || 'tuasesor_chatwoot_key_2026';

export async function POST(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key');
  if (apiKey !== CHATWOOT_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { event, ...eventData } = body;

    await supabase.from('n8n_webhook_logs').insert({
      webhook_name: `chatwoot_${event || 'unknown'}`,
      source: 'chatwoot',
      payload: body,
      response_status: 200,
    });

    if (event === 'message_created' && eventData.message_type === 'incoming') {
      const chatwootConvId = String(eventData.conversation?.id);
      const { data: existingConv } = await supabase
        .from('chatbot_conversations')
        .select('id')
        .eq('channel', 'chatwoot')
        .contains('metadata', { chatwoot_conversation_id: chatwootConvId })
        .limit(1);

      let conversationId: string;
      if (existingConv && existingConv.length > 0) {
        conversationId = existingConv[0].id;
      } else {
        const { data: newConv } = await supabase
          .from('chatbot_conversations')
          .insert({
            channel: 'chatwoot',
            status: 'active',
            metadata: { chatwoot_conversation_id: chatwootConvId, chatwoot_contact: eventData.sender },
          })
          .select('id')
          .single();
        conversationId = newConv?.id || '';
      }

      if (conversationId) {
        await supabase.from('chatbot_messages').insert({
          conversation_id: conversationId,
          role: 'user',
          content: eventData.content || '',
        });
      }

      return NextResponse.json({ status: 'ok', conversation_id: conversationId });
    }

    return NextResponse.json({ status: 'ok', event_handled: event || 'unknown' });
  } catch (error) {
    console.error('[Chatwoot Webhook] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
