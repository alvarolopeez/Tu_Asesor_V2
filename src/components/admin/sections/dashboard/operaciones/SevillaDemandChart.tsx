import { MapPin, Search } from "lucide-react";
import type { ZoneDemandItem } from "./operacionesUtils";

interface SevillaDemandChartProps {
  /** Top 10 zonas de toda la taxonomía, sin filtrar. */
  demand: ZoneDemandItem[];
  searchQuery: string;
  onSearchChange: (value: string) => void;
}

/** Top 10 zonas con más compradores activos, con buscador en vivo. */
export default function SevillaDemandChart({ demand, searchQuery, onSearchChange }: SevillaDemandChartProps) {
  const filtered = demand
    .filter(item => item.zone.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => b.count - a.count);

  const top10 = filtered.slice(0, 10);
  const maxDemandCount = Math.max(...filtered.map(item => item.count), 1);

  return (
    <div className="bg-[#1E293B]/60 backdrop-blur-md p-6 rounded-2xl border border-white/5 flex flex-col justify-between">
      <div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <MapPin size={18} className="text-[#FBBF24]" />
              Demanda por Zonas
            </h3>
            <p className="text-slate-400 text-xs mt-0.5">Top 10 zonas con más compradores activos y presupuesto medio</p>
          </div>

          {/* Modern search input */}
          <div className="relative w-full md:w-auto">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Search size={14} />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Buscar barrio o municipio..."
              className="bg-slate-950/60 border border-white/10 text-xs text-white rounded-xl pl-9 pr-4 py-2 focus:outline-none focus:ring-1 focus:ring-[#FBBF24] focus:border-transparent w-full md:w-56 placeholder-slate-500 transition-all duration-300"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange("")}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs text-slate-500 hover:text-white"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Horizontal Bar Chart list */}
        <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1 custom-scrollbar">
          {top10.length > 0 ? (
            top10.map((item, idx) => {
              const widthPercent = Math.max(5, (item.count / maxDemandCount) * 100);
              return (
                <div key={idx} className="group flex flex-col space-y-1.5 hover:bg-white/5 p-2 rounded-lg transition-all duration-200">
                  <div className="flex justify-between items-center text-xs font-semibold">
                    <span className="text-slate-200 group-hover:text-[#FBBF24] transition-colors">{item.zone}</span>
                    <span className="text-slate-400 text-[11px] font-normal">
                      <strong className="text-white font-semibold font-mono">{item.count}</strong> compr. • <strong className="text-slate-300 font-semibold font-mono">{item.avgBudget.toLocaleString()}€</strong> med.
                    </span>
                  </div>
                  <div className="w-full bg-slate-950/80 rounded-full h-2.5 relative overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-[#FBBF24] to-[#F59E0B] h-full rounded-full transition-all duration-1000 shadow-md group-hover:shadow-[#FBBF24]/20"
                      style={{ width: `${widthPercent}%` }}
                    ></div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-10 text-slate-500 text-xs">
              {searchQuery ? `Sin zonas para "${searchQuery}"` : "Sin datos de zonas — añade preferred_zones a los compradores"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
