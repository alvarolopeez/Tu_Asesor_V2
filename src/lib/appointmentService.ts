"use server"

import { createClient } from '@supabase/supabase-js'
import { sendWhatsAppMessage, sendWhatsAppTemplate } from '@/lib/whatsapp'
import { normalizeEsPhone } from '@/lib/phone'
import { startInterviewFromWebBooking, shortZoneFromAddress } from '@/lib/chatbot/scheduling'
import { setVisitScheduled } from '@/lib/leadFunnel'

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
 *       {{1}} = título corto del aviso (ej. "Nueva reserva de visita")
 *       {{2}} = detalle del aviso (línea separada por · con datos clave)
 *       Plantilla genérica reutilizable: vale para reservas, escalaciones,
 *       Documenso, etc. El pie "— CRM Tu Asesor Álvaro" lo añade la plantilla.
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
      // Crear nuevo lead
      const { data: newLead, error: insertError } = await supabaseAdmin
        .from('leads')
        .insert([{
          name: cleanName,
          phone: cleanPhone,
          email: cleanEmail,
          type: 'buyer',
          status: 'new',
          source: 'Reserva Web',
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

      // ⚠️ Brief #007 decisión 5: la reserva web ya NO dispara el webhook
      //    n8n `new-lead` (HSM `bienvenida_nuevo_lead`). El cliente que
      //    reserva recibe `confirmacion_visita_cliente` más abajo — enviar
      //    además la bienvenida era un doble WhatsApp. La bienvenida queda
      //    SOLO en BuyerRegistrationModal (registro sin reserva).
    }

    // 1.c UPSERT en `buyers_demands` para que el comprador aparezca en la
    //     pestaña "Pedidos" del CRM (BuyersManager.tsx lee SOLO de esa
    //     tabla; antes de este fix, la reserva web solo insertaba en
    //     `leads` y el comprador desaparecía de Pedidos al recargar).
    //     @added 2026-06-06 brief #002 T2 — replica el patrón exacto de
    //     BuyerRegistrationModal.tsx. Se ejecuta SIEMPRE (no solo cuando
    //     el lead es nuevo) porque puede existir un lead sin su demand.
    //     Fire-and-soft: si falla NO rompe la reserva ya creada.
    try {
      const { data: existingBuyers } = await supabaseAdmin
        .from('buyers_demands')
        .select('id')
        .eq('phone', cleanPhone)
        .limit(1)

      if (existingBuyers && existingBuyers.length > 0) {
        await supabaseAdmin
          .from('buyers_demands')
          .update({
            name: cleanName,
            email: cleanEmail,
            status: 'Activo',
            updated_at: new Date().toISOString(),
            last_activity_at: new Date().toISOString(),
            // R9 Ola 5: escribir FK lead_id ahora que la columna existe.
            // leadId está garantizado en este punto (líneas 88-118 lo resuelven).
            ...(leadId ? { lead_id: leadId } : {}),
          })
          .eq('id', existingBuyers[0].id)
      } else {
        const { data: newBuyer } = await supabaseAdmin
          .from('buyers_demands')
          .insert([{
            name: cleanName,
            phone: cleanPhone,
            email: cleanEmail,
            max_budget: 0,
            min_budget: 0,
            min_sqm: 0,
            status: 'Activo',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_activity_at: new Date().toISOString(),
            // R9 Ola 5: FK lead_id
            ...(leadId ? { lead_id: leadId } : {}),
          }])
          .select('id')
          .single()

        if (newBuyer?.id) {
          await supabaseAdmin
            .from('buyer_activity_logs')
            .insert([{
              buyer_id: newBuyer.id,
              // Brief #008 T5: antes 'IA WhatsApp' (mentía sobre el origen).
              event_type: 'Reserva web',
              title: 'Reserva de visita desde la web',
              notes: `Reservó visita al inmueble "${data.propertyTitle}". Perfil completo pendiente (lo recopilará el bot o Álvaro).`,
              event_date: new Date().toISOString(),
              property_id: data.propertyId,
            }])
        }
      }
    } catch (bdErr) {
      const msg = bdErr instanceof Error ? bdErr.message : String(bdErr)
      console.warn('[AppointmentService] buyers_demands upsert falló:', msg)
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

    // 2.b Funnel (Brief #007 T2.1): la cita mueve el lead a visit_scheduled
    //     guardando el estado previo para poder revertir si se cancela.
    //     Fire-and-soft: nunca rompe la reserva.
    if (leadId) {
      await setVisitScheduled(leadId)
    }

    // 3. Notificaciones por WhatsApp.
    //    Estrategia (FIX HIGH UX #5 + TZ #6 del review adversarial):
    //
    //    Caso A — el cliente YA tiene conversación WhatsApp activa con Paula:
    //      el HSM `confirmacion_visita_cliente` se OMITE (estaría dentro de
    //      la ventana 24h y duplicaría textualmente el push libre que sigue).
    //      Solo enviamos UN mensaje libre con el texto adecuado al outcome
    //      (entrevista arrancada / perfil ya completo / ya hay entrevista
    //      en curso / spoofing bloqueado).
    //
    //    Caso B — el cliente NO tiene conversación activa con Paula:
    //      enviamos el HSM clásico (única vía dentro/fuera de 24h) — sin
    //      empujón adicional.
    //
    //    En AMBOS casos: aviso a Álvaro con la plantilla `aviso_alvaro`.
    //    Fire-and-forget en cada subllamada.

    // Recuperamos zona y outcome antes de elegir camino.
    let propertyZone: string | null = null
    let bookingOutcome:
      | { kind: 'no_conversation' }
      | { kind: 'spoofing_blocked'; conversationId: string }
      | { kind: 'already_has_interview'; conversationId: string }
      | { kind: 'already_has_demand'; conversationId: string }
      | { kind: 'started'; conversationId: string }
      = { kind: 'no_conversation' }

    try {
      const { data: prop } = await supabaseAdmin
        .from('properties')
        .select('features')
        .eq('id', data.propertyId)
        .single()
      const features = (prop?.features as Record<string, any>) || {}
      propertyZone = shortZoneFromAddress(features.address as string | undefined)
    } catch {
      // no zone — el bot caerá a formato sin zona, no rompe.
    }

    if (leadId) {
      try {
        bookingOutcome = await startInterviewFromWebBooking({
          phone: cleanPhone,
          leadName: cleanName,
          leadId,
          propertyId: data.propertyId,
          propertyTitle: data.propertyTitle,
          propertyZone,
          scheduledAt: data.scheduledAt,
        })
      } catch (bookErr) {
        console.warn('[AppointmentService] No se pudo encadenar entrevista:', bookErr)
      }
    }

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
      const propLabel = propertyZone
        ? `${data.propertyTitle}, en ${propertyZone}`
        : data.propertyTitle

      const hasActiveConvo = bookingOutcome.kind !== 'no_conversation'

      // 3.a Mensaje al cliente.
      if (!hasActiveConvo) {
        // Sin conversación previa → plantilla HSM clásica.
        void sendWhatsAppTemplate(
          cleanPhone,
          TPL_CONFIRM_VISITA,
          [cleanName, data.propertyTitle, formattedDate],
          { normalize: true, logTag: '[AppointmentService][HSM cliente]' },
        )
      } else {
        // Tenemos conversación activa → texto libre adaptado al outcome.
        // (En `started`, el push ya se ha insertado en chatbot_messages por
        //  startInterviewFromWebBooking. Aquí enviamos por WhatsApp para
        //  que llegue al móvil del cliente.)
        switch (bookingOutcome.kind) {
          case 'started':
            void sendWhatsAppMessage(
              cleanPhone,
              `¡Hola ${cleanName}! Soy Paula 👋, la asesora virtual de Álvaro. ` +
              `Acabas de reservar tu visita a "${propLabel}" para ${formattedDate} 🎉. ` +
              `Para que la prepare a tu medida, ¿me ayudas con 3 datos rápidos? ` +
              `Si prefieres no responder, no pasa nada — él te contactará antes de la cita igualmente. ` +
              `💰 La primera: ¿qué ahorros aportarías a la compra? (una cifra aproximada vale).`,
              { logTag: '[AppointmentService][push started]' },
            )
            break
          case 'already_has_demand':
            void sendWhatsAppMessage(
              cleanPhone,
              `🎉 ¡${cleanName}! Tu visita a "${propLabel}" está reservada para ${formattedDate}. ` +
              `Álvaro te confirmará por aquí antes de la cita. ¿Algo más en lo que pueda ayudarte?`,
              { logTag: '[AppointmentService][push has-demand]' },
            )
            break
          case 'already_has_interview':
            void sendWhatsAppMessage(
              cleanPhone,
              `🎉 ¡${cleanName}! He registrado también tu visita a "${propLabel}" para ${formattedDate}. ` +
              `Sigamos con las preguntas que teníamos pendientes para terminar tu perfil.`,
              { logTag: '[AppointmentService][push interview-active]' },
            )
            break
          case 'spoofing_blocked':
            // No mandamos NADA al cliente (puede ser víctima). Solo a Álvaro.
            console.warn('[AppointmentService] spoofing_blocked — no push to client')
            break
        }
      }

      // 3.b Aviso al ASESOR (Álvaro). Diferenciamos fuente para que distinga
      //     de un solo vistazo si fue chatbot o reserva web. FIX LOW UX.
      if (ADVISOR_PHONE) {
        const avisoTitulo = bookingOutcome.kind === 'spoofing_blocked'
          ? '⚠️ Reserva web sospechosa (tel ya en uso por otro lead)'
          : 'Nueva visita reservada (web)'
        const avisoDetalle = `${cleanName} · ${cleanPhone} · "${propLabel}" · ${formattedDate}`
        void sendWhatsAppTemplate(
          ADVISOR_PHONE,
          TPL_AVISO_ALVARO,
          [avisoTitulo, avisoDetalle],
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
