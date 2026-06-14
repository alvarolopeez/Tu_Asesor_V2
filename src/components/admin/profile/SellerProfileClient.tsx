"use client";

// Brief #011 F3.2 (R7/R11, D12): perfil del VENDEDOR a página completa.
// Apartados: Perfil (contacto + funnel 4 estados) / Ficha inmueble
// (preferences + consola de tasación + Firmar Nota de Encargo) / Citas y
// anotaciones (timeline seller_activity_logs editable; 'Cita de adquisición'
// crea appointment type='captacion', default Q2).
//
// El botón "Firmar Nota de Encargo" cruza de ruta vía query params
// (?docKind=nota&docLeadId=...) — AdminDashboard los convierte en DocIntent.

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/utils";
import AdminAuthGate from "@/components/admin/AdminAuthGate";
import ActivityTimeline from "./ActivityTimeline";
import { getSellerTimelineIconConfig } from "./timelineIcons";
import type { Lead, LeadStatus } from "@/types";
import { displaySource, LEAD_SOURCE_OPTIONS } from "@/lib/leadSources";
import {
  ArrowLeft,
  Phone,
  Mail,
  Compass,
  Clock,
  FileText,
  Sparkles,
  CheckCircle,
  User,
  Home,
  Activity,
} from "lucide-react";
import toast from "react-hot-toast";

interface SellerPreferences {
  property_address?: string;
  property_type?: string;
  sqm?: number;
  rooms?: number;
  baths?: number;
  estimated_value?: number;
  agent_valuation?: number;
  commission_pct?: number;
  additionalNotes?: string;
  // Datos capturados por la web de valoración (Brief #017) que antes no se
  // reflejaban en el CRM.
  floor?: string;
  elevator?: boolean;
  condition?: string;
  hasTerrace?: boolean;
  hasGarage?: boolean;
  referencia_catastral?: string;
  direccion_oficial?: string;
  rango_estimado_web?: { low: number; high: number };
}

// Brief #011 F2.1 (R8/D1): funnel del vendedor a 4 estados en la UI.
const SELLER_STATUS_CONFIG: Partial<Record<LeadStatus, { label: string; cls: string }>> = {
  new: { label: "Nuevo Lead", cls: "text-amber-400 border-amber-500/20" },
  contacted: { label: "Contacto Establecido", cls: "text-blue-400 border-blue-500/20" },
  closed: { label: "Adquisición Hecha", cls: "text-emerald-400 border-emerald-500/20" },
  lost: { label: "Inactivo / Perdido", cls: "text-slate-400 border-slate-500/20" },
};

const PROPERTY_TYPES = ["Piso", "Casa", "Ático", "Dúplex", "Chalet", "Local", "Oficina", "Suelo", "Cualquiera"];

const SELLER_EVENT_TYPES = [
  { value: "Nota", label: "📝 Nota" },
  { value: "Llamada", label: "📞 Llamada" },
  { value: "Cita de adquisición", label: "📅 Cita de adquisición" },
];

type ProfileTab = "perfil" | "inmueble" | "actividad";

export default function SellerProfileClient({ leadId }: { leadId: string }) {
  return (
    <AdminAuthGate>
      <SellerProfileBody leadId={leadId} />
    </AdminAuthGate>
  );
}

