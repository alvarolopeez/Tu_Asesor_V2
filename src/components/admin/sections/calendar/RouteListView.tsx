import { Calendar as CalendarIcon, Clock, MapPin, Phone, Edit2, User, Home } from "lucide-react";
import type { AppointmentWithRelations } from "./types";
import { getBadgeStyle, getAppointmentTitle } from "./calendarUtils";

interface RouteListViewProps {
  appointments: AppointmentWithRelations[];
  /** Abrir una cita existente para editarla. */
  onApptEdit: (appt: AppointmentWithRelations) => void;
}

/** Vista de ruta: timeline cronológico optimizado para móvil con deep-links. */
export default function RouteListView({ appointments, onApptEdit }: RouteListViewProps) {
  const sortedAppointments = [...appointments].sort((a, b) =>
    new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
  );

  return (
    <div className="space-y-4">
      {sortedAppointments.length === 0 ? (
        <div className="bg-[#1E293B] p-10 rounded-2xl border border-white/5 text-center flex flex-col items-center justify-center">
          <CalendarIcon size={48} className="text-slate-500 mb-3" />
          <h4 className="text-white font-bold text-base">Sin citas para esta semana</h4>
          <p className="text-slate-400 text-sm max-w-sm mt-1">Disfruta del tiempo libre o bloquea slots adicionales usando el botón "Nueva Cita".</p>
        </div>
      ) : (
        <div className="relative border-l border-white/10 ml-4 md:ml-6 pl-6 space-y-6">
          {sortedAppointments.map((appt) => {
            const style = getBadgeStyle(appt.type || "visita");
            const dateObj = new Date(appt.scheduled_at);
            const dayName = dateObj.toLocaleDateString('es-ES', { weekday: 'long' });
            const dayNum = dateObj.getDate();
            const monthName = dateObj.toLocaleDateString('es-ES', { month: 'short' });
            const hour = String(dateObj.getHours()).padStart(2, '0');
            const minutes = String(dateObj.getMinutes()).padStart(2, '0');

            const apptTitle = getAppointmentTitle(appt, "Cita comercial");

            return (
              <div key={appt.id} className="relative group">

                {/* Circle Indicator on the line */}
                <span className={`absolute -left-[31px] top-1.5 w-4 h-4 rounded-full border-4 border-[#1E293B] shadow ${style.dot}`} />

                {/* Card container */}
                <div className="bg-[#1E293B] rounded-2xl border border-white/5 p-5 shadow-xl hover:border-white/10 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4">

                  <div className="space-y-2">
                    {/* Time tag */}
                    <div className="flex items-center gap-2">
                      <span className="bg-slate-900 border border-white/5 px-2.5 py-1 rounded-lg text-xs font-bold text-[#FBBF24] uppercase flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        {dayName} {dayNum} {monthName} - {hour}:{minutes}
                      </span>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] uppercase font-black border ${style.bg}`}>
                        {style.label}
                      </span>
                    </div>

                    {/* Title & Info */}
                    <h4 className="text-white font-extrabold text-lg group-hover:text-[#FBBF24] transition-colors">
                      {apptTitle}
                    </h4>

                    {/* Lead / Phone detail */}
                    {appt.leads && (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-400 text-xs mt-1">
                        <span className="flex items-center gap-1 text-slate-300">
                          <User className="w-3.5 h-3.5 text-slate-500" />
                          Lead: {appt.leads.name} ({appt.leads.email || "Sin email"})
                        </span>
                        {appt.leads.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3.5 h-3.5 text-slate-500" />
                            {appt.leads.phone}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Property linked */}
                    {appt.properties && (
                      <p className="text-slate-300 text-xs flex items-center gap-1 italic">
                        <Home className="w-3.5 h-3.5 text-slate-500" />
                        Propiedad: {appt.properties.title} - {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(appt.properties.price)}
                      </p>
                    )}

                    {/* Notes */}
                    {appt.notes && (
                      <p className="text-slate-400 text-xs bg-slate-900/40 p-2.5 rounded-xl border border-white/5 mt-2 italic max-w-xl">
                        📝 "{appt.notes}"
                      </p>
                    )}

                    {/* Location */}
                    {appt.location && (
                      <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                        <MapPin className="w-4 h-4 text-red-400" />
                        <span>Dirección: {appt.location}</span>
                      </div>
                    )}

                  </div>

                  {/* --- RESPONSIVE MOBILE DEEP LINKS & ACTIONS --- */}
                  <div className="flex items-center gap-2 mt-2 md:mt-0 shrink-0">

                    {/* 1. Google Maps Navigation */}
                    {appt.location && (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(appt.location)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 bg-[#FBBF24]/10 hover:bg-[#FBBF24]/20 border border-[#FBBF24]/30 text-[#FBBF24] font-bold text-xs px-4 py-2.5 rounded-xl transition-all w-full md:w-auto justify-center"
                      >
                        <MapPin className="w-4 h-4" /> Cómo llegar
                      </a>
                    )}

                    {/* 2. Direct Lead Call */}
                    {appt.leads?.phone && (
                      <a
                        href={`tel:${appt.leads.phone}`}
                        className="flex items-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-bold text-xs px-4 py-2.5 rounded-xl transition-all w-full md:w-auto justify-center"
                      >
                        <Phone className="w-4 h-4" /> Llamar cliente
                      </a>
                    )}

                    {/* 3. General edit */}
                    <button
                      onClick={() => onApptEdit(appt)}
                      className="p-2.5 hover:bg-white/5 border border-white/5 text-slate-400 hover:text-white rounded-xl transition-colors"
                      title="Editar"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>

                  </div>

                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
