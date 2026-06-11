"use client";

// Brief #011 F3.3 (R12/R17/R18, D12): ENCARGO a página completa.
// Apartados: Resumen (datos + hueco para el gate de propuestas de F4.3/F4.4) /
// Documentos (encargo_documents + generated_documents vinculados) / Actividad
// (timeline editable en seller_activity_logs filtrado por lead_id+property_id;
// 'Notaría' crea cita type='cierre', D11) / Publicación web (vínculo property
// + métricas, las visitas cuentan tras F1.4).
//
// Decisión cerrada del brief: los eventos del encargo viven en
// seller_activity_logs con lead_id + property_id SIEMPRE informados (la
// columna property_id se añadió en esta sesión con OK de Álvaro). Si el
// encargo no tiene property_id, se muestra el timeline completo del vendedor
// anotado como tal.

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/utils";
import AdminAuthGate from "@/components/admin/AdminAuthGate";
import ActivityTimeline, { type ExtraTimelineLog } from "./ActivityTimeline";
import { getBuyerTimelineIconConfig, getSellerTimelineIconConfig } from "./timelineIcons";
import type { Encargo, EncargoDocument, EncargoDocumentKind, EncargoStatus, Lead } from "@/types";
import {
  ArrowLeft,
  Briefcase,
  Calendar,
  Compass,
  Download,
  FileText,
  Trash2,
  Upload,
  User,
  Clock,
} from "lucide-react";
import toast from "react-hot-toast";

const KIND_LABELS: Record<EncargoDocumentKind, string> = {
  ibi: "IBI",
  comunidad: "Comunidad",
  energetica: "Cert. energética",
  nota_simple: "Nota simple",
  otros: "Otros",
};

const STATUS_BADGE: Record<EncargoStatus, string> = {
  activo: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
  vendido: "text-sky-300 bg-sky-500/10 border-sky-500/30",
  caducado: "text-amber-300 bg-amber-500/10 border-amber-500/30",
  cancelado: "text-slate-300 bg-slate-500/10 border-slate-500/30",
};

// Eventos manuales del expediente (los autos 'Propuesta'/'Propuesta aceptada'
// llegan por F3.4/F4). 'Contrato privado': la fecha del evento ES la fecha de
// firma. 'Notaría': además crea cita type='cierre' (D11).
const ENCARGO_EVENT_TYPES = [
  { value: "Visita", label: "🏠 Visita" },
  { value: "Llamada", label: "📞 Llamada" },
  { value: "Nota", label: "📝 Nota" },
  { value: "Contrato privado", label: "✍️ Contrato privado (fecha de firma)" },
  { value: "Notaría", label: "🏛️ Notaría (crea cita de cierre)" },
];

type ProfileTab = "resumen" | "documentos" | "actividad" | "publicacion";

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("es-ES");
}

export default function EncargoProfileClient({ encargoId }: { encargoId: string }) {
  return (
    <AdminAuthGate>
      <EncargoProfileBody encargoId={encargoId} />
    </AdminAuthGate>
  );
}