function SellerProfileBody({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<ProfileTab>("perfil");

  const fetchLead = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("id", leadId)
        .eq("type", "seller")
        .maybeSingle();
      if (error) throw error;
      if (!data) setNotFound(true);
      else setLead(data as Lead);
    } catch (err: any) {
      console.error("[SellerProfile] fetch lead:", err.message);
      toast.error("No se pudo cargar el perfil del vendedor");
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void fetchLead();
  }, [fetchLead]);

  const prefs: SellerPreferences = (lead?.preferences as SellerPreferences) || {};

  // Edición en caliente (mismo patrón handleUpdateLeadField del drawer).
  const updateField = async (field: string, value: unknown, isPreference = false) => {
    if (!lead) return;
    try {
      const payload = isPreference
        ? { preferences: { ...(lead.preferences || {}), [field]: value } }
        : { [field]: value };
      const { error } = await supabase.from("leads").update(payload).eq("id", lead.id);
      if (error) throw error;
      setLead((prev) =>
        prev
          ? isPreference
            ? { ...prev, preferences: { ...(prev.preferences || {}), [field]: value } }
            : { ...prev, [field]: value }
          : prev
      );
      toast.success("Cambio guardado en caliente");
    } catch (err: any) {
      console.error("[SellerProfile] updateField:", err.message);
      toast.error("No se pudo guardar la modificación");
    }
  };

  // Cambio de funnel con log automático 'Cambio Estado' (patrón WarmLeadsManager).
  const [timelineRefresh, setTimelineRefresh] = useState(0);
  const handleStatusChange = async (newStatus: LeadStatus) => {
    if (!lead || lead.status === newStatus) return;
    try {
      const { error } = await supabase
        .from("leads")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", lead.id);
      if (error) throw error;

      const oldLabel = SELLER_STATUS_CONFIG[lead.status || "new"]?.label || "Estado legacy";
      const newLabel = SELLER_STATUS_CONFIG[newStatus]?.label || newStatus;
      const { error: logError } = await supabase.from("seller_activity_logs").insert({
        lead_id: lead.id,
        event_type: "Cambio Estado",
        title: "Funnel Actualizado",
        notes: `El asesor actualizó el estado del lead de "${oldLabel}" a "${newLabel}".`,
      });
      if (logError) console.warn("[SellerProfile] log Cambio Estado falló:", logError.message);

      setLead((prev) => (prev ? { ...prev, status: newStatus } : prev));
      setTimelineRefresh((n) => n + 1);
      toast.success(`Captación actualizada a: ${newLabel}`);
    } catch (err: any) {
      console.error("[SellerProfile] status:", err.message);
      toast.error("No se pudo guardar el cambio de estado");
    }
  };

  // Side-effect del timeline: 'Cita de adquisición' → cita type='captacion'.
  const handleEventCreated = async (event: { event_type: string; title: string; notes: string | null; event_date: string }) => {
    if (event.event_type !== "Cita de adquisición" || !lead) return;
    const { error } = await supabase.from("appointments").insert({
      lead_id: lead.id,
      scheduled_at: event.event_date,
      type: "captacion",
      status: "pending",
      title: `📍 Cita de adquisición: ${lead.name}`,
      notes: event.notes || event.title || null,
    });
    if (error) {
      console.error("[SellerProfile] cita de adquisición:", error.message);
      toast.error("Hito guardado, pero no se pudo agendar en el calendario");
    } else {
      toast.success("Cita de adquisición agendada en el Calendario 📅");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#FBBF24]" />
      </div>
    );
  }

  if (notFound || !lead) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex flex-col items-center justify-center text-center p-6 space-y-4">
        <Compass className="text-slate-500" size={48} />
        <h1 className="text-white font-bold text-lg">Vendedor no encontrado</h1>
        <Link href="/admin/dashboard" className="text-[#FBBF24] text-sm font-bold hover:underline">
          ← Volver al dashboard
        </Link>
      </div>
    );
  }

  const status = (lead.status || "new") as LeadStatus;
  const statusKnown = Boolean(SELLER_STATUS_CONFIG[status]);

  const TABS: { id: ProfileTab; label: string; icon: React.ElementType }[] = [
    { id: "perfil", label: "Perfil", icon: User },
    { id: "inmueble", label: "Ficha Inmueble", icon: Home },
    { id: "actividad", label: "Citas y Anotaciones", icon: Activity },
  ];

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-200">
      <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
        {/* Header */}
        <div className="bg-[#1E293B] border border-white/5 rounded-2xl p-6 shadow-xl space-y-4">
          <Link
            href="/admin/dashboard"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-[#FBBF24] transition-colors font-bold"
          >
            <ArrowLeft size={14} /> Volver al dashboard
          </Link>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-[#FBBF24]/10 border border-[#FBBF24]/20 flex items-center justify-center font-black text-[#FBBF24] text-xl">
                {(lead.name || "V").charAt(0)}
              </div>
              <div>
                <h1 className="text-xl font-black text-white">{lead.name}</h1>
                <div className="flex flex-wrap items-center gap-3 mt-1.5">
                  <span className="flex items-center gap-1 text-xs text-slate-400">
                    <Phone size={12} className="text-[#FBBF24]" /> {lead.phone || "Sin tel."}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-slate-400">
                    <Mail size={12} className="text-[#FBBF24]" /> {lead.email || "Sin email"}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-slate-500">
                    <Clock size={11} /> Alta: {new Date(lead.created_at).toLocaleDateString("es-ES")} · Origen: {displaySource(lead.source)}
                  </span>
                </div>
              </div>
            </div>

            {/* Funnel 4 estados (fallback legacy si la fila trae qualified/visit_scheduled) */}
            {statusKnown ? (
              <select
                value={status}
                onChange={(e) => handleStatusChange(e.target.value as LeadStatus)}
                className={`bg-[#0F172A] border rounded-full px-4 py-1.5 text-xs font-bold focus:outline-none focus:border-[#FBBF24] cursor-pointer transition-all w-fit ${SELLER_STATUS_CONFIG[status]?.cls || ""}`}
              >
                {Object.entries(SELLER_STATUS_CONFIG).map(([key, val]) => (
                  <option key={key} value={key} className="text-white bg-[#0F172A]">{val!.label}</option>
                ))}
              </select>
            ) : (
              <span className="px-4 py-1.5 text-xs font-bold rounded-full border text-slate-400 border-slate-500/20 bg-slate-500/10 w-fit">
                Estado legacy ({status})
              </span>
            )}
          </div>

          {/* Tabs */}
          <div className="flex border-b border-white/5 -mb-6 -mx-6 px-6 pt-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 ${
                  tab === t.id ? "text-[#FBBF24] border-[#FBBF24]" : "text-slate-400 border-transparent hover:text-white"
                }`}
              >
                <t.icon size={14} /> {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── TAB: PERFIL ──────────────────────────────────────────────────── */}
        {tab === "perfil" && (
          <div className="bg-[#1E293B] border border-white/5 rounded-2xl p-6 shadow-xl space-y-4">
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Nombre Completo</label>
              <input
                type="text"
                defaultValue={lead.name}
                onBlur={(e) => {
                  if (e.target.value.trim() && e.target.value !== lead.name) {
                    void updateField("name", e.target.value.trim());
                  }
                }}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                className="w-full bg-[#0F172A]/50 border border-white/5 hover:border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#FBBF24] transition-all"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Teléfono Móvil</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  defaultValue={lead.phone || ""}
                  placeholder="Ej. +34694216833"
                  onBlur={(e) => {
                    if (e.target.value !== (lead.phone || "")) {
                      void updateField("phone", e.target.value.trim() || null);
                    }
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                  className="flex-1 bg-[#0F172A]/50 border border-white/5 hover:border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#FBBF24] transition-all"
                />
                {lead.phone && (
                  <a
                    href={`https://wa.me/${lead.phone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-[#25D366] hover:bg-[#20ba56] text-white flex items-center justify-center px-4 rounded-xl active:scale-95 transition-all text-xs font-bold"
                  >
                    WhatsApp
                  </a>
                )}
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Correo Electrónico</label>
              <input
                type="email"
                defaultValue={lead.email || ""}
                placeholder="propietario@email.com"
                onBlur={(e) => {
                  if (e.target.value !== (lead.email || "")) {
                    void updateField("email", e.target.value.trim() || null);
                  }
                }}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                className="w-full bg-[#0F172A]/50 border border-white/5 hover:border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#FBBF24] transition-all"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Origen del Lead</label>
              <select
                value={lead.source || ""}
                onChange={(e) => void updateField("source", e.target.value || null)}
                className="w-full bg-[#0F172A]/50 border border-white/5 hover:border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#FBBF24] transition-all cursor-pointer"
              >
                <option value="">No especificado</option>
                {LEAD_SOURCE_OPTIONS.map((src) => (
                  <option key={src} value={src}>{src}</option>
                ))}
              </select>
            </div>

            <div className="p-4 bg-white/[0.02] border border-white/5 rounded-xl text-xs text-slate-400 space-y-2">
              <p className="font-bold text-slate-300 flex items-center gap-1.5">
                <CheckCircle size={14} className="text-emerald-400" />
                Consentimiento RGPD Aceptado
              </p>
              <p>
                El propietario consintió el tratamiento de datos para tasaciones inmobiliarias en fecha{" "}
                <span className="text-slate-300 font-semibold">
                  {new Date(lead.created_at).toLocaleDateString()} a las {new Date(lead.created_at).toLocaleTimeString()}
                </span>.
              </p>
            </div>
          </div>
        )}

        {/* ── TAB: FICHA INMUEBLE ──────────────────────────────────────────── */}
        {tab === "inmueble" && (
          <div className="bg-[#1E293B] border border-white/5 rounded-2xl p-6 shadow-xl space-y-5">
            {/* Brief F2.3 (R9): DocIntent cruza de ruta vía query params del dashboard. */}
            {lead.status !== "closed" && (
              <button
                onClick={() => router.push(`/admin/dashboard?docKind=nota&docLeadId=${lead.id}`)}
                className="w-full flex items-center justify-center gap-2 bg-[#FBBF24]/10 border border-[#FBBF24]/30 hover:bg-[#FBBF24]/20 text-[#FBBF24] font-bold py-3 rounded-xl transition-all text-sm cursor-pointer"
              >
                <FileText size={16} />
                Firmar Nota de Encargo
              </button>
            )}

            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Dirección del Inmueble</label>
              <input
                type="text"
                defaultValue={prefs.property_address || ""}
                placeholder="Calle, Número, Planta, Sevilla"
                onBlur={(e) => {
                  if (e.target.value !== (prefs.property_address || "")) {
                    void updateField("property_address", e.target.value, true);
                  }
                }}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                className="w-full bg-[#0F172A]/50 border border-white/5 hover:border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#FBBF24] transition-all"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Tipo Inmueble</label>
                <select
                  value={prefs.property_type || "Piso"}
                  onChange={(e) => void updateField("property_type", e.target.value, true)}
                  className="w-full bg-[#0F172A]/50 border border-white/5 hover:border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#FBBF24] transition-all cursor-pointer"
                >
                  {PROPERTY_TYPES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">M² Construidos</label>
                <input
                  type="number"
                  defaultValue={prefs.sqm || ""}
                  placeholder="M²"
                  onBlur={(e) => {
                    const val = e.target.value === "" ? undefined : Number(e.target.value);
                    if (val !== prefs.sqm) void updateField("sqm", val, true);
                  }}
                  className="w-full bg-[#0F172A]/50 border border-white/5 hover:border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#FBBF24] transition-all"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Habitaciones</label>
                <input
                  type="number"
                  defaultValue={prefs.rooms || ""}
                  placeholder="Nº"
                  onBlur={(e) => {
                    const val = e.target.value === "" ? undefined : Number(e.target.value);
                    if (val !== prefs.rooms) void updateField("rooms", val, true);
                  }}
                  className="w-full bg-[#0F172A]/50 border border-white/5 hover:border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#FBBF24] transition-all"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Cuartos de Baño</label>
                <input
                  type="number"
                  defaultValue={prefs.baths || ""}
                  placeholder="Nº"
                  onBlur={(e) => {
                    const val = e.target.value === "" ? undefined : Number(e.target.value);
                    if (val !== prefs.baths) void updateField("baths", val, true);
                  }}
                  className="w-full bg-[#0F172A]/50 border border-white/5 hover:border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#FBBF24] transition-all"
                />
              </div>
            </div>

            {/* Planta + Estado de conservación (capturados por la web de valoración) */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Planta</label>
                <input
                  type="text"
                  defaultValue={prefs.floor ?? ""}
                  placeholder="Ej. 2 (0 = bajo)"
                  onBlur={(e) => {
                    const val = e.target.value.trim() || undefined;
                    if (val !== prefs.floor) void updateField("floor", val, true);
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                  className="w-full bg-[#0F172A]/50 border border-white/5 hover:border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#FBBF24] transition-all"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Estado de Conservación</label>
                <select
                  value={prefs.condition || ""}
                  onChange={(e) => void updateField("condition", e.target.value || undefined, true)}
                  className="w-full bg-[#0F172A]/50 border border-white/5 hover:border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#FBBF24] transition-all cursor-pointer"
                >
                  <option value="">Sin especificar</option>
                  <option value="reformar">A reformar</option>
                  <option value="bueno">Buen estado</option>
                  <option value="reformado">Reformado</option>
                </select>
              </div>
            </div>

            {/* Extras (ascensor/terraza/garaje) — toggles editables en caliente */}
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-2">Características</label>
              <div className="grid grid-cols-3 gap-3">
                {([
                  { key: "elevator", label: "Ascensor" },
                  { key: "hasTerrace", label: "Terraza" },
                  { key: "hasGarage", label: "Garaje" },
                ] as const).map(({ key, label }) => {
                  const active = Boolean(prefs[key]);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => void updateField(key, !active, true)}
                      className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                        active
                          ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300"
                          : "bg-[#0F172A]/50 border-white/5 text-slate-500 hover:border-white/10"
                      }`}
                    >
                      {active ? (
                        <CheckCircle size={14} />
                      ) : (
                        <span className="w-3.5 h-3.5 rounded-full border border-current inline-block" />
                      )}
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Referencia catastral (dato oficial capturado en la web — alimenta la valoración IA) */}
            {prefs.referencia_catastral && (
              <div className="text-[11px] text-slate-500">
                <span className="font-bold text-slate-400">Ref. catastral:</span> {prefs.referencia_catastral}
              </div>
            )}

            {/* Consola de tasación y negociación (réplica del drawer) */}
            <div className="p-5 rounded-2xl bg-amber-500/[0.02] border border-[#FBBF24]/30 space-y-4">
              <div className="flex items-center gap-2 text-[#FBBF24] font-bold text-xs uppercase tracking-widest">
                <Sparkles size={16} />
                Consola de Tasación & Negociación CRM
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block mb-1">Valoración Algoritmo Web</span>
                  <span className="text-base font-black text-slate-300 block bg-[#0F172A]/40 px-3 py-2.5 rounded-xl border border-white/5 leading-tight">
                    {prefs.rango_estimado_web?.low && prefs.rango_estimado_web?.high
                      ? `${formatCurrency(prefs.rango_estimado_web.low)} – ${formatCurrency(prefs.rango_estimado_web.high)}`
                      : prefs.estimated_value
                      ? formatCurrency(Number(prefs.estimated_value))
                      : "Sin calcular"}
                  </span>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[#FBBF24] mb-1">Tasación del Agente (€)</label>
                  <input
                    type="number"
                    defaultValue={prefs.agent_valuation || ""}
                    placeholder="Fijar tasación final..."
                    onBlur={(e) => {
                      const val = e.target.value === "" ? undefined : Number(e.target.value);
                      if (val !== prefs.agent_valuation) void updateField("agent_valuation", val, true);
                    }}
                    className="w-full bg-[#0F172A]/50 border border-[#FBBF24]/20 focus:border-[#FBBF24] rounded-xl px-3 py-2 text-sm text-white focus:outline-none transition-all font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 items-center">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1">Comisión Pactada (%)</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.5"
                      defaultValue={prefs.commission_pct || ""}
                      placeholder="Ej. 3"
                      onBlur={(e) => {
                        const val = e.target.value === "" ? undefined : Number(e.target.value);
                        if (val !== prefs.commission_pct) void updateField("commission_pct", val, true);
                      }}
                      className="w-full bg-[#0F172A]/50 border border-white/5 rounded-xl pl-3 pr-8 py-2 text-sm text-white focus:outline-none focus:border-[#FBBF24] transition-all font-semibold"
                    />
                    <span className="absolute right-3 inset-y-0 flex items-center text-xs text-slate-500 font-bold">%</span>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-slate-400 block mb-1">Honorarios Estimados (Sin IVA)</span>
                  <span className="text-lg font-black text-emerald-400 block bg-[#0F172A]/40 px-3 py-2 rounded-xl border border-white/5 tracking-tight leading-none h-[38px] flex items-center">
                    {(() => {
                      const refValue = Number(prefs.agent_valuation || prefs.estimated_value || 0);
                      const comm = Number(prefs.commission_pct || 0);
                      return refValue > 0 && comm > 0 ? formatCurrency(refValue * (comm / 100)) : "0 €";
                    })()}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Notas Comerciales / Comentarios</label>
              <textarea
                rows={4}
                defaultValue={prefs.additionalNotes || ""}
                placeholder="Registra cualquier anotación sobre el inmueble..."
                onBlur={(e) => {
                  if (e.target.value !== (prefs.additionalNotes || "")) {
                    void updateField("additionalNotes", e.target.value, true);
                  }
                }}
                className="w-full bg-[#0F172A]/50 border border-white/5 hover:border-white/10 rounded-xl px-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#FBBF24] transition-all"
              />
            </div>
          </div>
        )}

        {/* ── TAB: CITAS Y ANOTACIONES ─────────────────────────────────────── */}
        {tab === "actividad" && (
          <div className="bg-[#1E293B] border border-white/5 rounded-2xl p-6 shadow-xl space-y-4">
            <h2 className="text-xs font-black text-[#FBBF24] uppercase tracking-wider flex items-center gap-2">
              <Clock size={14} /> Citas y Anotaciones (Línea de Tiempo)
            </h2>
            <ActivityTimeline
              key={timelineRefresh}
              table="seller_activity_logs"
              ownerColumn="lead_id"
              ownerId={lead.id}
              eventTypes={SELLER_EVENT_TYPES}
              getIconConfig={getSellerTimelineIconConfig}
              onEventCreated={handleEventCreated}
            />
          </div>
        )}
      </div>
    </div>
  );
}
