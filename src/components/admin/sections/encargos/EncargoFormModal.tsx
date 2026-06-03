"use client";

/**
 * EncargoFormModal
 *
 * Modal "Añadir encargo" del módulo Encargos. Reemplaza al antiguo
 * `PropertyFormModal` que se usaba erróneamente desde `SellersManager`.
 *
 * Flujo:
 *  1. Usuario selecciona un lead vendedor de la lista (sólo leads
 *     `status != 'closed'` — los ya captados no se ofrecen aquí).
 *  2. Opcionalmente vincula una Nota de Encargo FIRMADA del módulo
 *     Documentos (cargada vía join: `generated_documents` cuya plantilla
 *     tiene categoría "Nota de encargo", `signature_status='completed'` y
 *     que aún no esté vinculada a otro encargo).
 *  3. Rellena datos jurídicos (dirección, m², habs, etc.) + económicos
 *     (precio captación, % honorarios, fecha firma, duración).
 *  4. Adjunta documentos operativos (IBI, comunidad, energética, nota
 *     simple, otros con label libre).
 *  5. Guardar → POST /api/encargos. La respuesta devuelve `encargo.id`.
 *     Tras crearlo, se suben los anexos al bucket Supabase Storage
 *     `encargo-files/<encargo_id>/` y se registran en `encargo_documents`.
 *
 * NO genera ni firma documentos: las firmas viven SIEMPRE en el módulo
 * Documentos. Aquí sólo se enlazan documentos ya existentes.
 *
 * @created 2026-06-03 (chat-conversación refactor)
 */

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { X, Save, Upload, FileText, Trash2, Search, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";
import type { Lead, EncargoDocumentKind } from "@/types";

interface NotaEncargoOption {
  id: string;
  template_name: string;
  seller_lead_id: string | null;
  documenso_id: string | null;
  signed_at: string;
  merged_data: Record<string, unknown>;
}

interface PendingAnexo {
  id: string;            // uuid temporal solo para key React
  kind: EncargoDocumentKind;
  label: string;         // descripción libre (sólo se persiste si kind='otros')
  file: File;
}

const KIND_LABELS: Record<EncargoDocumentKind, string> = {
  ibi: "IBI (recibo)",
  comunidad: "Recibo de comunidad",
  energetica: "Certificado energético",
  nota_simple: "Nota simple registral",
  otros: "Otros (libre)",
};

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (encargoId: string) => void;
  /** Lead pre-seleccionado si vienes desde "Promover a encargo" en Vendedores. */
  prefilledLeadId?: string;
}

