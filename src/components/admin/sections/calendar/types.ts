import type { AppointmentRow } from "../dashboard/types";

/**
 * Cita tal y como la devuelve Supabase con sus joins de `leads` y `properties`.
 * Extiende el row base con los datos relacionados que pinta el calendario.
 */
export interface AppointmentWithRelations extends AppointmentRow {
  leads?: {
    name: string;
    phone: string | null;
    email: string | null;
  } | null;
  properties?: {
    title: string;
    price: number;
  } | null;
}

/** Tipos de actividad comercial que admite una cita/bloqueo. */
export type AppointmentType = "captacion" | "visita" | "cierre" | "admin" | "blocked";

/** Estado interno del formulario de alta/edición de citas. */
export interface AppointmentFormData {
  lead_id: string;
  property_id: string;
  scheduled_date: string;
  scheduled_time: string;
  status: string;
  type: AppointmentType;
  title: string;
  location: string;
  notes: string;
  duration_minutes: number;
}

/** Franjas horarias agendables (10:00 → 19:30 cada 30 min). */
export const TIME_SLOTS = [
  "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
  "13:00", "13:30", "14:00", "14:30", "15:00", "15:30",
  "16:00", "16:30", "17:00", "17:30", "18:00", "18:30",
  "19:00", "19:30"
];

/** Días laborables de la agenda (Lunes a Sábado). */
export const DAYS_OF_WEEK = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
