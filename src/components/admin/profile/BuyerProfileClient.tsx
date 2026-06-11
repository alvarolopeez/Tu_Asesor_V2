"use client";

// Brief #011 F3.1 (R1–R5, D12): perfil del COMPRADOR a página completa.
// Tres apartados: Características (demand editable en caliente + zonas),
// Documentación (buyer_documents + bucket privado buyer-files) y Actividad
// (timeline editable compartido). La lista sigue en el dashboard (Pedidos);
// esta página es el destino del click en la fila.

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/utils";
import AdminAuthGate from "@/components/admin/AdminAuthGate";
import ZoneSelectorPremium from "@/components/admin/sections/ZoneSelectorPremium";
import ActivityTimeline, { type TimelinePropertyOption } from "./ActivityTimeline";
import { getBuyerTimelineIconConfig } from "./timelineIcons";
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Compass,
  Clock,
  FileText,
  Upload,
  Download,
  Trash2,
  Check,
} from "lucide-react";
import toast from "react-hot-toast";

interface BuyerDemand {
  id: string;
  lead_id: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  min_budget: number;
  max_budget: number;
  min_sqm: number;
  rooms: number;
  bathrooms: number;
  preferred_zones: string[];
  property_type: string;
  funding_type: "Contado" | "Hipoteca";
  savings_contribution: number;
  status: "Activo" | "Desactivado";
  /** Descripción libre de la demanda (columna añadida en F0.3). */
  notes: string | null;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
}

interface BuyerDocument {
  id: string;
  buyer_demand_id: string;
  kind: string;
  label: string | null;
  file_url: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  uploaded_at: string;
}

const PROPERTY_TYPES = ["Piso", "Casa", "Ático", "Dúplex", "Chalet", "Local", "Oficina", "Cualquiera"];
const STATUS_OPTIONS = ["Activo", "Desactivado"] as const;

// Tipos de anexo del comprador (espejo del patrón de encargo_documents).
const BUYER_DOC_KINDS: Record<string, string> = {
  identificacion: "DNI / NIE",
  solvencia: "Solvencia",
  financiacion: "Financiación",
  otros: "Otros",
};

// Brief F3.1: eventos manuales del comprador. 'Cita de venta' además crea una
// cita type='visita' en el calendario (default Q2 del plan).
const BUYER_EVENT_TYPES = [
  { value: "Llamada telefónica", label: "📞 Llamada" },
  { value: "Nota", label: "📝 Nota" },
  { value: "Cita de venta", label: "📅 Cita de venta" },
];

type ProfileTab = "caracteristicas" | "documentacion" | "actividad";

function fmtBytes(n: number | null): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function BuyerProfileClient({ demandId }: { demandId: string }) {
  return (
    <AdminAuthGate>
      <BuyerProfileBody demandId={demandId} />
    </AdminAuthGate>
  );
}

