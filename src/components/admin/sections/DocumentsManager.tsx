"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { renderBrandedHtml, docLayout } from "@/lib/brandedDoc";
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
  UserPlus,
  Users,
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
  seller_lead_id: string | null;
  buyer_id: string | null;
  merged_data: Record<string, unknown>;
  signature_status: string;
  created_at: string;
}

interface SellerLead {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  property_id: string | null;
  preferences: Record<string, any> | null;
}

interface OwnerInput {
  nombre: string;
  dni: string;
  telefono: string;
  email: string;
  direccion: string;
}

interface PartyInput {
  nombre: string;
  nif: string;
  email: string;
}

/** Formulario editable de la "página previa" antes de generar el documento. */
interface GenForm {
  /** "nota" = Nota de encargo (owners=vendedores). "propuesta" = Propuesta de
   *  compraventa (owners=compradores/proponentes + sellers=vendedores).
   *  "contrato" = Contrato privado (mismo modelo de partes que propuesta, con
   *  campos notariales adicionales; se pre-rellena desde una propuesta origen). */
  kind: "nota" | "propuesta" | "contrato";
  /** Sólo en contrato: id de la propuesta de origen que pre-rellenó el form. */
  sourceProposalId?: string;
  templateId: string;
  leadId: string;
  buyerId: string;
  lugar: string;
  fecha: string; // YYYY-MM-DD
  owners: OwnerInput[];
  repEnabled: boolean;
  repNombre: string;
  repDni: string;
  repCalidad: string;
  inmDireccion: string;
  inmTipo: string;
  inmM2: string;
  inmM2Construidos: string;
  inmDatosRegistrales: string;
  inmAnexos: string;
  inmRefCatastral: string;
  cargas: string;
  precio: string;
  honorariosPct: string;
  fechaInicio: string;
  fechaFin: string;
  // ── Propuesta de compraventa ──
  sellers: PartyInput[];
  pagoInicial: string;
  pagoAmpliacion: string;
  pagoRestante: string;
  plazoContrato: string; // YYYY-MM-DD
  plazoEscritura: string; // YYYY-MM-DD
  diasHabiles: string;
  // ── Contrato privado de compraventa ──
  notarioNombre: string;
  notarioCiudad: string;
  notarioFechaEscritura: string; // YYYY-MM-DD
  notarioNumProtocolo: string;
  registroNumero: string;
  registroCiudad: string;
  ibanVendedor: string;
  formaPagoAmpliacion: string;
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  draft: { label: "Borrador", cls: "bg-slate-500/15 text-slate-300" },
  sent: { label: "Enviado a firmar", cls: "bg-sky-500/15 text-sky-300" },
  viewed: { label: "Visto", cls: "bg-amber-500/15 text-amber-300" },
  completed: { label: "Firmado", cls: "bg-emerald-500/15 text-emerald-300" },
  rejected: { label: "Rechazado", cls: "bg-red-500/15 text-red-300" },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const emptyOwner = (): OwnerInput => ({ nombre: "", dni: "", telefono: "", email: "", direccion: "" });
const emptyParty = (): PartyInput => ({ nombre: "", nif: "", email: "" });

/**
 * Sección admin "Documentos" (Fase 4).
 *
 * Generación lead-driven: el documento (p.ej. Nota de encargo) se crea desde un
 * lead vendedor. Antes de generar se abre una "página previa" editable con todos
 * los campos autorrellenados (más los que no están en la ficha: DNI, dirección…),
 * con soporte de varios propietarios y representación. Guarda en
 * `generated_documents` y permite enviar a firmar con Documenso.
 */
export default function DocumentsManager() {
  const [view, setView] = useState<"generar" | "plantillas">("generar");
  const [loading, setLoading] = useState(true);

  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [sellerLeads, setSellerLeads] = useState<SellerLead[]>([]);
  const [generated, setGenerated] = useState<GeneratedDocument[]>([]);

  // Selección inicial (paso 1)
  const [genTemplateId, setGenTemplateId] = useState("");
  const [genLeadId, setGenLeadId] = useState("");
  /** Sólo para contratos: id de la propuesta a usar como origen del autorrelleno. */
  const [genProposalId, setGenProposalId] = useState("");

  // Página previa de edición (paso 2)
  const [form, setForm] = useState<GenForm | null>(null);

  // Editor de plantilla + preview imprimible
  const [editingTemplate, setEditingTemplate] = useState<DocumentTemplate | null>(null);
  const [previewDoc, setPreviewDoc] = useState<{ name: string; html: string } | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [{ data: tpls }, { data: leadsData }, { data: gens }] = await Promise.all([
        supabase.from("document_templates").select("*").order("created_at", { ascending: false }),
        supabase.from("leads").select("id, name, phone, email, property_id, preferences").eq("type", "seller").order("created_at", { ascending: false }),
        supabase.from("generated_documents").select("*").order("created_at", { ascending: false }),
      ]);

      setTemplates((tpls || []) as DocumentTemplate[]);
      setSellerLeads((leadsData || []) as SellerLead[]);
      setGenerated((gens || []) as GeneratedDocument[]);

      if (tpls && tpls.length > 0) setGenTemplateId((tpls[0] as DocumentTemplate).id);
      if (leadsData && leadsData.length > 0) setGenLeadId((leadsData[0] as SellerLead).id);
    } catch (err) {
      console.error("Error cargando documentos:", err);
      toast.error("No se pudieron cargar los documentos");
    } finally {
      setLoading(false);
    }
  };

  // Categoría → kind del formulario.
  const detectKind = (template: DocumentTemplate): GenForm["kind"] => {
    const cat = (template.category || "").toLowerCase();
    const nam = template.name.toLowerCase();
    if (cat.includes("contrato") || nam.includes("contrato privado")) return "contrato";
    if (cat.includes("propuesta") || nam.includes("propuesta")) return "propuesta";
    return "nota";
  };

  // ─── PASO 1 → 2: abrir la página previa con datos autorrellenados ────────
  const openEditor = () => {
    const template = templates.find((t) => t.id === genTemplateId);
    if (!template) return toast.error("Selecciona una plantilla");

    const kind = detectKind(template);
    if (kind === "contrato") return openEditorFromProposal(template);

    const lead = sellerLeads.find((l) => l.id === genLeadId);
    if (!lead) return toast.error("Selecciona un lead vendedor");

    const p = lead.preferences || {};
    const isPropuesta = kind === "propuesta";
    const today = new Date().toISOString().slice(0, 10);

    // En propuesta, el "owner" que firma es el COMPRADOR (vacío, se teclea) y el
    // vendedor sale del lead. En nota, el owner es el VENDEDOR (= lead).
    const ownerFromLead: OwnerInput = {
      nombre: lead.name || "",
      dni: "",
      telefono: lead.phone || "",
      email: lead.email || "",
      direccion: "",
    };

    setForm({
      kind: isPropuesta ? "propuesta" : "nota",
      sourceProposalId: undefined,
      templateId: template.id,
      leadId: lead.id,
      buyerId: "",
      lugar: p.city || "Sevilla",
      fecha: today,
      owners: isPropuesta ? [emptyOwner()] : [ownerFromLead],
      sellers: isPropuesta ? [{ nombre: lead.name || "", nif: "", email: lead.email || "" }] : [],
      repEnabled: false,
      repNombre: "",
      repDni: "",
      repCalidad: "",
      inmDireccion: p.property_address || "",
      inmTipo: p.property_type || "",
      inmM2: p.sqm ? String(p.sqm) : "",
      inmM2Construidos: "",
      inmDatosRegistrales: "",
      inmAnexos: "",
      inmRefCatastral: "",
      cargas: "Ninguna",
      precio: String(p.agent_valuation || p.estimated_value || ""),
      honorariosPct: p.commission_pct ? String(p.commission_pct) : "",
      fechaInicio: today,
      fechaFin: "",
      pagoInicial: "",
      pagoAmpliacion: "",
      pagoRestante: "",
      plazoContrato: "",
      plazoEscritura: "",
      diasHabiles: "7",
      notarioNombre: "",
      notarioCiudad: "Sevilla",
      notarioFechaEscritura: "",
      notarioNumProtocolo: "",
      registroNumero: "",
      registroCiudad: "Sevilla",
      ibanVendedor: "",
      formaPagoAmpliacion: "transferencia bancaria",
    });
  };

  /**
   * Apertura especial para CONTRATO PRIVADO: parte de una propuesta existente
   * y autorrellena todo lo que ya estaba (vendedor, comprador, inmueble, precio,
   * escalera de pagos, plazos, honorarios%). El usuario sólo añade los datos
   * notariales (notario, registro, IBAN, etc.).
   */
  const openEditorFromProposal = (template: DocumentTemplate) => {
    const propId = genProposalId;
    if (!propId) return toast.error("Selecciona una propuesta de origen");
    const proposal = generated.find((g) => g.id === propId);
    if (!proposal) return toast.error("Propuesta no encontrada");

    const ctx = (proposal.merged_data || {}) as Record<string, any>;
    const lead = sellerLeads.find((l) => l.id === proposal.seller_lead_id);
    const today = new Date().toISOString().slice(0, 10);

    // Reconstruir owners (compradores) y sellers (vendedores) a partir del
    // snapshot guardado. La propuesta no guardó cada owner por separado, pero
    // sí guardó al menos el "comprador.nombre/email" y el "vendedores" string.
    const owners: OwnerInput[] = Array.isArray(ctx.__owners) && ctx.__owners.length > 0
      ? ctx.__owners
      : [{
          nombre: String(ctx["comprador.nombre"] || ""),
          dni: "",
          telefono: "",
          email: String(ctx["comprador.email"] || ""),
          direccion: "",
        }];
    const sellers: PartyInput[] = Array.isArray(ctx.__sellers) && ctx.__sellers.length > 0
      ? ctx.__sellers
      : (lead ? [{ nombre: lead.name || "", nif: "", email: lead.email || "" }] : [emptyParty()]);

    // Honorarios % desde la NOTA DE ENCARGO del mismo seller_lead, si existe.
    const noteTpl = templates.find((t) => (t.category || "").toLowerCase().includes("nota"));
    const note = noteTpl && lead
      ? generated.find((g) => g.template_id === noteTpl.id && g.seller_lead_id === lead.id)
      : undefined;
    const noteCtx = (note?.merged_data || {}) as Record<string, any>;
    const honorariosPct = String(noteCtx.honorarios_pct ?? ctx.honorarios_pct ?? "");

    // Recuperar montos numéricos desde los strings "1.234 €" guardados.
    const num = (s: any) => String(s ?? "").replace(/[^\d]/g, "");

    setForm({
      kind: "contrato",
      sourceProposalId: propId,
      templateId: template.id,
      leadId: proposal.seller_lead_id || (lead?.id ?? ""),
      buyerId: "",
      lugar: String(ctx.lugar || "Sevilla"),
      fecha: today,
      owners,
      sellers,
      repEnabled: false,
      repNombre: "",
      repDni: "",
      repCalidad: "",
      inmDireccion: String(ctx["inmueble.direccion"] || ""),
      inmTipo: String(ctx["inmueble.tipo"] || ""),
      inmM2: String(ctx["inmueble.m2"] || ""),
      inmM2Construidos: String(ctx["inmueble.m2_construidos"] || ""),
      inmDatosRegistrales: String(ctx["inmueble.datos_registrales"] || ""),
      inmAnexos: String(ctx["inmueble.anexos"] || ""),
      inmRefCatastral: String(ctx["inmueble.referencia_catastral"] || ""),
      cargas: String(ctx.cargas || "Ninguna"),
      precio: num(ctx.precio),
      honorariosPct,
      fechaInicio: today,
      fechaFin: "",
      pagoInicial: num(ctx["pago.inicial"]),
      pagoAmpliacion: num(ctx["pago.ampliacion"]),
      pagoRestante: num(ctx["pago.restante"]),
      plazoContrato: today,           // hoy: el contrato privado se firma hoy
      plazoEscritura: "",              // a rellenar (la propuesta marcó un "plazo.escritura" como string formateado)
      diasHabiles: "7",
      notarioNombre: "",
      notarioCiudad: "Sevilla",
      notarioFechaEscritura: "",
      notarioNumProtocolo: "",
      registroNumero: "",
      registroCiudad: "Sevilla",
      ibanVendedor: "",
      formaPagoAmpliacion: "transferencia bancaria",
    });
    toast.success("Contrato pre-rellenado desde la propuesta");
  };

  const patch = (partial: Partial<GenForm>) => setForm((f) => (f ? { ...f, ...partial } : f));
  const patchOwner = (idx: number, partial: Partial<OwnerInput>) =>
    setForm((f) => (f ? { ...f, owners: f.owners.map((o, i) => (i === idx ? { ...o, ...partial } : o)) } : f));

  // ─── Combina el formulario en el diccionario de placeholders ─────────────
  const flattenForm = (f: GenForm) => {
    const fmtEuro = (raw: string) => {
      const n = Number(raw);
      return n > 0 ? `${n.toLocaleString("es-ES")} €` : "________";
    };
    const fmtDate = (d: string) => (d ? new Date(d).toLocaleDateString("es-ES") : "________");
    const price = Number(f.precio) || 0;
    const comm = Number(f.honorariosPct) || 0;
    const honorarios = price > 0 && comm > 0 ? price * (comm / 100) : 0;
    const o0 = f.owners[0] || emptyOwner();

    const propietarios = f.owners
      .filter((o) => o.nombre.trim())
      .map((o) => `D./Dña. ${o.nombre}${o.dni ? `, NIF ${o.dni}` : ""}, mayor de edad${o.direccion ? `, con domicilio en ${o.direccion}` : ""}${o.telefono ? `, teléfono ${o.telefono}` : ""}${o.email ? `, email ${o.email}` : ""}.`)
      .join("\n") || "________";

    const representacion = f.repEnabled
      ? `Actúa en representación de la parte vendedora D./Dña. ${f.repNombre || "________"}${f.repDni ? `, NIF ${f.repDni}` : ""}${f.repCalidad ? `, en calidad de ${f.repCalidad}` : ""}, según acreditará documentalmente.`
      : "Actúa en su propio nombre y representación.";

    const ctx: Record<string, string> = {
      fecha: f.fecha ? new Date(f.fecha).toLocaleDateString("es-ES") : new Date().toLocaleDateString("es-ES"),
      lugar: f.lugar || "Sevilla",
      "vendedor.nombre": o0.nombre || "________",
      "vendedor.dni": o0.dni || "________",
      "vendedor.telefono": o0.telefono || "________",
      "vendedor.email": o0.email || "________",
      "vendedor.direccion": o0.direccion || "________",
      propietarios,
      representacion,
      "inmueble.direccion": f.inmDireccion || "________",
      "inmueble.tipo": f.inmTipo || "________",
      "inmueble.m2": f.inmM2 || "________",
      "inmueble.m2_construidos": f.inmM2Construidos || "________",
      "inmueble.datos_registrales": f.inmDatosRegistrales || "________",
      "inmueble.anexos": f.inmAnexos || "________",
      "inmueble.referencia_catastral": f.inmRefCatastral || "________",
      cargas: f.cargas?.trim() || "Ninguna",
      precio: fmtEuro(f.precio),
      honorarios_pct: comm > 0 ? String(comm) : "________",
      comision_pct: comm > 0 ? String(comm) : "________",
      honorarios: honorarios > 0 ? `${honorarios.toLocaleString("es-ES")} €` : "________",
      fecha_inicio: fmtDate(f.fechaInicio),
      fecha_fin: fmtDate(f.fechaFin),
    };

    // ── Propuesta de compraventa: añade placeholders y firmantes propios ──
    if (f.kind === "propuesta") {
      const compradores = f.owners
        .filter((o) => o.nombre.trim())
        .map((o) => `D./Dña. ${o.nombre}${o.dni ? `, NIF ${o.dni}` : ""}, mayor de edad${o.direccion ? `, con domicilio en ${o.direccion}` : ""}${o.telefono ? `, teléfono ${o.telefono}` : ""}${o.email ? `, email ${o.email}` : ""}.`)
        .join("\n") || "________";

      const vendedores = f.sellers
        .filter((s) => s.nombre.trim())
        .map((s) => `D./Dña. ${s.nombre}${s.nif ? `, NIF ${s.nif}` : ""}`)
        .join(" y ") || "________";

      const repComprador = f.repEnabled
        ? `Actúa en representación de la parte proponente D./Dña. ${f.repNombre || "________"}${f.repDni ? `, NIF ${f.repDni}` : ""}${f.repCalidad ? `, en calidad de ${f.repCalidad}` : ""}, según acreditará documentalmente.`
        : "Actúa en su propio nombre y representación.";

      Object.assign(ctx, {
        compradores,
        representacion: repComprador,
        vendedores,
        "comprador.nombre": o0.nombre || "________",
        "comprador.email": o0.email || "________",
        "pago.inicial": fmtEuro(f.pagoInicial),
        "pago.ampliacion": fmtEuro(f.pagoAmpliacion),
        "pago.restante": fmtEuro(f.pagoRestante),
        "plazo.contrato": fmtDate(f.plazoContrato),
        "plazo.escritura": fmtDate(f.plazoEscritura),
        dias_habiles: f.diasHabiles?.trim() || "________",
      });

      // Firmantes: compradores (proponentes) + vendedores, todos con email válido.
      const recipients = [
        ...f.owners.filter((o) => EMAIL_RE.test(o.email)).map((o) => ({ name: o.nombre || "Comprador", email: o.email })),
        ...f.sellers.filter((s) => EMAIL_RE.test(s.email)).map((s) => ({ name: s.nombre || "Vendedor", email: s.email })),
      ];
      // Guardar snapshots completos para que un futuro CONTRATO pueda autorrellenar partes.
      (ctx as any).__owners = f.owners;
      (ctx as any).__sellers = f.sellers;
      return { ctx, recipients };
    }

    // ── Contrato privado de compraventa ──
    if (f.kind === "contrato") {
      const vendedoresFull = f.sellers
        .filter((s) => s.nombre.trim())
        .map((s, i) => `${i === 0 ? "De una parte (La Parte Vendedora):" : ""} D./Dña. ${s.nombre}${s.nif ? `, NIF ${s.nif}` : ""}, mayor de edad.`)
        .join("\n") || "________";

      const compradores = f.owners
        .filter((o) => o.nombre.trim())
        .map((o, i) => `${i === 0 ? "De otra parte (La Parte Compradora):" : ""} D./Dña. ${o.nombre}${o.dni ? `, NIF ${o.dni}` : ""}, mayor de edad${o.direccion ? `, con domicilio en ${o.direccion}` : ""}.`)
        .join("\n") || "________";

      const totalEntregado = (Number(f.pagoInicial) || 0) + (Number(f.pagoAmpliacion) || 0);

      Object.assign(ctx, {
        vendedores_full: vendedoresFull,
        compradores,
        "pago.inicial": fmtEuro(f.pagoInicial),
        "pago.ampliacion": fmtEuro(f.pagoAmpliacion),
        "pago.restante": fmtEuro(f.pagoRestante),
        total_entregado: totalEntregado > 0 ? `${totalEntregado.toLocaleString("es-ES")} €` : "________",
        "plazo.escritura": fmtDate(f.plazoEscritura),
        "notario.nombre": f.notarioNombre || "________",
        "notario.ciudad": f.notarioCiudad || "Sevilla",
        "notario.fecha_escritura": fmtDate(f.notarioFechaEscritura),
        "notario.num_protocolo": f.notarioNumProtocolo || "________",
        "registro.numero": f.registroNumero || "________",
        "registro.ciudad": f.registroCiudad || "Sevilla",
        iban_vendedor: f.ibanVendedor || "________",
        forma_pago_ampliacion: f.formaPagoAmpliacion || "transferencia bancaria",
        honorarios_pct: Number(f.honorariosPct) > 0 ? String(Number(f.honorariosPct)) : "________",
      });

      // Firmantes: vendedores + compradores + asesor (Álvaro firma como mediador).
      const recipients = [
        ...f.sellers.filter((s) => EMAIL_RE.test(s.email)).map((s) => ({ name: s.nombre || "Vendedor", email: s.email })),
        ...f.owners.filter((o) => EMAIL_RE.test(o.email)).map((o) => ({ name: o.nombre || "Comprador", email: o.email })),
        { name: "Álvaro López Cuevas", email: "info@tuasesoralvaro.com" },
      ];
      return { ctx, recipients };
    }

    // ── Nota de encargo: firmantes = propietarios con email válido ──
    const recipients = f.owners
      .filter((o) => EMAIL_RE.test(o.email))
      .map((o) => ({ name: o.nombre || "Propietario", email: o.email }));

    return { ctx, recipients };
  };

  const mergeBody = (body: string, ctx: Record<string, string>): string =>
    body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => ctx[key] ?? "________");

  // ─── GENERAR (desde la página previa) ────────────────────────────────────
  const handleGenerate = async () => {
    if (!form) return;
    const template = templates.find((t) => t.id === form.templateId);
    const lead = sellerLeads.find((l) => l.id === form.leadId);
    if (!template) return toast.error("Plantilla no encontrada");
    if (!form.owners.some((o) => o.nombre.trim())) return toast.error(form.kind === "nota" ? "Indica al menos un propietario" : "Indica al menos un comprador");
    if ((form.kind === "propuesta" || form.kind === "contrato") && !form.sellers.some((s) => s.nombre.trim())) return toast.error("Indica al menos un vendedor");

    const { ctx, recipients } = flattenForm(form);
    const text = mergeBody(template.body, ctx);
    const clientLabel = form.owners[0]?.nombre || (form.kind === "propuesta" ? "El comprador" : "La parte vendedora");
    const sellerName = form.sellers?.[0]?.nombre;
    const buyerName = form.owners?.[0]?.nombre;
    const html = renderBrandedHtml(
      {
        title: template.name,
        lugar: ctx.lugar,
        fecha: ctx.fecha,
        clientLabel,
        ...docLayout(template.category, clientLabel, { sellerName, buyerName }),
      },
      text,
    );

    try {
      const { error } = await supabase.from("generated_documents").insert({
        template_id: template.id,
        property_id: lead?.property_id || null,
        seller_lead_id: form.leadId,
        buyer_id: form.buyerId || null,
        merged_data: { ...ctx, __recipients: recipients },
        signature_status: "draft",
      });
      if (error) throw error;
      toast.success("Documento generado (borrador guardado)");
      setForm(null);
      setPreviewDoc({ name: template.name, html });
      fetchAll();
    } catch (err) {
      console.error("Error generando documento:", err);
      toast.error("No se pudo guardar el documento generado");
    }
  };

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

  // ─── VER / DESCARGAR un documento ya generado ────────────────────────────
  const handleViewDoc = (gd: GeneratedDocument) => {
    const tpl = templates.find((t) => t.id === gd.template_id);
    if (!tpl) return toast.error("La plantilla de este documento ya no existe");
    const ctx = (gd.merged_data || {}) as Record<string, string>;
    const text = mergeBody(tpl.body, ctx);
    const clientLabel = ctx["comprador.nombre"] || ctx["vendedor.nombre"] || "La parte firmante";
    const sellerName = (gd.merged_data as any)?.__sellers?.[0]?.nombre || ctx["vendedor.nombre"];
    const buyerName = (gd.merged_data as any)?.__owners?.[0]?.nombre || ctx["comprador.nombre"];
    const html = renderBrandedHtml(
      {
        title: tpl.name,
        lugar: ctx.lugar,
        fecha: ctx.fecha,
        clientLabel,
        ...docLayout(tpl.category, clientLabel, { sellerName, buyerName }),
      },
      text,
    );
    setPreviewDoc({ name: tpl.name, html });
  };

  // ─── ENVIAR A FIRMAR (Documenso) ─────────────────────────────────────────
  const handleSendToSign = async (gd: GeneratedDocument) => {
    setSendingId(gd.id);
    try {
      const res = await fetch("/api/documents/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generatedDocumentId: gd.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || "No se pudo enviar a firmar");
        return;
      }
      toast.success("Enviado a firmar con Documenso 📨");
      fetchAll();
    } catch (err) {
      console.error("Error enviando a firmar:", err);
      toast.error("Error de red al enviar a firmar");
    } finally {
      setSendingId(null);
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

  const inputCls = "w-full bg-[#0F172A] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#FBBF24]";
  const labelCls = "block text-xs font-bold text-slate-400 mb-1";

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
            Genera el documento desde un lead vendedor, revísalo y complétalo antes de enviarlo a firmar.
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
              <Sparkles size={16} /> Generar documento
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Plantilla</label>
                <select value={genTemplateId} onChange={(e) => setGenTemplateId(e.target.value)} className={inputCls}>
                  {templates.length === 0 && <option value="">Sin plantillas</option>}
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              {(() => {
                const sel = templates.find((t) => t.id === genTemplateId);
                const isContract = sel ? detectKind(sel) === "contrato" : false;
                if (isContract) {
                  // Para contrato: elegir una PROPUESTA generada como origen.
                  const proposalTplIds = templates
                    .filter((t) => detectKind(t) === "propuesta")
                    .map((t) => t.id);
                  const proposals = generated
                    .filter((g) => proposalTplIds.includes(g.template_id || ""))
                    .map((g) => {
                      const lead = sellerLeads.find((l) => l.id === g.seller_lead_id);
                      const ctx = (g.merged_data || {}) as Record<string, any>;
                      const buyer = ctx["comprador.nombre"] || "—";
                      const direccion = ctx["inmueble.direccion"] || lead?.preferences?.property_address || "—";
                      const fecha = new Date(g.created_at).toLocaleDateString("es-ES");
                      return { id: g.id, label: `${direccion} · ${buyer} · ${fecha}` };
                    });
                  return (
                    <div>
                      <label className={labelCls}>Operación a formalizar (propuesta de origen)</label>
                      <select value={genProposalId} onChange={(e) => setGenProposalId(e.target.value)} className={inputCls}>
                        <option value="">{proposals.length === 0 ? "No hay propuestas generadas" : "Selecciona una propuesta"}</option>
                        {proposals.map((p) => (
                          <option key={p.id} value={p.id}>{p.label}</option>
                        ))}
                      </select>
                      <p className="text-[10px] text-slate-500 mt-1">Se autorrellenarán vendedores, compradores, inmueble, precio, escalera de pagos y honorarios.</p>
                    </div>
                  );
                }
                return (
                  <div>
                    <label className={labelCls}>Lead vendedor</label>
                    <select value={genLeadId} onChange={(e) => setGenLeadId(e.target.value)} className={inputCls}>
                      {sellerLeads.length === 0 && <option value="">Sin leads vendedores</option>}
                      {sellerLeads.map((l) => (
                        <option key={l.id} value={l.id}>{l.name}{l.preferences?.property_address ? ` — ${l.preferences.property_address}` : ""}</option>
                      ))}
                    </select>
                  </div>
                );
              })()}
            </div>

            {(() => {
              const sel = templates.find((t) => t.id === genTemplateId);
              const isContract = sel ? detectKind(sel) === "contrato" : false;
              const disabled = templates.length === 0
                || (isContract ? !genProposalId : sellerLeads.length === 0);
              const hint = isContract
                ? "El contrato se autorrellena desde la propuesta. Sólo añadirás los datos notariales (notario, registro, IBAN del vendedor, forma de pago)."
                : "Se abrirá una página previa con todos los datos del lead autorrellenados y editables antes de generar el documento.";
              return (
                <>
                  <button
                    onClick={openEditor}
                    disabled={disabled}
                    className="flex items-center gap-2 bg-[#FBBF24] hover:bg-yellow-500 disabled:opacity-50 text-[#2C3E50] font-extrabold px-5 py-2.5 rounded-xl transition-all active:scale-95"
                  >
                    <FilePlus2 size={16} /> {isContract ? "Pre-rellenar contrato desde propuesta" : "Revisar y completar datos"}
                  </button>
                  <p className="text-[11px] text-slate-500">{hint}</p>
                </>
              );
            })()}
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
                  const lead = sellerLeads.find((l) => l.id === g.seller_lead_id);
                  const st = STATUS_LABEL[g.signature_status] || STATUS_LABEL.draft;
                  return (
                    <div key={g.id} className="flex items-center justify-between gap-3 bg-slate-900/40 border border-white/5 rounded-xl px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">{tpl?.name || "Plantilla eliminada"}</p>
                        <p className="text-[11px] text-slate-400 truncate">
                          {lead?.name || (g.merged_data as any)?.["vendedor.nombre"] || "Sin vendedor"} · {new Date(g.created_at).toLocaleDateString("es-ES")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleViewDoc(g)}
                          className="text-[11px] font-bold text-slate-200 bg-slate-700 hover:bg-slate-600 px-2.5 py-1 rounded-lg transition-all flex items-center gap-1"
                        >
                          <Printer size={12} /> Ver / PDF
                        </button>
                        {g.signature_status === "draft" && (
                          <button
                            onClick={() => handleSendToSign(g)}
                            disabled={sendingId === g.id}
                            className="text-[11px] font-bold text-[#2C3E50] bg-[#FBBF24] hover:bg-yellow-500 disabled:opacity-50 px-2.5 py-1 rounded-lg transition-all"
                          >
                            {sendingId === g.id ? "Enviando…" : "Enviar a firmar"}
                          </button>
                        )}
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ${st.cls}`}>{st.label}</span>
                      </div>
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

      {/* ─── PÁGINA PREVIA: EDICIÓN DE DATOS DEL DOCUMENTO ─────────────── */}
      {form && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-[#1E293B] border border-white/10 rounded-2xl w-full max-w-3xl my-auto shadow-2xl">
            <div className="flex justify-between items-center px-6 py-4 border-b border-white/10 sticky top-0 bg-[#1E293B] rounded-t-2xl">
              <div>
                <h3 className="text-lg font-bold text-white">Completar datos del documento</h3>
                <p className="text-[11px] text-slate-400">{templates.find((t) => t.id === form.templateId)?.name}</p>
              </div>
              <button onClick={() => setForm(null)} className="text-slate-400 hover:text-white p-1 hover:bg-white/10 rounded-full">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* PROPIETARIOS / COMPRADORES */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-[#FBBF24] flex items-center gap-2">
                    <Users size={14} /> {form.kind === "nota" ? "Propietarios" : (form.kind === "contrato" ? "Compradores" : "Compradores (Proponentes)")}
                  </h4>
                  <button
                    onClick={() => patch({ owners: [...form.owners, emptyOwner()] })}
                    className="flex items-center gap-1.5 text-[11px] font-bold text-[#2C3E50] bg-[#FBBF24] hover:bg-yellow-500 px-2.5 py-1 rounded-lg transition-all"
                  >
                    <UserPlus size={13} /> {form.kind === "nota" ? "Añadir propietario" : "Añadir comprador"}
                  </button>
                </div>

                {form.owners.map((o, idx) => (
                  <div key={idx} className="bg-[#0F172A]/60 border border-white/5 rounded-xl p-3 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] font-bold text-slate-400">{form.kind === "nota" ? "Propietario" : "Comprador"} {idx + 1}{idx === 0 ? " (principal)" : ""}</span>
                      {form.owners.length > 1 && (
                        <button onClick={() => patch({ owners: form.owners.filter((_, i) => i !== idx) })} className="text-slate-500 hover:text-red-400 p-1">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input className={inputCls} placeholder="Nombre y apellidos" value={o.nombre} onChange={(e) => patchOwner(idx, { nombre: e.target.value })} />
                      <input className={inputCls} placeholder="DNI" value={o.dni} onChange={(e) => patchOwner(idx, { dni: e.target.value })} />
                      <input className={inputCls} placeholder="Teléfono" value={o.telefono} onChange={(e) => patchOwner(idx, { telefono: e.target.value })} />
                      <input className={inputCls} placeholder="Email (para firmar)" value={o.email} onChange={(e) => patchOwner(idx, { email: e.target.value })} />
                      <input className={`${inputCls} sm:col-span-2`} placeholder="Domicilio" value={o.direccion} onChange={(e) => patchOwner(idx, { direccion: e.target.value })} />
                    </div>
                  </div>
                ))}
              </section>

              {/* VENDEDORES (propuesta + contrato) */}
              {(form.kind === "propuesta" || form.kind === "contrato") && (
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-[#FBBF24] flex items-center gap-2">
                      <Users size={14} /> Vendedores (propietarios del inmueble)
                    </h4>
                    <button
                      onClick={() => patch({ sellers: [...form.sellers, emptyParty()] })}
                      className="flex items-center gap-1.5 text-[11px] font-bold text-[#2C3E50] bg-[#FBBF24] hover:bg-yellow-500 px-2.5 py-1 rounded-lg transition-all"
                    >
                      <UserPlus size={13} /> Añadir vendedor
                    </button>
                  </div>
                  {form.sellers.map((s, idx) => (
                    <div key={idx} className="bg-[#0F172A]/60 border border-white/5 rounded-xl p-3 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[11px] font-bold text-slate-400">Vendedor {idx + 1}</span>
                        {form.sellers.length > 1 && (
                          <button onClick={() => patch({ sellers: form.sellers.filter((_, i) => i !== idx) })} className="text-slate-500 hover:text-red-400 p-1">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input className={inputCls} placeholder="Nombre y apellidos" value={s.nombre} onChange={(e) => patch({ sellers: form.sellers.map((x, i) => (i === idx ? { ...x, nombre: e.target.value } : x)) })} />
                        <input className={inputCls} placeholder="NIF" value={s.nif} onChange={(e) => patch({ sellers: form.sellers.map((x, i) => (i === idx ? { ...x, nif: e.target.value } : x)) })} />
                        <input className={inputCls} placeholder="Email (para firmar la aceptación)" value={s.email} onChange={(e) => patch({ sellers: form.sellers.map((x, i) => (i === idx ? { ...x, email: e.target.value } : x)) })} />
                      </div>
                    </div>
                  ))}
                </section>
              )}

              {/* REPRESENTACIÓN */}
              <section className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={form.repEnabled} onChange={(e) => patch({ repEnabled: e.target.checked })} className="w-4 h-4 accent-[#FBBF24]" />
                  <span className="text-sm font-bold text-white">{form.kind === "propuesta" ? "El comprador actúa en representación de un tercero" : "Actúa en representación del/los propietario(s)"}</span>
                </label>
                {form.repEnabled && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input className={inputCls} placeholder="Nombre del representante" value={form.repNombre} onChange={(e) => patch({ repNombre: e.target.value })} />
                    <input className={inputCls} placeholder="DNI representante" value={form.repDni} onChange={(e) => patch({ repDni: e.target.value })} />
                    <input className={inputCls} placeholder="En calidad de (apoderado…)" value={form.repCalidad} onChange={(e) => patch({ repCalidad: e.target.value })} />
                  </div>
                )}
              </section>

              {/* INMUEBLE */}
              <section className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-widest text-[#FBBF24]">Inmueble</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input className={`${inputCls} sm:col-span-2`} placeholder="Dirección del inmueble" value={form.inmDireccion} onChange={(e) => patch({ inmDireccion: e.target.value })} />
                  <input className={inputCls} placeholder="Tipo (Piso, Casa…)" value={form.inmTipo} onChange={(e) => patch({ inmTipo: e.target.value })} />
                  <input className={inputCls} placeholder="Referencia catastral" value={form.inmRefCatastral} onChange={(e) => patch({ inmRefCatastral: e.target.value })} />
                  <input className={`${inputCls} sm:col-span-2`} placeholder="Datos registrales (Tomo, Libro, Folio, Finca)" value={form.inmDatosRegistrales} onChange={(e) => patch({ inmDatosRegistrales: e.target.value })} />
                  <input className={inputCls} placeholder="M² útiles" value={form.inmM2} onChange={(e) => patch({ inmM2: e.target.value })} />
                  <input className={inputCls} placeholder="M² construidos" value={form.inmM2Construidos} onChange={(e) => patch({ inmM2Construidos: e.target.value })} />
                  <input className={`${inputCls} sm:col-span-2`} placeholder="Anexos (garaje / trastero…)" value={form.inmAnexos} onChange={(e) => patch({ inmAnexos: e.target.value })} />
                  <input className={`${inputCls} sm:col-span-2`} placeholder='Cargas / gravámenes (o "Ninguna")' value={form.cargas} onChange={(e) => patch({ cargas: e.target.value })} />
                </div>
              </section>

              {/* CONDICIONES */}
              <section className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-widest text-[#FBBF24]">Condiciones</h4>

                {form.kind === "contrato" ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="sm:col-span-3">
                        <label className={labelCls}>Precio total (€)</label>
                        <input className={inputCls} type="number" value={form.precio} onChange={(e) => patch({ precio: e.target.value })} />
                      </div>
                      <div>
                        <label className={labelCls}>1 · Señal previa (€)</label>
                        <input className={inputCls} type="number" value={form.pagoInicial} onChange={(e) => patch({ pagoInicial: e.target.value })} />
                      </div>
                      <div>
                        <label className={labelCls}>2 · Ampliación arras (€)</label>
                        <input className={inputCls} type="number" value={form.pagoAmpliacion} onChange={(e) => patch({ pagoAmpliacion: e.target.value })} />
                      </div>
                      <div>
                        <label className={labelCls}>3 · Resto en escritura (€)</label>
                        <input className={inputCls} type="number" value={form.pagoRestante} onChange={(e) => patch({ pagoRestante: e.target.value })} />
                      </div>
                      <div>
                        <label className={labelCls}>Honorarios asesor (%)</label>
                        <input className={inputCls} type="number" step="0.1" value={form.honorariosPct} onChange={(e) => patch({ honorariosPct: e.target.value })} />
                      </div>
                      <div className="sm:col-span-2">
                        <label className={labelCls}>IBAN del vendedor (para liberar la señal)</label>
                        <input className={inputCls} placeholder="ES12 3456 7890 1234 5678 9012" value={form.ibanVendedor} onChange={(e) => patch({ ibanVendedor: e.target.value })} />
                      </div>
                      <div>
                        <label className={labelCls}>Forma de pago ampliación</label>
                        <select className={inputCls} value={form.formaPagoAmpliacion} onChange={(e) => patch({ formaPagoAmpliacion: e.target.value })}>
                          <option value="transferencia bancaria">Transferencia bancaria</option>
                          <option value="cheque nominativo">Cheque nominativo</option>
                          <option value="ingreso en efectivo">Ingreso en efectivo</option>
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Límite escritura pública</label>
                        <input className={`${inputCls} [color-scheme:dark]`} type="date" value={form.plazoEscritura} onChange={(e) => patch({ plazoEscritura: e.target.value })} />
                      </div>
                      <div>
                        <label className={labelCls}>Lugar</label>
                        <input className={inputCls} value={form.lugar} onChange={(e) => patch({ lugar: e.target.value })} />
                      </div>
                      <div>
                        <label className={labelCls}>Fecha de firma</label>
                        <input className={`${inputCls} [color-scheme:dark]`} type="date" value={form.fecha} onChange={(e) => patch({ fecha: e.target.value })} />
                      </div>
                    </div>
                    <h4 className="text-xs font-bold uppercase tracking-widest text-[#FBBF24] mt-4">Datos notariales y registrales</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="sm:col-span-2">
                        <label className={labelCls}>Notario de la escritura original</label>
                        <input className={inputCls} placeholder="D. Nombre Apellido" value={form.notarioNombre} onChange={(e) => patch({ notarioNombre: e.target.value })} />
                      </div>
                      <div>
                        <label className={labelCls}>Ciudad del notario</label>
                        <input className={inputCls} value={form.notarioCiudad} onChange={(e) => patch({ notarioCiudad: e.target.value })} />
                      </div>
                      <div>
                        <label className={labelCls}>Fecha escritura original</label>
                        <input className={`${inputCls} [color-scheme:dark]`} type="date" value={form.notarioFechaEscritura} onChange={(e) => patch({ notarioFechaEscritura: e.target.value })} />
                      </div>
                      <div>
                        <label className={labelCls}>Nº protocolo</label>
                        <input className={inputCls} value={form.notarioNumProtocolo} onChange={(e) => patch({ notarioNumProtocolo: e.target.value })} />
                      </div>
                      <div>
                        <label className={labelCls}>Nº Registro de la Propiedad</label>
                        <input className={inputCls} value={form.registroNumero} onChange={(e) => patch({ registroNumero: e.target.value })} />
                      </div>
                      <div>
                        <label className={labelCls}>Ciudad del Registro</label>
                        <input className={inputCls} value={form.registroCiudad} onChange={(e) => patch({ registroCiudad: e.target.value })} />
                      </div>
                    </div>
                    {(() => {
                      const tot = Number(form.precio) || 0;
                      const sum = (Number(form.pagoInicial) || 0) + (Number(form.pagoAmpliacion) || 0) + (Number(form.pagoRestante) || 0);
                      if (tot > 0 && sum > 0 && sum !== tot) {
                        return <p className="text-[11px] text-amber-400 font-bold">⚠️ La suma de los pagos ({sum.toLocaleString("es-ES")} €) no cuadra con el precio total ({tot.toLocaleString("es-ES")} €).</p>;
                      }
                      return null;
                    })()}
                  </>
                ) : form.kind === "nota" ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label className={labelCls}>Precio de venta (€)</label>
                        <input className={inputCls} type="number" value={form.precio} onChange={(e) => patch({ precio: e.target.value })} />
                      </div>
                      <div>
                        <label className={labelCls}>Honorarios (%)</label>
                        <input className={inputCls} type="number" step="0.1" placeholder="Ej: 2" value={form.honorariosPct} onChange={(e) => patch({ honorariosPct: e.target.value })} />
                      </div>
                      <div>
                        <label className={labelCls}>Lugar</label>
                        <input className={inputCls} value={form.lugar} onChange={(e) => patch({ lugar: e.target.value })} />
                      </div>
                      <div>
                        <label className={labelCls}>Inicio del encargo</label>
                        <input className={`${inputCls} [color-scheme:dark]`} type="date" value={form.fechaInicio} onChange={(e) => patch({ fechaInicio: e.target.value })} />
                      </div>
                      <div>
                        <label className={labelCls}>Fin del encargo</label>
                        <input className={`${inputCls} [color-scheme:dark]`} type="date" value={form.fechaFin} onChange={(e) => patch({ fechaFin: e.target.value })} />
                      </div>
                      <div>
                        <label className={labelCls}>Fecha de firma</label>
                        <input className={`${inputCls} [color-scheme:dark]`} type="date" value={form.fecha} onChange={(e) => patch({ fecha: e.target.value })} />
                      </div>
                    </div>
                    {Number(form.precio) > 0 && Number(form.honorariosPct) > 0 && (
                      <p className="text-[11px] text-emerald-400 font-bold">
                        Honorarios estimados: {(Number(form.precio) * (Number(form.honorariosPct) / 100)).toLocaleString("es-ES")} € + IVA
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="sm:col-span-3">
                        <label className={labelCls}>Precio total propuesto (€)</label>
                        <input className={inputCls} type="number" value={form.precio} onChange={(e) => patch({ precio: e.target.value })} />
                      </div>
                      <div>
                        <label className={labelCls}>1 · Señal inicial (€)</label>
                        <input className={inputCls} type="number" placeholder="A la firma / custodia" value={form.pagoInicial} onChange={(e) => patch({ pagoInicial: e.target.value })} />
                      </div>
                      <div>
                        <label className={labelCls}>2 · Ampliación arras (€)</label>
                        <input className={inputCls} type="number" placeholder="En contrato privado" value={form.pagoAmpliacion} onChange={(e) => patch({ pagoAmpliacion: e.target.value })} />
                      </div>
                      <div>
                        <label className={labelCls}>3 · Resto (€)</label>
                        <input className={inputCls} type="number" placeholder="En escritura" value={form.pagoRestante} onChange={(e) => patch({ pagoRestante: e.target.value })} />
                      </div>
                      <div>
                        <label className={labelCls}>Límite contrato privado</label>
                        <input className={`${inputCls} [color-scheme:dark]`} type="date" value={form.plazoContrato} onChange={(e) => patch({ plazoContrato: e.target.value })} />
                      </div>
                      <div>
                        <label className={labelCls}>Límite escritura pública</label>
                        <input className={`${inputCls} [color-scheme:dark]`} type="date" value={form.plazoEscritura} onChange={(e) => patch({ plazoEscritura: e.target.value })} />
                      </div>
                      <div>
                        <label className={labelCls}>Días hábiles para aceptar</label>
                        <input className={inputCls} type="number" value={form.diasHabiles} onChange={(e) => patch({ diasHabiles: e.target.value })} />
                      </div>
                      <div>
                        <label className={labelCls}>Lugar</label>
                        <input className={inputCls} value={form.lugar} onChange={(e) => patch({ lugar: e.target.value })} />
                      </div>
                      <div>
                        <label className={labelCls}>Fecha de firma</label>
                        <input className={`${inputCls} [color-scheme:dark]`} type="date" value={form.fecha} onChange={(e) => patch({ fecha: e.target.value })} />
                      </div>
                    </div>
                    {(() => {
                      const tot = Number(form.precio) || 0;
                      const sum = (Number(form.pagoInicial) || 0) + (Number(form.pagoAmpliacion) || 0) + (Number(form.pagoRestante) || 0);
                      if (tot > 0 && sum > 0 && sum !== tot) {
                        return <p className="text-[11px] text-amber-400 font-bold">⚠️ La suma de los pagos ({sum.toLocaleString("es-ES")} €) no cuadra con el precio total ({tot.toLocaleString("es-ES")} €).</p>;
                      }
                      return null;
                    })()}
                  </>
                )}
              </section>

              <div className="flex gap-3 pt-2 border-t border-white/10">
                <button onClick={() => setForm(null)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl transition-all">
                  Cancelar
                </button>
                <button onClick={handleGenerate} className="flex-1 flex items-center justify-center gap-2 bg-[#FBBF24] hover:bg-yellow-500 text-[#2C3E50] font-extrabold py-2.5 rounded-xl transition-all active:scale-95">
                  <FilePlus2 size={16} /> Generar documento
                </button>
              </div>
            </div>
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
                  <label className={labelCls}>Nombre</label>
                  <input value={editingTemplate.name} onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })} className={inputCls} placeholder="Ej: Nota de Encargo en Exclusiva" />
                </div>
                <div>
                  <label className={labelCls}>Categoría</label>
                  <input value={editingTemplate.category} onChange={(e) => setEditingTemplate({ ...editingTemplate, category: e.target.value })} className={inputCls} placeholder="Nota de encargo" />
                </div>
              </div>
              <div>
                <label className={labelCls}>
                  Formato: <code className="text-[#FBBF24]">## Sección</code> · <code className="text-[#FBBF24]">- Etiqueta: valor</code> · <code className="text-[#FBBF24]">- a) viñeta</code>.<br />
                  Placeholders: <code className="text-[#FBBF24]">{"{{propietarios}}"}</code> <code className="text-[#FBBF24]">{"{{representacion}}"}</code> <code className="text-[#FBBF24]">{"{{inmueble.direccion}}"}</code> <code className="text-[#FBBF24]">{"{{inmueble.datos_registrales}}"}</code> <code className="text-[#FBBF24]">{"{{inmueble.referencia_catastral}}"}</code> <code className="text-[#FBBF24]">{"{{inmueble.m2}}"}</code> <code className="text-[#FBBF24]">{"{{inmueble.m2_construidos}}"}</code> <code className="text-[#FBBF24]">{"{{inmueble.anexos}}"}</code> <code className="text-[#FBBF24]">{"{{cargas}}"}</code> <code className="text-[#FBBF24]">{"{{precio}}"}</code> <code className="text-[#FBBF24]">{"{{honorarios_pct}}"}</code> <code className="text-[#FBBF24]">{"{{fecha_inicio}}"}</code> <code className="text-[#FBBF24]">{"{{fecha_fin}}"}</code> <code className="text-[#FBBF24]">{"{{fecha}}"}</code>
                </label>
                <textarea value={editingTemplate.body} onChange={(e) => setEditingTemplate({ ...editingTemplate, body: e.target.value })} rows={16} className={`${inputCls} font-mono text-xs`} />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setEditingTemplate(null)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl transition-all">Cancelar</button>
                <button onClick={handleSaveTemplate} className="flex-1 flex items-center justify-center gap-2 bg-[#FBBF24] hover:bg-yellow-500 text-[#2C3E50] font-extrabold py-2.5 rounded-xl transition-all active:scale-95">
                  <Save size={16} /> Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: VISTA PREVIA IMPRIMIBLE (render de marca en iframe) ─── */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#1E293B] border border-white/10 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[92vh]">
            <div className="bg-slate-900 px-6 py-4 border-b border-white/10 flex justify-between items-center">
              <h4 className="text-white font-extrabold flex items-center gap-2">
                <FileText size={18} className="text-[#FBBF24]" /> {previewDoc.name}
              </h4>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const fr = document.getElementById("doc-preview-frame") as HTMLIFrameElement | null;
                    fr?.contentWindow?.focus();
                    fr?.contentWindow?.print();
                  }}
                  className="px-4 py-2 bg-[#FBBF24] hover:bg-yellow-500 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5"
                >
                  <Printer size={14} /> Descargar / Imprimir PDF
                </button>
                <button onClick={() => setPreviewDoc(null)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs">Cerrar</button>
              </div>
            </div>
            <div className="p-4 overflow-y-auto bg-slate-700">
              <iframe
                id="doc-preview-frame"
                title={previewDoc.name}
                srcDoc={previewDoc.html}
                className="w-full bg-white rounded-lg shadow-xl"
                style={{ height: "80vh", border: "0" }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
