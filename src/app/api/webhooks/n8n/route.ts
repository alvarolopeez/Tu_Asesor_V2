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

const N8N_API_KEY = process.env.N8N_API_KEY || '';

// Reglas del seguimiento automático (consensuadas con Álvaro 2026-06-06).
// Si cambian: tocar SOLO estos valores, no la lógica del SELECT.
const FOLLOWUP_INACTIVITY_DAYS = 60; // un lead entra al envío si lleva >=60d sin contacto
const FOLLOWUP_COOLDOWN_DAYS   = 90; // tras recibir un seguimiento, no vuelve a recibir otro hasta pasados 90d
const FOLLOWUP_DAILY_CAP       = 20; // máximo de seguimientos enviados por ejecución del cron

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

      // ─── Pendientes de Seguimiento (Cron L-V 9:00) ───
      // Devuelve hasta FOLLOWUP_DAILY_CAP leads compradores que:
      //  · llevan ≥ FOLLOWUP_INACTIVITY_DAYS sin actualización,
      //  · NO han recibido seguimiento en los últimos FOLLOWUP_COOLDOWN_DAYS,
      //  · están abiertos (status ≠ closed/lost), y tienen teléfono válido.
      // Marca last_followup_at = NOW() ANTES de devolver para no
      // reincidir aunque el envío Meta luego falle (mejor perder 1 ciclo que
      // entrar en bucle). Si Meta cae sistemáticamente, se ve en n8n_webhook_logs.
      case 'get_pending_followups': {
        const inactivityCutoff = new Date(Date.now() - FOLLOWUP_INACTIVITY_DAYS * 86_400_000).toISOString();
        const cooldownCutoff   = new Date(Date.now() - FOLLOWUP_COOLDOWN_DAYS   * 86_400_000).toISOString();

        const { data: candidates, error: selErr } = await supabase
          .from('leads')
          .select('id, name, phone, last_followup_at, updated_at')
          .eq('type', 'buyer')
          .not('status', 'in', '(closed,lost)')
          .not('phone', 'is', null)
          .lte('updated_at', inactivityCutoff)
          .or(`last_followup_at.is.null,last_followup_at.lte.${cooldownCutoff}`)
          .order('last_followup_at', { ascending: true, nullsFirst: true })
          .order('updated_at', { ascending: true })
          .limit(FOLLOWUP_DAILY_CAP);

        if (selErr) {
          return NextResponse.json({ error: selErr.message }, { status: 500 });
        }

        const leads = (candidates || []).filter(l => !!l.phone?.trim());

        if (leads.length > 0) {
          const ids = leads.map(l => l.id);
          const nowIso = new Date().toISOString();
          await supabase
            .from('leads')
            .update({ last_followup_at: nowIso })
            .in('id', ids);
        }

        // Forma que espera el nodo "Separar Leads" del workflow:
        //   leads[i] = { id, name, phone, days_since_contact? }
        return NextResponse.json({
          leads: leads.map(l => ({
            id: l.id,
            name: l.name,
            phone: l.phone,
            days_since_contact: l.updated_at
              ? Math.floor((Date.now() - new Date(l.updated_at).getTime()) / 86_400_000)
              : null,
          })),
          count: leads.length,
          rules: {
            inactivity_days: FOLLOWUP_INACTIVITY_DAYS,
            cooldown_days:   FOLLOWUP_COOLDOWN_DAYS,
            daily_cap:       FOLLOWUP_DAILY_CAP,
          },
        });
      }

      // ─── Follow-ups de visita pendientes (FIX-G brief #002) ─────────
      // Devuelve conversaciones de chatbot cuyo `metadata.followup_visit`
      // tiene `pending_until <= NOW()` y `sent != true`. El workflow n8n
      // que lo consume manda un WhatsApp libre (la conversación está dentro
      // de 24h: el cliente acaba de hablar con el bot) preguntando si quiere
      // agendar visita. Antes de devolver, marcamos `sent=true` para evitar
      // duplicados aunque Meta luego falle.
      case 'get_pending_visit_followups': {
        const nowIso = new Date().toISOString();

        // Filtro horario 10:00-21:00 Madrid (FIX HIGH UX #10 review).
        // Si estamos fuera de ese horario, NO devolvemos ningún follow-up:
        // el cron volverá a ejecutarse, los pendientes se mantienen.
        const madridHour = Number(
          new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Europe/Madrid',
            hour: '2-digit', hour12: false,
          }).format(new Date())
        );
        if (madridHour < 10 || madridHour >= 21) {
          return NextResponse.json({ count: 0, followups: [], skipped_reason: 'out_of_hours_madrid' });
        }

        const { data: convos, error: selErr } = await supabase
          .from('chatbot_conversations')
          .select('id, wa_phone_number, metadata, lead_id')
          .eq('channel', 'whatsapp')
          .eq('status', 'active')
          .not('wa_phone_number', 'is', null)
          .limit(50);

        if (selErr) {
          return NextResponse.json({ error: selErr.message }, { status: 500 });
        }

        const candidates = (convos || []).filter((c: any) => {
          const f = c.metadata?.followup_visit;
          if (!f || f.sent === true) return false;
          if (!f.pending_until) return false;
          return f.pending_until <= nowIso;
        });

        // Marcar como sent ANTES de devolver. Si Meta luego falla, queda
        // el log — preferible perder un follow-up a entrar en bucle.
        for (const c of candidates) {
          const meta = (c as any).metadata || {};
          const newMeta = { ...meta, followup_visit: { ...meta.followup_visit, sent: true, sent_at: nowIso } };
          await supabase
            .from('chatbot_conversations')
            .update({ metadata: newMeta })
            .eq('id', c.id);
        }

        return NextResponse.json({
          count: candidates.length,
          followups: candidates.map((c: any) => ({
            conversation_id: c.id,
            phone: c.wa_phone_number,
            lead_id: c.lead_id,
          })),
        });
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
              'get_pending_followups',
              'get_pending_visit_followups',
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
