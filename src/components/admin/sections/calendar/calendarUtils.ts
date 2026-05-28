import type { AppointmentWithRelations } from "./types";

/** Estilo visual (fondo, punto e etiqueta) asociado a cada tipo de actividad. */
export interface BadgeStyle {
  bg: string;
  dot: string;
  label: string;
}

/** Mapea el tipo de cita a su estilo de badge / tarjeta. */
export function getBadgeStyle(type: string): BadgeStyle {
  switch (type) {
    case "captacion":
      return {
        bg: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20",
        dot: "bg-emerald-400",
        label: "Captación / Exclusiva"
      };
    case "visita":
      return {
        bg: "bg-sky-500/10 border-sky-500/30 text-sky-400 hover:bg-sky-500/20",
        dot: "bg-sky-400",
        label: "Visita Comprador"
      };
    case "cierre":
      return {
        bg: "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20",
        dot: "bg-amber-400",
        label: "Cierre / Legal"
      };
    case "admin":
      return {
        bg: "bg-slate-500/10 border-slate-500/30 text-slate-400 hover:bg-slate-500/20",
        dot: "bg-slate-400",
        label: "Administrativo"
      };
    case "blocked":
      return {
        bg: "bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/15 cursor-not-allowed pattern-stripes",
        dot: "bg-red-500",
        label: "Bloqueado"
      };
    default:
      return {
        bg: "bg-slate-700/50 border-slate-600/30 text-slate-300",
        dot: "bg-slate-400",
        label: "Reunión"
      };
  }
}

/** Devuelve las 6 fechas (Lunes→Sábado) de la semana que arranca en `weekStart`. */
export function getWeekDates(weekStart: Date): Date[] {
  const dates: Date[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    dates.push(d);
  }
  return dates;
}

/**
 * Busca la cita que ocupa un slot concreto (mismo día y dentro de su duración).
 * Permite que una cita de 60+ min ocupe varios slots consecutivos.
 */
export function getAppointmentForSlot(
  appointments: AppointmentWithRelations[],
  date: Date,
  timeSlot: string
): AppointmentWithRelations | undefined {
  return appointments.find(appt => {
    const apptDate = new Date(appt.scheduled_at);
    const sameDay = apptDate.getFullYear() === date.getFullYear() &&
                    apptDate.getMonth() === date.getMonth() &&
                    apptDate.getDate() === date.getDate();

    if (!sameDay) return false;

    const [slotH, slotM] = timeSlot.split(":").map(Number);
    const apptH = apptDate.getHours();
    const apptM = apptDate.getMinutes();

    const slotMinutesTotal = slotH * 60 + slotM;
    const apptMinutesTotal = apptH * 60 + apptM;
    const apptDuration = appt.duration_minutes || 30;

    return slotMinutesTotal >= apptMinutesTotal &&
           slotMinutesTotal < apptMinutesTotal + apptDuration;
  });
}

/**
 * Título a mostrar para una cita: usa su `title`, o deriva uno del tipo/lead.
 * @param fallback texto cuando no hay título ni lead (varía por vista).
 */
export function getAppointmentTitle(appt: AppointmentWithRelations, fallback = "Sin título"): string {
  return appt.title ||
    (appt.type === "blocked" ? "Bloqueado" :
     appt.leads?.name ? `${appt.type === "captacion" ? "Captación:" : "Visita:"} ${appt.leads.name}` :
     fallback);
}

/** KPIs de productividad semanal mostrados en el panel superior. */
export interface WeekStats {
  totalActivities: number;
  roadTimeStr: string;
  freeSlots: number;
}

/** Calcula actividades comerciales, tiempo estimado en carretera y huecos libres. */
export function computeWeekStats(appointments: AppointmentWithRelations[]): WeekStats {
  const activeWeekAppts = appointments.filter(a => ["captacion", "visita", "cierre"].includes(a.type || ""));
  const totalActivities = activeWeekAppts.length;

  const totalRoadTimeMinutes = activeWeekAppts.length * 20;
  const roadTimeHours = Math.floor(totalRoadTimeMinutes / 60);
  const roadTimeMins = totalRoadTimeMinutes % 60;
  const roadTimeStr = roadTimeHours > 0 ? `${roadTimeHours}h ${roadTimeMins}m` : `${roadTimeMins} min`;

  const totalWeeklySlots = 6 * 20;
  let occupiedSlotsCount = 0;
  appointments.forEach(appt => {
    const duration = appt.duration_minutes || 30;
    const slots = Math.max(1, Math.ceil(duration / 30));
    occupiedSlotsCount += slots;
  });
  const freeSlots = Math.max(0, totalWeeklySlots - occupiedSlotsCount);

  return { totalActivities, roadTimeStr, freeSlots };
}
