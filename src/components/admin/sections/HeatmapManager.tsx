import { Activity } from "lucide-react";

export default function HeatmapManager() {
  return (
    <div className="bg-[#1E293B] p-6 rounded-2xl border border-white/5 min-h-[500px] flex flex-col items-center justify-center">
      <Activity size={64} className="text-red-400 mb-4 opacity-50" />
      <h2 className="text-2xl font-bold text-white mb-2">Mapa de Calor y Analíticas</h2>
      <p className="text-slate-400 max-w-md text-center">Aquí incrustaremos el panel visual para monitorizar el comportamiento de los usuarios en la web (dónde hacen clic, cuánto tiempo se quedan, etc.).</p>
    </div>
  );
}
