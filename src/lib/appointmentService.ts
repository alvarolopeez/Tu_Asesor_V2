"use server"

import { supabase } from './supabase'

const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || ''
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || ''

/**
 * Envía un mensaje de WhatsApp al cliente usando la API de Meta Graph.
 */
async function sendWhatsAppMessage(to: string, text: string): Promise<boolean> {
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    console.warn('[AppointmentService][WhatsApp] ⚠️ Credenciales de WhatsApp no configuradas en el servidor. Mensaje no transmitido.');
    return false;
  }

  // Normalizar el teléfono para la API de Meta (ej. 34600000000)
  let waPhone = to.replace(/[+\-]/g, '')
  if (waPhone.length === 9 && (waPhone.startsWith('6') || waPhone.startsWith('7') || waPhone.startsWith('9'))) {
    waPhone = '34' + waPhone
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: waPhone,
          type: 'text',
          text: { body: text },
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[AppointmentService][WhatsApp] Error Meta:', response.status, errorBody);
      return false;
    }

    console.log(`[AppointmentService][WhatsApp] ✅ Notificación transmitida con éxito a ${waPhone}`);
    return true;
  } catch (error) {
    console.error('[AppointmentService][WhatsApp] Error de red:', error);
    return false;
  }
}

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
    const { data: existingLeads, error: searchError } = await supabase
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
      const { data: newLead, error: insertError } = await supabase
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
    }

    // 2. Insertar la cita en appointments
    const appointmentTitle = `Visita: ${data.propertyTitle}`
    const appointmentNotes = data.notes 
      ? `Solicitada desde la Web Pública.\nNotas del cliente: ${data.notes}`
      : 'Visita programada a través del calendario de la Web Pública.'

    const { data: newAppointment, error: appointmentError } = await supabase
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

      await sendWhatsAppMessage(cleanPhone, whatsappMessage)
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
