"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import toast from "react-hot-toast";
import type { LeadRow, PropertyRow } from "./dashboard/types";
import type { AppointmentWithRelations } from "./calendar/types";
import { getWeekDates } from "./calendar/calendarUtils";
import CalendarKpis from "./calendar/CalendarKpis";
import CalendarToolbar from "./calendar/CalendarToolbar";
import WeekGridView from "./calendar/WeekGridView";
import RouteListView from "./calendar/RouteListView";
import AppointmentFormModal from "./calendar/AppointmentFormModal";

/**
 * Sección admin de la agenda de citas.
 *
 * Orquestador puro: carga las citas/leads/inmuebles de la semana visible,
 * decide qué vista (grid/ruta) se muestra y qué modal está abierto. Toda la
 * UI vive en los subcomponentes bajo `./calendar/`.
 *
 * @see CalendarKpis          — panel superior de KPIs de productividad
 * @see CalendarToolbar       — navegación semanal + selector de vista + alta
 * @see WeekGridView          — cuadrícula semanal (desktop) y de un día (móvil)
 * @see RouteListView         — timeline de ruta con deep-links
 * @see AppointmentFormModal  — modal CRUD (maneja su propio form + buscadores)
 */
export default function CalendarManager() {
  const [appointments, setAppointments] = useState<AppointmentWithRelations[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'route'>('grid');
  const [selectedWeekStart, setSelectedWeekStart] = useState<Date>(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // lunes
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  });

  // Día seleccionado en la vista móvil de cuadrícula (0=Lun … 5=Sáb)
  const [selectedDayIndex, setSelectedDayIndex] = useState(() => {
    const day = new Date().getDay(); // 0 Domingo, 1 Lunes, …, 6 Sábado
    if (day === 0) return 0;
    return day - 1;
  });

  // Modal de cita: null = cerrado. `editing` null => creando una nueva.
  const [modalState, setModalState] = useState<
    { editing: AppointmentWithRelations | null; date?: Date; timeSlot?: string } | null
  >(null);

  useEffect(() => {
    fetchCalendarData();
  }, [selectedWeekStart]);

  const fetchCalendarData = async () => {
    setLoading(true);
    try {
      // Rango de fechas de la semana (Lunes a Sábado)
      const weekEnd = new Date(selectedWeekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      const [apptsRes, leadsRes, propsRes] = await Promise.all([
        supabase
          .from("appointments")
          .select("*, leads(name, phone, email), properties(title, price)")
          .gte("scheduled_at", selectedWeekStart.toISOString())
          .lt("scheduled_at", weekEnd.toISOString()),
        supabase.from("leads").select("*").order("name", { ascending: true }),
        supabase.from("properties").select("*").order("title", { ascending: true })
      ]);

      if (apptsRes.data) setAppointments(apptsRes.data);
      if (leadsRes.data) setLeads(leadsRes.data);
      if (propsRes.data) setProperties(propsRes.data);
    } catch (err) {
      console.error("Error fetching calendar data:", err);
    } finally {
      setLoading(false);
    }
  };

  const weekDates = getWeekDates(selectedWeekStart);

  const handlePrevWeek = () => {
    const d = new Date(selectedWeekStart);
    d.setDate(d.getDate() - 7);
    setSelectedWeekStart(d);
  };

  const handleNextWeek = () => {
    const d = new Date(selectedWeekStart);
    d.setDate(d.getDate() + 7);
    setSelectedWeekStart(d);
  };

  const handleJumpToToday = () => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    setSelectedWeekStart(monday);
  };

  // Bloquear día completo rápido (10:00–20:00)
  const handleBlockFullDay = async (date: Date) => {
    const dayStr = date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    if (!window.confirm(`¿Deseas bloquear completamente la agenda para el ${dayStr}?`)) return;

    try {
      const scheduledAt = new Date(date);
      scheduledAt.setHours(10, 0, 0, 0);

      const payload = {
        scheduled_at: scheduledAt.toISOString(),
        status: "confirmed",
        type: "blocked" as const,
        title: "Día Bloqueado Completo",
        location: "Oficina / Personal",
        notes: "Álvaro bloqueó este día para eventos automatizados.",
        duration_minutes: 600,
        lead_id: null,
        property_id: null
      };

      const { error } = await supabase.from("appointments").insert([payload]);
      if (error) throw error;
      fetchCalendarData();
    } catch (err) {
      console.error("Error blocking day:", err);
      toast.error("Hubo un error al bloquear el día.");
    }
  };

  // Tras guardar/eliminar en el modal: cerrar y refrescar la agenda.
  const handleSaved = () => {
    setModalState(null);
    fetchCalendarData();
  };

  return (
    <div className="space-y-6">

      {/* 1. KPIs DE PRODUCTIVIDAD (TOP PANEL) */}
      <CalendarKpis appointments={appointments} />

      {/* 2. CALENDAR NAV & VIEWS SELECTOR */}
      <CalendarToolbar
        weekDates={weekDates}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onPrevWeek={handlePrevWeek}
        onNextWeek={handleNextWeek}
        onJumpToToday={handleJumpToToday}
        onNewClick={() => setModalState({ editing: null })}
      />

      {/* 3. CALENDAR BODY */}
      {loading ? (
        <div className="bg-[#1E293B] p-12 rounded-2xl border border-white/5 flex flex-col items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-[#FBBF24] mb-3"></div>
          <p className="text-slate-400 text-sm">Cargando agenda de Álvaro...</p>
        </div>
      ) : viewMode === 'grid' ? (
        <WeekGridView
          weekDates={weekDates}
          appointments={appointments}
          selectedDayIndex={selectedDayIndex}
          onSelectDay={setSelectedDayIndex}
          onSlotCreate={(date, timeSlot) => setModalState({ editing: null, date, timeSlot })}
          onApptEdit={(appt) => setModalState({ editing: appt })}
          onBlockDay={handleBlockFullDay}
        />
      ) : (
        <RouteListView
          appointments={appointments}
          onApptEdit={(appt) => setModalState({ editing: appt })}
        />
      )}

      {/* 4. DETAILS / CREATION DIALOG (MODAL) */}
      {modalState && (
        <AppointmentFormModal
          editingAppointment={modalState.editing}
          initialDate={modalState.date}
          initialTimeSlot={modalState.timeSlot}
          leads={leads}
          properties={properties}
          onClose={() => setModalState(null)}
          onSaved={handleSaved}
        />
      )}

    </div>
  );
}
