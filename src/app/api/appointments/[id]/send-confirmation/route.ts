import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendWhatsAppTemplate } from '@/lib/whatsapp';

/**
 * POST /api/appointments/[id]/send-confirmation
 *
 * Envía la plantilla HSM `confirmacion_visita_cliente` al lead de la cita.
 * Usado desde el CRM (botón "Enviar confirmación" en CalendarManager) para:
 *  - Confirmar citas creadas por el chatbot que no recibieron HSM (porque la
 *    conversación estaba activa en el momento de la reserva).
 *  - Enviar recordatorios antes de la visita.
 *  - Reintentar si el primer envío automático falló (Meta 4xx transitorio).
 *
 * Plantilla `confirmacion_visita_cliente`:
 *   {{1}} = nombre del cliente
 *   {{2}} = título del inmueble
 *   {{3}} = fecha y hora en zona Europa/Madrid (ej. "12/06/2026, 17:00")
 *
 * Seguridad: endpoint interno del CRM, solo accesible desde el dashboard
 * de administración. No requiere API key adicional porque el CRM gestiona
 * la sesión — igual que /api/encargos y /api/n8n/diffusion.
 *
 * @created 2026-06-08 Ola 4 — templates Meta aprobadas.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceKey || supabaseAnonKey,
);

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: 'ID de cita requerido' }, { status: 400 });
  }

  // 1. Cargar la cita con lead y propiedad relacionados
  const { data: appt, error: apptErr } = await supabaseAdmin
    .from('appointments')
    .select('id, scheduled_at, title, status, lead_id, property_id, leads(name, phone), properties(title, features)')
    .eq('id', id)
    .single();

  if (apptErr || !appt) {
    console.error('[send-confirmation] cita no encontrada:', id, apptErr?.message);
    return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 });
  }

  // 2. Validar que tenemos teléfono del lead
  const lead = (appt as any).leads as { name?: string; phone?: string } | null;
  const property = (appt as any).properties as { title?: string; features?: Record<string, any> } | null;

  if (!lead?.phone) {
    return NextResponse.json(
      { error: 'El lead no tiene teléfono registrado. Añádelo en el CRM antes de enviar la confirmación.' },
      { status: 400 },
    );
  }

  if (appt.status === 'cancelled') {
    return NextResponse.json(
      { error: 'No se puede confirmar una cita cancelada.' },
      { status: 400 },
    );
  }

  // 3. Formatear fecha en Madrid (para el parámetro {{3}} de la plantilla)
  const dateObj = new Date(appt.scheduled_at);
  const formattedDate = dateObj.toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const leadName = lead.name || 'Cliente';
  // Preferimos el título real de la propiedad; fallback al título de la cita.
  const propertyTitle = property?.title || appt.title || 'la propiedad';

  // 4. Enviar HSM confirmacion_visita_cliente
  //    {{1}} nombre, {{2}} inmueble, {{3}} fecha y hora
  const sent = await sendWhatsAppTemplate(
    lead.phone,
    'confirmacion_visita_cliente',
    [leadName, propertyTitle, formattedDate],
    { normalize: true, logTag: '[API send-confirmation]' },
  );

  if (!sent) {
    console.error('[send-confirmation] sendWhatsAppTemplate devolvió false para appt', id);
    return NextResponse.json(
      { error: 'Meta rechazó el mensaje. Revisa los logs del servidor o el estado de la plantilla en Meta Business Manager.' },
      { status: 502 },
    );
  }

  console.info(`[send-confirmation] ✅ confirmacion_visita_cliente enviada → ${lead.phone} para cita ${id}`);
  return NextResponse.json({
    success: true,
    phone: lead.phone,
    formattedDate,
    leadName,
    propertyTitle,
  });
}
