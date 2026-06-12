import { PieChart } from "lucide-react";
import type { BuyerProfiles } from "./operacionesUtils";

interface BuyersBreakdownProps {
  profiles: BuyerProfiles;
}

function safePct(n: number, total: number): string {
  return total > 0 ? ((n / total) * 100).toFixed(1) : "0.0";
}

/** Desglose de compradores activos por capacidad financiera e intención. */
export default function BuyersBreakdown({ profiles }: BuyersBreakdownProps) {
  const {
    sinEstudioCount, estudioHechoCount, preconcedidaCount, contadoCount,
    habitualCount, inversionCount, totalFinCount, totalIntentCount,
  } = profiles;

  const financialRows = [
    { label: "Hipoteca y sin estudio",     count: sinEstudioCount,   pct: safePct(sinEstudioCount,   totalFinCount), color: "bg-rose-500" },
    { label: "Hipoteca con estudio hecho", count: estudioHechoCount, pct: safePct(estudioHechoCount, totalFinCount), color: "bg-blue-500" },
    { label: "Hipoteca preconcedida",      count: preconcedidaCount, pct: safePct(preconcedidaCount, totalFinCount), color: "bg-amber-500" },
    { label: "Al contado",                 count: contadoCount,      pct: safePct(contadoCount,      totalFinCount), color: "bg-emerald-500" },
  ];

  const intentRows = [
    { label: "Vivienda Habitual",    count: habitualCount,  pct: safePct(habitualCount,  totalIntentCount), color: "bg-indigo-500" },
    { label: "Vivienda de Inversión", count: inversionCount, pct: safePct(inversionCount, totalIntentCount), color: "bg-purple-500" },
  ];

  const liquidezPct = totalFinCount > 0
    ? Math.round(((preconcedidaCount + contadoCount) / totalFinCount) * 100)
    : 0;

  return (
    <div className="bg-[#1E293B]/60 backdrop-blur-md p-6 rounded-2xl border border-white/5">
      <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
        <PieChart size={18} className="text-[#FBBF24]" />
        Desglose de Compradores Activos
      </h3>
      <p className="text-slate-400 text-xs mb-6">
        Clasificación por capacidad financiera y propósito · fuente: buyers_demands
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

        {/* Columna 1: Capacidad financiera */}
        <div className="space-y-4">
          <h4 className="text-xs text-[#FBBF24] font-bold tracking-wider uppercase border-b border-white/5 pb-2">
            Capacidad Financiera
          </h4>

          {totalFinCount === 0 && (
            <p className="text-xs text-slate-500 italic">Sin datos de funding_type en compradores activos.</p>
          )}

          <div className="space-y-4">
            {financialRows.map((item, idx) => (
              <div key={idx} className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-300">{item.label}</span>
                  <span className="text-slate-400 font-normal">
                    <strong className="text-white font-semibold font-mono">{item.count}</strong> ({item.pct}%)
                  </span>
                </div>
                <div className="w-full bg-slate-950/80 rounded-full h-2 relative overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ${item.color}`}
                    style={{ width: `${item.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Columna 2: Propósito de adquisición */}
        <div className="space-y-4">
          <h4 className="text-xs text-[#FBBF24] font-bold tracking-wider uppercase border-b border-white/5 pb-2">
            Propósito de Adquisición
          </h4>

          {totalIntentCount === 0 && (
            <p className="text-xs text-slate-500 italic">Sin datos de propósito en compradores activos.</p>
          )}

          <div className="space-y-6 pt-2">
            {intentRows.map((item, idx) => (
              <div key={idx} className="space-y-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-300 text-sm">{item.label}</span>
                  <span className="text-slate-400 font-normal">
                    <strong className="text-white font-semibold font-mono">{item.count}</strong> ({item.pct}%)
                  </span>
                </div>
                <div className="w-full bg-slate-950/80 rounded-full h-3 relative overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ${item.color}`}
                    style={{ width: `${item.pct}%` }}
                  />
                </div>
              </div>
            ))}

            <div className="bg-slate-950/40 border border-white/5 p-3 rounded-xl text-[11px] text-slate-400 leading-relaxed mt-4">
              <strong className="text-slate-200">Insight Operativo:</strong> El{" "}
              <strong className="text-[#FBBF24] font-mono">{liquidezPct}%</strong> de tus compradores
              activos tienen liquidez inmediata o pre-aprobación bancaria consolidada, óptimo para
              campañas de venta exprés.
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
