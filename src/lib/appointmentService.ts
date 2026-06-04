"use server"

import { createClient } from '@supabase/supabase-js'
import { sendWhatsAppTemplate } from '@/lib/whatsapp'
import { normalizeEsPhone } from '@/lib/phone'

/**
 * Plantillas HSM que deben existir/aprobarse en Meta para que estos avisos se
 * entreguen FUERA de la ventana de 24 h (un cliente que reserva por la web no
 * ha escrito al bot, así que el texto libre se rechaza con 131047).
 *
 *   • `confirmacion_visita_cliente` (idioma es) — al CLIENTE.
 *       {{1}} = nombre del cliente
 *       {{2}} = título/inmueble de la visita
 *       {{3}} = fecha y hora (texto ya formateado, ej. "12/06/2026 17:00")
 *   • `aviso_alvaro` (idioma es, categoría Utility) — al ASESOR (Álvaro).
 *       {{1}} = texto libre del aviso (una sola variable, reutilizable)
 *
 * Mientras Meta no las apruebe, los envíos devuelven false y se loguean, pero
 * NO rompen la creación de la cita.
 */
const TPL_CONFIRM_VISITA = 'confirmacion_visita_cliente'
const TPL_AVISO_ALVARO = 'aviso_alvaro'
const ADVISOR_PHONE = process.env.ADVISOR_WHATSAPP_PHONE || ''

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
    // Normalizamos a E.164 español (+34…) para que el lead quede con un
    // formato consistente y los envíos de WhatsApp (plantillas) no fallen.
    const cleanPhone = normalizeEsPhone(data.leadPhone)
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

    // 3. Notificaciones por WhatsApp (PLANTILLAS HSM).
    //    El cliente acaba de reservar desde la web → está FUERA de la ventana
    //    de 24 h de Meta, así que el texto libre se rechaza (131047). Usamos
    //    plantillas aprobadas. Fire-and-forget: si fallan (o aún no están
    //    aprobadas) NO rompemos la reserva, ya creada.
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

      // 3.a Confirmación al CLIENTE (plantilla confirmacion_visita_cliente).
      void sendWhatsAppTemplate(
        cleanPhone,
        TPL_CONFIRM_VISITA,
        [cleanName, data.propertyTitle, formattedDate],
        { normalize: true, logTag: '[AppointmentService][HSM cliente]' },
      )

      // 3.b Aviso al ASESOR (Álvaro) con la plantilla genérica aviso_alvaro.
      if (ADVISOR_PHONE) {
        const aviso = `Nueva reserva de visita: ${cleanName} (${cleanPhone}) para "${data.propertyTitle}" el ${formattedDate}.`
        void sendWhatsAppTemplate(
          ADVISOR_PHONE,
          TPL_AVISO_ALVARO,
          [aviso],
          { normalize: true, logTag: '[AppointmentService][HSM asesor]' },
        )
      }
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
