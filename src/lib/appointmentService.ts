"use server"

import { createClient } from '@supabase/supabase-js'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// Privileged Supabase client to bypass RLS policies on the server safely
const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceKey || supabaseAnonKey
)

interface PublicAppointmentData {
  leadName: string
  leadPhone: string
  leadEmail?: string
  propertyId: string
  propertyTitle: string
  scheduledAt: string // ISO timestamp, e.g. "2026-05-25T10:00:00.000Z"
  notes?: string
}

interface AppointmentResult {
  success: boolean
  appointmentId: string | null
  error?: string
}

/**
 * Servicio para agendar visitas online desde la web pública.
 * 
 * Reglas de negocio:
 * 1. Limpiar y normalizar el número de teléfono del lead para evitar duplicados.
 * 2. Buscar si existe un lead con ese teléfono en la tabla `leads`.
 * 3. Si existe, reutilizar su ID. Si no, insertar un nuevo lead con type = 'buyer', status = 'new', source = 'web_public'.
 * 4. Insertar la cita en `appointments` en estado 'pending' (🔵 se verá en azul en el CRM), tipo 'visita', y duración 30 minutos.
 */
export async function bookPublicAppointment(
  data: PublicAppointmentData
): Promise<AppointmentResult> {
  try {
    const cleanPhone = data.leadPhone.trim().replace(/\s+/g, '')
    const cleanEmail = data.leadEmail?.trim().toLowerCase() || null
    const cleanName = data.leadName.trim()

    let leadId: string | null = null
    let isNewLead = false

    // 1. Buscar si ya existe un lead con ese teléfono
    const { data: existingLeads, error: searchError } = await supabaseAdmin
      .from('leads')
      .select('id')
      .eq('phone', cleanPhone)
      .limit(1)

    if (searchError) {
      console.warn('[AppointmentService] Error al buscar lead existente:', searchError.message)
    }

    if (existingLeads && existingLeads.length > 0) {
      // Reutilizar lead existente
      leadId = existingLeads[0].id
    } else {
      isNewLead = true
      // Crear nuevo lead
      const { data: newLead, error: insertError } = await supabaseAdmin
        .from('leads')
        .insert([{
          name: cleanName,
          phone: cleanPhone,
          email: cleanEmail,
          type: 'buyer',
          status: 'new',
          source: 'web_public',
          property_id: data.propertyId // Inmueble por el que se interesó inicialmente
        }])
        .select('id')
        .single()

      if (insertError) {
        console.error('[AppointmentService] Error al crear nuevo lead:', insertError.message)
        return {
          success: false,
          appointmentId: null,
          error: `No se pudo registrar sus datos de contacto: ${insertError.message}`
        }
      }

      leadId = newLead.id

      // 1.b Disparar n8n para enviar la plantilla HSM `bienvenida_nuevo_lead`
      //     (workflow `Notificacion Nuevo Lead`, id QikfXMJumWbpI3wL).
      //     Mismo patrón que BuyerRegistrationModal pero aquí lo hacemos
      //     server-side (este servicio ya corre en el servidor): no podemos
      //     usar una URL relativa, así que llamamos al webhook de n8n con su
      //     URL pública y registramos un log de auditoría en `n8n_webhook_logs`.
      //     Fire-and-forget: si n8n falla NO bloqueamos la creación de la cita.
      //     @added 2026-06-03 — fix: la web pública insertaba leads
      //     source='web_public' desde aquí sin disparar el workflow de
      //     bienvenida, por eso no llegaban WhatsApp a clientes nuevos que
      //     agendaban directamente (sin pasar por BuyerRegistrationModal).
      try {
        const newLeadWebhookUrl =
          process.env.N8N_NEW_LEAD_WEBHOOK_URL ||
          'https://alvaroolopez.app.n8n.cloud/webhook/new-lead'
        const welcomePayload = {
          data: {
            lead_id: leadId,
            name: cleanName,
            phone: cleanPhone,
            email: cleanEmail || '',
            source: 'web_public',
            preferences: { location: 'Sevilla' },
          },
        }
        // Lanzamos en background sin await para no demorar la respuesta al
        // usuario; pero el `void` evita warnings de promesa flotante.
        void (async () => {
          try {
            const res = await fetch(newLeadWebhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(welcomePayload),
            })
            await supabaseAdmin.from('n8n_webhook_logs').insert({
              webhook_name: 'new_lead_welcome',
              source: 'appointment_service',
              payload: welcomePayload,
              response_status: res.status,
              error_message: res.ok ? null : `n8n webhook respondió ${res.statusText}`,
            })
          } catch (whErr) {
            const msg = whErr instanceof Error ? whErr.message : String(whErr)
            console.warn('[AppointmentService][n8n new-lead] webhook falló:', msg)
            await supabaseAdmin.from('n8n_webhook_logs').insert({
              webhook_name: 'new_lead_welcome',
              source: 'appointment_service',
              payload: welcomePayload,
              response_status: 0,
              error_message: `HTTP error: ${msg}`,
            })
          }
        })()
      } catch (triggerErr) {
        console.warn(
          '[AppointmentService][n8n new-lead] no se pudo disparar:',
          triggerErr,
        )
      }
    }

    // 2. Insertar la cita en appointments
    const appointmentTitle = `Visita: ${data.propertyTitle}`
    const appointmentNotes = data.notes 
      ? `Solicitada desde la Web Pública.\nNotas del cliente: ${data.notes}`
      : 'Visita programada a través del calendario de la Web Pública.'

    const { data: newAppointment, error: appointmentError } = await supabaseAdmin
      .from('appointments')
      .insert([{
        lead_id: leadId,
        property_id: data.propertyId,
        scheduled_at: data.scheduledAt,
        status: 'pending', // 🔵 Pendiente, se muestra en azul en el CRM
        type: 'visita',
        title: appointmentTitle,
        notes: appointmentNotes,
        duration_minutes: 30
      }])
      .select('id')
      .single()

    if (appointmentError) {
      console.error('[AppointmentService] Error al crear la cita:', appointmentError.message)
      return {
        success: false,
        appointmentId: null,
        error: `No se pudo agendar la cita en nuestro sistema: ${appointmentError.message}`
      }
    }

    // 3. Notificación de Reserva por WhatsApp
    try {
      const dateObj = new Date(data.scheduledAt)
      const formattedDate = dateObj.toLocaleString('es-ES', {
        timeZone: 'Europe/Madrid',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })

      let whatsappMessage = ''
      if (!isNewLead) {
        // Caso A (Cliente ya registrado previamente)
        whatsappMessage = `¡Hola ${cleanName}! 👋 Te confirmo que has reservado con éxito tu cita para visitar el inmueble *${data.propertyTitle}* el día ${formattedDate}.\n\nÁlvaro se pondrá en contacto contigo muy pronto para confirmar los detalles. ¡Que tengas un excelente día! 😊`
      } else {
        // Caso B (Cliente nuevo)
        whatsappMessage = `¡Hola ${cleanName}! 👋 Cita confirmada para visitar el inmueble *${data.propertyTitle}* el día ${formattedDate}.\n\nPara preparar mejor tu visita, Álvaro te llamará pronto para hacerte unas preguntas muy breves sobre tus condiciones de compra.\n\nSi lo prefieres, puedes ahorrar tiempo y rellenar tu perfil de comprador directamente en nuestro formulario oficial a través del siguiente enlace: https://tuasesoralvaro.com/comprar?register=true\n\n¡Muchas gracias y nos vemos pronto! 😊`
      }

      await sendWhatsAppMessage(cleanPhone, whatsappMessage, { normalize: true, logTag: '[AppointmentService][WhatsApp]' })
    } catch (wsError) {
      console.error('[AppointmentService] Error al enviar WhatsApp:', wsError)
    }

    return {
      success: true,
      appointmentId: newAppointment.id
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[AppointmentService] Error inesperado:', msg)
    return {
      success: false,
      appointmentId: null,
      error: `Ocurrió un error inesperado: ${msg}`
    }
  }
}