export default function EncargoFormModal({ open, onClose, onCreated, prefilledLeadId }: Props) {
  // ── Selectores ──
  const [sellerLeads, setSellerLeads] = useState<Lead[]>([]);
  const [notas, setNotas] = useState<NotaEncargoOption[]>([]);
  const [loadingLookups, setLoadingLookups] = useState(false);

  // ── Form state ──
  const [leadId, setLeadId] = useState<string>(prefilledLeadId || "");
  const [notaId, setNotaId] = useState<string>("");
  const [direccion, setDireccion] = useState("");
  const [refCatastral, setRefCatastral] = useState("");
  const [sqm, setSqm] = useState("");
  const [rooms, setRooms] = useState("");
  const [baths, setBaths] = useState("");
  const [precio, setPrecio] = useState("");
  const [honPct, setHonPct] = useState("3");
  const [fechaFirma, setFechaFirma] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [duracion, setDuracion] = useState("6");
  const [notes, setNotes] = useState("");

  // ── Anexos ──
  const [anexos, setAnexos] = useState<PendingAnexo[]>([]);
  const [saving, setSaving] = useState(false);

  // ── Búsqueda en selector de leads ──
  const [leadSearch, setLeadSearch] = useState("");

  // Carga selectores al abrir
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoadingLookups(true);
      try {
        // 1) Leads vendedores en captación (status != 'closed').
        const { data: leads } = await supabase
          .from("leads")
          .select("*")
          .eq("type", "seller")
          .neq("status", "closed")
          .order("created_at", { ascending: false });
        if (!cancelled) setSellerLeads((leads as Lead[]) || []);

        // 2) Notas de Encargo firmadas y aún no vinculadas a un encargo.
        //    El join con document_templates filtra por categoría.
        const { data: tpls } = await supabase
          .from("document_templates")
          .select("id, name, category")
          .ilike("category", "%encargo%");
        const tplIds = (tpls || []).map((t: any) => t.id);
        if (tplIds.length === 0) {
          if (!cancelled) setNotas([]);
        } else {
          const { data: docs } = await supabase
            .from("generated_documents")
            .select("id, template_id, seller_lead_id, documenso_id, merged_data, updated_at")
            .in("template_id", tplIds)
            .eq("signature_status", "completed")
            .is("encargo_id", null);
          const tplById = new Map<string, string>(
            (tpls || []).map((t: any) => [t.id, t.name]),
          );
          const mapped: NotaEncargoOption[] = (docs || []).map((d: any) => ({
            id: d.id,
            template_name: tplById.get(d.template_id) || "Nota de encargo",
            seller_lead_id: d.seller_lead_id,
            documenso_id: d.documenso_id,
            signed_at: d.updated_at,
            merged_data: d.merged_data || {},
          }));
          if (!cancelled) setNotas(mapped);
        }
      } catch (err: any) {
        console.error("[EncargoFormModal] error cargando selectores:", err.message);
      } finally {
        if (!cancelled) setLoadingLookups(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  // Reset al cerrar
  useEffect(() => {
    if (!open) {
      setLeadId(prefilledLeadId || "");
      setNotaId("");
      setDireccion("");
      setRefCatastral("");
      setSqm("");
      setRooms("");
      setBaths("");
      setPrecio("");
      setHonPct("3");
      setFechaFirma(new Date().toISOString().slice(0, 10));
      setDuracion("6");
      setNotes("");
      setAnexos([]);
      setLeadSearch("");
    }
  }, [open, prefilledLeadId]);

  // Filtrar notas por lead seleccionado (si hay)
  const notasFiltradas = useMemo(() => {
    if (!leadId) return notas;
    return notas.filter((n) => !n.seller_lead_id || n.seller_lead_id === leadId);
  }, [notas, leadId]);

  // Filtrar leads por búsqueda
  const filteredLeads = useMemo(() => {
    const t = leadSearch.trim().toLowerCase();
    if (!t) return sellerLeads;
    return sellerLeads.filter((l) => {
      return (
        l.name?.toLowerCase().includes(t) ||
        l.phone?.toLowerCase().includes(t) ||
        l.email?.toLowerCase().includes(t)
      );
    });
  }, [sellerLeads, leadSearch]);

  // Auto-rellenar desde la Nota seleccionada
  useEffect(() => {
    if (!notaId) return;
    const nota = notas.find((n) => n.id === notaId);
    if (!nota) return;
    const md = nota.merged_data as Record<string, any>;
    // Soportamos varias claves jerárquicas y planas (las que usa el editor
    // "Pre-rellenar" en DocumentsManager).
    const tryGet = (...keys: string[]): string | undefined => {
      for (const k of keys) {
        const dotted = k.split(".").reduce<any>((o, p) => (o ? o[p] : undefined), md);
        const flat = (md as any)[k];
        const v = dotted ?? flat;
        if (v !== undefined && v !== null && v !== "") return String(v);
      }
      return undefined;
    };
    const dir = tryGet("inmueble.direccion", "direccion", "property.address", "address");
    const cat = tryGet("inmueble.referencia_catastral", "referencia_catastral", "ref_catastral");
    const m  = tryGet("inmueble.sqm", "sqm", "m2");
    const r  = tryGet("inmueble.habitaciones", "habitaciones", "rooms");
    const b  = tryGet("inmueble.banos", "banos", "baths");
    const p  = tryGet("inmueble.precio_salida", "precio_salida", "precio_valoracion", "price");
    const h  = tryGet("honorarios_pct", "honorarios", "comision_pct");
    const d  = tryGet("duracion_meses", "duracion", "plazo_meses");
    if (dir) setDireccion(dir);
    if (cat) setRefCatastral(cat);
    if (m) setSqm(m);
    if (r) setRooms(r);
    if (b) setBaths(b);
    if (p) setPrecio(p);
    if (h) setHonPct(h);
    if (d) setDuracion(d);
    if (nota.seller_lead_id && !leadId) setLeadId(nota.seller_lead_id);
  }, [notaId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Helpers anexos
  const addAnexoFiles = (kind: EncargoDocumentKind, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const next: PendingAnexo[] = [];
    for (let i = 0; i < files.length; i++) {
      next.push({
        id: `${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}`,
        kind,
        label: kind === "otros" ? files[i].name.replace(/\.[^.]+$/, "") : KIND_LABELS[kind],
        file: files[i],
      });
    }
    setAnexos((prev) => [...prev, ...next]);
  };
  const removeAnexo = (id: string) => setAnexos((prev) => prev.filter((a) => a.id !== id));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadId) {
      toast.error("Selecciona un lead vendedor.");
      return;
    }
    setSaving(true);
    try {
      // 1. Crear el encargo en server-side (incluye auto-transición lead).
      const res = await fetch("/api/encargos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seller_lead_id: leadId,
          nota_encargo_doc_id: notaId || null,
          direccion: direccion || null,
          ref_catastral: refCatastral || null,
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
      if (!res.ok || !json?.encargo) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      const encargoId = json.encargo.id as string;

      // 2. Subir anexos al bucket y registrar en encargo_documents.
      if (anexos.length > 0) {
        for (const a of anexos) {
          const safe = a.file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
          const path = `${encargoId}/${a.kind}/${Date.now()}_${safe}`;
          const { error: upErr } = await supabase.storage
            .from("encargo-files")
            .upload(path, a.file, {
              cacheControl: "3600",
              upsert: false,
              contentType: a.file.type || "application/octet-stream",
            });
          if (upErr) {
            console.error("[EncargoFormModal] upload err", upErr.message);
            toast.error(`No se pudo subir ${a.file.name}: ${upErr.message}`);
            continue;
          }
          await supabase.from("encargo_documents").insert({
            encargo_id: encargoId,
            kind: a.kind,
            label: a.label || null,
            file_url: path, // guardamos la ruta dentro del bucket; el download genera signed URL
            file_size_bytes: a.file.size,
            mime_type: a.file.type || null,
          });
        }
      }

      toast.success("Encargo creado correctamente.");
      onCreated(encargoId);
      onClose();
    } catch (err: any) {
      console.error("[EncargoFormModal] submit error:", err.message);
      toast.error(err.message || "No se pudo crear el encargo.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;
  if (typeof window === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <form
        onSubmit={handleSubmit}
        className="bg-[#0F172A] border border-white/10 rounded-2xl w-full max-w-3xl shadow-2xl my-8"
      >
        {/* Cabecera */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <h2 className="text-lg font-bold text-white">Añadir encargo</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Crea el expediente, vincula la Nota de Encargo firmada y adjunta documentación.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-all"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Cuerpo */}
        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* 1) Lead vendedor */}
          <section className="space-y-2">
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Lead vendedor *</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Search size={14} />
              </span>
              <input
                type="text"
                placeholder="Buscar vendedor en captación..."
                value={leadSearch}
                onChange={(e) => setLeadSearch(e.target.value)}
                className="w-full bg-[#1E293B] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#FBBF24]"
              />
            </div>
            <select
              value={leadId}
              onChange={(e) => setLeadId(e.target.value)}
              className="w-full bg-[#1E293B] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#FBBF24]"
              required
            >
              <option value="">— Selecciona vendedor —</option>
              {filteredLeads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} {l.phone ? `· ${l.phone}` : ""}
                </option>
              ))}
            </select>
            {filteredLeads.length === 0 && !loadingLookups && (
              <p className="text-[11px] text-amber-300 flex items-center gap-1.5">
                <AlertTriangle size={11} /> No hay vendedores en captación. Crea primero un lead en Vendedores.
              </p>
            )}
          </section>

          {/* 2) Nota de encargo (opcional) */}
          <section className="space-y-2">
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Nota de encargo firmada (opcional)</label>
            <select
              value={notaId}
              onChange={(e) => setNotaId(e.target.value)}
              className="w-full bg-[#1E293B] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#FBBF24]"
            >
              <option value="">— Sin vincular (la firmaré más tarde desde Documentos) —</option>
              {notasFiltradas.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.template_name} · firmada {new Date(n.signed_at).toLocaleDateString("es-ES")}
                </option>
              ))}
            </select>
            {notaId && (
              <p className="text-[11px] text-slate-400">
                Auto-rellenamos los campos jurídicos desde el documento. Puedes editarlos antes de guardar.
              </p>
            )}
          </section>

          {/* 3) Datos jurídicos */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Dirección del inmueble</label>
              <input
                type="text"
                value={direccion}
                onChange={(e) => setDireccion(e.target.value)}
                className="w-full bg-[#1E293B] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#FBBF24]"
                placeholder="Calle, número, piso, ciudad"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Referencia catastral</label>
              <input
                type="text"
                value={refCatastral}
                onChange={(e) => setRefCatastral(e.target.value)}
                className="w-full bg-[#1E293B] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#FBBF24]"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Superficie (m²)</label>
              <input type="number" min={0} value={sqm} onChange={(e) => setSqm(e.target.value)}
                className="w-full bg-[#1E293B] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#FBBF24]" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Habitaciones</label>
                <input type="number" min={0} value={rooms} onChange={(e) => setRooms(e.target.value)}
                  className="w-full bg-[#1E293B] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#FBBF24]" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Baños</label>
                <input type="number" min={0} value={baths} onChange={(e) => setBaths(e.target.value)}
                  className="w-full bg-[#1E293B] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#FBBF24]" />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Precio captación (€)</label>
              <input type="number" min={0} value={precio} onChange={(e) => setPrecio(e.target.value)}
                className="w-full bg-[#1E293B] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#FBBF24]" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Honorarios (%)</label>
                <input type="number" step={0.1} min={0} value={honPct} onChange={(e) => setHonPct(e.target.value)}
                  className="w-full bg-[#1E293B] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#FBBF24]" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Duración (meses)</label>
                <input type="number" min={1} value={duracion} onChange={(e) => setDuracion(e.target.value)}
                  className="w-full bg-[#1E293B] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#FBBF24]" />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Fecha firma exclusiva</label>
              <input type="date" value={fechaFirma} onChange={(e) => setFechaFirma(e.target.value)}
                className="w-full bg-[#1E293B] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#FBBF24]" />
            </div>
            <div className="md:col-span-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Notas internas</label>
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-[#1E293B] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#FBBF24]"
                placeholder="Detalles, condiciones particulares, propietarios..." />
            </div>
          </section>

          {/* 4) Anexos */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <FileText size={13} /> Documentación adjunta
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {(Object.keys(KIND_LABELS) as EncargoDocumentKind[]).map((k) => (
                <label
                  key={k}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-[#1E293B] hover:bg-[#1E293B]/80 border border-white/10 hover:border-[#FBBF24]/40 rounded-xl text-xs font-bold text-slate-300 hover:text-white cursor-pointer transition-all"
                >
                  <Upload size={12} />
                  {KIND_LABELS[k]}
                  <input
                    type="file"
                    multiple={k === "otros"}
                    className="hidden"
                    onChange={(e) => {
                      addAnexoFiles(k, e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
              ))}
            </div>
            {anexos.length > 0 && (
              <ul className="space-y-1.5">
                {anexos.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 bg-[#1E293B]/60 border border-white/5 rounded-xl px-3 py-2">
                    <FileText size={13} className="text-slate-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase text-[#FBBF24]">{KIND_LABELS[a.kind]}</span>
                        <span className="text-[11px] text-slate-400 truncate">{a.file.name}</span>
                      </div>
                      {a.kind === "otros" && (
                        <input
                          type="text"
                          value={a.label}
                          onChange={(e) => setAnexos((prev) => prev.map((x) => (x.id === a.id ? { ...x, label: e.target.value } : x)))}
                          placeholder="Etiqueta libre (ej: Contrato privado, factura...)"
                          className="mt-1 w-full bg-[#0F172A] border border-white/5 rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-[#FBBF24]"
                        />
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500">{(a.file.size / 1024).toFixed(1)} KB</span>
                    <button
                      type="button"
                      onClick={() => removeAnexo(a.id)}
                      className="p-1.5 hover:bg-rose-500/10 text-rose-400 rounded transition-all"
                      aria-label="Quitar"
                    >
                      <Trash2 size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Pie */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-white/10 bg-[#1E293B]/30">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-xs font-bold text-slate-300 hover:text-white hover:bg-white/5 rounded-xl transition-all disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || !leadId}
            className="flex items-center gap-2 px-4 py-2 text-xs font-extrabold text-[#2C3E50] bg-[#FBBF24] hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all"
          >
            <Save size={14} />
            {saving ? "Guardando…" : "Crear encargo"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
