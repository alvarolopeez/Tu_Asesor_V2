'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Sparkles, Loader2, Download, AlertTriangle, TrendingDown, CheckCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { PriceDropEstimate } from './operacionesUtils';
import type { PriceVerdicto, PriceAnalysisContext } from '@/lib/priceAnalysis';

/**
 * Modal del análisis de rebaja con IA (Brief #015).
 *
 * Flujo:
 *   1. POST /api/properties/[id]/price-analysis → inicia el análisis.
 *   2. Si responde antes del timeout Netlify (~26s): muestra resultado.
 *   3. Si fetch falla por timeout: inicia polling GET cada 3s hasta done/failed.
 *   4. Cuando hay resultado: muestra cifra hero + narrativa markdown + botón PDF.
 *
 * @created 2026-06-13 brief #015
 */

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 60; // 3 min máx

const STEPS = [
  'Consultando datos del inmueble en el CRM…',
  'Buscando comparables de mercado en Sevilla…',
  'Analizando feedback de compradores…',
  'Cruzando señales: días, visitas, propuestas…',
  'El tasador IA está redactando el veredicto…',
];

interface Props {
  propertyId: string;
  propertyTitle: string;
  priceDrop?: PriceDropEstimate;
  onClose: () => void;
}

export default function PriceDropModal({ propertyId, propertyTitle, priceDrop, onClose }: Props) {
  const [status, setStatus] = useState<'loading' | 'polling' | 'done' | 'failed'>('loading');
  const [stepIdx, setStepIdx] = useState(0);
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [veredicto, setVeredicto] = useState<PriceVerdicto | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollAttempts = useRef(0);

  const startPolling = () => {
    if (pollRef.current) return;
    setStatus('polling');
    pollAttempts.current = 0;
    pollRef.current = setInterval(async () => {
      pollAttempts.current += 1;
      if (pollAttempts.current > POLL_MAX_ATTEMPTS) {
        clearInterval(pollRef.current!);
        setStatus('failed');
        setErrorMsg('El análisis tardó demasiado. Por favor, inténtalo de nuevo.');
        return;
      }
      try {
        const res = await fetch(`/api/properties/${propertyId}/price-analysis`);
        const json = await res.json();
        if (json.status === 'done') {
          clearInterval(pollRef.current!);
          setMarkdown(json.markdown ?? null);
          setVeredicto(json.veredicto ?? null);
          setStatus('done');
        } else if (json.status === 'failed') {
          clearInterval(pollRef.current!);
          setStatus('failed');
          setErrorMsg(json.error_msg || 'El análisis falló en el servidor.');
        }
        // 'running' → seguir polling
      } catch {
        // ignorar errores de red en polling
      }
    }, POLL_INTERVAL_MS);
  };

  useEffect(() => {
    let cancelled = false;

    // Avanza los pasos de animación
    const stepTimer = setInterval(() => {
      setStepIdx((i) => (i + 1) % STEPS.length);
    }, 2800);

    const run = async () => {
      try {
        const res = await fetch(`/api/properties/${propertyId}/price-analysis`, { method: 'POST' });
        if (cancelled) return;

        if (res.ok) {
          const json = await res.json();
          if (json.status === 'done' || json.markdown) {
            clearInterval(stepTimer);
            setMarkdown(json.markdown ?? null);
            setVeredicto(json.veredicto ?? null);
            setStatus('done');
          } else {
            // status='running' devuelto (raro pero posible)
            startPolling();
          }
        } else {
          const json = await res.json().catch(() => ({}));
          if (cancelled) return;
          setStatus('failed');
          setErrorMsg(json.error || `Error ${res.status}`);
        }
      } catch {
        // Timeout o corte de conexión Netlify → pasar a polling
        if (!cancelled) startPolling();
      }
    };

    run();

    return () => {
      cancelled = true;
      clearInterval(stepTimer);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const handleDownloadPdf = async () => {
    setPdfLoading(true);
    try {
      const res = await fetch(`/api/properties/${propertyId}/dossier-pdf`, { method: 'POST' });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `informe_posicionamiento_${propertyId.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`No se pudo generar el PDF: ${err?.message || 'error desconocido'}`);
    } finally {
      setPdfLoading(false);
    }
  };

  const verdLabel = veredicto?.veredicto === 'caro' ? 'PRECIO CARO'
    : veredicto?.veredicto === 'correcto' ? 'PRECIO CORRECTO'
    : 'PRECIO AJUSTADO';
  const verdColor = veredicto?.veredicto === 'caro'
    ? 'text-rose-400 border-rose-400/30 bg-rose-500/10'
    : veredicto?.veredicto === 'correcto'
    ? 'text-emerald-400 border-emerald-400/30 bg-emerald-500/10'
    : 'text-amber-400 border-amber-400/30 bg-amber-500/10';

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#0F172A] border border-white/10 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-start justify-between gap-3 bg-[#0F172A]/95 backdrop-blur">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-[#FBBF24] font-bold flex items-center gap-1.5">
              <Sparkles size={12} /> Informe de Posicionamiento · IA en directo
            </p>
            <h2 className="text-lg font-bold text-white truncate">{propertyTitle}</h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {status === 'done' && (
              <button
                onClick={handleDownloadPdf}
                disabled={pdfLoading}
                className="px-3 py-1.5 bg-[#FBBF24] hover:bg-[#FBBF24]/90 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 disabled:opacity-60"
              >
                {pdfLoading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                Descargar dossier PDF
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-6">

          {/* Loading / polling */}
          {(status === 'loading' || status === 'polling') && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-4">
              <div className="relative">
                <Loader2 className="animate-spin text-[#FBBF24]" size={40} />
                <Sparkles size={18} className="absolute -top-1 -right-1 text-violet-400 animate-pulse" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-semibold text-white">{STEPS[stepIdx]}</p>
                <p className="text-[10px] text-slate-500">
                  {status === 'polling' ? 'Análisis en proceso — buscando comparables en tiempo real…' : 'Consultando mercado con IA + Google Search…'}
                </p>
                {status === 'polling' && (
                  <p className="text-[9px] text-slate-600 mt-1">La latencia del razonamiento es la ventaja: más tiempo = análisis más profundo.</p>
                )}
              </div>
              <div className="flex gap-1.5 mt-2">
                {STEPS.map((_, i) => (
                  <div key={i} className={`h-1 rounded-full transition-all duration-500 ${i === stepIdx ? 'w-5 bg-[#FBBF24]' : 'w-1.5 bg-slate-700'}`} />
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {status === 'failed' && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-5 text-rose-200">
              <div className="flex items-center gap-2 font-bold mb-2">
                <AlertTriangle size={16} className="text-rose-400" />
                No se pudo completar el análisis
              </div>
              <p className="text-xs text-rose-200/80 mb-3">{errorMsg}</p>
              {priceDrop && !priceDrop.noAdjustment && (
                <div className="bg-slate-900/50 border border-white/5 rounded-xl p-4 mt-3">
                  <p className="text-xs font-bold text-[#FBBF24] mb-1 flex items-center gap-1.5">
                    <TrendingDown size={13} /> Estimación heurística (fallback)
                  </p>
                  <p className="text-white font-black text-xl">−{priceDrop.eurLow.toLocaleString()}€ … −{priceDrop.eurHigh.toLocaleString()}€</p>
                  <p className="text-slate-400 text-xs">(−{priceDrop.pctLow}% … −{priceDrop.pctHigh}%) · Confianza {priceDrop.confidence}</p>
                </div>
              )}
            </div>
          )}

          {/* Resultado */}
          {status === 'done' && (
            <div className="space-y-6">
              {/* Cifra hero */}
              {veredicto ? (
                <div className={`rounded-xl border p-5 ${verdColor}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        {veredicto.veredicto === 'caro' ? <TrendingDown size={18} /> : <CheckCircle size={18} />}
                        <span className="text-xs font-black uppercase tracking-widest">{verdLabel}</span>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white/10">
                          Confianza {veredicto.confianza}
                        </span>
                      </div>
                      {veredicto.veredicto === 'caro' && veredicto.sobreprecio_pct > 0 && (
                        <>
                          <p className="text-3xl font-black leading-tight">
                            {veredicto.sobreprecio_pct.toFixed(1)}% sobre mercado
                          </p>
                          {veredicto.precio_recomendado > 0 && (
                            <p className="text-base font-bold mt-0.5">
                              Precio recomendado: {veredicto.precio_recomendado.toLocaleString()} €
                              {' '}
                              <span className="text-sm font-normal opacity-80">
                                (−{veredicto.rebaja_eur.toLocaleString()} €, −{veredicto.rebaja_pct_low.toFixed(1)}%…−{veredicto.rebaja_pct_high.toFixed(1)}%)
                              </span>
                            </p>
                          )}
                        </>
                      )}
                      {veredicto.veredicto !== 'caro' && (
                        <p className="text-xl font-bold mt-1">
                          {veredicto.veredicto === 'correcto' ? 'El precio está bien alineado con el mercado actual.' : 'Precio ligeramente por encima del mercado.'}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Motivos */}
                  {veredicto.motivos.length > 0 && (
                    <ul className="mt-3 space-y-1 border-t border-white/10 pt-3">
                      {veredicto.motivos.map((m, i) => (
                        <li key={i} className="text-[11px] flex gap-1.5 opacity-90">
                          <span className="opacity-50">•</span> {m}
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Comparables con fuentes */}
                  {veredicto.comparables.length > 0 && (
                    <div className="mt-3 border-t border-white/10 pt-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider opacity-60 mb-2">Comparables de mercado</p>
                      <div className="space-y-1">
                        {veredicto.comparables.map((c, i) => (
                          <div key={i} className="flex items-center justify-between text-[11px]">
                            <span className="opacity-70">
                              {c.url
                                ? <a href={c.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{c.fuente}</a>
                                : c.fuente}
                            </span>
                            <span className="font-bold">{c.precio_m2.toLocaleString()} €/m²</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                // Fallback heurístico si IA no devolvió veredicto JSON
                priceDrop && !priceDrop.noAdjustment && (
                  <div className="bg-slate-800/60 border border-[#FBBF24]/20 rounded-xl p-5">
                    <p className="text-[10px] uppercase tracking-wider text-[#FBBF24] font-bold mb-1 flex items-center gap-1.5">
                      <TrendingDown size={12} /> Estimación de ajuste (heurística)
                    </p>
                    <p className="text-white font-black text-2xl">−{priceDrop.eurLow.toLocaleString()}€ … −{priceDrop.eurHigh.toLocaleString()}€</p>
                    <p className="text-slate-400 text-xs">(−{priceDrop.pctLow}% … −{priceDrop.pctHigh}%)</p>
                  </div>
                )
              )}

              {/* Narrativa IA con react-markdown */}
              {markdown && (
                <div className="bg-slate-900/40 rounded-xl border border-white/5 p-5">
                  <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-3">Análisis completo</p>
                  <article className="prose prose-invert prose-sm max-w-none text-slate-200 [&>h1]:text-base [&>h2]:text-sm [&>h3]:text-sm [&>p]:text-sm [&>ul]:text-sm [&>li]:text-sm">
                    <ReactMarkdown>{markdown}</ReactMarkdown>
                  </article>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-white/10 bg-[#1E293B]/40 text-[10px] text-slate-500">
          Generado por {process.env.NEXT_PUBLIC_REBAJA_MODEL_LABEL || 'Gemini Pro'} con Google Search grounding · Solo datos reales · No inventa comparables
        </div>
      </div>
    </div>
  );
}
