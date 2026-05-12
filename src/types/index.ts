/**
 * Tipos e interfaces centralizadas del proyecto.
 * Mapean exactamente al schema de Supabase.
 * Actualizar si se modifica el schema de la BD.
 */

// ─── LEADS ────────────────────────────────────────────
export type LeadType = 'buyer' | 'seller';
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'visit_scheduled' | 'closed' | 'lost';

export interface Lead {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  type: LeadType | null;
  status: LeadStatus | null;
  source: string | null;
  property_id: string | null;
  preferences: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface LeadInsert {
  name: string;
  phone?: string;
  email?: string;
  type: LeadType;
  source?: string;
  preferences?: Record<string, unknown>;
}

// ─── PROPERTIES ───────────────────────────────────────
export type PropertyStatus = 'active' | 'sold' | 'rented' | 'draft';

export interface Property {
  id: string;
  title: string;
  description: string | null;
  price: number;
  status: PropertyStatus | null;
  features: Record<string, unknown>;
  images: string[];
  created_at: string;
  updated_at: string;
}

// ─── REVIEWS ──────────────────────────────────────────
export interface Review {
  id: string;
  client_name: string;
  rating: number; // 1-5
  comment: string;
  is_published: boolean; // Campo real en BD (no "status")
  created_at: string;
  updated_at: string;
}

// ─── TOOL CALCULATIONS ───────────────────────────────
export type ToolType = 'valoracion' | 'plusvalia' | 'plusvalia_fiscal' | 'rentabilidad';

export interface ToolCalculation {
  id: string;
  lead_id: string | null;
  tool_type: string;
  inputs: Record<string, unknown>;
  results: Record<string, unknown>;
  created_at: string;
}

// ─── APPOINTMENTS ────────────────────────────────────
export type AppointmentStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';

export interface Appointment {
  id: string;
  lead_id: string;
  property_id: string | null;
  scheduled_at: string;
  status: AppointmentStatus | null;
  cal_event_id: string | null;
  created_at: string;
}

// ─── AI INTERACTIONS ─────────────────────────────────
export type AIIntent = 'schedule_visit' | 'ask_price' | 'valuation' | 'general_inquiry';

export interface AIInteraction {
  id: string;
  lead_id: string;
  summary: string;
  intent: AIIntent | null;
  created_at: string;
}

// ─── CALCULATOR RESULTS ──────────────────────────────
export interface PlusvaliaResultMunicipal {
  tipo: 'municipal';
  baseObjetiva: number;
  cuotaObjetiva: number;
  baseReal: number;
  cuotaReal: number;
  cuotaFinal: number;
  mejorOpcion: string;
  ahorro: number;
}

export interface PlusvaliaResultFiscal {
  tipo: 'fiscal';
  ganancia: number;
  gananciaSujeta: number;
  cuotaIRPF: number;
}

export type PlusvaliaResult = PlusvaliaResultMunicipal | PlusvaliaResultFiscal;

export interface RentabilidadResult {
  inversionTotal: number;
  aportacionPropia: number;
  ingresosAnuales: number;
  gastosFijosAnuales: number;
  pagoAnualHipoteca: number;
  cuotaMensualHipoteca: number;
  irpf: number;
  beneficioNetoAnual: number;
  cashflowMensual: number;
  rentabilidadNeta: number;
  roe: number;
}
