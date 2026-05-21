import { supabase } from './supabase'

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
