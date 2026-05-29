"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import {
  FileText,
  Plus,
  Save,
  Trash2,
  Printer,
  Sparkles,
  FilePlus2,
  X,
  Clock,
} from "lucide-react";
import toast from "react-hot-toast";

// ─── TYPES ──────────────────────────────────────────────────────────────
interface DocumentTemplate {
  id: string;
  name: string;
  category: string;
  body: string;
  is_active: boolean;
  created_at: string;
}

interface GeneratedDocument {
  id: string;
  template_id: string | null;
  property_id: string | null;
  buyer_id: string | null;
  merged_data: Record<string, unknown>;
  signature_status: string;
  created_at: string;
}

interface EncargoProperty {
  id: string;
  title: string;
  price: number;
  features: Record<string, any> | null;
}

interface BuyerDemand {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

interface SellerLead {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  property_id: string | null;
  preferences: Record<string, any> | null;
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  draft: { label: "Borrador", cls: "bg-slate-500/15 text-slate-300" },
  sent: { label: "Enviado a firmar", cls: "bg-sky-500/15 text-sky-300" },
  viewed: { label: "Visto", cls: "bg-amber-500/15 text-amber-300" },
  completed: { label: "Firmado", cls: "bg-emerald-500/15 text-emerald-300" },
  rejected: { label: "Rechazado", cls: "bg-red-500/15 text-red-300" },
};

/**
 * Sección admin "Documentos" (Fase 4b).
 *
 * Dos vistas: gestión de plantillas (CRUD con placeholders {{...}}) y generación
 * de documentos autorellenados desde encargo + comprador. La generación guarda un
 * registro en `generated_documents` (estado 'draft') y abre una vista imprimible.
 * El envío a firma (Documenso) y el webhook de estado llegan en 4c/4d.
 */
export default function DocumentsManager() {
  const [view, setView] = useState<"plantillas" | "generar">("generar");
  const [loading, setLoading] = useState(true);

  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [properties, setProperties] = useState<EncargoProperty[]>([]);
  const [buyers, setBuyers] = useState<BuyerDemand[]>([]);
  const [sellerLeads, setSellerLeads] = useState<SellerLead[]>([]);
  const [generated, setGenerated] = useState<GeneratedDocument[]>([]);

  // Editor de plantilla
  const [editingTemplate, setEditingTemplate] = useState<DocumentTemplate | null>(null);

  // Generación
  const [genTemplateId, setGenTemplateId] = useState("");
  const [genPropertyId, setGenPropertyId] = useState("");
  const [genBuyerId, setGenBuyerId] = useState("");
  const [previewDoc, setPreviewDoc] = useState<{ name: string; text: string } | null>(null);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [
        { data: tpls },
        { data: props },
        { data: buyersData },
        { data: leadsData },
        { data: gens },
      ] = await Promise.all([
        supabase.from("document_templates").select("*").order("created_at", { ascending: false }),
        supabase.from("properties").select("id, title, price, features").eq("features->>is_encargo", "true"),
        supabase.from("buyers_demands").select("id, name, phone, email"),
        supabase.from("leads").select("id, name, phone, email, property_id, preferences").eq("type", "seller"),
        supabase.from("generated_documents").select("*").order("created_at", { ascending: false }),
      ]);

      setTemplates((tpls || []) as DocumentTemplate[]);
      setProperties((props || []) as EncargoProperty[]);
      setBuyers((buyersData || []) as BuyerDemand[]);
      setSellerLeads((leadsData || []) as SellerLead[]);
      setGenerated((gens || []) as GeneratedDocument[]);

      if (tpls && tpls.length > 0) setGenTemplateId((tpls[0] as DocumentTemplate).id);
      if (props && props.length > 0) setGenPropertyId((props[0] as EncargoProperty).id);
    } catch (err) {
      console.error("Error cargando documentos:", err);
      toast.error("No se pudieron cargar los documentos");
    } finally {
      setLoading(false);
    }
  };

  // ─── MERGE DE PLACEHOLDERS ──────────────────────────────────────────────
  /** Construye el diccionario plano de valores para una combinación encargo+comprador. */
  const buildContext = (
    property?: EncargoProperty,
    buyer?: BuyerDemand,
  ): Record<string, string> => {
    const seller = property
      ? sellerLeads.find((l) => l.property_id === property.id)
      : undefined;
    const prefs = seller?.preferences || {};
    const price = Number(property?.price || 0);
    const commPct = Number(prefs.commission_pct || 0);
    const honorarios = price > 0 && commPct > 0 ? price * (commPct / 100) : 0;

    const fmt = (n: number) => (n > 0 ? `${n.toLocaleString("es-ES")} €` : "________");

    return {
      fecha: new Date().toLocaleDateString("es-ES"),
      lugar: prefs.city || "Sevilla",
      "vendedor.nombre": seller?.name || "________",
      "vendedor.telefono": seller?.phone || "________",
      "vendedor.email": seller?.email || "________",
      "inmueble.direccion": prefs.property_address || property?.features?.address || property?.title || "________",
      "inmueble.tipo": prefs.property_type || property?.features?.propertyType || "________",
      "inmueble.m2": String(prefs.sqm || property?.features?.sqm || "________"),
      precio: fmt(price),
      comision_pct: commPct > 0 ? `${commPct}` : "________",
      honorarios: fmt(honorarios),
      "comprador.nombre": buyer?.name || "________",
      "comprador.telefono": buyer?.phone || "________",
      "comprador.email": buyer?.email || "________",
    };
  };

  /** Reemplaza {{clave}} por su valor; deja una línea de relleno si no hay dato. */
  const mergeBody = (body: string, ctx: Record<string, string>): string =>
    body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => ctx[key] ?? "________");

  // ─── PLANTILLAS: CRUD ───────────────────────────────────────────────────
  const handleSaveTemplate = async () => {
    if (!editingTemplate) return;
    if (!editingTemplate.name.trim() || !editingTemplate.body.trim()) {
      toast.error("Nombre y cuerpo son obligatorios");
      return;
    }
    try {
      if (editingTemplate.id) {
        const { error } = await supabase
          .from("document_templates")
          .update({
            name: editingTemplate.name,
            category: editingTemplate.category,
            body: editingTemplate.body,
            is_active: editingTemplate.is_active,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingTemplate.id);
        if (error) throw error;
        toast.success("Plantilla actualizada");
      } else {
        const { error } = await supabase.from("document_templates").insert({
          name: editingTemplate.name,
          category: editingTemplate.category || "Otros",
          body: editingTemplate.body,
        });
        if (error) throw error;
        toast.success("Plantilla creada");
      }
      setEditingTemplate(null);
      fetchAll();
    } catch (err) {
      console.error("Error guardando plantilla:", err);
      toast.error("No se pudo guardar la plantilla");
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm("¿Eliminar esta plantilla? Los documentos ya generados se conservan.")) return;
    try {
      const { error } = await supabase.from("document_templates").delete().eq("id", id);
      if (error) throw error;
      toast.success("Plantilla eliminada");
      fetchAll();
    } catch (err) {
      console.error("Error eliminando plantilla:", err);
      toast.error("No se pudo eliminar");
    }
  };

  // ─── GENERAR DOCUMENTO ──────────────────────────────────────────────────
  const handleGenerate = async () => {
    const template = templates.find((t) => t.id === genTemplateId);
    const property = properties.find((p) => p.id === genPropertyId);
    const buyer = buyers.find((b) => b.id === genBuyerId);
    if (!template) {
      toast.error("Selecciona una plantilla");
      return;
    }

    const ctx = buildContext(property, buyer);
    const text = mergeBody(template.body, ctx);
    const seller = property ? sellerLeads.find((l) => l.property_id === property.id) : undefined;

    try {
      const { error } = await supabase.from("generated_documents").insert({
        template_id: template.id,
        property_id: property?.id || null,
        buyer_id: buyer?.id || null,
        seller_lead_id: seller?.id || null,
        merged_data: ctx,
        signature_status: "draft",
      });
      if (error) throw error;
      toast.success("Documento generado (borrador guardado)");
      setPreviewDoc({ name: template.name, text });
      fetchAll();
    } catch (err) {
      console.error("Error generando documento:", err);
      toast.error("No se pudo guardar el documento generado");
    }
  };

  // ─── RENDER ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#FBBF24]"></div>
        <p className="text-slate-400 text-sm">Cargando plantillas y documentos...</p>
      </div>
    );
  }

  return (
    <div className="bg-[#1E293B] p-4 md:p-6 rounded-2xl border border-white/5 min-h-[500px] space-y-6">
      {/* Header + view switch */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
            <FileText className="text-[#FBBF24]" size={24} />
            Documentos & Plantillas
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Genera documentos autorellenados desde tus encargos. La firma digital (Documenso) llegará en breve.
          </p>
        </div>
        <div className="flex bg-slate-900/60 p-1 rounded-xl border border-white/5 self-start">
          <button
            onClick={() => setView("generar")}
            className={`px-4 py-2 rounded-lg font-bold text-xs md:text-sm transition-all ${view === "generar" ? "bg-[#FBBF24] text-[#2C3E50]" : "text-slate-400 hover:text-white"}`}
          >
            Generar
          </button>
          <button
            onClick={() => setView("plantillas")}
            className={`px-4 py-2 rounded-lg font-bold text-xs md:text-sm transition-all ${view === "plantillas" ? "bg-[#FBBF24] text-[#2C3E50]" : "text-slate-400 hover:text-white"}`}
          >
            Plantillas
          </button>
        </div>
      </div>

      {/* ─── VISTA GENERAR ─────────────────────────────────────────────── */}
      {view === "generar" && (
        <div className="space-y-6">
          <div className="bg-slate-900/40 border border-[#FBBF24]/20 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2 text-[#FBBF24] font-bold text-xs uppercase tracking-widest">
              <Sparkles size={16} /> Generador con autorrelleno
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">Plantilla</label>
                <select
                  value={genTemplateId}
                  onChange={(e) => setGenTemplateId(e.target.value)}
                  className="w-full bg-[#0F172A] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                >
                  {templates.length === 0 && <option value="">Sin plantillas</option>}
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">Encargo (inmueble)</label>
                <select
                  value={genPropertyId}
                  onChange={(e) => setGenPropertyId(e.target.value)}
                  className="w-full bg-[#0F172A] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                >
                  <option value="">— Ninguno —</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">Comprador (opcional)</label>
                <select
                  value={genBuyerId}
                  onChange={(e) => setGenBuyerId(e.target.value)}
                  className="w-full bg-[#0F172A] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                >
                  <option value="">— Ninguno —</option>
                  {buyers.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={templates.length === 0}
              className="flex items-center gap-2 bg-[#FBBF24] hover:bg-yellow-500 disabled:opacity-50 text-[#2C3E50] font-extrabold px-5 py-2.5 rounded-xl transition-all active:scale-95"
            >
              <FilePlus2 size={16} /> Generar documento
            </button>
            <p className="text-[11px] text-slate-500">
              Los campos sin dato en la BD (DNI, referencia catastral, duración…) se dejan como línea de relleno para completar a mano antes de firmar.
            </p>
          </div>

          {/* Documentos generados */}
          <div>
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Clock size={15} className="text-slate-400" /> Documentos generados
            </h3>
            {generated.length === 0 ? (
              <p className="text-slate-500 text-sm bg-slate-900/30 border border-white/5 rounded-xl p-4 text-center">
                Aún no has generado ningún documento.
              </p>
            ) : (
              <div className="space-y-2">
                {generated.map((g) => {
                  const tpl = templates.find((t) => t.id === g.template_id);
                  const prop = properties.find((p) => p.id === g.property_id);
                  const st = STATUS_LABEL[g.signature_status] || STATUS_LABEL.draft;
                  return (
                    <div key={g.id} className="flex items-center justify-between bg-slate-900/40 border border-white/5 rounded-xl px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">{tpl?.name || "Plantilla eliminada"}</p>
                        <p className="text-[11px] text-slate-400 truncate">
                          {prop?.title || "Sin inmueble"} · {new Date(g.created_at).toLocaleDateString("es-ES")}
                        </p>
                      </div>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded shrink-0 ${st.cls}`}>
                        {st.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── VISTA PLANTILLAS ──────────────────────────────────────────── */}
      {view === "plantillas" && (
        <div className="space-y-4">
          <button
            onClick={() => setEditingTemplate({ id: "", name: "", category: "Otros", body: "", is_active: true, created_at: "" })}
            className="flex items-center gap-2 bg-[#FBBF24] hover:bg-yellow-500 text-[#2C3E50] font-extrabold px-4 py-2.5 rounded-xl transition-all active:scale-95"
          >
            <Plus size={16} /> Nueva plantilla
          </button>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {templates.map((t) => (
              <div key={t.id} className="bg-slate-900/40 border border-white/5 rounded-2xl p-4 flex flex-col">
                <div className="flex justify-between items-start gap-2 mb-2">
                  <div>
                    <p className="font-bold text-white">{t.name}</p>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#FBBF24] bg-[#FBBF24]/10 px-2 py-0.5 rounded">{t.category}</span>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => setEditingTemplate(t)} className="text-slate-400 hover:text-white p-1.5 hover:bg-white/10 rounded-lg" title="Editar">
                      <FileText size={15} />
                    </button>
                    <button onClick={() => handleDeleteTemplate(t.id)} className="text-slate-400 hover:text-red-400 p-1.5 hover:bg-white/10 rounded-lg" title="Eliminar">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 line-clamp-3 whitespace-pre-wrap">{t.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── MODAL: EDITOR DE PLANTILLA ────────────────────────────────── */}
      {editingTemplate && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-[#1E293B] border border-white/10 rounded-2xl w-full max-w-3xl my-auto shadow-2xl">
            <div className="flex justify-between items-center px-6 py-4 border-b border-white/10">
              <h3 className="text-lg font-bold text-white">{editingTemplate.id ? "Editar plantilla" : "Nueva plantilla"}</h3>
              <button onClick={() => setEditingTemplate(null)} className="text-slate-400 hover:text-white p-1 hover:bg-white/10 rounded-full">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">Nombre</label>
                  <input
                    value={editingTemplate.name}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                    className="w-full bg-[#0F172A] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                    placeholder="Ej: Nota de Encargo en Exclusiva"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">Categoría</label>
                  <input
                    value={editingTemplate.category}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, category: e.target.value })}
                    className="w-full bg-[#0F172A] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                    placeholder="Nota de encargo"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">
                  Cuerpo (usa placeholders como <code className="text-[#FBBF24]">{"{{vendedor.nombre}}"}</code>, <code className="text-[#FBBF24]">{"{{inmueble.direccion}}"}</code>, <code className="text-[#FBBF24]">{"{{precio}}"}</code>, <code className="text-[#FBBF24]">{"{{comision_pct}}"}</code>)
                </label>
                <textarea
                  value={editingTemplate.body}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, body: e.target.value })}
                  rows={16}
                  className="w-full bg-[#0F172A] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setEditingTemplate(null)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl transition-all">
                  Cancelar
                </button>
                <button onClick={handleSaveTemplate} className="flex-1 flex items-center justify-center gap-2 bg-[#FBBF24] hover:bg-yellow-500 text-[#2C3E50] font-extrabold py-2.5 rounded-xl transition-all active:scale-95">
                  <Save size={16} /> Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: VISTA PREVIA IMPRIMIBLE ────────────────────────────── */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#1E293B] border border-white/10 rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="bg-slate-900 px-6 py-4 border-b border-white/10 flex justify-between items-center">
              <h4 className="text-white font-extrabold flex items-center gap-2">
                <FileText size={18} className="text-[#FBBF24]" /> {previewDoc.name}
              </h4>
              <div className="flex gap-2">
                <button onClick={() => window.print()} className="px-4 py-2 bg-[#FBBF24] hover:bg-yellow-500 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5">
                  <Printer size={14} /> Imprimir / PDF
                </button>
                <button onClick={() => setPreviewDoc(null)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs">
                  Cerrar
                </button>
              </div>
            </div>
            <div id="printable-doc" className="p-8 overflow-y-auto bg-white text-slate-900 whitespace-pre-wrap text-sm leading-relaxed">
              {previewDoc.text}
            </div>
          </div>
          <style dangerouslySetInnerHTML={{ __html: `
            @media print {
              body * { visibility: hidden; }
              #printable-doc, #printable-doc * { visibility: visible; }
              #printable-doc { position: absolute; left: 0; top: 0; width: 100%; padding: 24px; }
            }
          `}} />
        </div>
      )}
    </div>
  );
}
