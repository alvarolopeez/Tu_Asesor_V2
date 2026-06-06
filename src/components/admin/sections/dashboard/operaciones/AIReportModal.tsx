import { useEffect, useState } from "react";
import { X, Sparkles, Loader2, Copy, Check } from "lucide-react";

/**
 * Modal que dispara POST /api/properties/[id]/ai-report y renderiza el
 * informe en markdown (sin parser pesado — usamos formato monoespaciado
 * para preservar headers/listas).
 *
 * @created 2026-06-06 brief #002 T7
 */
interface Props {
  propertyId: string;
  propertyTitle: string;
  onClose: () => void;
}

export default function AIReportModal({ propertyId, propertyTitle, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/properties/${propertyId}/ai-report`, { method: "POST" });
        const json = await res.json();
        if (!res.ok) {
          if (!cancelled) setError(json?.error || `Error ${res.status}`);
        } else {
          if (!cancelled) setMarkdown(json.markdown || "");
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Error de red");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [propertyId]);

  const handleCopy = async () => {
    if (!markdown) return;
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#0F172A] border border-white/10 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-white/10 flex items-start justify-between gap-3 sticky top-0 bg-[#0F172A]/95 backdrop-blur">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-[#FBBF24] font-bold flex items-center gap-1.5">
              <Sparkles size={12} /> Análisis IA del inmueble
            </p>
            <h2 className="text-lg font-bold text-white truncate">{propertyTitle}</h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {markdown && (
              <button
                onClick={handleCopy}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white"
                title="Copiar markdown"
              >
                {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-6 flex-1">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Loader2 className="animate-spin text-[#FBBF24]" size={32} />
              <p className="text-xs mt-3 font-semibold">Analizando datos del inmueble con IA…</p>
              <p className="text-[10px] mt-1">Cruzando visitas, propuestas, días en mercado y comparables.</p>
            </div>
          )}

          {!loading && error && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 text-rose-200 text-sm">
              <p className="font-bold mb-1">No se pudo generar el informe</p>
              <p className="text-xs text-rose-200/80">{error}</p>
            </div>
          )}

          {!loading && !error && markdown && (
            <article className="prose prose-invert prose-sm max-w-none text-slate-200 whitespace-pre-wrap font-sans leading-relaxed">
              {markdown}
            </article>
          )}
        </div>

        <div className="px-6 py-3 border-t border-white/10 bg-[#1E293B]/40 text-[10px] text-slate-500">
          Generado por Gemini sobre datos reales del CRM. No incluye fuentes externas (Idealista pendiente).
        </div>
      </div>
    </div>
  );
}