function BuyerProfileBody({ demandId }: { demandId: string }) {
  const [demand, setDemand] = useState<BuyerDemand | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<ProfileTab>("caracteristicas");

  const [documents, setDocuments] = useState<BuyerDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploadingKind, setUploadingKind] = useState<string | null>(null);

  const [properties, setProperties] = useState<TimelinePropertyOption[]>([]);

  const fetchDemand = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("buyers_demands")
        .select("*")
        .eq("id", demandId)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        setNotFound(true);
      } else {
        setDemand(data as BuyerDemand);
      }
    } catch (err: any) {
      console.error("[BuyerProfile] fetch demand:", err.message);
      toast.error("No se pudo cargar el perfil del comprador");
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [demandId]);

  const fetchDocuments = useCallback(async () => {
    setDocsLoading(true);
    try {
      const { data, error } = await supabase
        .from("buyer_documents")
        .select("*")
        .eq("buyer_demand_id", demandId)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      setDocuments((data as BuyerDocument[]) || []);
    } catch (err: any) {
      console.error("[BuyerProfile] fetch documents:", err.message);
      toast.error("No se pudo cargar la documentación");
    } finally {
      setDocsLoading(false);
    }
  }, [demandId]);

  const fetchProperties = useCallback(async () => {
    const { data } = await supabase
      .from("properties")
      .select("id, title, price")
      .order("title", { ascending: true });
    setProperties((data as TimelinePropertyOption[]) || []);
  }, []);

  useEffect(() => {
    void fetchDemand();
    void fetchProperties();
  }, [fetchDemand, fetchProperties]);

  useEffect(() => {
    if (tab === "documentacion") void fetchDocuments();
  }, [tab, fetchDocuments]);

  // Edición en caliente (mismo patrón saveMatchingCriteria del drawer).
  const saveField = async (updates: Partial<BuyerDemand>) => {
    if (!demand) return;
    try {
      const { error } = await supabase
        .from("buyers_demands")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", demand.id);
      if (error) throw error;
      setDemand((prev) => (prev ? { ...prev, ...updates } : prev));
      toast.success("Cambios guardados");
    } catch (err: any) {
      console.error("[BuyerProfile] saveField:", err.message);
      toast.error("Error al guardar cambios");
    }
  };

  // ── Documentación (réplica del patrón de anexos del encargo) ────────────
  const uploadDocument = async (kind: string, file: File) => {
    setUploadingKind(kind);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
      const path = `${demandId}/${kind}/${Date.now()}_${safe}`;
      const { error: upErr } = await supabase.storage
        .from("buyer-files")
        .upload(path, file, { upsert: false, contentType: file.type || "application/octet-stream" });
      if (upErr) throw upErr;

      const { error: insErr } = await supabase.from("buyer_documents").insert({
        buyer_demand_id: demandId,
        kind,
        label: kind === "otros" ? file.name : BUYER_DOC_KINDS[kind] || kind,
        file_url: path,
        file_size_bytes: file.size,
        mime_type: file.type || null,
      });
      if (insErr) throw insErr;
      toast.success("Documento subido");
      void fetchDocuments();
    } catch (err: any) {
      console.error("[BuyerProfile] upload:", err.message);
      toast.error(`Subida falló: ${err.message}`);
    } finally {
      setUploadingKind(null);
    }
  };

  const downloadDocument = async (doc: BuyerDocument) => {
    const { data } = await supabase.storage.from("buyer-files").createSignedUrl(doc.file_url, 60 * 5);
    if (!data?.signedUrl) {
      toast.error("No se pudo generar enlace de descarga");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const deleteDocument = async (doc: BuyerDocument) => {
    if (!confirm("¿Eliminar este documento del expediente del comprador?")) return;
    await supabase.storage.from("buyer-files").remove([doc.file_url]).catch(() => {});
    await supabase.from("buyer_documents").delete().eq("id", doc.id);
    setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    toast.success("Documento eliminado");
  };

  // ── Side-effect del timeline: 'Cita de venta' → cita en el calendario ────
  const handleEventCreated = async (event: { event_type: string; title: string; notes: string | null; event_date: string }) => {
    if (event.event_type !== "Cita de venta" || !demand) return;
    if (!demand.lead_id) {
      toast("Hito registrado (la demanda no tiene lead vinculado: sin cita en calendario)", { icon: "ℹ️" });
      return;
    }
    const { error } = await supabase.from("appointments").insert({
      lead_id: demand.lead_id,
      scheduled_at: event.event_date,
      type: "visita",
      status: "pending",
      title: `📅 Cita de venta: ${demand.name}`,
      notes: event.notes || event.title || null,
    });
    if (error) {
      console.error("[BuyerProfile] cita de venta:", error.message);
      toast.error("Hito guardado, pero no se pudo agendar en el calendario");
    } else {
      toast.success("Cita de venta agendada en el Calendario 📅");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#FBBF24]" />
      </div>
    );
  }

  if (notFound || !demand) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex flex-col items-center justify-center text-center p-6 space-y-4">
        <Compass className="text-slate-500" size={48} />
        <h1 className="text-white font-bold text-lg">Comprador no encontrado</h1>
        <Link href="/admin/dashboard" className="text-[#FBBF24] text-sm font-bold hover:underline">
          ← Volver al dashboard
        </Link>
      </div>
    );
  }

  const TABS: { id: ProfileTab; label: string }[] = [
    { id: "caracteristicas", label: "Características" },
    { id: "documentacion", label: "Documentación" },
    { id: "actividad", label: "Actividad" },
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
              <div className="w-14 h-14 rounded-full bg-[#FBBF24] text-[#2C3E50] font-black text-xl flex items-center justify-center border border-white/10 shadow-inner">
                {(demand.name || "C").charAt(0)}
              </div>
              <div>
                <h1 className="text-xl font-black text-white">{demand.name}</h1>
                <div className="flex flex-wrap items-center gap-3 mt-1.5">
                  <span className="flex items-center gap-1 text-xs text-slate-400">
                    <Phone size={12} className="text-[#FBBF24]" /> {demand.phone || "Sin tel."}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-slate-400">
                    <Mail size={12} className="text-[#FBBF24]" /> {demand.email || "Sin email"}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-slate-500">
                    <Clock size={11} /> Última actividad: {new Date(demand.last_activity_at || demand.created_at).toLocaleDateString("es-ES")}
                  </span>
                </div>
              </div>
            </div>

            {/* Estado Activo/Desactivado (coherente con F0.1) */}
            <select
              value={demand.status || "Activo"}
              onChange={(e) => saveField({ status: e.target.value as BuyerDemand["status"] })}
              className={`bg-[#0F172A] border rounded-full px-4 py-1.5 text-xs font-bold focus:outline-none focus:border-[#FBBF24] cursor-pointer transition-all w-fit ${
                demand.status === "Activo" ? "text-emerald-400 border-emerald-500/20" : "text-slate-400 border-slate-500/20"
              }`}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt} value={opt} className="text-white bg-[#0F172A]">{opt}</option>
              ))}
            </select>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-white/5 -mb-6 -mx-6 px-6 pt-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-3 text-xs font-bold transition-all border-b-2 ${
                  tab === t.id ? "text-[#FBBF24] border-[#FBBF24]" : "text-slate-400 border-transparent hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── TAB: CARACTERÍSTICAS ─────────────────────────────────────────── */}
        {tab === "caracteristicas" && (
          <div className="bg-[#1E293B] border border-white/5 rounded-2xl p-6 shadow-xl space-y-5">
            <h2 className="text-xs font-black text-[#FBBF24] uppercase tracking-wider flex items-center gap-2">
              <Compass size={14} /> Criterios de búsqueda y financiación (edición en caliente)
            </h2>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wide">Presupuesto Máximo</span>
                <div className="relative mt-1">
                  <input
                    type="number"
                    defaultValue={demand.max_budget || 0}
                    onBlur={(e) => {
                      const val = Number(e.target.value);
                      if (val !== demand.max_budget) saveField({ max_budget: val });
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                    className="w-full bg-[#0F172A] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#FBBF24]"
                  />
                  <span className="absolute right-2.5 top-2 text-[10px] text-slate-500 font-bold">€</span>
                </div>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wide">Tipo de Inmueble</span>
                <select
                  value={demand.property_type || "Piso"}
                  onChange={(e) => saveField({ property_type: e.target.value })}
                  className="w-full bg-[#0F172A] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#FBBF24] mt-1 block"
                >
                  {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wide">Dormitorios / Baños</span>
                <div className="flex gap-2 mt-1">
                  <select
                    value={demand.rooms || 0}
                    onChange={(e) => saveField({ rooms: Number(e.target.value) })}
                    className="bg-[#0F172A] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#FBBF24] w-full cursor-pointer"
                  >
                    {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} hab</option>)}
                  </select>
                  <select
                    value={demand.bathrooms || 0}
                    onChange={(e) => saveField({ bathrooms: Number(e.target.value) })}
                    className="bg-[#0F172A] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#FBBF24] w-full cursor-pointer"
                  >
                    {[0, 1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} baños</option>)}
                  </select>
                </div>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wide">Metros Cuadrados Mín.</span>
                <div className="relative mt-1">
                  <input
                    type="number"
                    defaultValue={demand.min_sqm || 0}
                    onBlur={(e) => {
                      const val = Number(e.target.value);
                      if (val !== demand.min_sqm) saveField({ min_sqm: val });
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                    className="w-full bg-[#0F172A] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#FBBF24]"
                  />
                  <span className="absolute right-2.5 top-2 text-[10px] text-slate-500 font-bold">m²</span>
                </div>
              </div>
            </div>

            {/* Financiación */}
            <div className="border-t border-white/10 pt-4">
              <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wide mb-2">Análisis Financiero del Lead</span>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#0F172A] p-2.5 rounded-xl border border-white/5">
                  <span className="text-[9px] text-slate-400 block font-semibold">Forma Pago</span>
                  <select
                    value={demand.funding_type || "Hipoteca"}
                    onChange={(e) => saveField({ funding_type: e.target.value as "Contado" | "Hipoteca" })}
                    className={`bg-transparent border-none p-0 text-xs font-black uppercase mt-1 block w-full focus:outline-none cursor-pointer ${
                      demand.funding_type === "Contado" ? "text-emerald-400" : "text-amber-400"
                    }`}
                  >
                    <option value="Hipoteca" className="text-white bg-[#0F172A]">Hipoteca</option>
                    <option value="Contado" className="text-white bg-[#0F172A]">Contado</option>
                  </select>
                </div>

                {(demand.funding_type || "Hipoteca") === "Hipoteca" ? (
                  <>
                    <div className="bg-[#0F172A] p-2.5 rounded-xl border border-white/5">
                      <span className="text-[9px] text-slate-400 block font-semibold">Aportación Ahorros</span>
                      <input
                        type="number"
                        key={demand.savings_contribution}
                        defaultValue={demand.savings_contribution || 0}
                        onBlur={(e) => {
                          const val = Number(e.target.value);
                          if (val !== demand.savings_contribution) saveField({ savings_contribution: val });
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                        className="bg-transparent border-none p-0 text-xs font-black text-white mt-1 block w-full focus:outline-none"
                      />
                    </div>
                    <div className="bg-[#0F172A] p-2.5 rounded-xl border border-white/5">
                      <span className="text-[9px] text-slate-400 block font-semibold">Hipoteca Requerida</span>
                      <span className="text-xs font-black text-purple-300 mt-1 block">
                        {formatCurrency(Math.max(0, (demand.max_budget || 0) - (demand.savings_contribution || 0)))}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="bg-[#0F172A] col-span-2 p-2.5 rounded-xl border border-white/5 flex items-center justify-between">
                    <div>
                      <span className="text-[9px] text-slate-400 block font-semibold">Aportación al Contado</span>
                      <span className="text-xs font-black text-emerald-400 block">Fondos Propios 100% disponibles</span>
                    </div>
                    <Check size={16} className="text-emerald-400 mr-1" />
                  </div>
                )}
              </div>
            </div>

            {/* Descripción libre (buyers_demands.notes, F0.3) */}
            <div className="border-t border-white/10 pt-4">
              <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wide mb-2">Descripción libre de la demanda</span>
              <textarea
                rows={3}
                defaultValue={demand.notes || ""}
                placeholder="Anota matices que no caben en los campos: urgencia, motivación, mascotas, ascensor imprescindible..."
                onBlur={(e) => {
                  if (e.target.value !== (demand.notes || "")) saveField({ notes: e.target.value || null });
                }}
                className="w-full bg-[#0F172A] border border-white/10 rounded-xl px-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#FBBF24] transition-all"
              />
            </div>

            {/* Zonas: chips + selector con árbol, buscador sobre SEVILLA_TAXONOMY y copiloto IA */}
            <div className="border-t border-white/10 pt-4">
              <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wide mb-2">Zonas de Interés (haz clic para quitar)</span>
              <div className="flex flex-wrap gap-1.5">
                {demand.preferred_zones && demand.preferred_zones.length > 0 ? (
                  demand.preferred_zones.map((zone, idx) => (
                    <button
                      key={idx}
                      onClick={() => saveField({ preferred_zones: demand.preferred_zones.filter((z) => z !== zone) })}
                      className="bg-[#0F172A] hover:bg-rose-500/20 hover:text-rose-300 hover:border-rose-500/30 text-slate-300 text-xs px-2.5 py-1 rounded-lg border border-white/10 flex items-center gap-1 transition-all group/zone cursor-pointer"
                      title="Haz clic para quitar esta zona"
                    >
                      <MapPin size={10} className="text-[#FBBF24] group-hover/zone:text-rose-400" />
                      {zone}
                      <span className="text-[9px] text-slate-500 group-hover/zone:text-rose-400 ml-1">×</span>
                    </button>
                  ))
                ) : (
                  <span className="text-slate-500 text-xs">Ninguna zona seleccionada</span>
                )}
              </div>

              <div className="mt-4 border-t border-white/5 pt-4">
                <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wide mb-2">Editor de Zonas (Árbol, Buscador y Copilot IA)</span>
                <ZoneSelectorPremium
                  selectedZones={demand.preferred_zones || []}
                  onChange={(updatedZones) => saveField({ preferred_zones: updatedZones })}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: DOCUMENTACIÓN ───────────────────────────────────────────── */}
        {tab === "documentacion" && (
          <div className="bg-[#1E293B] border border-white/5 rounded-2xl p-6 shadow-xl space-y-4">
            <h2 className="text-xs font-black text-[#FBBF24] uppercase tracking-wider flex items-center gap-2">
              <FileText size={14} /> Documentación del comprador
            </h2>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {Object.entries(BUYER_DOC_KINDS).map(([kind, label]) => (
                <label
                  key={kind}
                  className={`flex items-center justify-center gap-1.5 px-3 py-2 bg-[#0F172A] hover:bg-[#0F172A]/80 border border-white/10 hover:border-[#FBBF24]/40 rounded-xl text-[11px] font-bold text-slate-300 hover:text-white cursor-pointer transition-all ${uploadingKind ? "opacity-50 pointer-events-none" : ""}`}
                >
                  <Upload size={11} /> {uploadingKind === kind ? "Subiendo..." : label}
                  <input
                    type="file"
                    multiple={kind === "otros"}
                    className="hidden"
                    onChange={(e) => {
                      const files = e.target.files;
                      if (!files) return;
                      for (let i = 0; i < files.length; i++) {
                        void uploadDocument(kind, files[i]);
                      }
                      e.target.value = "";
                    }}
                  />
                </label>
              ))}
            </div>

            {docsLoading ? (
              <div className="py-8 text-center text-xs text-slate-400">Cargando documentación...</div>
            ) : documents.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                Sin documentos. Sube DNI, justificantes de solvencia o pre-aprobaciones de financiación.
              </div>
            ) : (
              <div className="divide-y divide-white/5 border border-white/5 rounded-xl overflow-hidden">
                {documents.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between gap-3 px-4 py-3 bg-white/[0.02] hover:bg-white/[0.04] transition-all">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">{doc.label || doc.file_url.split("/").pop()}</p>
                      <p className="text-[10px] text-slate-500">
                        {BUYER_DOC_KINDS[doc.kind] || doc.kind} · {fmtBytes(doc.file_size_bytes)} · {new Date(doc.uploaded_at).toLocaleDateString("es-ES")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => void downloadDocument(doc)}
                        className="p-2 rounded-lg bg-white/5 hover:bg-[#FBBF24] text-slate-300 hover:text-[#2C3E50] border border-white/5 transition-all cursor-pointer"
                        title="Descargar (enlace firmado)"
                      >
                        <Download size={13} />
                      </button>
                      <button
                        onClick={() => void deleteDocument(doc)}
                        className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white border border-rose-500/20 transition-all cursor-pointer"
                        title="Eliminar"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: ACTIVIDAD ───────────────────────────────────────────────── */}
        {tab === "actividad" && (
          <div className="bg-[#1E293B] border border-white/5 rounded-2xl p-6 shadow-xl space-y-4">
            <h2 className="text-xs font-black text-[#FBBF24] uppercase tracking-wider flex items-center gap-2">
              <Clock size={14} /> Historial de Actividad (Línea de Tiempo)
            </h2>
            <ActivityTimeline
              table="buyer_activity_logs"
              ownerColumn="buyer_id"
              ownerId={demand.id}
              eventTypes={BUYER_EVENT_TYPES}
              getIconConfig={getBuyerTimelineIconConfig}
              properties={properties}
              onEventCreated={handleEventCreated}
            />
          </div>
        )}
      </div>
    </div>
  );
}
