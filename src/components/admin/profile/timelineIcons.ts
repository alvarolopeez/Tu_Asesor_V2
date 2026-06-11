// Brief #011 F3 (D12): config visual de los timelines de actividad, extraída
// de BuyersManager para compartirla entre el drawer del dashboard y las
// páginas completas /admin/buyers|sellers|encargos/[id].
//
// Convención: cada event_type mapea a color del punto, color del texto y
// label con emoji. Los tipos legacy se conservan para filas históricas.

export interface TimelineIconConfig {
  color: string;
  textColor: string;
  label: string;
}

const DEFAULT_CONFIG: TimelineIconConfig = {
  color: 'bg-slate-500 border-slate-600',
  textColor: 'text-slate-400',
  label: '📌 Actividad',
};

/** Timeline del COMPRADOR (`buyer_activity_logs`). */
export const getBuyerTimelineIconConfig = (type: string): TimelineIconConfig => {
  switch (type) {
    case 'Llamada telefónica':
      return { color: 'bg-blue-500 border-blue-600', textColor: 'text-blue-400', label: '📞 Llamada' };
    case 'Nota':
      return { color: 'bg-amber-400 border-amber-500', textColor: 'text-amber-300', label: '📝 Nota' };
    case 'Cita de venta':
      return { color: 'bg-violet-500 border-violet-600', textColor: 'text-violet-400', label: '📅 Cita de venta' };
    case 'Visita física realizada':
      return { color: 'bg-indigo-500 border-indigo-600', textColor: 'text-indigo-400', label: '🏠 Visita Física' };
    case 'Oferta presentada':
      return { color: 'bg-amber-500 border-amber-600', textColor: 'text-amber-400', label: '💰 Oferta' };
    case 'Contrato firmado':
      return { color: 'bg-emerald-500 border-emerald-600', textColor: 'text-emerald-400', label: '✍️ Contrato' };
    // Brief #008 T5: tipos legibles por origen. Los antiguos ('IA WhatsApp',
    // 'Llamada telefónica' como auto) se conservan por filas legacy.
    case 'Registro web':
      return { color: 'bg-sky-500 border-sky-600', textColor: 'text-sky-400', label: '🌐 Registro web' };
    case 'Actualización web':
      return { color: 'bg-sky-500 border-sky-600', textColor: 'text-sky-400', label: '🌐 Actualización web' };
    case 'Reserva web':
      return { color: 'bg-cyan-500 border-cyan-600', textColor: 'text-cyan-400', label: '📅 Reserva web' };
    case 'Alta en CRM':
      return { color: 'bg-teal-500 border-teal-600', textColor: 'text-teal-400', label: '📋 Alta en CRM' };
    // Brief #011 F1.2 (R19): impacto de difusión registrado por /api/n8n/diffusion.
    case 'Difusión':
      return { color: 'bg-fuchsia-500 border-fuchsia-600', textColor: 'text-fuchsia-400', label: '📣 Difusión' };
    // Brief #011 F3.4: auto-eventos desde documentos.
    case 'Propuesta':
      return { color: 'bg-amber-500 border-amber-600', textColor: 'text-amber-400', label: '📄 Propuesta' };
    case 'Propuesta firmada':
      return { color: 'bg-emerald-500 border-emerald-600', textColor: 'text-emerald-400', label: '✍️ Propuesta firmada' };
    case 'Contrato privado firmado':
      return { color: 'bg-emerald-500 border-emerald-600', textColor: 'text-emerald-400', label: '✍️ Contrato privado firmado' };
    case 'IA WhatsApp':
      return { color: 'bg-purple-500 border-purple-600', textColor: 'text-purple-400', label: '🤖 IA WhatsApp' };
    case 'Visita web':
      return { color: 'bg-sky-500 border-sky-600', textColor: 'text-sky-400', label: '🌐 Web' };
    default:
      return DEFAULT_CONFIG;
  }
};

/** Timeline del VENDEDOR (`seller_activity_logs`) — también lo usa el encargo. */
export const getSellerTimelineIconConfig = (type: string): TimelineIconConfig => {
  switch (type) {
    case 'Llamada':
      return { color: 'bg-blue-500 border-blue-600', textColor: 'text-blue-400', label: '📞 Llamada' };
    case 'Nota':
      return { color: 'bg-amber-400 border-amber-500', textColor: 'text-amber-300', label: '📝 Nota' };
    case 'Nota de visita':
      return { color: 'bg-indigo-500 border-indigo-600', textColor: 'text-indigo-400', label: '🏠 Visita' };
    case 'Visita':
      return { color: 'bg-indigo-500 border-indigo-600', textColor: 'text-indigo-400', label: '🏠 Visita' };
    case 'Cita de adquisición':
      return { color: 'bg-violet-500 border-violet-600', textColor: 'text-violet-400', label: '📅 Cita de adquisición' };
    case 'Adquisición':
      return { color: 'bg-amber-500 border-amber-600', textColor: 'text-[#FBBF24]', label: '💼 Adquisición' };
    case 'Valoración':
      return { color: 'bg-amber-500 border-amber-600', textColor: 'text-amber-400', label: '📊 Tasación' };
    case 'Email':
      return { color: 'bg-sky-500 border-sky-600', textColor: 'text-sky-400', label: '✉️ Email' };
    case 'IA WhatsApp':
      return { color: 'bg-purple-500 border-purple-600', textColor: 'text-purple-400', label: '🤖 IA WhatsApp' };
    case 'Meta Ads':
      return { color: 'bg-pink-500 border-pink-600', textColor: 'text-pink-400', label: '📣 Meta Ads' };
    case 'Cambio Estado':
      return { color: 'bg-emerald-500 border-emerald-600', textColor: 'text-emerald-400', label: '🔀 Cambio de estado' };
    case 'Alta en CRM':
      return { color: 'bg-teal-500 border-teal-600', textColor: 'text-teal-400', label: '📋 Alta en CRM' };
    // Brief #011 F3.3/F3.4/F4: eventos del expediente del encargo.
    case 'Propuesta':
      return { color: 'bg-amber-500 border-amber-600', textColor: 'text-amber-400', label: '📄 Propuesta' };
    case 'Propuesta aceptada':
      return { color: 'bg-emerald-500 border-emerald-600', textColor: 'text-emerald-400', label: '🤝 Propuesta aceptada' };
    case 'Contrato privado':
      return { color: 'bg-emerald-500 border-emerald-600', textColor: 'text-emerald-400', label: '✍️ Contrato privado' };
    case 'Notaría':
      return { color: 'bg-sky-500 border-sky-600', textColor: 'text-sky-400', label: '🏛️ Notaría' };
    case 'Nota de Encargo firmada':
      return { color: 'bg-emerald-500 border-emerald-600', textColor: 'text-emerald-400', label: '✍️ Nota de Encargo firmada' };
    case 'Propuesta firmada':
      return { color: 'bg-emerald-500 border-emerald-600', textColor: 'text-emerald-400', label: '✍️ Propuesta firmada' };
    case 'Contrato privado firmado':
      return { color: 'bg-emerald-500 border-emerald-600', textColor: 'text-emerald-400', label: '✍️ Contrato privado firmado' };
    default:
      return DEFAULT_CONFIG;
  }
};
