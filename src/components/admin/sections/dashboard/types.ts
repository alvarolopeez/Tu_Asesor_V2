/**
 * Tipos compartidos para los sub-componentes del Dashboard.
 * Evita repetir `any[]` en cada tab y centraliza el contrato de datos.
 * 
 * CREADO: Auditoría Supervisor (Mayo 2026)
 * Sustituye los 22+ usos de `any[]` que tenía el monolito original.
 */

// ─── Datos del Dashboard ─────────────────────────────────
export interface DashboardData {
  properties: PropertyRow[]
  leads: LeadRow[]
  appointments: AppointmentRow[]
  conversations: ConversationRow[]
  messages: MessageRow[]
  webhookLogs: WebhookLogRow[]
  webVisits: WebVisitRow[]
  expenses: ExpenseRow[]
  systemErrors: SystemErrorRow[]
}

export interface PropertyRow {
  id: string
  title: string
  description: string | null
  price: number
  status: string | null
  features: Record<string, unknown>
  images: string[]
  created_at: string
  updated_at: string
  /** Fecha real de publicación al mercado (Fase 3). Null = aún no publicada. */
  published_at?: string | null
}

export interface LeadRow {
  id: string
  name: string
  phone: string | null
  email: string | null
  type: string | null
  status: string | null
  source: string | null
  property_id: string | null
  preferences: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface AppointmentRow {
  id: string
  lead_id: string | null
  property_id: string | null
  scheduled_at: string
  status: string | null
  cal_event_id: string | null
  created_at: string
  type?: 'captacion' | 'visita' | 'cierre' | 'admin' | 'blocked'
  title?: string | null
  location?: string | null
  notes?: string | null
  duration_minutes?: number
}

export interface ConversationRow {
  id: string
  lead_id: string | null
  channel: string
  wa_phone_number: string | null
  status: string
  escalated_to: string | null
  started_at: string
  ended_at: string | null
  metadata: Record<string, unknown>
}

export interface MessageRow {
  id: string
  conversation_id: string
  role: string
  content: string
  intent_detected: string | null
  confidence: number | null
  wa_message_id: string | null
  created_at: string
}

export interface WebhookLogRow {
  id: string
  webhook_name: string
  source: string
  payload: Record<string, unknown>
  response_status: number | null
  error_message: string | null
  processed_at: string
}

export interface WebVisitRow {
  id: string
  session_id: string
  page: string
  referrer: string | null
  created_at: string
}

export interface ExpenseRow {
  id: string
  name: string
  category: string
  amount: number
  is_automated: boolean
  created_at: string
}

export interface SystemErrorRow {
  id: string
  error_type: string
  message: string
  severity: string
  details: Record<string, unknown>
  created_at: string
}

export interface BuyerActivityLogRow {
  id: string
  buyer_id: string
  event_type: string
  title: string
  notes: string | null
  event_date: string
  created_at: string
  property_id?: string | null
}

export interface BuyerDemandRow {
  id: string
  name: string
  phone: string | null
  email: string | null
  max_budget: number
  status: string
  preferred_zones?: string[] | null
  created_at?: string
  funding_type?: string | null
  lead_id?: string | null
}

export interface EncargoRow {
  id: string
  seller_lead_id: string | null
  property_id: string | null
  fecha_firma: string | null
  status: string
  created_at: string
  updated_at: string
}

export interface SellerActivityLogRow {
  id: string
  lead_id: string
  event_type: string
  event_date: string
  property_id: string | null
}

