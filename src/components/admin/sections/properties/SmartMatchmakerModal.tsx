import { useState, useEffect, useMemo } from "react";
import { X, MapPin, Sparkles, Send, Settings } from "lucide-react";
import toast from "react-hot-toast";
import type { Property } from "./types";
import { formatPrice } from "./propertyUtils";

interface SmartMatchmakerModalProps {
  /** Propiedad objetivo del cruce. El modal se renderiza solo cuando hay una. */
  property: Property;
  /** Cierra el modal (limpia state en padre). */
  onClose: () => void;
}

const DEFAULT_PRICE_MARGIN_DOWN = 10; // % a la baja
const DEFAULT_PRICE_MARGIN_UP   = 10; // % al alza
// URL real del webhook n8n "Difusion Inteligente - Smart Matchmaker" (workflow
// 6E0AP0gqLUliPQtN). El placeholder anterior nunca apuntaba a un host real, por
// eso el workflow tenía 0 ejecuciones. Fix 2026-06-01.
const DEFAULT_N8N_WEBHOOK = "https://alvaroolopez.app.n8n.cloud/webhook/smart-diffusion";

/**
 * Destinatario devuelto por /api/n8n/diffusion en modo dry_run.
 * Fuente canónica del perfil comprador: `buyers_demands` (max_budget,
 * property_type, rooms…). NO se lee `leads.preferences` (la entrevista de Paula
 * nunca la rellenaba → salía "Sin límite / Cualquiera" en el modal antiguo).
 */
interface DiffusionRecipient {
  demand_id: string;
  lead_id: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  maxPricePreference: number | string | null;
  propertyType: string | null;
  rooms: number | string | null;
  bathrooms: number | string | null;
  funnelStatus: string | null;
}

/**
 * Modal de difusión inteligente — UN SOLO PASO (rediseño 2026-06-12).
 *
 * Cruza el inmueble con los compradores cualificados (matching server-side real
 * sobre `buyers_demands`) y muestra DIRECTAMENTE la lista de destinatarios con
 * sus características reales (presupuesto, tipo, habitaciones). Cada uno trae un
 * checkbox para excluirlo de ESTA campaña; un único botón "Difundir" lanza la
 * campaña de WhatsApp vía el webhook n8n.
 *
 * El cruce y el envío se ejecutan server-side en `/api/n8n/diffusion` para no
 * exponer datos confidenciales de leads ni credenciales al navegador. El modo
 * `dry_run` devuelve los destinatarios sin llamar a n8n ni registrar impactos.
 */
