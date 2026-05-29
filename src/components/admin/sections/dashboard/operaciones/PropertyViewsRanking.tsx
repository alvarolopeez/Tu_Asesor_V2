import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import type { PropertyRow } from "../types";

interface PropertyViewsRankingProps {
  top3: PropertyRow[];
  bottom3: PropertyRow[];
  /** Mapa id→visitas reales (desde web_visits). */
  visitsByProperty: Record<string, number>;
}

/** Ranking de inmuebles por número de visitas (top 3 vs bottom 3). */
export default function PropertyViewsRanking({ top3, bottom3, visitsByProperty }: PropertyViewsRankingProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Top 3 most visited */}
      <div className="bg-[#1E293B]/60 backdrop-blur-md p-6 rounded-2xl border border-white/5">
        <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2 text-green-400">
          <ArrowUpRight size={18} /> Top 3 Inmuebles Más Visitados
        </h3>
        <div className="space-y-3">
          {top3.map((prop, idx) => (
            <div key={idx} className="bg-slate-900/40 p-3 rounded-xl border border-white/5 flex justify-between items-center">
              <div>
                <p className="text-sm font-bold text-white">{prop.title}</p>
                <p className="text-xs text-slate-400">{(Number(prop.price)).toLocaleString()}€</p>
              </div>
              <div className="text-right">
                <span className="bg-green-500/10 text-green-400 px-2 py-1 rounded text-xs font-bold border border-green-500/20">
                  {visitsByProperty[prop.id] ?? 0} visitas
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom 3 least visited */}
      <div className="bg-[#1E293B]/60 backdrop-blur-md p-6 rounded-2xl border border-white/5">
        <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2 text-orange-400">
          <ArrowDownRight size={18} /> Bottom 3 Inmuebles Menos Visitados
        </h3>
        <div className="space-y-3">
          {bottom3.map((prop, idx) => (
            <div key={idx} className="bg-slate-900/40 p-3 rounded-xl border border-white/5 flex justify-between items-center">
              <div>
                <p className="text-sm font-bold text-white">{prop.title}</p>
                <p className="text-xs text-slate-400">{(Number(prop.price)).toLocaleString()}€</p>
              </div>
              <div className="text-right">
                <span className="bg-orange-500/10 text-orange-400 px-2 py-1 rounded text-xs font-bold border border-orange-500/20">
                  {visitsByProperty[prop.id] ?? 0} visitas
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
