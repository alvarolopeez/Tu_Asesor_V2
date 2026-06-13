import { Printer, TrendingDown } from "lucide-react";
import type { PropertyRow } from "../types";
import type { SelectedMetrics, PriceDropEstimate } from "./operacionesUtils";

interface PropertyReportSelectorProps {
  properties: PropertyRow[];
  selectedPropertyId: string;
  onSelectProperty: (id: string) => void;
  selectedProperty: PropertyRow | undefined;
  metrics: SelectedMetrics;
  platformAvgViews: number;
  platformAvgDays: number;
  priceDrop?: PriceDropEstimate;
  /** Abre la vista previa del dossier PDF. */
  onPrint: () => void;
  /** Abre el modal de análisis de rebaja IA (brief #015). */
  onGeneratePriceDropReport: () => void;
}

const CONFIDENCE_STYLE: Record<string, string> = {
  alta: "bg-emerald-500/15 text-emerald-400",
  media: "bg-amber-500/15 text-amber-400",
  baja: "bg-slate-500/15 text-slate-400",
};

/** Selector de inmueble + comparativa de métricas y disparador del informe. */
export default function PropertyReportSelector({
  properties,
  selectedPropertyId,
  onSelectProperty,
  selectedProperty,
  metrics,
  platformAvgViews,
  platformAvgDays,
  priceDrop,
  onPrint,
  onGeneratePriceDropReport,
}: PropertyReportSelectorProps) {
  const {
    selectedViews,
    selectedPhysicalCompleted,
    selectedPhysicalPending,
    selectedDays,
    selectedPrice,
    selectedValuation,
    valuationDiffPct,
    correlationRating,
    correlationColor,
    isPublished,
  } = metrics;

  return (
    <div className="bg-[#1E293B]/85 backdrop-blur-md p-6 rounded-2xl border border-[#FBBF24]/30 shadow-xl">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
            <TrendingDown size={18} className="text-[#FBBF24]" />
            Informe de Posicionamiento
          </h3>
          <p className="text-slate-400 text-xs">Estudio IA de posición competitiva en el mercado actual · Dossier PDF descargable</p>
        </div>

        {/* Properties Dropdown */}
        <select
          value={selectedPropertyId}
          onChange={(e) => onSelectProperty(e.target.value)}
          className="bg-slate-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
        >
          {properties.map(p => (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </select>
      </div>

      {selectedProperty ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
          {/* Left detail card */}
          <div className="space-y-4 bg-slate-900/40 p-5 rounded-xl border border-white/5">
            <h4 className="font-bold text-white text-base">{selectedProperty.title}</h4>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between pb-1 border-b border-white/5">
                <span className="text-slate-400">Precio de Publicación</span>
                <span className="font-bold text-white">{selectedPrice.toLocaleString()}€</span>
              </div>
              <div className="flex justify-between pb-1 border-b border-white/5">
                <span className="text-slate-400">Valoración por IA</span>
                <span className="font-bold text-white">{selectedValuation > 0 ? `${selectedValuation.toLocaleString()}€` : "N/D"}</span>
              </div>
              <div className="flex justify-between pb-1 border-b border-white/5">
                <span className="text-slate-400">Días Publicada</span>
                <span className="font-bold text-white">{isPublished ? `${selectedDays} días` : "Sin publicar"}</span>
              </div>
              <div className="flex justify-between pb-1 border-b border-white/5">
                <span className="text-slate-400">Visitas Web</span>
                <span className="font-bold text-white">{selectedViews} visitas</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Visitas Físicas</span>
                <span className="font-bold text-white">
                  {selectedPhysicalCompleted} completadas
                  {selectedPhysicalPending > 0 && (
                    <span className="ml-1 text-amber-300">(+{selectedPhysicalPending} pendientes)</span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Middle Comparison Metrics */}
          <div className="space-y-4">
            <div className="bg-slate-900/40 p-4 rounded-xl border border-white/5">
              <div className="flex justify-between items-center mb-1 text-xs">
                <span className="text-slate-400">Rendimiento de Visitas</span>
                <span className={`font-bold ${selectedViews >= platformAvgViews ? "text-green-400" : "text-orange-400"}`}>
                  {selectedViews >= platformAvgViews ? "+" : ""}{selectedViews - platformAvgViews} vs Media
                </span>
              </div>
              <p className="text-xs text-slate-500">Media de la plataforma: {platformAvgViews} visitas</p>
            </div>

            <div className="bg-slate-900/40 p-4 rounded-xl border border-white/5">
              <div className="flex justify-between items-center mb-1 text-xs">
                <span className="text-slate-400">Velocidad de Cierre</span>
                <span className={`font-bold ${selectedDays <= platformAvgDays ? "text-green-400" : "text-orange-400"}`}>
                  {selectedDays - platformAvgDays > 0 ? "+" : ""}{selectedDays - platformAvgDays} días vs Media
                </span>
              </div>
              <p className="text-xs text-slate-500">Media de la plataforma: {platformAvgDays} días</p>
            </div>
          </div>

          {/* Offer correlation visual gauge */}
          <div className="bg-slate-900/40 p-5 rounded-xl border border-white/5 flex flex-col justify-between h-full min-h-[140px]">
            <div className="text-center">
              <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Correlación de Ofertas</p>
              <span className={`text-lg font-extrabold ${correlationColor}`}>{correlationRating}</span>
              <p className="text-2xl font-black text-white mt-2">
                {valuationDiffPct > 0 ? "+" : ""}{valuationDiffPct.toFixed(1)}%
              </p>
              <p className="text-[10px] text-slate-500 mt-1">Desviación respecto a Valoración de Mercado</p>
            </div>

            <div className="space-y-2 mt-4">
              <button
                onClick={onPrint}
                className="w-full py-2 bg-[#FBBF24] hover:bg-[#FBBF24]/90 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all duration-300"
              >
                <Printer size={14} /> Generar Informe PDF
              </button>
              <button
                onClick={onGeneratePriceDropReport}
                className="w-full py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 hover:text-white border border-rose-400/30 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all duration-300"
              >
                <TrendingDown size={14} /> Informe de posicionamiento IA
              </button>
            </div>
          </div>

          {/* ─── ESTIMACIÓN DE BAJADA DE PRECIO (heurística) ─────────────── */}
          {priceDrop && (
            <div className="lg:col-span-3 bg-slate-900/40 p-5 rounded-xl border border-white/5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <TrendingDown size={16} className="text-[#FBBF24]" />
                  Estimación de Ajuste de Precio
                </h4>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${CONFIDENCE_STYLE[priceDrop.confidence]}`}>
                  Confianza {priceDrop.confidence}
                </span>
              </div>

              {priceDrop.noAdjustment ? (
                <p className="text-sm text-emerald-400 font-semibold">
                  No se recomienda bajar el precio con las señales actuales. ✅
                </p>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-end gap-4">
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider">Ajuste sugerido</p>
                    <p className="text-2xl font-black text-[#FBBF24] leading-tight">
                      −{priceDrop.eurLow.toLocaleString()}€ … −{priceDrop.eurHigh.toLocaleString()}€
                    </p>
                    <p className="text-xs text-slate-400 font-bold">
                      (−{priceDrop.pctLow}% … −{priceDrop.pctHigh}%)
                    </p>
                  </div>
                </div>
              )}

              {priceDrop.reasons.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {priceDrop.reasons.map((r, i) => (
                    <li key={i} className="text-[11px] text-slate-400 flex gap-1.5">
                      <span className="text-[#FBBF24]">•</span> {r}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="text-slate-500 text-sm text-center py-6">Selecciona una propiedad para ver el análisis de valoración</p>
      )}
    </div>
  );
}
