import { Layers } from "lucide-react";
import type { PipelineMap } from "./operacionesUtils";

interface PipelineCardProps {
  pipelineMap: PipelineMap;
  maxStageCount: number;
}

/** Embudo de captación de propietarios (barras por etapa de cartera). */
export default function PipelineCard({ pipelineMap, maxStageCount }: PipelineCardProps) {
  const stages = [
    { label: "Valoración Inicial", val: pipelineMap.valoracion, color: "bg-blue-500" },
    { label: "Captación Activa", val: pipelineMap.captacion, color: "bg-indigo-500" },
    { label: "Notas de Encargo firmadas", val: pipelineMap.notas_encargo, color: "bg-amber-500" },
    { label: "Propuestas Recibidas", val: pipelineMap.propuestas, color: "bg-orange-500" },
    { label: "Pendientes de Notaría", val: pipelineMap.pendientes_notaria, color: "bg-emerald-500" },
  ];

  return (
    <div className="bg-[#1E293B]/60 backdrop-blur-md p-6 rounded-2xl border border-white/5 flex flex-col justify-between">
      <div>
        <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
          <Layers size={18} className="text-[#FBBF24]" />
          Pipeline de Propietarios (Cartera)
        </h3>
        <p className="text-slate-400 text-xs mb-6">Embudo operativo de captaciones activas</p>
      </div>

      <div className="space-y-4">
        {stages.map((stage, idx) => (
          <div key={idx} className="space-y-1">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-slate-300">{stage.label}</span>
              <span className="text-white">{stage.val} propiedades</span>
            </div>
            <div className="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${stage.color}`}
                style={{ width: `${(stage.val / maxStageCount) * 100}%` }}
              ></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
