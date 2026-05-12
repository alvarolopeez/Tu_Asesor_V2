import { Calendar as CalendarIcon } from "lucide-react";

export default function CalendarManager() {
  return (
    <div className="bg-[#1E293B] p-6 rounded-2xl border border-white/5 min-h-[500px] flex flex-col items-center justify-center">
      <CalendarIcon size={64} className="text-[#FBBF24] mb-4 opacity-50" />
      <h2 className="text-2xl font-bold text-white mb-2">Gestor de Citas</h2>
      <p className="text-slate-400 max-w-md text-center">Aquí integraremos un calendario visual (tipo Google Calendar) para gestionar visitas a inmuebles y reuniones con clientes agendadas por ti o por la IA.</p>
    </div>
  );
}
