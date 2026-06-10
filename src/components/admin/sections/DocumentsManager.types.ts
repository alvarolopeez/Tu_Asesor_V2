/**
 * Tipos, constantes y factories para DocumentsManager.
 * Extraídos del componente monolítico en R8 Ola 5 (2026-06-08)
 * para mantener DocumentsManager.tsx enfocado en rendering y estado.
 */

// ─── Supabase row types ──────────────────────────────────────────────────────

export interface DocumentTemplate {
  id: string;
  name: string;
  category: string;
  body: string;
  is_active: boolean;
  created_at: string;
}

export interface GeneratedDocument {
  id: string;
  template_id: string | null;
  property_id: string | null;
  seller_lead_id: string | null;
  buyer_id: string | null;
  merged_data: Record<string, unknown>;
  signature_status: string;
  created_at: string;
}

export interface SellerLead {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  property_id: string | null;
  preferences: Record<string, any> | null;
}

// ─── Navegación inter-tab (Brief #008 T4) ───────────────────────────────────

/**
 * Intent de creación de documento lanzado desde un evento de timeline
 * (Pedidos/Vendedores) hacia la pestaña Documentos. AdminDashboard lo
 * transporta; DocumentsManager lo consume al montar (preselecciona plantilla
 * y abre el editor) y avisa con onIntentConsumed.
 */
export interface DocIntent {
  kind: "propuesta" | "contrato" | "nota";
  /** Lead asociado: vendedor para 'nota'; lead del comprador para 'propuesta'. */
  leadId?: string;
  /** buyers_demands.id del comprador ('propuesta'/'contrato'). */
  buyerId?: string;
  encargoId?: string;
}

// ─── Form inputs ─────────────────────────────────────────────────────────────

export interface OwnerInput {
  nombre: string;
  dni: string;
  telefono: string;
  email: string;
  direccion: string;
}

export interface PartyInput {
  nombre: string;
  nif: string;
  email: string;
}

/**
 * Formulario editable de la "página previa" antes de generar el documento.
 *
 * kind:
 *  "nota"      → Nota de encargo (owners = vendedores)
 *  "propuesta" → Propuesta de compraventa (owners = compradores + sellers = vendedores)
 *  "contrato"  → Contrato privado (mismo modelo que propuesta + campos notariales;
 *                se pre-rellena desde una propuesta origen)
 *  "comprador" → Documentos del comprador (Ficha 218/2005, KYC, Parte de Visita)
 */
export interface GenForm {
  kind: "nota" | "propuesta" | "contrato" | "comprador";
  /** Solo en contrato: id de la propuesta de origen que pre-rellenó el form. */
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
  // ── Propuesta de compraventa ──────────────────────────────────────────────
  sellers: PartyInput[];
  pagoInicial: string;
  pagoAmpliacion: string;
  pagoRestante: string;
  // ── Documentos del comprador ──────────────────────────────────────────────
  /** "ficha" | "kyc" | "visita" — sub-tipo del kind "comprador". */
  buyerDocType?: "ficha" | "kyc" | "visita" | "";
  // Ficha Informativa (Decreto 218/2005)
  cuotaComunidad: string;
  anyoConstruccion: string;
  certLetra: string;
  certConsumo: string;
  certEmisiones: string;
  fechaNotaSimple: string;
  itpPct: string;
  gastosNotariaPct: string;
  // KYC (Ley 10/2010)
  actividadProfesional: string;
  titularidadTipo: "propia" | "tercero";
  titularidadTerceroDetalle: string;
  prpFlag: "no" | "si";
  prpCargo: string;
  origenFondos: "ahorros" | "hipoteca" | "venta_patrimonio" | "herencia" | "otros";
  origenOtrosDetalle: string;
  // Parte de Visita
  fechaVisita: string;
  plazoContrato: string;  // YYYY-MM-DD
  plazoEscritura: string; // YYYY-MM-DD
  diasHabiles: string;
  // ── Contrato privado de compraventa ──────────────────────────────────────
  notarioNombre: string;
  notarioCiudad: string;
  notarioFechaEscritura: string; // YYYY-MM-DD
  notarioNumProtocolo: string;
  registroNumero: string;
  registroCiudad: string;
  ibanVendedor: string;
  formaPagoAmpliacion: string;
}

// ─── Constantes ──────────────────────────────────────────────────────────────

export const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  draft:     { label: "Borrador",         cls: "bg-slate-500/15 text-slate-300"  },
  sent:      { label: "Enviado a firmar", cls: "bg-sky-500/15 text-sky-300"      },
  viewed:    { label: "Visto",            cls: "bg-amber-500/15 text-amber-300"  },
  completed: { label: "Firmado",          cls: "bg-emerald-500/15 text-emerald-300" },
  rejected:  { label: "Rechazado",        cls: "bg-red-500/15 text-red-300"      },
};

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── Factory helpers ──────────────────────────────────────────────────────────

/** Crea un `OwnerInput` vacío para añadir filas al formulario de propietarios. */
export const emptyOwner = (): OwnerInput => ({
  nombre: "", dni: "", telefono: "", email: "", direccion: "",
});

/** Crea un `PartyInput` vacío (compradores en propuesta/contrato). */
export const emptyParty = (): PartyInput => ({ nombre: "", nif: "", email: "" });
