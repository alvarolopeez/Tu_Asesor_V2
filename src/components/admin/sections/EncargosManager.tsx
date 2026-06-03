"use client";

/**
 * EncargosManager
 *
 * Apartado "Encargos" del CRM. Reemplaza por completo al antiguo
 * `SellersManager`, que confundía Encargo con Property y abría
 * `PropertyFormModal` (form de Inmuebles) como falso "Subir encargo".
 *
 * Modelo de datos (ver migración 2026-06-03):
 *   • `encargos`           → expediente jurídico/comercial.
 *   • `encargo_documents`  → anexos operativos (IBI, comunidad, energética,
 *                            nota simple, otros).
 *   • `generated_documents.encargo_id` → back-reference para Nota de Encargo
 *                            firmada (y otras Propuestas/Reservas).
 *
 * Vista principal:
 *   • KPIs (activos · vencen ≤30 días · honorarios esperados · vendidos mes).
 *   • Tabs por status (Activos | Vendidos | Caducados | Cancelados).
 *   • Tabla con buscador.
 *   • Botón "Añadir encargo" → `EncargoFormModal`.
 *
 * Drawer "Expediente Digital" (al click en una fila):
 *   • Tab Resumen → datos jurídicos editables.
 *   • Tab Documentos → Nota vinculada (descargable) + anexos con upload.
 *   • Tab Actividad → visitas (appointments) y propuestas/reservas linkadas.
 *   • Tab Publicación web → muestra property_id vinculado si lo hay.
 *   • Acciones: marcar vendido / caducado / cancelado / eliminar (revierte
 *     status del lead vendedor automáticamente vía API).
 *
 * @created 2026-06-03 (refactor CRM)
 */

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/utils";
import {
  Briefcase,
  Plus,
  Search,
  Download,
  X,
  Calendar,
  AlertTriangle,
  CheckCircle,
  Home,
  FileText,
  Trash2,
  RefreshCw,
  Upload,
  ExternalLink,
} from "lucide-react";
import toast from "react-hot-toast";
import type {
  Encargo,
  EncargoStatus,
  EncargoDocument,
  EncargoDocumentKind,
  Lead,
} from "@/types";
import EncargoFormModal from "./encargos/EncargoFormModal";

// ── Tipos enriquecidos para la tabla ────────────────────────────────────────
interface EncargoRow extends Encargo {
  lead: Lead | null;
  expiry_date: Date | null;
  expected_fee: number;
}

const STATUS_TABS: { key: EncargoStatus; label: string; cls: string }[] = [
  { key: "activo",    label: "Activos",    cls: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30" },
  { key: "vendido",   label: "Vendidos",   cls: "text-sky-300 bg-sky-500/10 border-sky-500/30" },
  { key: "caducado",  label: "Caducados",  cls: "text-amber-300 bg-amber-500/10 border-amber-500/30" },
  { key: "cancelado", label: "Cancelados", cls: "text-slate-300 bg-slate-500/10 border-slate-500/30" },
];

const KIND_LABELS: Record<EncargoDocumentKind, string> = {
  ibi: "IBI",
  comunidad: "Comunidad",
  energetica: "Cert. energética",
  nota_simple: "Nota simple",
  otros: "Otros",
};

// Helpers de fecha
function calcExpiry(fechaFirma: string | null, durMeses: number | null | undefined): Date | null {
  if (!fechaFirma) return null;
  const d = new Date(fechaFirma);
  if (isNaN(d.getTime())) return null;
  d.setMonth(d.getMonth() + (durMeses || 6));
  return d;
}
function daysUntil(d: Date | null): number | null {
  if (!d) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const t = new Date(d); t.setHours(0, 0, 0, 0);
  return Math.round((t.getTime() - today.getTime()) / 86_400_000);
}
function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("es-ES");
}

