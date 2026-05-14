import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * Webhook receptor para N8N.
 * 
 * Endpoint autenticado por API key que permite a N8N ejecutar
 * operaciones en Supabase de forma segura sin exponer service_role_key.
 * 
 * Operaciones soportadas:
 * - create_lead: Crear un lead nuevo
 * - update_lead_status: Cambiar estado de un lead
 * - create_appointment: Agendar una cita
 * - get_properties: Listar propiedades activas
 * - log_interaction: Registrar interacción IA
 * - send_chatbot_response: Guardar respuesta del chatbot en BD
 * 
 * Seguridad: Header "x-api-key" obligatorio
 * 
 * @agent IA/Automatización
 * @created 2026-05-14
 */

const N8N_API_KEY = process.env.N8N_API_KEY || 'tuasesor_n8n_key_2026';

function validateApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get('x-api-key');
  return apiKey === N8N_API_KEY;
}

export async function POST(request: NextRequest) {
  // 1. Verificar API key
  if (!validateApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, data } = body;

    if (!action) {
      return NextResponse.json(
        { error: 'Missing "action" field' },
        { status: 400 }
      );
    }

    // Log del webhook
    await supabase.from('n8n_webhook_logs').insert({
      webhook_name: `n8n_${action}`,
      source: 'n8n',
      payload: body,
      response_status: 200,
    });

    // 2. Router de acciones
    switch (action) {
      // ─── Crear Lead ─────────────────────────────────
      case 'create_lead': {
        const { name, phone, email, type = 'buyer', source = 'n8n' } = data;

        if (!name) {
          return NextResponse.json(
            { error: 'Missing required field: name' },
            { status: 400 }
          );
        }

        // De-duplicar por teléfono (misma lógica que leadService.ts)
        if (phone) {
          const { data: existing } = await supabase
            .from('leads')
            .select('id')
            .eq('phone', phone.trim())
            .limit(1);

          if (existing && existing.length > 0) {
            return NextResponse.json({
              success: true,
              lead_id: existing[0].id,
              is_existing: true,
            });
          }
        }

        const { data: newLead, error } = await supabase
          .from('leads')
          .insert({
            name: name.trim(),
            phone: phone?.trim(),
            email: email?.trim(),
            type,
            source,
            status: 'new',
          })
          .select('id')
          .single();

        if (error) {
          return NextResponse.json(
            { error: error.message },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          lead_id: newLead.id,
          is_existing: false,
        });
      }

      // ─── Actualizar Estado del Lead ─────────────────
      case 'update_lead_status': {
        const { lead_id, status } = data;
        const validStatuses = ['new', 'contacted', 'qualified', 'visit_scheduled', 'closed', 'lost'];

        if (!lead_id || !status || !validStatuses.includes(status)) {
          return NextResponse.json(
            { error: 'Invalid lead_id or status' },
            { status: 400 }
          );
        }

        const { error } = await supabase
          .from('leads')
          .update({ status, updated_at: new Date().toISOString() })
          .eq('id', lead_id);

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
      }

      // ─── Crear Cita ─────────────────────────────────
      case 'create_appointment': {
        const { lead_id, property_id, scheduled_at, cal_event_id } = data;

        if (!lead_id || !scheduled_at) {
          return NextResponse.json(
            { error: 'Missing lead_id or scheduled_at' },
            { status: 400 }
          );
        }

        const { data: appointment, error } = await supabase
          .from('appointments')
          .insert({
            lead_id,
            property_id: property_id || null,
            scheduled_at,
            cal_event_id: cal_event_id || null,
            status: 'pending',
          })
          .select('id')
          .single();

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
          success: true,
          appointment_id: appointment.id,
        });
      }

      // ─── Listar Propiedades Activas ─────────────────
      case 'get_properties': {
        const { limit: queryLimit = 20 } = data || {};

        const { data: properties, error } = await supabase
          .from('properties')
          .select('id, title, description, price, status, features, images')
          .eq('status', 'active')
          .limit(queryLimit);

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
          success: true,
          properties,
          count: properties?.length || 0,
        });
      }

      // ─── Registrar Interacción IA ───────────────────
      case 'log_interaction': {
        const {
          lead_id,
          summary,
          intent,
          channel = 'whatsapp',
          raw_message,
          response_text,
          confidence_score,
          session_id,
        } = data;

        if (!lead_id || !summary) {
          return NextResponse.json(
            { error: 'Missing lead_id or summary' },
            { status: 400 }
          );
        }

        const { error } = await supabase.from('ai_interactions').insert({
          lead_id,
          summary,
          intent,
          channel,
          raw_message,
          response_text,
          confidence_score,
          session_id,
        });

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
      }

      // ─── Guardar Respuesta del Chatbot ──────────────
      case 'send_chatbot_response': {
        const {
          conversation_id,
          content,
          intent_detected,
          confidence,
        } = data;

        if (!conversation_id || !content) {
          return NextResponse.json(
            { error: 'Missing conversation_id or content' },
            { status: 400 }
          );
        }

        const { error } = await supabase.from('chatbot_messages').insert({
          conversation_id,
          role: 'assistant',
          content,
          intent_detected,
          confidence,
        });

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Si el intent es ESCALATE, actualizar la conversación
        if (intent_detected === 'ESCALATE') {
          await supabase
            .from('chatbot_conversations')
            .update({ status: 'escalated', escalated_to: 'alvaro' })
            .eq('id', conversation_id);
        }

        return NextResponse.json({ success: true });
      }

      // ─── Acción desconocida ─────────────────────────
      default:
        return NextResponse.json(
          {
            error: `Unknown action: ${action}`,
            available_actions: [
              'create_lead',
              'update_lead_status',
              'create_appointment',
              'get_properties',
              'log_interaction',
              'send_chatbot_response',
            ],
          },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[N8N Webhook] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
