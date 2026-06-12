"use client";

import { useState, useMemo } from "react";
import { BarChart3, Maximize2, X } from "lucide-react";
import type { PropertyRow } from "../types";
import { computeMarketDays, OPTIMO_CIERRE_DIAS, PRICE_RANGES } from "./operacionesUtils";
import type { MarketDayRange } from "./operacionesUtils";

interface MarketDaysChartProps {
  properties: PropertyRow[];
  platformAvgDays: number;
}

type BucketMode = "default" | "50k" | "100k";

function getAvailableYears(properties: PropertyRow[]): number[] {
  const years = new Set<number>();
  properties.forEach(p => {
    const d = p.published_at ? new Date(p.published_at) : new Date(p.created_at);
    years.add(d.getFullYear());
  });
  return Array.from(years).sort((a, b) => b - a);
}

interface ChartSvgProps {
  points: { x: number; y: number; label: string; avg: number }[];
  svgWidth: number;
  svgHeight: number;
  maxDays: number;
  compact?: boolean;
}

function ChartSvg({ points, svgWidth, svgHeight, maxDays, compact }: ChartSvgProps) {
  if (points.length === 0) {
    return (
      <text x={svgWidth / 2} y={svgHeight / 2} fill="#64748B" fontSize="10" textAnchor="middle">
        Sin datos
      </text>
    );
  }

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const yRef = svgHeight - 20; // baseline Y

  // Línea del óptimo
  const optY = yRef - (OPTIMO_CIERRE_DIAS / maxDays) * (yRef - 20);

  return (
    <>
      {/* Grid */}
      {[0.25, 0.5, 0.75, 1].map(f => (
        <line
          key={f}
          x1="10"
          y1={yRef - f * (yRef - 20)}
          x2={svgWidth - 10}
          y2={yRef - f * (yRef - 20)}
          stroke="rgba(255,255,255,0.05)"
          strokeDasharray="3,3"
        />
      ))}

      {/* Línea del óptimo */}
      {optY >= 20 && optY <= yRef && (
        <>
          <line
            x1="10"
            y1={optY}
            x2={svgWidth - 10}
            y2={optY}
            stroke="#4ade80"
            strokeWidth="1"
            strokeDasharray="4,3"
            opacity="0.6"
          />
          <text x={svgWidth - 12} y={optY - 3} fill="#4ade80" fontSize={compact ? "7" : "8"} textAnchor="end" opacity="0.8">
            Óptimo {OPTIMO_CIERRE_DIAS}d
          </text>
        </>
      )}

      {/* Línea principal */}
      <path d={linePath} fill="none" stroke="#FBBF24" strokeWidth="2.5" strokeLinecap="round" />

      {/* Nodos y etiquetas */}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="4" fill="#1E293B" stroke="#FBBF24" strokeWidth="2" />
          <text
            x={p.x}
            y={p.y - 10}
            fill="#fff"
            fontSize={compact ? "8" : "9"}
            fontWeight="bold"
            textAnchor="middle"
          >
            {p.avg}d
          </text>
          {/* Solo label del primero y último cuando hay muchos puntos */}
          {(points.length <= 6 || i === 0 || i === points.length - 1) && (
            <text x={p.x} y={yRef + 12} fill="#94A3B8" fontSize={compact ? "7" : "8"} textAnchor="middle">
              {p.label}
            </text>
          )}
        </g>
      ))}
    </>
  );
}

function buildPoints(
  ranges: MarketDayRange[],
  svgWidth: number,
  svgHeight: number,
  maxDays: number,
): { x: number; y: number; label: string; avg: number }[] {
  const n = ranges.length;
  if (n === 0) return [];
  const yRef = svgHeight - 20;
  const padL = 20;
  const padR = 20;
  const step = n > 1 ? (svgWidth - padL - padR) / (n - 1) : 0;

  return ranges.map((item, idx) => ({
    x: padL + idx * step,
    y: item.avg > 0 ? yRef - (item.avg / maxDays) * (yRef - 20) : yRef,
    label: item.label,
    avg: item.avg,
  }));
}