function EncargoProfileBody({ encargoId }: { encargoId: string }) {
  const [encargo, setEncargo] = useState<Encargo | null>(null);
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<ProfileTab>("resumen");
  const [saving, setSaving] = useState(false);

  // Resumen (form editable, mismo PATCH /api/encargos/[id] que el drawer)
  const [direccion, setDireccion] = useState("");
  const [refCat, setRefCat] = useState("");
  const [sqm, setSqm] = useState("");
  const [rooms, setRooms] = useState("");
  const [baths, setBaths] = useState("");
  const [precio, setPrecio] = useState("");
  const [honPct, setHonPct] = useState("");
  const [duracion, setDuracion] = useState("6");
  const [fechaFirma, setFechaFirma] = useState("");
  const [notes, setNotes] = useState("");

  // Documentos
  const [anexos, setAnexos] = useState<EncargoDocument[]>([]);
  const [vinculatedDocs, setVinculatedDocs] = useState<any[]>([]);

  // Publicación web
  const [availableProperties, setAvailableProperties] = useState<any[]>([]);
  const [linkedProperty, setLinkedProperty] = useState<any | null>(null);
  const [propMetrics, setPropMetrics] = useState<{ visits: number; appointments: number } | null>(null);
  const [linking, setLinking] = useState(false);

  // F4.3/F4.4: propuestas buyer_signed o completed del vendedor de este encargo.
  const [proposals, setProposals] = useState<Array<{
    id: string;
    created_at: string;
    merged_data: Record<string, any>;
    buyer_id: string | null;
    signature_status: string;
    buyerName?: string;
  }>>([]);
  const [acceptingProposalId, setAcceptingProposalId] = useState<string | null>(null);
  const [sentProposals, setSentProposals] = useState<Set<string>>(new Set());

  // Actividad de COMPRADORES sobre el inmueble del encargo (read-only,
  // fusionada en el timeline — paridad con el drawer antiguo).
  const [buyerExtraLogs, setBuyerExtraLogs] = useState<ExtraTimelineLog[]>([]);

  const fetchEncargo = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("encargos")
        .select("*")
        .eq("id", encargoId)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        setNotFound(true);
        return;
      }
      const enc = data as Encargo;
      setEncargo(enc);
      setDireccion(enc.direccion || "");
      setRefCat(enc.ref_catastral || "");
      setSqm(enc.sqm?.toString() || "");
      setRooms(enc.rooms?.toString() || "");
      setBaths(enc.baths?.toString() || "");
      setPrecio(enc.precio_captacion?.toString() || "");
      setHonPct(enc.honorarios_pct?.toString() || "");
      setDuracion(enc.duracion_meses?.toString() || "6");
      setFechaFirma(enc.fecha_firma || "");
      setNotes(enc.notes || "");

      if (enc.seller_lead_id) {
        const { data: leadRow } = await supabase
          .from("leads")
          .select("*")
          .eq("id", enc.seller_lead_id)
          .maybeSingle();
        setLead((leadRow as Lead) || null);
      }
    } catch (err: any) {
      console.error("[EncargoProfile] fetch:", err.message);
      toast.error("No se pudo cargar el encargo");
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [encargoId]);

  useEffect(() => {
    void fetchEncargo();
  }, [fetchEncargo]);

  // F4.3: carga las propuestas buyer_signed/completed del vendedor de este encargo.
  useEffect(() => {
    if (!encargo?.seller_lead_id) return;
    let cancelled = false;
    const PROPUESTA_TEMPLATE_ID = "64b8da33-e0ba-41fd-af94-4e3afde2dfc3";
    (async () => {
      const { data } = await supabase
        .from("generated_documents")
        .select("id, created_at, merged_data, buyer_id, signature_status")
        .eq("seller_lead_id", encargo.seller_lead_id)
        .eq("template_id", PROPUESTA_TEMPLATE_ID)
        .in("signature_status", ["buyer_signed", "completed"])
        .order("created_at", { ascending: false });
      if (cancelled) return;
      const rows = (data || []) as Array<{ id: string; created_at: string; merged_data: any; buyer_id: string | null; signature_status: string }>;
      const buyerIds = [...new Set(rows.map((r) => r.buyer_id).filter(Boolean))] as string[];
      let nameMap = new Map<string, string>();
      if (buyerIds.length > 0) {
        const { data: demands } = await supabase
          .from("buyers_demands")
          .select("id, name")
          .in("id", buyerIds);
        nameMap = new Map(((demands as any[]) || []).map((d: any) => [d.id, d.name as string]));
      }
      if (!cancelled) {
        setProposals(rows.map((r) => ({ ...r, merged_data: r.merged_data || {}, buyerName: nameMap.get(r.buyer_id!) })));
      }
    })();
    return () => { cancelled = true; };
  }, [encargo?.seller_lead_id, encargo?.id]);

  // Carga por tab (patrón del drawer de EncargosManager)
  useEffect(() => {
    if (!encargo) return;
    let cancelled = false;
    (async () => {
      if (tab === "documentos") {
        const { data } = await supabase
          .from("encargo_documents")
          .select("*")
          .eq("encargo_id", encargo.id)
          .order("uploaded_at", { ascending: false });
        if (!cancelled) setAnexos((data as EncargoDocument[]) || []);

        const { data: docs } = await supabase
          .from("generated_documents")
          .select("id, template_id, signature_status, created_at, document_templates(name)")
          .eq("encargo_id", encargo.id)
          .order("created_at", { ascending: false });
        if (!cancelled) setVinculatedDocs(docs || []);
      } else if (tab === "actividad") {
        // Actividad del comprador vinculada a este inmueble (p.ej. una visita
        // registrada desde /admin/buyers/[id] con "Vincular a Inmueble").
        // Se EXCLUYEN los tipos que F3.4 ya espeja en el log del vendedor
        // (Propuesta/firmas) para no duplicar entradas en la fusión.
        if (!encargo.property_id) {
          if (!cancelled) setBuyerExtraLogs([]);
          return;
        }
        const MIRRORED = ["Propuesta", "Propuesta firmada", "Contrato privado firmado"];
        const { data: buyerLogs } = await supabase
          .from("buyer_activity_logs")
          .select("*")
          .eq("property_id", encargo.property_id)
          .order("event_date", { ascending: false });
        const rows = ((buyerLogs as any[]) || []).filter((l) => !MIRRORED.includes(l.event_type));

        // Nombre del comprador para el badge de procedencia.
        const demandIds = Array.from(new Set(rows.map((l) => l.buyer_id).filter(Boolean)));
        let namesById = new Map<string, string>();
        if (demandIds.length > 0) {
          const { data: demands } = await supabase
            .from("buyers_demands")
            .select("id, name")
            .in("id", demandIds);
          namesById = new Map(((demands as any[]) || []).map((d) => [d.id, d.name]));
        }

        if (!cancelled) {
          setBuyerExtraLogs(
            rows.map((l) => ({
              id: `buyer-${l.id}`,
              event_type: l.event_type,
              title: l.title,
              notes: l.notes,
              event_date: l.event_date,
              iconConfig: getBuyerTimelineIconConfig(l.event_type),
              badge: `Comprador · ${namesById.get(l.buyer_id) || "—"}`,
            })),
          );
        }
      } else if (tab === "publicacion") {
        const { data: props } = await supabase
          .from("properties")
          .select("id, title, status, images, features")
          .order("created_at", { ascending: false });
        if (!cancelled) setAvailableProperties(props || []);

        if (encargo.property_id) {
          const linked = (props || []).find((p: any) => p.id === encargo.property_id) || null;
          if (!cancelled) setLinkedProperty(linked);
          const [visitsRes, apptsRes] = await Promise.all([
            supabase.from("web_visits").select("page_path"),
            supabase.from("appointments").select("id").eq("property_id", encargo.property_id),
          ]);
          const visits = ((visitsRes.data as { page_path: string }[]) || [])
            .filter((v) => v.page_path?.includes(encargo.property_id as string)).length;
          if (!cancelled) setPropMetrics({ visits, appointments: (apptsRes.data || []).length });
        } else {
          if (!cancelled) {
            setLinkedProperty(null);
            setPropMetrics(null);
          }
        }
      }
    })();
    return () => { cancelled = true; };
  }, [tab, encargo]);

  const saveResumen = async () => {
    if (!encargo) return;
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
      await fetchEncargo();
    } catch (err: any) {
      toast.error(err.message || "No se pudo actualizar");
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (newStatus: EncargoStatus) => {
    if (!encargo) return;
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
      await fetchEncargo();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Documentos ───────────────────────────────────────────────────────────
  const uploadAnexo = async (kind: EncargoDocumentKind, file: File) => {
    if (!encargo) return;
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
      label: kind === "otros" ? file.name : KIND_LABELS[kind],
      file_url: path,
      file_size_bytes: file.size,
      mime_type: file.type || null,
    });
    const { data } = await supabase
      .from("encargo_documents")
      .select("*")
      .eq("encargo_id", encargo.id)
      .order("uploaded_at", { ascending: false });
    setAnexos((data as EncargoDocument[]) || []);
    toast.success("Documento subido");
  };

  const deleteAnexo = async (anexo: EncargoDocument) => {
    if (!confirm("¿Eliminar este documento del expediente?")) return;
    await supabase.storage.from("encargo-files").remove([anexo.file_url]).catch(() => {});
    await supabase.from("encargo_documents").delete().eq("id", anexo.id);
    setAnexos((prev) => prev.filter((a) => a.id !== anexo.id));
  };

  const handleDownload = async (anexo: EncargoDocument) => {
    const { data } = await supabase.storage.from("encargo-files").createSignedUrl(anexo.file_url, 60 * 5);
    if (!data?.signedUrl) {
      toast.error("No se pudo generar enlace de descarga");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  };

  // ── Publicación web ──────────────────────────────────────────────────────
  const setLinkedPropertyId = async (propertyId: string | null) => {
    if (!encargo) return;
    setLinking(true);
    try {
      const res = await fetch(`/api/encargos/${encargo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ property_id: propertyId }),
      });
      if (!res.ok) throw new Error((await res.json())?.error || "Error");
      toast.success(propertyId ? "Inmueble vinculado al encargo" : "Inmueble desvinculado");
      await fetchEncargo();
    } catch (err: any) {
      toast.error(err.message || "No se pudo actualizar el vínculo");
    } finally {
      setLinking(false);
    }
  };

  // ── Side-effect del timeline: 'Notaría' → cita type='cierre' (D11) ───────
  const handleEventCreated = async (event: { event_type: string; title: string; notes: string | null; event_date: string }) => {
    if (event.event_type !== "Notaría" || !encargo?.seller_lead_id) return;
    const { error } = await supabase.from("appointments").insert({
      lead_id: encargo.seller_lead_id,
      property_id: encargo.property_id || null,
      scheduled_at: event.event_date,
      type: "cierre",
      status: "pending",
      title: `🏛️ Notaría: ${encargo.direccion || "encargo"}`,
      notes: event.notes || event.title || null,
    });
    if (error) {
      console.error("[EncargoProfile] cita notaría:", error.message);
      toast.error("Hito guardado, pero no se pudo crear la cita de cierre");
    } else {
      toast.success("Cita de cierre (Notaría) creada en el Calendario 🏛️");
    }
  };

  // F4.3: acepta una propuesta buyer_signed → genera doc Aceptación para el vendedor.
  const handleAcceptProposal = async (proposalId: string) => {
    if (!encargo || !lead?.email) {
      toast.error("El vendedor no tiene email registrado. Añádelo en su ficha antes de aceptar.");
      return;
    }
    if (!confirm("¿Enviar la aceptación de propuesta al vendedor para su firma?")) return;
    setAcceptingProposalId(proposalId);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          encargoId: encargo.id,
          sellerLeadId: encargo.seller_lead_id,
          sellerName: lead.name,
          sellerEmail: lead.email,
          propertyId: encargo.property_id || null,
          direccion: encargo.direccion || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Error al enviar la aceptación");
      toast.success("Aceptación enviada al vendedor por email (Documenso).");
      setSentProposals((prev) => new Set([...prev, proposalId]));
    } catch (err: any) {
      toast.error(err.message || "No se pudo enviar la aceptación");
    } finally {
      setAcceptingProposalId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#FBBF24]" />
      </div>
    );
  }

  if (notFound || !encargo) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex flex-col items-center justify-center text-center p-6 space-y-4">
        <Compass className="text-slate-500" size={48} />
        <h1 className="text-white font-bold text-lg">Encargo no encontrado</h1>
        <Link href="/admin/dashboard" className="text-[#FBBF24] text-sm font-bold hover:underline">
          ← Volver al dashboard
        </Link>
      </div>
    );
  }

  const expectedFee =
    encargo.precio_captacion && encargo.honorarios_pct
      ? Number(encargo.precio_captacion) * (Number(encargo.honorarios_pct) / 100)
      : 0;

  const TABS: { id: ProfileTab; label: string }[] = [
    { id: "resumen", label: "Resumen" },
    { id: "documentos", label: "Documentos" },
    { id: "actividad", label: "Actividad" },
    { id: "publicacion", label: "Publicación web" },
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
              <div className="w-14 h-14 rounded-xl bg-[#FBBF24]/10 border border-[#FBBF24]/20 flex items-center justify-center text-[#FBBF24]">
                <Briefcase size={26} />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-[#FBBF24] font-bold">Expediente digital</p>
                <h1 className="text-xl font-black text-white">{encargo.direccion || "Inmueble sin dirección"}</h1>
                <div className="flex flex-wrap items-center gap-3 mt-1.5">
                  {encargo.seller_lead_id ? (
                    <Link
                      href={`/admin/sellers/${encargo.seller_lead_id}`}
                      className="flex items-center gap-1 text-xs text-slate-400 hover:text-[#FBBF24] transition-colors"
                    >
                      <User size={12} className="text-[#FBBF24]" /> {lead?.name || "Ver vendedor"}
                    </Link>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      <User size={12} /> Sin vendedor vinculado
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-[10px] text-slate-500">
                    <Calendar size={11} /> Firmado: {fmtDate(encargo.fecha_firma)}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-emerald-300">
                    {encargo.honorarios_pct ? `${encargo.honorarios_pct}% · ${formatCurrency(expectedFee)}` : "Honorarios sin definir"}
                  </span>
                </div>
              </div>
            </div>

            <span className={`px-4 py-1.5 text-xs font-bold rounded-full border w-fit capitalize ${STATUS_BADGE[encargo.status] || STATUS_BADGE.cancelado}`}>
              {encargo.status}
            </span>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-white/5 -mb-6 -mx-6 px-6 pt-2 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-3 text-xs font-bold transition-all border-b-2 whitespace-nowrap ${
                  tab === t.id ? "text-[#FBBF24] border-[#FBBF24]" : "text-slate-400 border-transparent hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── TAB: RESUMEN ─────────────────────────────────────────────────── */}
        {tab === "resumen" && (
          <div className="space-y-6">
            <div className="bg-[#1E293B] border border-white/5 rounded-2xl p-6 shadow-xl space-y-3">
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
              <div className="flex items-center justify-between gap-2 pt-3 border-t border-white/5 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  {encargo.status === "activo" ? (
                    <>
                      <button onClick={() => void changeStatus("vendido")} disabled={saving}
                        className="text-[11px] font-bold text-white bg-sky-600 hover:bg-sky-500 px-3 py-1.5 rounded-lg">Marcar vendido</button>
                      <button onClick={() => void changeStatus("caducado")} disabled={saving}
                        className="text-[11px] font-bold text-white bg-amber-600 hover:bg-amber-500 px-3 py-1.5 rounded-lg">Marcar caducado</button>
                      <button onClick={() => void changeStatus("cancelado")} disabled={saving}
                        className="text-[11px] font-bold text-slate-200 bg-slate-600 hover:bg-slate-500 px-3 py-1.5 rounded-lg">Cancelar</button>
                    </>
                  ) : (
                    <button onClick={() => void changeStatus("activo")} disabled={saving}
                      className="text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 rounded-lg">Reactivar</button>
                  )}
                </div>
                <button onClick={() => void saveResumen()} disabled={saving}
                  className="text-xs font-extrabold text-[#2C3E50] bg-[#FBBF24] hover:bg-yellow-500 px-4 py-2 rounded-xl disabled:opacity-50">
                  {saving ? "Guardando…" : "Guardar cambios"}
                </button>
              </div>
            </div>

            {/* F4.3/F4.4: Gate de propuestas */}
            <div className="bg-[#1E293B] border border-white/5 rounded-2xl p-6 shadow-xl">
              <h2 className="text-xs font-black text-[#FBBF24] uppercase tracking-wider flex items-center gap-2 mb-4">
                <FileText size={14} /> Propuestas recibidas
              </h2>
              {!encargo.seller_lead_id ? (
                <p className="text-[11px] text-slate-500 italic">
                  El encargo no tiene vendedor vinculado.
                </p>
              ) : proposals.length === 0 ? (
                <p className="text-[11px] text-slate-500 italic">
                  Ningún comprador ha firmado aún una propuesta sobre este encargo.
                </p>
              ) : (
                <ul className="space-y-3">
                  {proposals.map((p) => (
                    <li
                      key={p.id}
                      className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 border ${
                        p.signature_status === "completed"
                          ? "bg-emerald-500/5 border-emerald-500/20"
                          : "bg-[#0F172A]/60 border-amber-500/20"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">
                          {p.buyerName || p.merged_data?.["comprador.nombre"] || "Comprador desconocido"}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Firmada el {fmtDate(p.created_at)} ·{" "}
                          {p.signature_status === "completed" ? (
                            <span className="text-emerald-300 font-bold">Propuesta aceptada</span>
                          ) : sentProposals.has(p.id) ? (
                            <span className="text-amber-300 font-bold">Aceptación enviada al vendedor</span>
                          ) : (
                            <span className="text-amber-300 font-bold">Pendiente de aceptar</span>
                          )}
                        </p>
                      </div>
                      {p.signature_status === "completed" ? (
                        <Link
                          href={`/admin/dashboard?docKind=contrato&docLeadId=${encargo.seller_lead_id}&docEncargoId=${encargo.id}${p.buyer_id ? `&docBuyerId=${p.buyer_id}` : ""}`}
                          className="text-xs font-extrabold text-[#2C3E50] bg-emerald-400 hover:bg-emerald-300 px-4 py-2 rounded-xl whitespace-nowrap"
                        >
                          Generar Contrato privado
                        </Link>
                      ) : sentProposals.has(p.id) ? (
                        <span className="text-[11px] text-amber-300/70 italic whitespace-nowrap">
                          En espera de firma del vendedor…
                        </span>
                      ) : (
                        <button
                          onClick={() => void handleAcceptProposal(p.id)}
                          disabled={acceptingProposalId === p.id}
                          className="text-xs font-extrabold text-[#2C3E50] bg-[#FBBF24] hover:bg-yellow-500 px-4 py-2 rounded-xl disabled:opacity-50 whitespace-nowrap"
                        >
                          {acceptingProposalId === p.id ? "Enviando…" : "Aceptar propuesta"}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* ── TAB: DOCUMENTOS ──────────────────────────────────────────────── */}
        {tab === "documentos" && (
          <div className="bg-[#1E293B] border border-white/5 rounded-2xl p-6 shadow-xl space-y-5">
            <section>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-2 flex items-center gap-1.5">
                <FileText size={12} /> Nota de encargo
              </h3>
              {encargo.nota_encargo_doc_id ? (
                <a
                  href={`/api/documents/${encargo.nota_encargo_doc_id}/download`}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-300 hover:text-white text-xs font-bold rounded-xl border border-emerald-500/30 transition-all"
                >
                  <Download size={13} /> Descargar Nota de Encargo firmada
                </a>
              ) : (
                <p className="text-[11px] text-slate-500 italic">Sin Nota de Encargo vinculada. Créala desde el apartado Documentos del dashboard.</p>
              )}
            </section>

            <section>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-2 flex items-center gap-1.5">
                <Upload size={12} /> Documentación adjunta
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                {(Object.keys(KIND_LABELS) as EncargoDocumentKind[]).map((k) => (
                  <label key={k} className="flex items-center justify-center gap-1.5 px-3 py-2 bg-[#0F172A] hover:bg-[#0F172A]/80 border border-white/10 hover:border-[#FBBF24]/40 rounded-xl text-[11px] font-bold text-slate-300 hover:text-white cursor-pointer transition-all">
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
                    <li key={a.id} className="flex items-center gap-2 bg-[#0F172A]/60 border border-white/5 rounded-xl px-3 py-2">
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

            {vinculatedDocs.length > 0 && (
              <section>
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-2">Otros documentos firmados vinculados</h3>
                <ul className="space-y-1.5">
                  {vinculatedDocs.map((d) => (
                    <li key={d.id} className="text-[11px] text-slate-300 flex items-center justify-between bg-[#0F172A]/40 px-3 py-2 rounded-lg">
                      <span>{(d as any).document_templates?.name || `doc ${String(d.id).slice(0, 8)}`} · {d.signature_status}</span>
                      <a href={`/api/documents/${d.id}/download`} className="text-[#FBBF24] hover:text-yellow-300">Descargar</a>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        {/* ── TAB: ACTIVIDAD ───────────────────────────────────────────────── */}
        {tab === "actividad" && (
          <div className="bg-[#1E293B] border border-white/5 rounded-2xl p-6 shadow-xl space-y-4">
            <h2 className="text-xs font-black text-[#FBBF24] uppercase tracking-wider flex items-center gap-2">
              <Clock size={14} /> Actividad del expediente
            </h2>
            {encargo.seller_lead_id ? (
              <ActivityTimeline
                table="seller_activity_logs"
                ownerColumn="lead_id"
                ownerId={encargo.seller_lead_id}
                eventTypes={ENCARGO_EVENT_TYPES}
                getIconConfig={getSellerTimelineIconConfig}
                filterPropertyId={encargo.property_id || undefined}
                insertExtras={{ property_id: encargo.property_id || null }}
                extraLogs={buyerExtraLogs}
                onEventCreated={handleEventCreated}
                scopeNote={
                  encargo.property_id
                    ? undefined
                    : "Timeline del vendedor: el encargo no tiene inmueble vinculado, se muestran todos sus eventos."
                }
              />
            ) : (
              <p className="text-[11px] text-slate-500 italic">
                El encargo no tiene vendedor vinculado: no hay timeline disponible.
              </p>
            )}
          </div>
        )}

        {/* ── TAB: PUBLICACIÓN WEB ─────────────────────────────────────────── */}
        {tab === "publicacion" && (
          <div className="bg-[#1E293B] border border-white/5 rounded-2xl p-6 shadow-xl space-y-4">
            {encargo.property_id && linkedProperty ? (
              <>
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-emerald-300">Inmueble vinculado</p>
                      <p className="text-xs text-white font-semibold mt-1">{linkedProperty.title}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Estado: {linkedProperty.status} · ref {String(encargo.property_id).slice(0, 8)}</p>
                    </div>
                    <button
                      onClick={() => void setLinkedPropertyId(null)}
                      disabled={linking}
                      className="text-[11px] font-bold text-rose-300 bg-rose-500/10 hover:bg-rose-500 hover:text-white border border-rose-500/30 px-3 py-1.5 rounded-lg disabled:opacity-50"
                    >
                      Desvincular
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#0F172A]/60 border border-white/5 rounded-xl p-4">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Visitas web</span>
                    <span className="text-2xl font-extrabold text-sky-400 mt-1 block">{propMetrics?.visits ?? "—"}</span>
                  </div>
                  <div className="bg-[#0F172A]/60 border border-white/5 rounded-xl p-4">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Citas agendadas</span>
                    <span className="text-2xl font-extrabold text-[#FBBF24] mt-1 block">{propMetrics?.appointments ?? "—"}</span>
                  </div>
                </div>
                <p className="text-[10px] text-slate-500">
                  Las visitas web se cuentan por las páginas cuya ruta incluye el id del inmueble (misma fuente que el panel de Operaciones; el detalle del modal de /comprar cuenta desde F1.4). La ficha pública se edita en el apartado Inmuebles.
                </p>
              </>
            ) : (
              <div className="space-y-3">
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                  <p className="text-sm font-bold text-amber-300">Sin inmueble vinculado</p>
                  <p className="text-[11px] text-slate-300 mt-1">
                    Vincula aquí el anuncio publicado en la web para ver sus métricas (visitas y citas) dentro del expediente. Crea el inmueble en el apartado Inmuebles si aún no existe.
                  </p>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Vincular inmueble publicado</label>
                  <select
                    defaultValue=""
                    disabled={linking}
                    onChange={(e) => { if (e.target.value) void setLinkedPropertyId(e.target.value); }}
                    className="w-full bg-[#0F172A] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#FBBF24]"
                  >
                    <option value="">— Selecciona un inmueble —</option>
                    {availableProperties.map((p) => (
                      <option key={p.id} value={p.id}>{p.title} ({p.status})</option>
                    ))}
                  </select>
                  {availableProperties.length === 0 && (
                    <p className="text-[11px] text-slate-500 mt-1">No hay inmuebles. Crea uno en el apartado Inmuebles.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
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
          className="w-full bg-[#0F172A] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#FBBF24]"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-[#0F172A] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#FBBF24]"
        />
      )}
    </div>
  );
}
