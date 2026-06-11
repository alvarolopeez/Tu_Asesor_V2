import { useState, useEffect, useMemo } from "react";
import { X, MapPin, Sparkles, Send, Settings } from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabase";
import type { LeadRow } from "../dashboard/types";
import type { Property } from "./types";
import { formatPrice } from "./propertyUtils";

interface SmartMatchmakerModalProps {
  /** Propiedad objetivo del cruce. El modal se renderiza solo cuando hay una. */
  property: Property;
  /** Cierra el modal (limpia state en padre). */
  onClose: () => void;
}

const DEFAULT_PRICE_MARGIN = 10; // ± % de presupuesto
const DEFAULT_GEO_RADIUS = 5;    // km
// URL real del webhook n8n "Difusion Inteligente - Smart Matchmaker" (workflow
// 6E0AP0gqLUliPQtN). El placeholder anterior nunca apuntaba a un host real, por
// eso el workflow tenía 0 ejecuciones. Fix 2026-06-01.
const DEFAULT_N8N_WEBHOOK = "https://alvaroolopez.app.n8n.cloud/webhook/smart-diffusion";

/** Destinatario devuelto por /api/n8n/diffusion en modo dry_run (R19). */
interface DiffusionRecipient {
  demand_id: string;
  lead_id: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  maxPricePreference: number | string | null;
}

/**
 * Modal de difusión inteligente. Cruza la propiedad seleccionada con leads
 * compatibles (por presupuesto y radio geográfico) y permite lanzar una
 * campaña de WhatsApp vía el webhook n8n configurado.
 *
 * El cruce real se ejecuta server-side en Supabase RPC `get_matching_leads_for_property`
 * y el envío se enruta por `/api/n8n/diffusion` para no exponer credenciales al cliente.
 */
