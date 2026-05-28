import { TrendingUp } from "lucide-react";
import type { GrowthDatum } from "./operacionesUtils";

interface GrowthChartProps {
  growthData: GrowthDatum[];
}

/** Área SVG con la evolución mensual acumulada de compradores activos. */
export default function GrowthChart({ growthData }: GrowthChartProps) {
  const maxGrowthVal = Math.max(...growthData.map(g => g.total), 200) || 200;

  const growthPoints = growthData.map((item, idx) => {
    const x = 50 + idx * 85;
    const y = 120 - (item.total / maxGrowthVal) * 90;
    return { x, y, ...item };
  });

  const growthLinePath = growthPoints.map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const growthAreaPath = growthPoints.length > 0
    ? `${growthLinePath} L ${growthPoints[growthPoints.length - 1].x} 130 L ${growthPoints[0].x} 130 Z`
    : "";

  return (
    <div className="bg-[#1E293B]/60 backdrop-blur-md p-6 rounded-2xl border border-white/5 flex flex-col justify-between">
      <div>
        <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
          <TrendingUp size={18} className="text-[#FBBF24]" />
          Crecimiento de Compradores Activos
        </h3>
        <p className="text-slate-400 text-xs mb-6">Evolución mensual acumulada en la base de datos</p>

        {/* Glowing SVG Area Chart */}
        <div className="w-full h-[220px] bg-slate-950/40 border border-white/5 rounded-2xl p-4 relative overflow-hidden flex flex-col justify-between">
          <svg viewBox="0 0 500 160" className="w-full h-[140px] overflow-visible">
            <defs>
              <linearGradient id="areaGrowthGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FBBF24" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#FBBF24" stopOpacity="0.00" />
              </linearGradient>
            </defs>

            {/* Grid Lines */}
            <line x1="20" y1="20" x2="480" y2="20" stroke="rgba(255,255,255,0.03)" strokeDasharray="3,3" />
            <line x1="20" y1="56" x2="480" y2="56" stroke="rgba(255,255,255,0.03)" strokeDasharray="3,3" />
            <line x1="20" y1="93" x2="480" y2="93" stroke="rgba(255,255,255,0.03)" strokeDasharray="3,3" />
            <line x1="20" y1="130" x2="480" y2="130" stroke="rgba(255,255,255,0.05)" />

            {/* Draw area filled with gradient */}
            {growthAreaPath && (
              <path d={growthAreaPath} fill="url(#areaGrowthGrad)" />
            )}

            {/* Draw the line */}
            {growthLinePath && (
              <path d={growthLinePath} fill="none" stroke="#FBBF24" strokeWidth="3" strokeLinecap="round" />
            )}

            {/* Nodes, Labels, Tooltips */}
            {growthPoints.map((p, idx) => (
              <g key={idx} className="group/node cursor-pointer">
                <circle cx={p.x} cy={p.y} r="8" fill="transparent" />
                <circle cx={p.x} cy={p.y} r="4" fill="#1E293B" stroke="#FBBF24" strokeWidth="2.5" className="transition-all duration-300 group-hover/node:r-5 group-hover/node:fill-[#FBBF24]" />

                <text x={p.x} y={p.y - 12} fill="#ffffff" fontSize="9" fontWeight="bold" textAnchor="middle" className="opacity-70 group-hover/node:opacity-100 group-hover/node:scale-110 transition-all font-mono">
                  {p.total}
                </text>

                <text x={p.x} y="148" fill="#64748B" fontSize="9" textAnchor="middle" className="font-semibold">
                  {p.monthName}
                </text>
              </g>
            ))}
          </svg>

          <div className="flex justify-between items-center px-2 pt-2 border-t border-white/5 mt-2">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#FBBF24]" />
              <span className="text-[10px] text-slate-400 font-semibold uppercase">Total Acumulado</span>
            </div>
            <div className="text-right">
              <span className="text-[11px] text-green-400 font-bold bg-green-500/10 px-2 py-0.5 rounded border border-green-500/10 font-mono">
                +{(growthData[5].total - growthData[0].total)} en 6m
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
