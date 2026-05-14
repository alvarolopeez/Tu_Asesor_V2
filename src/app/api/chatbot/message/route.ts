import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * Endpoint del chatbot para el widget web.
 * Recibe mensajes del usuario, los guarda y devuelve respuesta del motor IA.
 * 
 * En Fase 1: respuesta estática de cortesía.
 * En Fase 2: se conectará a la Edge Function chatbot-engine.
 * 
 * @agent IA/Automatización
 * @created 2026-05-14
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, conversation_id, visitor_name } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Missing message' }, { status: 400 });
    }

    // 1. Buscar o crear conversación
    let convId = conversation_id;

    if (!convId) {
      const { data: newConv } = await supabase
        .from('chatbot_conversations')
        .insert({
          channel: 'web_widget',
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

    // 3. Generar respuesta (Fase 1: respuesta de cortesía)
    // TODO Fase 2: Llamar a Edge Function chatbot-engine con historial
    const aiResponse = generatePlaceholderResponse(message);

    // 4. Guardar respuesta del asistente
    await supabase.from('chatbot_messages').insert({
      conversation_id: convId,
      role: 'assistant',
      content: aiResponse.response,
      intent_detected: aiResponse.intent,
      confidence: aiResponse.confidence,
    });

    return NextResponse.json({
      response: aiResponse.response,
      intent: aiResponse.intent,
      confidence: aiResponse.confidence,
      conversation_id: convId,
    });
  } catch (error) {
    console.error('[Chatbot Message] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Respuesta temporal hasta que se conecte el motor LLM.
 * Detecta intenciones básicas por palabras clave.
 */
function generatePlaceholderResponse(message: string) {
  const lower = message.toLowerCase();

  if (lower.includes('visita') || lower.includes('ver') || lower.includes('cita')) {
    return {
      response: '¡Por supuesto! 🏠 Me encantaría enseñarte la propiedad. ¿Podrías indicarme tu nombre, teléfono y cuándo te vendría bien? Álvaro se pondrá en contacto contigo para confirmar la cita.',
      intent: 'schedule_visit',
      confidence: 0.85,
    };
  }

  if (lower.includes('precio') || lower.includes('cuánto') || lower.includes('cuanto') || lower.includes('vale')) {
    return {
      response: '💰 Para darte información precisa sobre precios, necesitaría saber qué zona te interesa. ¿Buscas en Sevilla capital o en algún municipio cercano como Dos Hermanas, Alcalá o Mairena?',
      intent: 'ask_price',
      confidence: 0.80,
    };
  }

  if (lower.includes('valorar') || lower.includes('valoración') || lower.includes('vender')) {
    return {
      response: '📊 ¡Genial! Puedes obtener una valoración orientativa gratuita de tu propiedad en nuestra herramienta online: https://tuasesoralvaro.es/valoracion. Si quieres una valoración presencial más precisa, Álvaro puede visitarte sin compromiso.',
      intent: 'valuation',
      confidence: 0.90,
    };
  }

  return {
    response: '¡Hola! 👋 Soy el asistente virtual de Álvaro, tu asesor inmobiliario en Sevilla. ¿En qué puedo ayudarte? Puedo informarte sobre propiedades disponibles, valorar tu vivienda o agendar una visita.',
    intent: 'general_inquiry',
    confidence: 0.70,
  };
}