/** Gráfico de media de días en mercado por rango de precio. */
export default function MarketDaysChart({ properties, platformAvgDays }: MarketDaysChartProps) {
  const [bucketMode, setBucketMode] = useState<BucketMode>("default");
  const [selectedYear, setSelectedYear] = useState<number | undefined>(undefined);
  const [showModal, setShowModal] = useState(false);

  const availableYears = useMemo(() => getAvailableYears(properties), [properties]);

  const marketDaysPerRange = useMemo(
    () =>
      computeMarketDays(properties, {
        ranges: bucketMode === "default" ? PRICE_RANGES : undefined,
        bucketSize: bucketMode === "50k" ? 50_000 : bucketMode === "100k" ? 100_000 : undefined,
        year: selectedYear,
      }),
    [properties, bucketMode, selectedYear],
  );

  const maxDays = Math.max(...marketDaysPerRange.map(r => r.avg), OPTIMO_CIERRE_DIAS, 1);

  const compactPoints = buildPoints(marketDaysPerRange, 300, 120, maxDays);
  const modalPoints = buildPoints(marketDaysPerRange, 600, 240, maxDays);

  return (
    <>
      <div className="bg-[#1E293B]/60 backdrop-blur-md p-6 rounded-2xl border border-white/5 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <BarChart3 size={18} className="text-[#FBBF24]" />
              Media de Días en Mercado
            </h3>
            <p className="text-slate-400 text-xs mt-0.5">Comparativa por rango de precios</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            title="Ampliar gráfico"
            className="text-slate-500 hover:text-[#FBBF24] transition-colors mt-1"
          >
            <Maximize2 size={16} />
          </button>
        </div>

        {/* Controles */}
        <div className="flex flex-wrap gap-2 items-center">
          {/* Granularidad */}
          <div className="flex gap-1">
            {(["default", "50k", "100k"] as BucketMode[]).map(m => (
              <button
                key={m}
                onClick={() => setBucketMode(m)}
                className={`text-[10px] font-semibold px-2 py-0.5 rounded border transition-all ${
                  bucketMode === m
                    ? "bg-[#FBBF24] text-slate-900 border-[#FBBF24]"
                    : "bg-slate-900 text-slate-400 border-white/10 hover:text-white"
                }`}
              >
                {m === "default" ? "6 franjas" : `±${m}`}
              </button>
            ))}
          </div>

          {/* Año */}
          <select
            value={selectedYear ?? ""}
            onChange={e => setSelectedYear(e.target.value ? Number(e.target.value) : undefined)}
            className="bg-slate-900 border border-white/10 text-xs text-white rounded-lg px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#FBBF24]"
          >
            <option value="">Todos los años</option>
            {availableYears.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col md:flex-row items-center gap-4 justify-between">
          {/* Gráfico SVG */}
          <div className="w-full max-w-[340px] h-[150px] bg-slate-900/40 border border-white/5 rounded-xl p-2">
            <svg viewBox="0 0 300 120" className="w-full h-full overflow-visible">
              <ChartSvg points={compactPoints} svgWidth={300} svgHeight={120} maxDays={maxDays} compact />
            </svg>
          </div>

          {/* Resumen */}
          <div className="flex-1 w-full space-y-2">
            <div className="bg-[#0F172A] p-3 rounded-xl border border-white/5 flex justify-between items-center">
              <span className="text-xs text-slate-400">Media del Portal</span>
              <span className="text-sm font-extrabold text-[#FBBF24]">{platformAvgDays} días</span>
            </div>
            <div className="bg-[#0F172A] p-3 rounded-xl border border-white/5 flex justify-between items-center">
              <span className="text-xs text-slate-400">Óptimo de Cierre</span>
              <span className="text-sm font-extrabold text-green-400">{OPTIMO_CIERRE_DIAS} días</span>
            </div>
          </div>
        </div>
      </div>

      {/* Modal ampliado */}
      {showModal && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          onClick={() => setShowModal(false)}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div
            className="relative z-10 bg-[#1E293B] border border-white/10 rounded-2xl p-6 w-full max-w-3xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white font-bold text-lg flex items-center gap-2">
                <BarChart3 size={18} className="text-[#FBBF24]" />
                Media de Días en Mercado
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <div className="w-full bg-slate-900/40 border border-white/5 rounded-xl p-4">
              <svg viewBox="0 0 600 240" className="w-full overflow-visible">
                <ChartSvg points={modalPoints} svgWidth={600} svgHeight={240} maxDays={maxDays} />
              </svg>
            </div>
            <div className="flex gap-4 mt-4 text-xs text-slate-400">
              <span>
                <span className="inline-block w-3 h-1 bg-green-400 mr-1 rounded opacity-60 align-middle" />
                Óptimo {OPTIMO_CIERRE_DIAS}d
              </span>
              <span>
                <span className="inline-block w-3 h-1 bg-[#FBBF24] mr-1 rounded align-middle" />
                Media por franja
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