export default function SmartMatchmakerModal({ property, onClose }: SmartMatchmakerModalProps) {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [priceMargin, setPriceMargin] = useState<number>(DEFAULT_PRICE_MARGIN);
  const [geoRadius, setGeoRadius] = useState<number>(DEFAULT_GEO_RADIUS);
  const [n8nWebhookUrl, setN8nWebhookUrl] = useState<string>(DEFAULT_N8N_WEBHOOK);
  const [campaignLaunching, setCampaignLaunching] = useState(false);

  // R19 (Brief #011 F1.1): preview del matching real (dry_run) con exclusión
  // por campaña. null = aún no se ha pedido la preview.
  const [previewRecipients, setPreviewRecipients] = useState<DiffusionRecipient[] | null>(null);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [previewLoading, setPreviewLoading] = useState(false);

  // Cargar leads coincidentes via RPC cuando cambian propiedad o filtros
  useEffect(() => {
    const loadMatchmakerLeads = async () => {
      setLoadingLeads(true);
      try {
        const { data, error } = await supabase.rpc("get_matching_leads_for_property", {
          p_property_id: property.id,
          p_price_margin: priceMargin,
          p_geo_radius: geoRadius
        });
        if (error) throw error;
        setLeads((data || []) as LeadRow[]);
      } catch (err) {
        console.error("Error loading matching leads via RPC:", err);
        toast.error("Error al cruzar compradores con el inmueble");
      } finally {
        setLoadingLeads(false);
      }
    };
    loadMatchmakerLeads();
  }, [property.id, priceMargin, geoRadius]);

  // Métricas reactivas del cruce: under (sobrado) / target (ajustado) / over (negociable)
  const matchmakingResult = useMemo(() => {
    const propPrice = Number(property.price);

    let under = 0;
    let target = 0;
    let over = 0;

    leads.forEach((buyer: any) => {
      const maxP = Number(buyer.preferences?.maxPrice || 0);
      if (maxP >= propPrice * 1.1) {
        under++;
      } else if (maxP >= propPrice) {
        target++;
      } else {
        over++;
      }
    });

    return { matches: leads, metrics: { under, target, over } };
  }, [property.price, leads]);

  // R19: pide al server la lista REAL de destinatarios (dry_run) antes de lanzar.
  const openPreview = async () => {
    setPreviewLoading(true);
    try {
      const res = await fetch("/api/n8n/diffusion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webhookUrl: n8nWebhookUrl,
          payload: {
            event: "real_estate_ai_diffusion",
            property_id: property.id,
            price_margin: priceMargin,
            geo_radius: geoRadius,
            dry_run: true
          }
        })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPreviewRecipients((data.recipients || []) as DiffusionRecipient[]);
      setExcludedIds(new Set());
    } catch (err) {
      console.error("Error al previsualizar destinatarios de difusión:", err);
      toast.error("Error al previsualizar los destinatarios");
    } finally {
      setPreviewLoading(false);
    }
  };

  const toggleExcluded = (demandId: string) => {
    setExcludedIds(prev => {
      const next = new Set(prev);
      if (next.has(demandId)) next.delete(demandId);
      else next.add(demandId);
      return next;
    });
  };

  // Dispara la campaña via /api/n8n/diffusion (el server resuelve leads + envía a n8n)
  const launchWhatsAppCampaign = async () => {
    setCampaignLaunching(true);

    const loadingToast = toast.loading("Enviando webhook y programando campaña en n8n...");
    const payload = {
      event: "real_estate_ai_diffusion",
      property_id: property.id,
      price_margin: priceMargin,
      geo_radius: geoRadius,
      // Exclusión solo de ESTA campaña (default Q5: no se persiste).
      excluded_demand_ids: Array.from(excludedIds)
    };

    try {
      const proxyResponse = await fetch("/api/n8n/diffusion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl: n8nWebhookUrl, payload })
      }).catch(err => {
        console.warn("N8N proxy call failed, details:", err);
        return { ok: false, status: 500, statusText: "Offline/Simulated" } as Response;
      });
      const response = proxyResponse.ok ? await proxyResponse.json() : { ok: false, status: 500, statusText: "Proxy error" };

      toast.dismiss(loadingToast);

      if (proxyResponse.ok) {
        toast.success(`¡Campaña lanzada con éxito para ${response.match_count || 0} leads!`);
        onClose();
      } else {
        toast.error("Error al lanzar la campaña en el servidor.");
      }
    } catch (err: any) {
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
            <p className="text-xs text-purple-300">Cruzando filtros con clientes compradores activos en base de datos</p>
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

          {/* Range Slider 1: Budget Margin Slider */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wide">Desviación de Presupuesto</label>
              <span className="text-xs font-extrabold text-[#FBBF24] bg-[#FBBF24]/10 border border-[#FBBF24]/20 px-2 py-0.5 rounded-full">
                ± {priceMargin}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="30"
              step="5"
              value={priceMargin}
              onChange={(e) => setPriceMargin(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-[#FBBF24] transition-all hover:bg-slate-700"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-medium">
              <span>Estricto (0%)</span>
              <span className="text-slate-400">
                Rango: {formatPrice(property.price * (1 - priceMargin/100))} - {formatPrice(property.price * (1 + priceMargin/100))}
              </span>
              <span>Ampliante (30%)</span>
            </div>
          </div>

          {/* Range Slider 2: Geographic Proximity Radius Slider */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wide">Radio de Distancia Geográfica</label>
              <span className="text-xs font-extrabold text-purple-300 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full">
                {geoRadius} km
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="20"
              step="1"
              value={geoRadius}
              onChange={(e) => setGeoRadius(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500 transition-all hover:bg-slate-700"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-medium">
              <span>Muy cercano (1km)</span>
              <span className="text-slate-400">Expande la zona de interés dibujada</span>
              <span>Amplio (20km)</span>
            </div>
          </div>
        </div>

        {/* Matched Count & Visual Stacked Budget Meter */}
        <div className="space-y-4 mb-6">
          <div className="flex justify-between items-center">
            <span className="text-sm text-slate-300 font-bold">
              Compradores Coincidentes: <span className="text-white text-base bg-purple-500/20 px-2.5 py-1 rounded-lg border border-purple-500/30">{matchmakingResult.matches.length} leads</span>
            </span>
            <span className="text-xs text-slate-400">Desglose de presupuestos coincidente</span>
          </div>

          {/* Stacked Percentage bar metric */}
          <div className="w-full h-3.5 bg-slate-800 rounded-full overflow-hidden flex">
            {matchmakingResult.matches.length > 0 ? (
              <>
                <div
                  style={{ width: `${(matchmakingResult.metrics.under / matchmakingResult.matches.length) * 100}%` }}
                  className="bg-emerald-500 h-full transition-all duration-300"
                  title={`Comprador Premium (Presupuesto Sobrado): ${matchmakingResult.metrics.under}`}
                />
                <div
                  style={{ width: `${(matchmakingResult.metrics.target / matchmakingResult.matches.length) * 100}%` }}
                  className="bg-[#FBBF24] h-full transition-all duration-300"
                  title={`Presupuesto Objetivo Ajustado: ${matchmakingResult.metrics.target}`}
                />
                <div
                  style={{ width: `${(matchmakingResult.metrics.over / matchmakingResult.matches.length) * 100}%` }}
                  className="bg-rose-500 h-full transition-all duration-300"
                  title={`Presupuesto Marginal (Negociable): ${matchmakingResult.metrics.over}`}
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
              <span className="text-slate-400">Presupuesto Holgado ({matchmakingResult.metrics.under})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-[#FBBF24] rounded-full" />
              <span className="text-slate-400">Presupuesto Ajustado ({matchmakingResult.metrics.target})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-rose-500 rounded-full" />
              <span className="text-slate-400">Presupuesto Negociable ({matchmakingResult.metrics.over})</span>
            </div>
          </div>
        </div>

        {/* List of matched buyers */}
        <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar mb-6">
          {loadingLeads ? (
            <div className="p-6 bg-[#1E293B]/40 backdrop-blur-md rounded-xl border border-white/5 space-y-4 animate-pulse">
              <div className="flex justify-between items-center">
                <div className="h-4 bg-slate-700 rounded w-1/3"></div>
                <div className="h-6 bg-slate-700 rounded w-16"></div>
              </div>
              <div className="space-y-3">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="bg-[#0F172A]/50 p-4 rounded-xl border border-white/5 flex justify-between items-center">
                    <div className="space-y-2 flex-1">
                      <div className="h-4 bg-slate-800 rounded w-1/4"></div>
                      <div className="h-3 bg-slate-800 rounded w-1/2"></div>
                    </div>
                    <div className="h-5 bg-slate-800 rounded w-20"></div>
                  </div>
                ))}
              </div>
            </div>
          ) : matchmakingResult.matches.length > 0 ? (
            matchmakingResult.matches.map((buyer) => (
              <div key={buyer.id} className="bg-[#0F172A] p-4 rounded-xl border border-white/5 flex justify-between items-center hover:border-purple-500/20 transition-all">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm">{buyer.name}</span>
                    {buyer.phone && <span className="text-[10px] text-slate-500">{buyer.phone}</span>}
                  </div>
                  <div className="text-xs text-slate-400 mt-1 flex flex-wrap gap-x-3">
                    <span>Pref: <strong className="text-slate-300">{String(buyer.preferences?.propertyType || "Cualquiera")}</strong></span>
                    <span>Presupuesto Máx: <strong className="text-[#FBBF24]">{buyer.preferences?.maxPrice ? formatPrice(Number(buyer.preferences.maxPrice)) : "Sin límite"}</strong></span>
                    <span>Dormitorios: <strong className="text-slate-300">{String(buyer.preferences?.minRooms || "-")}</strong></span>
                  </div>
                </div>
                {buyer.phone && (
                  <span className="px-2.5 py-1 bg-green-500/10 text-green-400 border border-green-500/20 rounded-full text-[10px] font-bold">
                    WhatsApp Activo
                  </span>
                )}
              </div>
            ))
          ) : (
            <div className="p-8 bg-[#0F172A] rounded-xl text-center text-slate-500 text-sm">
              Prueba a ampliar los sliders de rango de precio o distancia geográfica para encontrar coincidencias.
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

        {/* Preview de destinatarios reales con exclusión por campaña (R19) */}
        {previewRecipients !== null && (
          <div className="bg-[#0F172A] p-4 rounded-xl border border-purple-500/20 space-y-3 mb-6">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wide">
                Destinatarios de la campaña ({previewRecipients.length - excludedIds.size} de {previewRecipients.length})
              </span>
              <span className="text-[10px] text-slate-500">Desmarca a quien no quieras incluir (solo esta campaña)</span>
            </div>
            {previewRecipients.length === 0 ? (
              <div className="text-center text-slate-500 text-sm py-4">
                El matching del servidor no encontró destinatarios con estos parámetros.
              </div>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto pr-2 custom-scrollbar">
                {previewRecipients.map((r) => (
                  <label
                    key={r.demand_id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      excludedIds.has(r.demand_id)
                        ? 'border-white/5 bg-[#1E293B]/40 opacity-50'
                        : 'border-purple-500/20 bg-[#1E293B]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={!excludedIds.has(r.demand_id)}
                      onChange={() => toggleExcluded(r.demand_id)}
                      className="accent-purple-500 w-4 h-4 shrink-0"
                    />
                    <div className="min-w-0">
                      <span className="font-bold text-white text-sm block truncate">{r.name}</span>
                      <span className="text-[10px] text-slate-400">
                        {r.phone || "Sin teléfono"}
                        {r.maxPricePreference && Number(r.maxPricePreference) > 0
                          ? ` · Máx: ${formatPrice(Number(r.maxPricePreference))}`
                          : " · Sin presupuesto"}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-4">
          {previewRecipients === null ? (
            <>
              <button
                onClick={onClose}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-xl transition-all text-center"
              >
                Cancelar
              </button>
              <button
                onClick={openPreview}
                disabled={previewLoading}
                className="flex-1 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-900/20 disabled:text-purple-700 text-white font-extrabold py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-600/15"
              >
                {previewLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                    Cruzando destinatarios...
                  </>
                ) : (
                  <>
                    <Sparkles size={18} /> Revisar Destinatarios
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setPreviewRecipients(null)}
                disabled={campaignLaunching}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-xl transition-all text-center"
              >
                Volver
              </button>
              <button
                onClick={launchWhatsAppCampaign}
                disabled={campaignLaunching || previewRecipients.length - excludedIds.size === 0}
                className="flex-1 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-900/20 disabled:text-purple-700 text-white font-extrabold py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-600/15"
              >
                {campaignLaunching ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                    Lanzando...
                  </>
                ) : (
                  <>
                    <Send size={18} /> Lanzar a {previewRecipients.length - excludedIds.size} destinatarios
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
