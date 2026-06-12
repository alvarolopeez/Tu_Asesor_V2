"use client";

import { useState, useMemo } from "react";
import { TrendingUp } from "lucide-react";
import type { BuyerDemandRow } from "../types";
import { computeGrowth, PRICE_RANGES } from "./operacionesUtils";
import type { GrowthGranularity } from "./operacionesUtils";

interface GrowthChartProps {
  buyersDemands: BuyerDemandRow[];
}

const GRAN_LABELS: Record<GrowthGranularity, string> = {
  day: "Día",
  week: "Semana",
  month: "Mes",
  year: "Año",
};

const PRICE_PRESET_LABELS = ["Todos", ...PRICE_RANGES.map(r => r.label)];

/** Área SVG con la evolución acumulada de compradores activos (interactiva). */
export default function GrowthChart({ buyersDemands }: GrowthChartProps) {
  const [granularity, setGranularity] = useState<GrowthGranularity>("month");
  const [pricePreset, setPricePreset] = useState<number>(-1); // -1 = todos

  const priceFilter = useMemo(() => {
    if (pricePreset < 0) return { priceMin: undefined, priceMax: undefined };
    const range = PRICE_RANGES[pricePreset];
    return { priceMin: range.min, priceMax: isFinite(range.max) ? range.max : undefined };
  }, [pricePreset]);

  const growthData = useMemo(
    () => computeGrowth(buyersDemands, { granularity, ...priceFilter }),
    [buyersDemands, granularity, priceFilter],
  );

  const maxGrowthVal = Math.max(...growthData.map(g => g.total), 1);
  const svgWidth = 500;
  const svgHeight = 160;
  const padL = 30;
  const padR = 20;
  const padT = 20;
  const padB = 30;

  const usableW = svgWidth - padL - padR;
  const usableH = svgHeight - padT - padB;
  const n = growthData.length;
  const step = n > 1 ? usableW / (n - 1) : 0;

  const growthPoints = growthData.map((item, idx) => ({
    x: padL + idx * step,
    y: padT + usableH - (item.total / maxGrowthVal) * usableH,
    ...item,
  }));

  const growthLinePath =
    growthPoints.length > 0
      ? growthPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")
      : "";

  const growthAreaPath =
    growthPoints.length > 0
      ? `${growthLinePath} L ${growthPoints[n - 1].x} ${padT + usableH} L ${growthPoints[0].x} ${padT + usableH} Z`
      : "";

  // Delta desde el primer al último punto
  const firstTotal = growthData[0]?.total ?? 0;
  const lastTotal = growthData[n - 1]?.total ?? 0;
  const delta = lastTotal - firstTotal;
  const deltaLabel = n > 1 ? `+${delta} en ${n} ${GRAN_LABELS[granularity].toLowerCase()}s` : `${lastTotal} total`;

  // Mostrar etiqueta solo cada N puntos para no saturar
  const labelEvery = n <= 8 ? 1 : n <= 16 ? 2 : Math.ceil(n / 8);

  return (
    <div className="bg-[#1E293B]/60 backdrop-blur-md p-6 rounded-2xl border border-white/5 flex flex-col gap-4">
      <div>
        <h3 className="text-lg font-bold text-white mb-0.5 flex items-center gap-2">
          <TrendingUp size={18} className="text-[#FBBF24]" />
          Crecimiento de Compradores Activos
        </h3>
        <p className="text-slate-400 text-xs">Evolución acumulada por granularidad temporal</p>
      </div>

      {/* Controles */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Granularidad */}
        <div className="flex gap-1">
          {(["day", "week", "month", "year"] as GrowthGranularity[]).map(g => (
            <button
              key={g}
              onClick={() => setGranularity(g)}
              className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg border transition-all ${
                granularity === g
                  ? "bg-[#FBBF24] text-slate-900 border-[#FBBF24]"
                  : "bg-slate-900 text-slate-400 border-white/10 hover:text-white"
              }`}
            >
              {GRAN_LABELS[g]}
            </button>
          ))}
        </div>

        {/* Franja de precio */}
        <select
          value={pricePreset}
          onChange={e => setPricePreset(Number(e.target.value))}
          className="bg-slate-900 border border-white/10 text-xs text-white rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#FBBF24]"
        >
          {PRICE_PRESET_LABELS.map((label, i) => (
            <option key={i} value={i - 1}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Gráfico SVG */}
      <div className="w-full h-[220px] bg-slate-950/40 border border-white/5 rounded-2xl p-4 relative overflow-hidden flex flex-col justify-between">
        <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-[170px] overflow-visible">
          <defs>
            <linearGradient id="areaGrowthGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FBBF24" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#FBBF24" stopOpacity="0.00" />
            </linearGradient>
          </defs>

          {/* Grid Lines */}
          {[0.25, 0.5, 0.75, 1].map(f => (
            <line
              key={f}
              x1={padL}
              y1={padT + usableH - f * usableH}
              x2={svgWidth - padR}
              y2={padT + usableH - f * usableH}
              stroke={f === 1 ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.03)"}
              strokeDasharray={f === 1 ? undefined : "3,3"}
            />
          ))}

          {/* Área con gradiente */}
          {growthAreaPath && <path d={growthAreaPath} fill="url(#areaGrowthGrad)" />}

          {/* Línea */}
          {growthLinePath && (
            <path d={growthLinePath} fill="none" stroke="#FBBF24" strokeWidth="2.5" strokeLinecap="round" />
          )}

          {/* Nodos y etiquetas */}
          {growthPoints.map((p, idx) => (
            <g key={idx} className="group/node cursor-pointer">
              <circle cx={p.x} cy={p.y} r="6" fill="transparent" />
              <circle cx={p.x} cy={p.y} r="3.5" fill="#1E293B" stroke="#FBBF24" strokeWidth="2" />
              <text
                x={p.x}
                y={p.y - 9}
                fill="#fff"
                fontSize="8"
                fontWeight="bold"
                textAnchor="middle"
                className="opacity-70 group-hover/node:opacity-100 transition-opacity font-mono"
              >
                {p.total}
              </text>
              {idx % labelEvery === 0 && (
                <text x={p.x} y={padT + usableH + 16} fill="#64748B" fontSize="8" textAnchor="middle">
                  {p.label}
                </text>
              )}
            </g>
          ))}
        </svg>

        <div className="flex justify-between items-center px-2 pt-2 border-t border-white/5">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FBBF24]" />
            <span className="text-[10px] text-slate-400 font-semibold uppercase">Total Acumulado</span>
          </div>
          <span className="text-[11px] text-green-400 font-bold bg-green-500/10 px-2 py-0.5 rounded border border-green-500/10 font-mono">
            {deltaLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
