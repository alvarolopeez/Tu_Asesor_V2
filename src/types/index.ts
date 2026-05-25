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

export interface SellerActivityLog {
  id: string;
  lead_id: string;
  event_type: string;
  title: string;
  notes: string | null;
  event_date: string;
  created_at: string;
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
  channel: string | null;       // [2026-05-14] Añadido por Agente IA
  raw_message: string | null;   // [2026-05-14] Añadido por Agente IA
  response_text: string | null; // [2026-05-14] Añadido por Agente IA
  confidence_score: number | null; // [2026-05-14] Añadido por Agente IA
  session_id: string | null;    // [2026-05-14] Añadido por Agente IA → FK a chatbot_conversations
  created_at: string;
}

// ─── CHATBOT (Nuevo - Agente IA 2026-05-14) ──────────
export type ChatChannel = 'whatsapp' | 'web_widget' | 'chatwoot';
export type ConversationStatus = 'active' | 'escalated' | 'closed';
export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatbotConversation {
  id: string;
  lead_id: string | null;
  channel: ChatChannel;
  wa_phone_number: string | null;
  status: ConversationStatus;
  escalated_to: string | null;
  started_at: string;
  ended_at: string | null;
  metadata: Record<string, unknown>;
}

export interface ChatbotMessage {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  intent_detected: string | null;
  confidence: number | null;
  wa_message_id: string | null;
  created_at: string;
}

export interface N8nWebhookLog {
  id: string;
  webhook_name: string;
  source: string;
  payload: Record<string, unknown>;
  response_status: number | null;
  error_message: string | null;
  processed_at: string;
}

// ─── CHATBOT ENGINE TYPES ────────────────────────────
export interface ChatbotEngineRequest {
  conversation_id?: string;
  message: string;
  channel: ChatChannel;
  phone?: string;       // Para WhatsApp
  lead_name?: string;   // Si se conoce
}

export interface ChatbotEngineResponse {
  response: string;
  intent: AIIntent | 'ESCALATE' | null;
  confidence: number;
  data_extracted: {
    name?: string;
    phone?: string;
    preferred_date?: string;
    property_interest?: string;
  };
  conversation_id: string;
  should_escalate: boolean;
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

// ─── AI ZONE COPILOT ─────────────────────────────────
export interface AiZoneCopilotRequest {
  text: string;
}

export interface AiZoneCopilotResponse {
  detected_zones: string[];
  reasoning: string;
}

