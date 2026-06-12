"use client";

import { useState, useMemo } from "react";
import { Layers } from "lucide-react";
import type { LeadRow, EncargoRow, SellerActivityLogRow } from "../types";
import { computeOwnerPipeline } from "./operacionesUtils";

interface PipelineCardProps {
  sellerLeads: LeadRow[];
  encargos: EncargoRow[];
  sellerActivityLogs: SellerActivityLogRow[];
}

type QuickRange = "7d" | "30d" | "year" | "all";

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function quickRangeLabel(q: QuickRange): string {
  return q === "7d" ? "7 días" : q === "30d" ? "30 días" : q === "year" ? "Año" : "Todo";
}

/** Embudo extendido de captación: 6 etapas con filtro de fechas configurable. */
export default function PipelineCard({ sellerLeads, encargos, sellerActivityLogs }: PipelineCardProps) {
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

  const [fromInput, setFromInput] = useState<string>(toDateInput(defaultFrom));
  const [toInput, setToInput] = useState<string>(toDateInput(now));
  const [quickRange, setQuickRange] = useState<QuickRange | null>("year");

  function applyQuick(q: QuickRange) {
    setQuickRange(q);
    const t = new Date();
    if (q === "all") {
      setFromInput("");
      setToInput("");
    } else if (q === "7d") {
      const f = new Date(t.getTime() - 6 * 86_400_000);
      setFromInput(toDateInput(f));
      setToInput(toDateInput(t));
    } else if (q === "30d") {
      const f = new Date(t.getTime() - 29 * 86_400_000);
      setFromInput(toDateInput(f));
      setToInput(toDateInput(t));
    } else {
      const f = new Date(t.getFullYear() - 1, t.getMonth(), t.getDate());
      setFromInput(toDateInput(f));
      setToInput(toDateInput(t));
    }
  }

  const dateRange = useMemo(() => ({
    from: fromInput ? new Date(fromInput + "T00:00:00") : null,
    to: toInput ? new Date(toInput + "T00:00:00") : null,
  }), [fromInput, toInput]);

  const stages = useMemo(
    () => computeOwnerPipeline(sellerLeads, encargos, sellerActivityLogs, dateRange),
    [sellerLeads, encargos, sellerActivityLogs, dateRange],
  );

  const maxCount = Math.max(...stages.map(s => s.count), 1);

  return (
    <div className="bg-[#1E293B]/60 backdrop-blur-md p-6 rounded-2xl border border-white/5 flex flex-col gap-4">
      <div>
        <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
          <Layers size={18} className="text-[#FBBF24]" />
          Pipeline de Propietarios (Cartera)
        </h3>
        <p className="text-slate-400 text-xs">Embudo operativo de captaciones activas — 6 etapas</p>
      </div>

      {/* Filtro de fechas */}
      <div className="flex flex-col gap-2">
        {/* Atajos rápidos */}
        <div className="flex gap-1.5 flex-wrap">
          {(["7d", "30d", "year", "all"] as QuickRange[]).map(q => (
            <button
              key={q}
              onClick={() => applyQuick(q)}
              className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg border transition-all ${
                quickRange === q
                  ? "bg-[#FBBF24] text-slate-900 border-[#FBBF24]"
                  : "bg-slate-900 text-slate-400 border-white/10 hover:text-white"
              }`}
            >
              {quickRangeLabel(q)}
            </button>
          ))}
        </div>
        {/* Inputs manuales */}
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={fromInput}
            onChange={e => { setFromInput(e.target.value); setQuickRange(null); }}
            className="flex-1 bg-slate-900 border border-white/10 text-xs text-white rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#FBBF24]"
          />
          <span className="text-slate-500 text-xs">—</span>
          <input
            type="date"
            value={toInput}
            onChange={e => { setToInput(e.target.value); setQuickRange(null); }}
            className="flex-1 bg-slate-900 border border-white/10 text-xs text-white rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#FBBF24]"
          />
        </div>
      </div>

      {/* Barras del pipeline */}
      <div className="space-y-3">
        {stages.map(stage => (
          <div key={stage.key} className="space-y-1">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-slate-300">{stage.label}</span>
              <span className="text-white font-mono">{stage.count}</span>
            </div>
            <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${stage.color}`}
                style={{ width: `${(stage.count / maxCount) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