export default function EncargosManager() {
  const [encargos, setEncargos] = useState<Encargo[]>([]);
  const [leadsById, setLeadsById] = useState<Map<string, Lead>>(new Map());
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<EncargoStatus>("activo");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // ── Carga inicial + refresh ────────────────────────────────────────────
  const fetchAll = async () => {
    setLoading(true);
    try {
      const [encsRes, leadsRes] = await Promise.all([
        supabase.from("encargos").select("*").order("created_at", { ascending: false }),
        supabase.from("leads").select("*").eq("type", "seller"),
      ]);
      setEncargos((encsRes.data as Encargo[]) || []);
      const m = new Map<string, Lead>();
      ((leadsRes.data as Lead[]) || []).forEach((l) => m.set(l.id, l));
      setLeadsById(m);
    } catch (err: any) {
      console.error("[EncargosManager] fetchAll:", err.message);
      toast.error("No se pudieron cargar los encargos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchAll(); }, []);

  // ── Enriquecidos ───────────────────────────────────────────────────────
  const rows: EncargoRow[] = useMemo(() => {
    return encargos.map((e) => {
      const lead = e.seller_lead_id ? leadsById.get(e.seller_lead_id) || null : null;
      const expiry = calcExpiry(e.fecha_firma, e.duracion_meses);
      const expected_fee = e.precio_captacion && e.honorarios_pct
        ? Number(e.precio_captacion) * (Number(e.honorarios_pct) / 100)
        : 0;
      return { ...e, lead, expiry_date: expiry, expected_fee };
    });
  }, [encargos, leadsById]);

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (r.status !== tab) return false;
      if (!t) return true;
      const hay = [r.lead?.name, r.lead?.phone, r.direccion, r.ref_catastral]
        .filter(Boolean).join(" ").toLowerCase();
      return hay.includes(t);
    });
  }, [rows, tab, search]);

  // ── KPIs (sobre todos los activos) ─────────────────────────────────────
  const kpi = useMemo(() => {
    const activos = rows.filter((r) => r.status === "activo");
    const expiringSoon = activos.filter((r) => {
      const d = daysUntil(r.expiry_date);
      return d !== null && d >= 0 && d <= 30;
    }).length;
    const totalFees = activos.reduce((s, r) => s + r.expected_fee, 0);
    const vendidosMes = rows.filter((r) => {
      if (r.status !== "vendido") return false;
      const u = new Date(r.updated_at);
      const now = new Date();
      return u.getFullYear() === now.getFullYear() && u.getMonth() === now.getMonth();
    }).length;
    return { activos: activos.length, expiringSoon, totalFees, vendidosMes };
  }, [rows]);

  const selectedEncargo = useMemo(() => rows.find((r) => r.id === selectedId) || null, [rows, selectedId]);

  return (
    <div className="space-y-6">
      {/* ─── KPIs ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Encargos activos" value={String(kpi.activos)} accent="text-white" icon={<Briefcase size={22} className="text-[#FBBF24]" />} bg="bg-amber-500/10 border-amber-500/20" />
        <KpiCard label="Vencen ≤30 días" value={String(kpi.expiringSoon)} accent="text-amber-400" icon={<AlertTriangle size={22} className="text-amber-300" />} bg="bg-amber-500/10 border-amber-500/20" />
        <KpiCard label="Honorarios esperados" value={formatCurrency(kpi.totalFees)} accent="text-emerald-400" icon={<CheckCircle size={22} className="text-emerald-300" />} bg="bg-emerald-500/10 border-emerald-500/20" />
        <KpiCard label="Vendidos este mes" value={String(kpi.vendidosMes)} accent="text-sky-400" icon={<Home size={22} className="text-sky-300" />} bg="bg-sky-500/10 border-sky-500/20" />
      </div>

      {/* ─── Cabecera + acciones ────────────────────────────────────────── */}
      <div className="bg-[#1E293B]/40 border border-white/5 p-5 rounded-2xl backdrop-blur-md flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2"><Briefcase size={20} className="text-[#FBBF24]" /> Encargos en exclusiva</h2>
          <p className="text-[11px] text-slate-400 mt-1">Expediente jurídico, documentación y seguimiento de cada captación.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400"><Search size={14} /></span>
            <input
              type="text"
              placeholder="Buscar por dirección o vendedor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-72 max-w-full bg-[#0F172A]/50 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#FBBF24]"
            />
          </div>
          <button
            onClick={() => void fetchAll()}
            className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300"
            title="Refrescar"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-[#FBBF24] hover:bg-yellow-500 text-[#2C3E50] font-extrabold px-4 py-2 rounded-xl transition-all active:scale-95"
          >
            <Plus size={14} /> Añadir encargo
          </button>
        </div>
      </div>

      {/* ─── Tabs por status ───────────────────────────────────────────── */}
      <div className="flex items-center gap-2 bg-[#1E293B]/40 border border-white/5 rounded-2xl p-1.5 w-fit">
        {STATUS_TABS.map((t) => {
          const count = rows.filter((r) => r.status === t.key).length;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`text-xs font-bold px-4 py-2 rounded-xl transition-all flex items-center gap-2 ${
                tab === t.key ? "bg-[#FBBF24] text-[#2C3E50]" : "text-slate-300 hover:text-white hover:bg-white/5"
              }`}
            >
              {t.label}
              <span className={`text-[10px] font-extrabold rounded-full px-2 py-0.5 ${
                tab === t.key ? "bg-[#2C3E50]/20 text-[#2C3E50]" : "bg-white/10 text-white"
              }`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* ─── Tabla ─────────────────────────────────────────────────────── */}
      <div className="bg-[#1E293B]/20 border border-white/5 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center space-y-3">
            <div className="w-10 h-10 border-4 border-[#FBBF24] border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-400">Cargando encargos...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center">
            <Briefcase className="mx-auto text-slate-500 mb-3" size={40} />
            <p className="text-slate-300 font-bold text-sm">No hay encargos en este estado</p>
            <p className="text-slate-500 text-xs mt-1">Pulsa "Añadir encargo" para registrar el primero.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-[#0F172A]/40 text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                  <th className="py-3 px-5">Inmueble / Vendedor</th>
                  <th className="py-3 px-5">Precio · Honorarios</th>
                  <th className="py-3 px-5">Firmado</th>
                  <th className="py-3 px-5">Vencimiento</th>
                  <th className="py-3 px-5">Nota encargo</th>
                  <th className="py-3 px-5 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((r) => {
                  const du = daysUntil(r.expiry_date);
                  const vencCls =
                    du === null ? "text-slate-400 bg-slate-500/10 border-slate-500/20"
                    : du < 0 ? "text-rose-300 bg-rose-500/10 border-rose-500/30"
                    : du <= 30 ? "text-amber-300 bg-amber-500/10 border-amber-500/30"
                    : "text-emerald-300 bg-emerald-500/10 border-emerald-500/30";
                  const vencTxt =
                    du === null ? "—"
                    : du < 0 ? `Vencido hace ${Math.abs(du)} d`
                    : du === 0 ? "Vence hoy"
                    : `Vence en ${du} d`;
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setSelectedId(r.id)}
                      className="hover:bg-white/[0.03] cursor-pointer transition-all group"
                    >
                      <td className="py-3 px-5">
                        <p className="font-bold text-white text-sm group-hover:text-[#FBBF24] transition-all truncate max-w-[280px]">{r.direccion || "Inmueble sin dirección"}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {r.lead?.name || "Lead no vinculado"}{r.lead?.phone ? ` · ${r.lead.phone}` : ""}
                        </p>
                      </td>
                      <td className="py-3 px-5 text-xs">
                        <p className="text-white font-semibold">{r.precio_captacion ? formatCurrency(Number(r.precio_captacion)) : "—"}</p>
                        <p className="text-emerald-300 mt-0.5">{r.honorarios_pct ? `${r.honorarios_pct}% · ${formatCurrency(r.expected_fee)}` : "Honorarios sin definir"}</p>
                      </td>
                      <td className="py-3 px-5 text-xs text-slate-300">{fmtDate(r.fecha_firma)}</td>
                      <td className="py-3 px-5">
                        <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full border w-fit inline-flex items-center gap-1.5 ${vencCls}`}>
                          {du !== null && du <= 30 && <AlertTriangle size={10} />}
                          {vencTxt}
                        </span>
                        <p className="text-[10px] text-slate-500 mt-1">{fmtDate(r.expiry_date)}</p>
                      </td>
                      <td className="py-3 px-5">
                        {r.nota_encargo_doc_id ? (
                          <a
                            href={`/api/documents/${r.nota_encargo_doc_id}/download`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-300 hover:text-white text-[10px] font-bold rounded border border-emerald-500/30 transition-all"
                            title="Descargar Nota firmada"
                          >
                            <Download size={11} /> Descargar
                          </a>
                        ) : (
                          <span className="text-[11px] text-slate-500 italic">Sin vincular</span>
                        )}
                      </td>
                      <td className="py-3 px-5 text-center">
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedId(r.id); }}
                          className="p-2 rounded-lg bg-white/5 hover:bg-[#FBBF24]/10 text-slate-300 hover:text-[#FBBF24] border border-white/5"
                          title="Abrir expediente"
                        >
                          <ExternalLink size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Modal crear ───────────────────────────────────────────────── */}
      <EncargoFormModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={async () => {
          await fetchAll();
        }}
      />

      {/* ─── Drawer expediente ─────────────────────────────────────────── */}
      {selectedEncargo && (
        <EncargoDrawer
          encargo={selectedEncargo}
          onClose={() => setSelectedId(null)}
          onChange={fetchAll}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// COMPONENTES SECUNDARIOS
// ────────────────────────────────────────────────────────────────────────────

function KpiCard({ label, value, accent, icon, bg }: { label: string; value: string; accent: string; icon: React.ReactNode; bg: string }) {
  return (
    <div className="bg-[#1E293B]/40 border border-white/5 p-5 rounded-2xl flex items-center justify-between shadow-xl backdrop-blur-md">
      <div>
        <span className="text-[10px] text-slate-400 font-medium block uppercase tracking-wider">{label}</span>
        <span className={`text-2xl font-extrabold mt-1 block ${accent}`}>{value}</span>
      </div>
      <div className={`w-12 h-12 rounded-xl border flex items-center justify-center ${bg}`}>{icon}</div>
    </div>
  );
}

// ── DRAWER ──────────────────────────────────────────────────────────────────
function EncargoDrawer({ encargo, onClose, onChange }: { encargo: EncargoRow; onClose: () => void; onChange: () => Promise<void> }) {
  const [tab, setTab] = useState<"resumen" | "documentos" | "actividad" | "publicacion">("resumen");
  const [saving, setSaving] = useState(false);
  const [anexos, setAnexos] = useState<EncargoDocument[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [vinculatedDocs, setVinculatedDocs] = useState<any[]>([]);

  // Form editable (resumen)
  const [direccion, setDireccion] = useState(encargo.direccion || "");
  const [refCat, setRefCat] = useState(encargo.ref_catastral || "");
  const [sqm, setSqm] = useState(encargo.sqm?.toString() || "");
  const [rooms, setRooms] = useState(encargo.rooms?.toString() || "");
  const [baths, setBaths] = useState(encargo.baths?.toString() || "");
  const [precio, setPrecio] = useState(encargo.precio_captacion?.toString() || "");
  const [honPct, setHonPct] = useState(encargo.honorarios_pct?.toString() || "");
  const [duracion, setDuracion] = useState(encargo.duracion_meses?.toString() || "6");
  const [fechaFirma, setFechaFirma] = useState(encargo.fecha_firma || "");
  const [notes, setNotes] = useState(encargo.notes || "");

  // Cargar related al cambio de tab
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (tab === "documentos") {
        const { data } = await supabase
          .from("encargo_documents")
          .select("*")
          .eq("encargo_id", encargo.id)
          .order("uploaded_at", { ascending: false });
        if (!cancelled) setAnexos((data as EncargoDocument[]) || []);

        // Otros documentos del módulo Documentos vinculados a este encargo.
        const { data: docs } = await supabase
          .from("generated_documents")
          .select("id, template_id, signature_status, documenso_id, created_at")
          .eq("encargo_id", encargo.id);
        if (!cancelled) setVinculatedDocs(docs || []);
      } else if (tab === "actividad" && encargo.seller_lead_id) {
        const { data } = await supabase
          .from("appointments")
          .select("*")
          .eq("lead_id", encargo.seller_lead_id)
          .order("scheduled_at", { ascending: false });
        if (!cancelled) setAppointments(data || []);
      }
    })();
    return () => { cancelled = true; };
  }, [tab, encargo.id, encargo.seller_lead_id]);

  const saveResumen = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/encargos/${encargo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direccion: direccion || null,
          ref_catastral: refCat || null,
          sqm: sqm ? Number(sqm) : null,
          rooms: rooms ? Number(rooms) : null,
          baths: baths ? Number(baths) : null,
          precio_captacion: precio ? Number(precio) : null,
          honorarios_pct: honPct ? Number(honPct) : null,
          fecha_firma: fechaFirma || null,
          duracion_meses: duracion ? Number(duracion) : 6,
          notes: notes || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Error");
      toast.success("Encargo actualizado");
      await onChange();
    } catch (err: any) {
      toast.error(err.message || "No se pudo actualizar");
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (newStatus: EncargoStatus) => {
    if (!confirm(`¿Marcar este encargo como ${newStatus}?`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/encargos/${encargo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error((await res.json())?.error || "Error");
      toast.success(`Encargo marcado como ${newStatus}`);
      await onChange();
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteEncargo = async () => {
    if (!confirm("Eliminar este encargo borrará su expediente y todos los anexos. El lead vendedor volverá a aparecer en Vendedores con su estado anterior. ¿Confirmar?")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/encargos/${encargo.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json())?.error || "Error");
      toast.success("Encargo eliminado");
      await onChange();
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const uploadAnexo = async (kind: EncargoDocumentKind, file: File, label?: string) => {
    const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const path = `${encargo.id}/${kind}/${Date.now()}_${safe}`;
    const { error: upErr } = await supabase.storage
      .from("encargo-files")
      .upload(path, file, { upsert: false, contentType: file.type || "application/octet-stream" });
    if (upErr) {
      toast.error(`Subida falló: ${upErr.message}`);
      return;
    }
    await supabase.from("encargo_documents").insert({
      encargo_id: encargo.id,
      kind,
      label: label || (kind === "otros" ? file.name : KIND_LABELS[kind]),
      file_url: path,
      file_size_bytes: file.size,
      mime_type: file.type || null,
    });
    // refresh anexos
    const { data } = await supabase
      .from("encargo_documents")
      .select("*")
      .eq("encargo_id", encargo.id)
      .order("uploaded_at", { ascending: false });
    setAnexos((data as EncargoDocument[]) || []);
  };

  const deleteAnexo = async (anexo: EncargoDocument) => {
    if (!confirm("¿Eliminar este documento del expediente?")) return;
    await supabase.storage.from("encargo-files").remove([anexo.file_url]).catch(() => {});
    await supabase.from("encargo_documents").delete().eq("id", anexo.id);
    setAnexos((prev) => prev.filter((a) => a.id !== anexo.id));
  };

  const getSignedUrl = async (path: string): Promise<string | null> => {
    const { data } = await supabase.storage.from("encargo-files").createSignedUrl(path, 60 * 5);
    return data?.signedUrl || null;
  };

  const handleDownload = async (anexo: EncargoDocument) => {
    const url = await getSignedUrl(anexo.file_url);
    if (!url) { toast.error("No se pudo generar enlace de descarga"); return; }
    window.open(url, "_blank", "noopener");
  };

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <aside className="relative w-full max-w-2xl bg-[#0F172A] border-l border-white/10 shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#0F172A]/95 backdrop-blur border-b border-white/10 px-6 py-4 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-[#FBBF24] font-bold">Expediente digital</p>
            <h2 className="text-lg font-bold text-white truncate">{encargo.direccion || "Inmueble sin dirección"}</h2>
            <p className="text-[11px] text-slate-400">{encargo.lead?.name || "Sin vendedor vinculado"}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white"><X size={18} /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/5 bg-[#1E293B]/30 px-2">
          {(["resumen", "documentos", "actividad", "publicacion"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-3 text-xs font-bold capitalize transition-all border-b-2 ${
                tab === t ? "text-[#FBBF24] border-[#FBBF24]" : "text-slate-400 border-transparent hover:text-white"
              }`}
            >{t === "publicacion" ? "Publicación web" : t}</button>
          ))}
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {tab === "resumen" && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Dirección" value={direccion} onChange={setDireccion} />
                <Field label="Referencia catastral" value={refCat} onChange={setRefCat} />
                <Field label="m²" value={sqm} onChange={setSqm} type="number" />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Habs" value={rooms} onChange={setRooms} type="number" />
                  <Field label="Baños" value={baths} onChange={setBaths} type="number" />
                </div>
                <Field label="Precio captación (€)" value={precio} onChange={setPrecio} type="number" />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Honorarios %" value={honPct} onChange={setHonPct} type="number" />
                  <Field label="Duración (meses)" value={duracion} onChange={setDuracion} type="number" />
                </div>
                <Field label="Fecha firma" value={fechaFirma} onChange={setFechaFirma} type="date" />
                <Field label="Notas" value={notes} onChange={setNotes} textarea />
              </div>
              <div className="flex items-center justify-between gap-2 pt-3 border-t border-white/5">
                <div className="flex items-center gap-2 flex-wrap">
                  {encargo.status === "activo" && (
                    <>
                      <button onClick={() => changeStatus("vendido")} disabled={saving}
                        className="text-[11px] font-bold text-white bg-sky-600 hover:bg-sky-500 px-3 py-1.5 rounded-lg">Marcar vendido</button>
                      <button onClick={() => changeStatus("caducado")} disabled={saving}
                        className="text-[11px] font-bold text-white bg-amber-600 hover:bg-amber-500 px-3 py-1.5 rounded-lg">Marcar caducado</button>
                      <button onClick={() => changeStatus("cancelado")} disabled={saving}
                        className="text-[11px] font-bold text-slate-200 bg-slate-600 hover:bg-slate-500 px-3 py-1.5 rounded-lg">Cancelar</button>
                    </>
                  )}
                  {encargo.status !== "activo" && (
                    <button onClick={() => changeStatus("activo")} disabled={saving}
                      className="text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 rounded-lg">Reactivar</button>
                  )}
                  <button onClick={deleteEncargo} disabled={saving}
                    className="text-[11px] font-bold text-rose-300 bg-rose-500/10 hover:bg-rose-500 hover:text-white border border-rose-500/30 px-3 py-1.5 rounded-lg flex items-center gap-1">
                    <Trash2 size={12} /> Eliminar
                  </button>
                </div>
                <button onClick={saveResumen} disabled={saving}
                  className="text-xs font-extrabold text-[#2C3E50] bg-[#FBBF24] hover:bg-yellow-500 px-4 py-2 rounded-xl disabled:opacity-50">
                  {saving ? "Guardando…" : "Guardar cambios"}
                </button>
              </div>
            </div>
          )}

          {tab === "documentos" && (
            <div className="space-y-4">
              {/* Nota de encargo */}
              <section>
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-2 flex items-center gap-1.5"><FileText size={12} /> Nota de encargo</h3>
                {encargo.nota_encargo_doc_id ? (
                  <a
                    href={`/api/documents/${encargo.nota_encargo_doc_id}/download`}
                    className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-300 hover:text-white text-xs font-bold rounded-xl border border-emerald-500/30 transition-all"
                  >
                    <Download size={13} /> Descargar Nota de Encargo firmada
                  </a>
                ) : (
                  <p className="text-[11px] text-slate-500 italic">Sin Nota de Encargo vinculada. Vincula una desde el modal de edición (próximamente) o créala desde el apartado Documentos.</p>
                )}
              </section>

              {/* Anexos */}
              <section>
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-2 flex items-center gap-1.5"><Upload size={12} /> Documentación adjunta</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                  {(Object.keys(KIND_LABELS) as EncargoDocumentKind[]).map((k) => (
                    <label key={k} className="flex items-center justify-center gap-1.5 px-3 py-2 bg-[#1E293B] hover:bg-[#1E293B]/80 border border-white/10 hover:border-[#FBBF24]/40 rounded-xl text-[11px] font-bold text-slate-300 hover:text-white cursor-pointer transition-all">
                      <Upload size={11} /> {KIND_LABELS[k]}
                      <input
                        type="file"
                        multiple={k === "otros"}
                        className="hidden"
                        onChange={(e) => {
                          const files = e.target.files;
                          if (!files) return;
                          for (let i = 0; i < files.length; i++) {
                            void uploadAnexo(k, files[i]);
                          }
                          e.target.value = "";
                        }}
                      />
                    </label>
                  ))}
                </div>
                {anexos.length === 0 ? (
                  <p className="text-[11px] text-slate-500 italic">No hay anexos en el expediente.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {anexos.map((a) => (
                      <li key={a.id} className="flex items-center gap-2 bg-[#1E293B]/60 border border-white/5 rounded-xl px-3 py-2">
                        <FileText size={13} className="text-slate-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] font-bold uppercase text-[#FBBF24]">{KIND_LABELS[a.kind]}</span>
                          <p className="text-[11px] text-slate-300 truncate">{a.label || a.file_url}</p>
                        </div>
                        <button onClick={() => void handleDownload(a)} className="p-1.5 hover:bg-white/5 text-slate-300 hover:text-[#FBBF24] rounded" title="Descargar"><Download size={12} /></button>
                        <button onClick={() => void deleteAnexo(a)} className="p-1.5 hover:bg-rose-500/10 text-rose-400 rounded" title="Eliminar"><Trash2 size={12} /></button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Otros docs Documenso vinculados */}
              {vinculatedDocs.length > 0 && (
                <section>
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-2">Otros documentos firmados vinculados</h3>
                  <ul className="space-y-1.5">
                    {vinculatedDocs.map((d) => (
                      <li key={d.id} className="text-[11px] text-slate-300 flex items-center justify-between bg-[#1E293B]/40 px-3 py-2 rounded-lg">
                        <span>doc {d.id.slice(0, 8)} · {d.signature_status}</span>
                        <a href={`/api/documents/${d.id}/download`} className="text-[#FBBF24] hover:text-yellow-300">Descargar</a>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}

          {tab === "actividad" && (
            <div className="space-y-3">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5"><Calendar size={12} /> Visitas y citas</h3>
              {appointments.length === 0 ? (
                <p className="text-[11px] text-slate-500 italic">Sin actividad registrada.</p>
              ) : (
                <ul className="space-y-2">
                  {appointments.map((ap) => (
                    <li key={ap.id} className="bg-[#1E293B]/40 border border-white/5 rounded-xl px-3 py-2">
                      <p className="text-xs text-white font-semibold">{ap.title || "Cita"}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {fmtDate(ap.scheduled_at)} · {ap.status || "—"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {tab === "publicacion" && (
            <div className="space-y-3">
              {encargo.property_id ? (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
                  <p className="text-sm font-bold text-emerald-300">Inmueble publicado en la web</p>
                  <p className="text-[11px] text-slate-300 mt-1">property_id: <code className="text-[10px]">{encargo.property_id}</code></p>
                  <p className="text-[11px] text-slate-400 mt-2">La ficha pública se gestiona desde el apartado Inmuebles.</p>
                </div>
              ) : (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                  <p className="text-sm font-bold text-amber-300">Sin publicar en web</p>
                  <p className="text-[11px] text-slate-300 mt-1">Cuando estés listo, crea el inmueble en el apartado Inmuebles y vincúlalo desde aquí (próximamente).</p>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", textarea = false }: { label: string; value: string; onChange: (v: string) => void; type?: string; textarea?: boolean }) {
  return (
    <div>
      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">{label}</label>
      {textarea ? (
        <textarea
          rows={2}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-[#1E293B] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#FBBF24]"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-[#1E293B] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#FBBF24]"
        />
      )}
    </div>
  );
}