export default function SmartMatchmakerModal({ property, onClose }: SmartMatchmakerModalProps) {
  const [priceMarginDown, setPriceMarginDown] = useState<number>(DEFAULT_PRICE_MARGIN_DOWN);
  const [priceMarginUp,   setPriceMarginUp]   = useState<number>(DEFAULT_PRICE_MARGIN_UP);
  const [n8nWebhookUrl, setN8nWebhookUrl] = useState<string>(DEFAULT_N8N_WEBHOOK);

  // Destinatarios reales (dry_run). Exclusión solo para ESTA campaña.
  const [recipients, setRecipients] = useState<DiffusionRecipient[]>([]);
  const [loading, setLoading] = useState(false);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [campaignLaunching, setCampaignLaunching] = useState(false);

  // Cruce real server-side cuando cambian propiedad o filtros. Debounce 350ms
  // para no martillear el endpoint al arrastrar los sliders.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/n8n/diffusion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            webhookUrl: n8nWebhookUrl,
            payload: {
              event: "real_estate_ai_diffusion",
              property_id: property.id,
              price_margin_down: priceMarginDown,
              price_margin_up: priceMarginUp,
              dry_run: true
            }
          })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setRecipients((data.recipients || []) as DiffusionRecipient[]);
          // Al recalcular el cruce, reseteamos la exclusión a "todos incluidos".
          setExcludedIds(new Set());
        }
      } catch (err) {
        if (!cancelled && (err as { name?: string })?.name !== "AbortError") {
          console.error("Error al cruzar destinatarios de difusión:", err);
          toast.error("Error al cruzar compradores con el inmueble");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
    // n8nWebhookUrl no afecta al cruce (dry_run lo ignora) pero se envía como
    // requisito del endpoint; lo dejamos fuera de deps a propósito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property.id, priceMarginDown, priceMarginUp]);

  // Desglose de presupuestos (holgado / ajustado / negociable) sobre los
  // destinatarios reales — ahora con max_budget de verdad.
  const metrics = useMemo(() => {
    const propPrice = Number(property.price);
    let under = 0, target = 0, over = 0;
    recipients.forEach((r) => {
      const maxP = Number(r.maxPricePreference || 0);
      if (maxP >= propPrice * 1.1) under++;
      else if (maxP >= propPrice) target++;
      else over++; // incluye "sin presupuesto declarado"
    });
    return { under, target, over };
  }, [property.price, recipients]);

  const includedCount = recipients.length - excludedIds.size;

  const toggleExcluded = (demandId: string) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(demandId)) next.delete(demandId);
      else next.add(demandId);
      return next;
    });
  };

  // Lanza la campaña real via /api/n8n/diffusion (el server resuelve leads +
  // envía a n8n). Excluye los destinatarios desmarcados de ESTA campaña.
  const launchWhatsAppCampaign = async () => {
    if (includedCount === 0) return;
    setCampaignLaunching(true);
    const loadingToast = toast.loading("Enviando webhook y programando campaña en n8n...");
    const payload = {
      event: "real_estate_ai_diffusion",
      property_id: property.id,
      price_margin_down: priceMarginDown,
      price_margin_up: priceMarginUp,
      excluded_demand_ids: Array.from(excludedIds)
    };

    try {
      const proxyResponse = await fetch("/api/n8n/diffusion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl: n8nWebhookUrl, payload })
      }).catch((err) => {
        console.warn("N8N proxy call failed, details:", err);
        return { ok: false, status: 500, statusText: "Offline/Simulated" } as Response;
      });
      const response = proxyResponse.ok ? await proxyResponse.json() : { ok: false };

      toast.dismiss(loadingToast);

      if (proxyResponse.ok) {
        toast.success(`¡Campaña lanzada con éxito para ${response.match_count ?? includedCount} leads!`);
        onClose();
      } else {
        toast.error("Error al lanzar la campaña en el servidor.");
      }
    } catch (err) {
      console.error(err);
      toast.dismiss(loadingToast);
      toast.error("Error al lanzar la campaña.");
    } finally {
      setCampaignLaunching(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-start justify-center z-[60] p-4 md:p-6 overflow-y-auto">
      <div className="bg-[#1E293B] border border-purple-500/30 p-6 md:p-8 rounded-2xl w-full max-w-3xl shadow-2xl relative text-left my-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 hover:bg-white/10 rounded-full transition-all"
        >
          <X size={20} />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-purple-500/20 text-purple-400 rounded-xl flex items-center justify-center border border-purple-500/30">
            <Sparkles size={20} className="animate-pulse" />
          </div>
          <div>
            <h3 className="text-2xl font-bold text-white font-heading">Cruzar Inmueble con IA (Matchmaker)</h3>
            <p className="text-xs text-purple-300">Compradores cualificados que encajan con este inmueble</p>
          </div>
        </div>

        {/* Target Property Summary */}
        <div className="bg-[#0F172A] p-4 rounded-xl border border-white/5 mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="text-xs text-slate-500 font-bold uppercase">Inmueble Seleccionado</div>
            <div className="font-extrabold text-white text-base mt-0.5">{property.title}</div>
            <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
              <MapPin size={12} className="text-[#FBBF24]" />
              <span>{property.features?.address || "Sin dirección fija"}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-500 font-bold uppercase">Precio del Inmueble</div>
            <div className="font-black text-xl text-[#FBBF24] mt-0.5">{formatPrice(property.price)}</div>
          </div>
        </div>

        {/* Adjustable Range Sliders UI */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-[#0F172A] p-6 rounded-xl border border-white/5 mb-6">

          {/* Slider: Desviación a la baja */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wide">Desviación a la baja</label>
              <span className="text-xs font-extrabold text-[#FBBF24] bg-[#FBBF24]/10 border border-[#FBBF24]/20 px-2 py-0.5 rounded-full">
                -{priceMarginDown}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="30"
              step="5"
              value={priceMarginDown}
              onChange={(e) => setPriceMarginDown(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-[#FBBF24] transition-all hover:bg-slate-700"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-medium">
              <span>Estricto (0%)</span>
              <span className="text-slate-400">Mín: {formatPrice(property.price * (1 - priceMarginDown / 100))}</span>
              <span>Amplio (30%)</span>
            </div>
          </div>

          {/* Slider: Desviación al alza */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wide">Desviación al alza</label>
              <span className="text-xs font-extrabold text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                +{priceMarginUp}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="30"
              step="5"
              value={priceMarginUp}
              onChange={(e) => setPriceMarginUp(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 transition-all hover:bg-slate-700"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-medium">
              <span>Estricto (0%)</span>
              <span className="text-slate-400">Máx: {formatPrice(property.price * (1 + priceMarginUp / 100))}</span>
              <span>Amplio (30%)</span>
            </div>
          </div>

          {/* Rango resultante + nota de zona */}
          <div className="md:col-span-2 flex items-center justify-between text-[11px] text-slate-400 bg-slate-800/40 rounded-lg px-3 py-2">
            <span>
              Rango aceptado: <strong className="text-white">{formatPrice(property.price * (1 - priceMarginDown / 100))}</strong>
              {" — "}
              <strong className="text-white">{formatPrice(property.price * (1 + priceMarginUp / 100))}</strong>
            </span>
            <span className="text-slate-500 flex items-center gap-1">
              <MapPin size={10} /> Zona: por zonas de interés del comprador
            </span>
          </div>
        </div>

        {/* Matched Count & Visual Stacked Budget Meter */}
        <div className="space-y-4 mb-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-slate-300 font-bold">
              Compradores cualificados: <span className="text-white text-base bg-purple-500/20 px-2.5 py-1 rounded-lg border border-purple-500/30">{recipients.length}</span>
            </span>
            <span className="text-xs text-slate-400">Desmarca a quien no quieras incluir</span>
          </div>

          {/* Stacked Percentage bar metric */}
          <div className="w-full h-3.5 bg-slate-800 rounded-full overflow-hidden flex">
            {recipients.length > 0 ? (
              <>
                <div
                  style={{ width: `${(metrics.under / recipients.length) * 100}%` }}
                  className="bg-emerald-500 h-full transition-all duration-300"
                  title={`Comprador Premium (Presupuesto Sobrado): ${metrics.under}`}
                />
                <div
                  style={{ width: `${(metrics.target / recipients.length) * 100}%` }}
                  className="bg-[#FBBF24] h-full transition-all duration-300"
                  title={`Presupuesto Objetivo Ajustado: ${metrics.target}`}
                />
                <div
                  style={{ width: `${(metrics.over / recipients.length) * 100}%` }}
                  className="bg-rose-500 h-full transition-all duration-300"
                  title={`Presupuesto Marginal (Negociable): ${metrics.over}`}
                />
              </>
            ) : (
              <div className="w-full h-full bg-slate-800 text-center text-[10px] text-slate-500">Sin coincidencias con los parámetros actuales</div>
            )}
          </div>

          {/* Legends for budget meter */}
          <div className="flex flex-wrap gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-emerald-500 rounded-full" />
              <span className="text-slate-400">Presupuesto Holgado ({metrics.under})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-[#FBBF24] rounded-full" />
              <span className="text-slate-400">Presupuesto Ajustado ({metrics.target})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-rose-500 rounded-full" />
              <span className="text-slate-400">Presupuesto Negociable ({metrics.over})</span>
            </div>
          </div>
        </div>

        {/* List of matched buyers — checkbox para incluir/excluir de la campaña */}
        <div className="space-y-2.5 max-h-72 overflow-y-auto pr-2 custom-scrollbar mb-6">
          {loading ? (
            <div className="space-y-3 animate-pulse">
              {[1, 2, 3].map((n) => (
                <div key={n} className="bg-[#0F172A]/50 p-4 rounded-xl border border-white/5 flex justify-between items-center">
                  <div className="space-y-2 flex-1">
                    <div className="h-4 bg-slate-800 rounded w-1/4"></div>
                    <div className="h-3 bg-slate-800 rounded w-2/3"></div>
                  </div>
                  <div className="h-5 bg-slate-800 rounded w-20"></div>
                </div>
              ))}
            </div>
          ) : recipients.length > 0 ? (
            recipients.map((r) => {
              const excluded = excludedIds.has(r.demand_id);
              const maxP = Number(r.maxPricePreference || 0);
              return (
                <label
                  key={r.demand_id}
                  className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                    excluded
                      ? "border-white/5 bg-[#0F172A]/40 opacity-50"
                      : "border-white/5 bg-[#0F172A] hover:border-purple-500/20"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={!excluded}
                    onChange={() => toggleExcluded(r.demand_id)}
                    className="accent-purple-500 w-4 h-4 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm truncate">{r.name}</span>
                      {r.phone && <span className="text-[10px] text-slate-500">{r.phone}</span>}
                    </div>
                    <div className="text-xs text-slate-400 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>Tipo: <strong className="text-slate-300">{r.propertyType || "Cualquiera"}</strong></span>
                      <span>Presupuesto: <strong className={maxP > 0 ? "text-[#FBBF24]" : "text-slate-500"}>{maxP > 0 ? formatPrice(maxP) : "Sin declarar"}</strong></span>
                      <span>Hab: <strong className="text-slate-300">{r.rooms ? String(r.rooms) : "-"}</strong></span>
                    </div>
                  </div>
                  {r.phone && (
                    <span className="px-2.5 py-1 bg-green-500/10 text-green-400 border border-green-500/20 rounded-full text-[10px] font-bold shrink-0">
                      WhatsApp Activo
                    </span>
                  )}
                </label>
              );
            })
          ) : (
            <div className="p-8 bg-[#0F172A] rounded-xl text-center text-slate-500 text-sm">
              No hay compradores cualificados con estos parámetros. Amplía los márgenes de presupuesto.
            </div>
          )}
        </div>

        {/* Settings panel to customize n8n Webhook URL (Layer 3) */}
        <div className="bg-[#0F172A] p-4 rounded-xl border border-white/5 space-y-2 mb-6">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wide">
            <Settings size={14} className="text-purple-400" /> Dirección del Webhook de Campañas (n8n)
          </div>
          <input
            type="text"
            value={n8nWebhookUrl}
            onChange={(e) => setN8nWebhookUrl(e.target.value)}
            className="w-full bg-[#1E293B] border border-white/10 rounded-lg py-2 px-3 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500 font-mono"
            placeholder="https://su-servidor-n8n/webhook/..."
          />
        </div>

        {/* Action Buttons — un solo paso */}
        <div className="flex gap-4">
          <button
            onClick={onClose}
            disabled={campaignLaunching}
            className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-xl transition-all text-center"
          >
            Cancelar
          </button>
          <button
            onClick={launchWhatsAppCampaign}
            disabled={campaignLaunching || loading || includedCount === 0}
            className="flex-1 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-900/20 disabled:text-purple-700 text-white font-extrabold py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-600/15"
          >
            {campaignLaunching ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                Difundiendo...
              </>
            ) : (
              <>
                <Send size={18} /> Difundir a {includedCount} destinatario{includedCount === 1 ? "" : "s"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
