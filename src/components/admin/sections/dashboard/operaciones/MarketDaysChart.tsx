import { BarChart3 } from "lucide-react";
import type { MarketDayRange } from "./operacionesUtils";

interface MarketDaysChartProps {
  marketDaysPerRange: MarketDayRange[];
  platformAvgDays: number;
}

/** Gráfico de líneas SVG de la media de días en mercado por rango de precio. */
export default function MarketDaysChart({ marketDaysPerRange, platformAvgDays }: MarketDaysChartProps) {
  // Geometría del SVG (grid 320x120): mapea 0..120 días a la altura 100..20.
  const points = marketDaysPerRange.map((item, idx) => {
    const x = 40 + idx * 80;
    const y = 100 - (item.avg / 120) * 80;
    return { x, y, label: item.label, avg: item.avg };
  });

  const linePath = points.map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  return (
    <div className="bg-[#1E293B]/60 backdrop-blur-md p-6 rounded-2xl border border-white/5 flex flex-col justify-between">
      <div>
        <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
          <BarChart3 size={18} className="text-[#FBBF24]" />
          Media de Días en Mercado
        </h3>
        <p className="text-slate-400 text-xs mb-6">Comparativa por rango de precios de la propiedad</p>
      </div>

      <div className="flex flex-col md:flex-row items-center gap-4 justify-between">
        {/* Responsive SVG Line Chart */}
        <div className="w-full max-w-[340px] h-[160px] bg-slate-900/40 border border-white/5 rounded-xl p-2 relative">
          <svg viewBox="0 0 320 120" className="w-full h-full">
            {/* Grid lines */}
            <line x1="10" y1="20" x2="310" y2="20" stroke="rgba(255,255,255,0.05)" strokeDasharray="3,3" />
            <line x1="10" y1="60" x2="310" y2="60" stroke="rgba(255,255,255,0.05)" strokeDasharray="3,3" />
            <line x1="10" y1="100" x2="310" y2="100" stroke="rgba(255,255,255,0.05)" strokeDasharray="3,3" />

            {/* Draw main line */}
            <path d={linePath} fill="none" stroke="#FBBF24" strokeWidth="3" strokeLinecap="round" />

            {/* Nodes & Labels */}
            {points.map((p, idx) => (
              <g key={idx}>
                <circle cx={p.x} cy={p.y} r="5" fill="#1E293B" stroke="#FBBF24" strokeWidth="2" />
                {/* Tooltip values */}
                <text x={p.x} y={p.y - 12} fill="#ffffff" fontSize="9" fontWeight="bold" textAnchor="middle">
                  {p.avg}d
                </text>
                <text x={p.x} y="116" fill="#94A3B8" fontSize="8" textAnchor="middle">
                  {p.label}
                </text>
              </g>
            ))}
          </svg>
        </div>

        {/* Quick Summary Cards */}
        <div className="flex-1 w-full space-y-2">
          <div className="bg-[#0F172A] p-3 rounded-xl border border-white/5 flex justify-between items-center">
            <span className="text-xs text-slate-400">Media del Portal</span>
            <span className="text-sm font-extrabold text-[#FBBF24]">{platformAvgDays} días</span>
          </div>
          <div className="bg-[#0F172A] p-3 rounded-xl border border-white/5 flex justify-between items-center">
            <span className="text-xs text-slate-400">Óptimo de Cierre</span>
            <span className="text-sm font-extrabold text-green-400">45 días</span>
          </div>
        </div>
      </div>
    </div>
  );
}
