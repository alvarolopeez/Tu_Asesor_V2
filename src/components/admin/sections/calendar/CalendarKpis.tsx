import { CheckCircle, Map, Clock } from "lucide-react";
import type { AppointmentWithRelations } from "./types";
import { computeWeekStats } from "./calendarUtils";

interface CalendarKpisProps {
  appointments: AppointmentWithRelations[];
}

/** Panel superior con los 3 KPIs de productividad de la semana visible. */
export default function CalendarKpis({ appointments }: CalendarKpisProps) {
  const { totalActivities, roadTimeStr, freeSlots } = computeWeekStats(appointments);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

      {/* KPI 1: Actividades */}
      <div className="bg-[#1E293B] p-5 rounded-2xl border border-white/5 flex items-center gap-4 shadow-xl">
        <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
          <CheckCircle className="w-6 h-6" />
        </div>
        <div>
          <p className="text-slate-400 text-xs uppercase tracking-wider font-semibold">Actividades Comerciales</p>
          <h3 className="text-2xl font-bold text-white mt-1">{totalActivities} <span className="text-xs font-normal text-slate-400">citas activas</span></h3>
          <p className="text-[11px] text-emerald-400/80 mt-0.5">Visitas, valoraciones y firmas</p>
        </div>
      </div>

      {/* KPI 2: Carretera Heurística */}
      <div className="bg-[#1E293B] p-5 rounded-2xl border border-white/5 flex items-center gap-4 shadow-xl">
        <div className="w-12 h-12 rounded-xl bg-sky-500/10 flex items-center justify-center text-sky-400 shrink-0">
          <Map className="w-6 h-6" />
        </div>
        <div>
          <p className="text-slate-400 text-xs uppercase tracking-wider font-semibold">Carretera Estimado</p>
          <h3 className="text-2xl font-bold text-white mt-1">{roadTimeStr}</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">20 min / desplazamiento comercial</p>
        </div>
      </div>

      {/* KPI 3: Huecos Disponibles */}
      <div className="bg-[#1E293B] p-5 rounded-2xl border border-white/5 flex items-center gap-4 shadow-xl">
        <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 shrink-0">
          <Clock className="w-6 h-6" />
        </div>
        <div>
          <p className="text-slate-400 text-xs uppercase tracking-wider font-semibold">Huecos Agendables AI</p>
          <h3 className="text-2xl font-bold text-white mt-1">{freeSlots} <span className="text-xs font-normal text-slate-400">libres</span></h3>
          <p className="text-[11px] text-amber-400/80 mt-0.5">Disponibles para visitas/chatbot</p>
        </div>
      </div>

    </div>
  );
}
