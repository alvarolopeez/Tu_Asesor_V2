"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import {
  Calculator,
  Loader2,
  CheckCircle,
  AlertCircle,
  Download,
  History,
  ChevronDown,
  ChevronUp,
  Zap,
  TrendingUp,
  Gem,
  X,
} from "lucide-react";
import type { ValuationInputs, ValuationResult, EstadoInmueble } from "@/lib/valuation";

// ─── Tipos locales ────────────────────────────────────────────────────────────

interface ValuationReport {
  id: string;
  created_at: string;
  status: "running" | "done" | "failed";
  inputs: ValuationInputs;
  result?: ValuationResult | null;
  property_id?: string | null;
  error_msg?: string | null;
  markdown?: string | null;
  grounding_urls?: string[];
}

const ESTADO_OPTIONS: EstadoInmueble[] = [
  "Para reformar",
  "Bien conservado",
  "Buen estado",
  "Reformado",
];

const TIPO_OPTIONS = ["piso", "casa", "local", "otro"] as const;

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 60;

// ─── Componente ───────────────────────────────────────────────────────────────

export default function ValuationManager() {
  // Form
  const [inputs, setInputs] = useState<Partial<ValuationInputs>>({
    estado: "Buen estado",
    tipo: "piso",
  });

  // Estado de generación
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeReport, setActiveReport] = useState<ValuationReport | null>(null);

  // Histórico
  const [history, setHistory] = useState<ValuationReport[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Write-back
  const [writingBack, setWritingBack] = useState(false);
  const [writeBackMsg, setWriteBackMsg] = useState<string | null>(null);

  // PDF
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollAttemptsRef = useRef(0);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(
    (id: string) => {
      pollAttemptsRef.current = 0;
      pollRef.current = setInterval(async () => {
        pollAttemptsRef.current++;
        if (pollAttemptsRef.current > POLL_MAX_ATTEMPTS) {
          stopPoll();
          setError("Tiempo de espera agotado. Recarga para ver si el análisis terminó.");
          setIsGenerating(false);
          return;
        }
        try {
          const res = await fetch(`/api/valuation/${id}`);
          if (!res.ok) return;
          const data: ValuationReport = await res.json();
          if (data.status === "done" || data.status === "failed") {
            stopPoll();
            setActiveReport(data);
            setIsGenerating(false);
          }
        } catch {
          // silencioso — reintenta en el próximo tick
        }
      }, POLL_INTERVAL_MS);
    },
    [stopPoll],
  );

  useEffect(() => () => stopPoll(), [stopPoll]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputs.m2 || inputs.m2 <= 0) {
      setError("Indica los m²");
      return;
    }
    if (!inputs.estado) {
      setError("Selecciona el estado del inmueble");
      return;
    }
    if (!inputs.direccion && !inputs.referencia_catastral && !inputs.zona) {
      setError("Indica al menos dirección, referencia catastral o zona");
      return;
    }

    setError(null);
    setIsGenerating(true);
    setActiveReport(null);
    setWriteBackMsg(null);

    try {
      const res = await fetch("/api/valuation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inputs),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al iniciar la valoración");
        setIsGenerating(false);
        return;
      }
      startPolling(data.id as string);
    } catch {
      setError("Error de conexión");
      setIsGenerating(false);
    }
  };

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch("/api/valuation");
      const data = await res.json();
      setHistory(Array.isArray(data) ? data : []);
    } catch {
      // silencioso
    } finally {
      setLoadingHistory(false);
    }
  };

  const openHistorical = async (report: ValuationReport) => {
    if (report.status !== "done") return;
    const res = await fetch(`/api/valuation/${report.id}`);
    const data: ValuationReport = await res.json();
    setActiveReport(data);
    setHistoryOpen(false);
    setWriteBackMsg(null);
  };

  const handleDownloadPdf = async () => {
    if (!activeReport?.id) return;
    setDownloadingPdf(true);
    try {
      const res = await fetch(`/api/valuation/${activeReport.id}/pdf`, { method: "POST" });
      if (!res.ok) {
        let msg = "Error al generar el PDF";
        try {
          const errData = await res.json();
          if (errData?.error) msg = `Error PDF: ${String(errData.error).slice(0, 150)}`;
        } catch { /* ignore */ }
        setError(msg);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `valoracion_${activeReport.id.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Error al descargar el PDF");
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleWriteBack = async () => {
    if (!activeReport?.id) return;
    setWritingBack(true);
    setWriteBackMsg(null);
    try {
      const res = await fetch(`/api/valuation/${activeReport.id}/writeback`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setWriteBackMsg(`Error: ${data.error}`);
        return;
      }
      setWriteBackMsg(
        `Guardado: ${data.precio_mercado?.toLocaleString()} € en el inmueble${data.seller_lead_updated ? " y en el lead vendedor" : ""}.`,
      );
    } catch {
      setWriteBackMsg("Error al guardar en el CRM");
    } finally {
      setWritingBack(false);
    }
  };

  const field = <K extends keyof ValuationInputs>(key: K, value: ValuationInputs[K]) =>
    setInputs((prev) => ({ ...prev, [key]: value }));

  const result = activeReport?.result as ValuationResult | null | undefined;

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#FBBF24]/10 rounded-xl flex items-center justify-center">
            <Calculator className="w-5 h-5 text-[#FBBF24]" />
          </div>
          <div>
            <h2 className="text-white font-semibold text-lg">Valoración IA</h2>
            <p className="text-slate-400 text-xs">Mejor precio de salida para un inmueble</p>
          </div>
        </div>
        <button
          onClick={() => {
            setHistoryOpen((v) => !v);
            if (!historyOpen) loadHistory();
          }}
          className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 text-sm transition-colors"
        >
          <History className="w-4 h-4" />
          Historial
          {historyOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {/* Historial */}
      {historyOpen && (
        <div className="bg-slate-800/50 border border-white/5 rounded-xl p-4 space-y-2">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-3">
            Últimas valoraciones
          </p>
          {loadingHistory && (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
            </div>
          )}
          {!loadingHistory && history.length === 0 && (
            <p className="text-slate-500 text-sm">Sin valoraciones previas</p>
          )}
          {history.map((h) => {
            const inp = h.inputs as ValuationInputs;
            const label = inp.direccion || inp.zona || "Sin localización";
            const precio = (h.result as ValuationResult | null)?.rangos?.mercado?.precio;
            return (
              <button
                key={h.id}
                onClick={() => openHistorical(h)}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-700 rounded-lg transition-colors text-left"
              >
                <div>
                  <p className="text-white text-sm font-medium">{label.slice(0, 50)}</p>
                  <p className="text-slate-400 text-xs">
                    {inp.m2} m² · {inp.estado} ·{" "}
                    {new Date(h.created_at).toLocaleDateString("es-ES")}
                  </p>
                </div>
                <div className="text-right shrink-0 ml-4">
                  {h.status === "done" && precio ? (
                    <span className="text-blue-400 font-semibold text-sm">
                      {precio.toLocaleString()} €
                    </span>
                  ) : h.status === "failed" ? (
                    <span className="text-red-400 text-xs">Error</span>
                  ) : (
                    <span className="text-yellow-400 text-xs">En proceso</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Formulario */}
      <form onSubmit={handleSubmit} className="bg-slate-800/50 border border-white/5 rounded-xl p-6 space-y-5">
        <h3 className="text-white font-medium text-sm uppercase tracking-wider text-[#FBBF24]">
          Datos del inmueble
        </h3>

        {/* Localización */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-slate-400 text-xs mb-1">Dirección</label>
            <input
              type="text"
              value={inputs.direccion || ""}
              onChange={(e) => field("direccion", e.target.value || undefined)}
              placeholder="Ej: Calle Sierpes 12, Sevilla"
              className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-[#FBBF24]/50"
            />
          </div>
          <div>
            <label className="block text-slate-400 text-xs mb-1">Referencia catastral (opcional)</label>
            <input
              type="text"
              value={inputs.referencia_catastral || ""}
              onChange={(e) => field("referencia_catastral", e.target.value || undefined)}
              placeholder="Ej: 9872023VH5797S0001WX"
              className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-[#FBBF24]/50"
            />
          </div>
        </div>

        {/* Zona + m² + tipo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="col-span-2 md:col-span-1">
            <label className="block text-slate-400 text-xs mb-1">Zona</label>
            <input
              type="text"
              value={inputs.zona || ""}
              onChange={(e) => field("zona", e.target.value || undefined)}
              placeholder="Nervión, Triana…"
              className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-[#FBBF24]/50"
            />
          </div>
          <div>
            <label className="block text-slate-400 text-xs mb-1">
              m² <span className="text-red-400">*</span>
            </label>
            <input
              type="number"
              min={1}
              value={inputs.m2 || ""}
              onChange={(e) => field("m2", parseFloat(e.target.value) || 0)}
              placeholder="80"
              className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-[#FBBF24]/50"
            />
          </div>
          <div>
            <label className="block text-slate-400 text-xs mb-1">Tipo</label>
            <select
              value={inputs.tipo || "piso"}
              onChange={(e) => field("tipo", e.target.value as ValuationInputs["tipo"])}
              className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#FBBF24]/50"
            >
              {TIPO_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-slate-400 text-xs mb-1">
              Estado <span className="text-red-400">*</span>
            </label>
            <select
              value={inputs.estado || "Buen estado"}
              onChange={(e) => field("estado", e.target.value as EstadoInmueble)}
              className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#FBBF24]/50"
            >
              {ESTADO_OPTIONS.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Básicos */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-slate-400 text-xs mb-1">Habitaciones</label>
            <input
              type="number"
              min={0}
              value={inputs.habitaciones || ""}
              onChange={(e) => field("habitaciones", parseInt(e.target.value) || undefined)}
              placeholder="3"
              className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-[#FBBF24]/50"
            />
          </div>
          <div>
            <label className="block text-slate-400 text-xs mb-1">Baños</label>
            <input
              type="number"
              min={0}
              value={inputs.banos || ""}
              onChange={(e) => field("banos", parseInt(e.target.value) || undefined)}
              placeholder="1"
              className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-[#FBBF24]/50"
            />
          </div>
          <div>
            <label className="block text-slate-400 text-xs mb-1">Planta</label>
            <input
              type="text"
              value={inputs.planta || ""}
              onChange={(e) => field("planta", e.target.value || undefined)}
              placeholder="2ª"
              className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-[#FBBF24]/50"
            />
          </div>
          <div>
            <label className="block text-slate-400 text-xs mb-1">Ascensor</label>
            <select
              value={inputs.ascensor === undefined ? "" : inputs.ascensor ? "si" : "no"}
              onChange={(e) =>
                field("ascensor", e.target.value === "" ? undefined : e.target.value === "si")
              }
              className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#FBBF24]/50"
            >
              <option value="">—</option>
              <option value="si">Sí</option>
              <option value="no">No</option>
            </select>
          </div>
          <div>
            <label className="block text-slate-400 text-xs mb-1">Año construcción</label>
            <input
              type="number"
              min={1900}
              max={2026}
              value={inputs.ano || ""}
              onChange={(e) => field("ano", parseInt(e.target.value) || undefined)}
              placeholder="1985"
              className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-[#FBBF24]/50"
            />
          </div>
        </div>

        {/* Reformas */}
        <div>
          <label className="block text-slate-400 text-xs mb-1">
            Reformas y extras (opcional)
          </label>
          <textarea
            rows={2}
            value={inputs.reformas_extras || ""}
            onChange={(e) => field("reformas_extras", e.target.value || undefined)}
            placeholder="cocina reformada 2023, suelos nuevos, A/A, climalit, parking…"
            className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-[#FBBF24]/50 resize-none"
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
            <button onClick={() => setError(null)} className="ml-auto">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        <button
          type="submit"
          disabled={isGenerating}
          className="w-full flex items-center justify-center gap-2 bg-[#FBBF24] hover:bg-[#F59E0B] disabled:opacity-60 disabled:cursor-not-allowed text-[#0F172A] font-semibold py-3 rounded-xl transition-colors"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Analizando mercado con IA… puede tardar 30-60 s
            </>
          ) : (
            <>
              <Calculator className="w-4 h-4" />
              Generar valoración
            </>
          )}
        </button>
      </form>

      {/* Resultados */}
      {activeReport?.status === "done" && (
        <div className="space-y-4">
          {/* Cabecera: estado + botón PDF (siempre visible) */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
              <span className="text-white font-medium">Valoración completada</span>
              {result && (
                <>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      result.confianza === "alta"
                        ? "bg-green-500/20 text-green-300"
                        : result.confianza === "media"
                          ? "bg-yellow-500/20 text-yellow-300"
                          : "bg-slate-500/20 text-slate-300"
                    }`}
                  >
                    Confianza {result.confianza}
                  </span>
                  {result.precio_m2_zona > 0 && (
                    <span className="text-slate-400 text-xs">
                      €/m² zona: {result.precio_m2_zona.toLocaleString()}
                      {result.precio_m2_zona_rango &&
                        ` (${result.precio_m2_zona_rango.min.toLocaleString()}–${result.precio_m2_zona_rango.max.toLocaleString()})`}
                    </span>
                  )}
                </>
              )}
            </div>
            <button
              onClick={handleDownloadPdf}
              disabled={downloadingPdf}
              className="flex items-center gap-2 px-4 py-2 bg-[#FBBF24] hover:bg-[#F59E0B] disabled:opacity-60 rounded-xl text-[#0F172A] text-sm font-bold transition-colors shrink-0"
            >
              {downloadingPdf ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {downloadingPdf ? "Generando…" : "Descargar PDF"}
            </button>
          </div>

          {/* Sin datos estructurados: aviso y descarga */}
          {!result && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-6 flex flex-col items-center gap-3 text-center">
              <Download className="w-8 h-8 text-blue-400" />
              <p className="text-blue-200 font-medium">Informe listo</p>
              <p className="text-slate-400 text-sm">
                El análisis está completo. Pulsa "Descargar PDF" para obtener el informe con todos los detalles generados por la IA.
              </p>
            </div>
          )}

          {/* Advertencias */}
          {result?.advertencias && result.advertencias.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3">
              <p className="text-amber-300 text-xs font-semibold mb-1">Advertencias</p>
              {result.advertencias.map((a, i) => (
                <p key={i} className="text-amber-200 text-xs">
                  · {a}
                </p>
              ))}
            </div>
          )}

          {/* 3 Tarjetas hero */}
          {result && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Venta rápida */}
              <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="w-4 h-4 text-green-400" />
                  <span className="text-green-300 text-xs font-semibold uppercase tracking-wider">
                    Venta rápida
                  </span>
                </div>
                <p className="text-white text-2xl font-bold">
                  {result.rangos.venta_rapida.precio.toLocaleString()} €
                </p>
                <p className="text-green-300 text-sm mt-0.5">
                  {result.rangos.venta_rapida.precio_m2.toLocaleString()} €/m²
                </p>
                <p className="text-slate-400 text-xs mt-1">
                  ~{result.rangos.venta_rapida.dias_estimados} días
                </p>
                {result.rangos.venta_rapida.justificacion && (
                  <p className="text-slate-300 text-xs mt-2 leading-relaxed">
                    {result.rangos.venta_rapida.justificacion}
                  </p>
                )}
              </div>

              {/* Mercado */}
              <div className="bg-blue-500/10 border border-blue-500/40 rounded-xl p-5 ring-1 ring-blue-500/20">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-4 h-4 text-blue-400" />
                  <span className="text-blue-300 text-xs font-semibold uppercase tracking-wider">
                    Precio de mercado
                  </span>
                </div>
                <p className="text-white text-3xl font-bold">
                  {result.rangos.mercado.precio.toLocaleString()} €
                </p>
                <p className="text-blue-300 text-sm mt-0.5">
                  {result.rangos.mercado.precio_m2.toLocaleString()} €/m²
                </p>
                <p className="text-slate-400 text-xs mt-1">
                  ~{result.rangos.mercado.dias_estimados} días
                </p>
                {result.rangos.mercado.justificacion && (
                  <p className="text-slate-300 text-xs mt-2 leading-relaxed">
                    {result.rangos.mercado.justificacion}
                  </p>
                )}
              </div>

              {/* Premium */}
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Gem className="w-4 h-4 text-amber-400" />
                  <span className="text-amber-300 text-xs font-semibold uppercase tracking-wider">
                    Premium
                  </span>
                </div>
                <p className="text-white text-2xl font-bold">
                  {result.rangos.premium.precio.toLocaleString()} €
                </p>
                <p className="text-amber-300 text-sm mt-0.5">
                  {result.rangos.premium.precio_m2.toLocaleString()} €/m²
                </p>
                <p className="text-slate-400 text-xs mt-1">
                  ~{result.rangos.premium.dias_estimados} días
                </p>
                {result.rangos.premium.justificacion && (
                  <p className="text-slate-300 text-xs mt-2 leading-relaxed">
                    {result.rangos.premium.justificacion}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Factores */}
          {result?.factores && result.factores.length > 0 && (
            <div className="bg-slate-800/50 border border-white/5 rounded-xl p-4">
              <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
                Factores del inmueble
              </p>
              <div className="flex flex-wrap gap-2">
                {result.factores.map((f, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-1 bg-slate-700 text-slate-200 text-xs rounded-full"
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Comparables */}
          {result?.comparables && result.comparables.length > 0 && (
            <div className="bg-slate-800/50 border border-white/5 rounded-xl p-4">
              <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">
                Comparables de mercado
              </p>
              <div className="space-y-1.5">
                {result.comparables.map((c, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-slate-300">
                      {c.url ? (
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 underline"
                        >
                          {c.fuente}
                        </a>
                      ) : (
                        c.fuente
                      )}
                    </span>
                    <span className="text-white font-medium">
                      {c.precio_m2.toLocaleString()} €/m²
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Narrativa IA */}
          {activeReport.markdown && (
            <div className="bg-slate-800/50 border border-white/5 rounded-xl p-5">
              <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">
                Análisis completo
              </p>
              <div className="prose prose-invert prose-sm max-w-none text-slate-200">
                <ReactMarkdown>{activeReport.markdown}</ReactMarkdown>
              </div>
            </div>
          )}

          {/* Supuestos */}
          {result?.supuestos && result.supuestos.length > 0 && (
            <div className="bg-slate-900/50 border border-white/5 rounded-xl p-4">
              <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">
                Supuestos asumidos por la IA
              </p>
              <ul className="space-y-1">
                {result.supuestos.map((s, i) => (
                  <li key={i} className="text-slate-400 text-xs">
                    · {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Estado failed */}
      {activeReport?.status === "failed" && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-red-300 font-medium text-sm">La valoración falló</p>
            <p className="text-red-200 text-xs mt-1 font-mono">
              {activeReport.error_msg?.slice(0, 200)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
