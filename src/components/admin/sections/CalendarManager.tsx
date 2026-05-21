"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { 
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  Phone,
  Plus,
  Edit2,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
  Check,
  CheckCircle,
  AlertCircle,
  List,
  Grid,
  Lock,
  User,
  Home,
  FileText,
  Map,
  PlusCircle,
  HelpCircle
} from "lucide-react";
import { AppointmentRow, LeadRow, PropertyRow } from "./dashboard/types";

// Extender el tipo de cita local para incluir los joins de Supabase
interface AppointmentWithRelations extends AppointmentRow {
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

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<AppointmentWithRelations | null>(null);
  const [formData, setFormData] = useState({
    lead_id: "",
    property_id: "",
    scheduled_date: "",
    scheduled_time: "10:00",
    status: "confirmed",
    type: "visita" as "captacion" | "visita" | "cierre" | "admin" | "blocked",
    title: "",
    location: "",
    notes: "",
    duration_minutes: 30
  });

  // Configuración de disponibilidad
  const TIME_SLOTS = [
    "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", 
    "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", 
    "16:00", "16:30", "17:00", "17:30", "18:00", "18:30", 
    "19:00", "19:30"
  ];

  // Lunes a Sábado
  const DAYS_OF_WEEK = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

  useEffect(() => {
    fetchCalendarData();
  }, [selectedWeekStart]);

  const fetchCalendarData = async () => {
    setLoading(true);
    try {
      // Calcular rango de fechas de la semana (Lunes a Sábado)
      const weekEnd = new Date(selectedWeekStart);
      weekEnd.setDate(weekEnd.getDate() + 6); // Hasta domingo inicio

      const [apptsRes, leadsRes, propsRes] = await Promise.all([
        supabase
          .from("appointments")
          .select("*, leads(name, phone, email), properties(title, price)")
          .gte("scheduled_at", selectedWeekStart.toISOString())
          .lt("scheduled_at", weekEnd.toISOString()),
        supabase
          .from("leads")
          .select("*")
          .order("name", { ascending: true }),
        supabase
          .from("properties")
          .select("*")
          .order("title", { ascending: true })
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

  // Helper para obtener las fechas de la semana actual
  const getWeekDates = () => {
    const dates: Date[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(selectedWeekStart);
      d.setDate(d.getDate() + i);
      dates.push(d);
    }
    return dates;
  };

  const weekDates = getWeekDates();

  // Navegación de semanas
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

  // Helper para buscar citas asociadas a un día y slot de hora
  const getAppointmentForSlot = (date: Date, timeSlot: string) => {
    return appointments.find(appt => {
      const apptDate = new Date(appt.scheduled_at);
      // Comparar fecha sin hora
      const sameDay = apptDate.getFullYear() === date.getFullYear() &&
                      apptDate.getMonth() === date.getMonth() &&
                      apptDate.getDate() === date.getDate();
      
      if (!sameDay) return false;

      // Comparar horas y minutos
      const [slotH, slotM] = timeSlot.split(":").map(Number);
      const apptH = apptDate.getHours();
      const apptM = apptDate.getMinutes();

      // Permitir solapamientos o duraciones mayores
      const slotMinutesTotal = slotH * 60 + slotM;
      const apptMinutesTotal = apptH * 60 + apptM;
      const apptDuration = appt.duration_minutes || 30;

      return slotMinutesTotal >= apptMinutesTotal && 
             slotMinutesTotal < apptMinutesTotal + apptDuration;
    });
  };

  // Abrir modal de creación/edición
  const handleOpenCreateModal = (date?: Date, timeSlot?: string) => {
    setEditingAppointment(null);
    let dateStr = "";
    if (date) {
      // Formato local YYYY-MM-DD
      const offset = date.getTimezoneOffset();
      const localDate = new Date(date.getTime() - (offset*60*1000));
      dateStr = localDate.toISOString().split("T")[0];
    } else {
      dateStr = new Date().toISOString().split("T")[0];
    }

    setFormData({
      lead_id: "",
      property_id: "",
      scheduled_date: dateStr,
      scheduled_time: timeSlot || "10:00",
      status: "confirmed",
      type: "visita",
      title: "",
      location: "",
      notes: "",
      duration_minutes: 30
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (appt: AppointmentWithRelations) => {
    setEditingAppointment(appt);
    const dateObj = new Date(appt.scheduled_at);
    
    // Formato local YYYY-MM-DD
    const offset = dateObj.getTimezoneOffset();
    const localDate = new Date(dateObj.getTime() - (offset*60*1000));
    const dateStr = localDate.toISOString().split("T")[0];

    const hours = String(dateObj.getHours()).padStart(2, '0');
    const minutes = String(dateObj.getMinutes()).padStart(2, '0');
    const timeStr = `${hours}:${minutes}`;

    setFormData({
      lead_id: appt.lead_id || "",
      property_id: appt.property_id || "",
      scheduled_date: dateStr,
      scheduled_time: timeStr,
      status: appt.status || "confirmed",
      type: appt.type || "visita",
      title: appt.title || "",
      location: appt.location || "",
      notes: appt.notes || "",
      duration_minutes: appt.duration_minutes || 30
    });
    setIsModalOpen(true);
  };

  // Guardar cita
  const handleSaveAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const [h, m] = formData.scheduled_time.split(":").map(Number);
      const scheduledAt = new Date(formData.scheduled_date);
      scheduledAt.setHours(h, m, 0, 0);

      const payload: Partial<AppointmentRow> = {
        scheduled_at: scheduledAt.toISOString(),
        status: formData.status,
        type: formData.type,
        title: formData.title || null,
        location: formData.location || null,
        notes: formData.notes || null,
        duration_minutes: Number(formData.duration_minutes),
        lead_id: formData.lead_id || null,
        property_id: formData.property_id || null
      };

      if (editingAppointment) {
        // Update
        const { error } = await supabase
          .from("appointments")
          .update(payload)
          .eq("id", editingAppointment.id);

        if (error) throw error;
      } else {
        // Create
        const { error } = await supabase
          .from("appointments")
          .insert([payload]);

        if (error) throw error;
      }

      setIsModalOpen(false);
      fetchCalendarData();
    } catch (err) {
      console.error("Error saving appointment:", err);
      alert("Hubo un error al guardar la cita.");
    }
  };

  // Eliminar cita
  const handleDeleteAppointment = async () => {
    if (!editingAppointment) return;
    if (!confirm("¿Seguro que deseas eliminar/cancelar esta cita o bloqueo?")) return;

    try {
      const { error } = await supabase
        .from("appointments")
        .delete()
        .eq("id", editingAppointment.id);

      if (error) throw error;

      setIsModalOpen(false);
      fetchCalendarData();
    } catch (err) {
      console.error("Error deleting appointment:", err);
      alert("Hubo un error al eliminar la cita.");
    }
  };

  // Bloquear día completo rápido
  const handleBlockFullDay = async (date: Date) => {
    const dayStr = date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    if (!confirm(`¿Deseas bloquear completamente la agenda para el ${dayStr}?`)) return;

    try {
      // Creamos un único bloqueo de 10:00 a 20:00 (600 minutos)
      const scheduledAt = new Date(date);
      scheduledAt.setHours(10, 0, 0, 0);

      const payload = {
        scheduled_at: scheduledAt.toISOString(),
        status: "confirmed",
        type: "blocked" as const,
        title: "Día Bloqueado Completo",
        location: "Oficina / Personal",
        notes: "Álvaro bloqueó este día para eventos automatizados.",
        duration_minutes: 600, // 10 horas completas
        lead_id: null,
        property_id: null
      };

      const { error } = await supabase
        .from("appointments")
        .insert([payload]);

      if (error) throw error;
      fetchCalendarData();
    } catch (err) {
      console.error("Error blocking day:", err);
      alert("Hubo un error al bloquear el día.");
    }
  };

  // --- KPIs y Estadísticas de Productividad ---
  // Total actividades (captacion, visita, cierre) de la semana actual
  const activeWeekAppts = appointments.filter(a => ['captacion', 'visita', 'cierre'].includes(a.type || ''));
  const totalActivities = activeWeekAppts.length;

  // Tiempo estimado en carretera: 20 min por cita comercial presencial
  const totalRoadTimeMinutes = activeWeekAppts.length * 20;
  const roadTimeHours = Math.floor(totalRoadTimeMinutes / 60);
  const roadTimeMins = totalRoadTimeMinutes % 60;
  const roadTimeStr = roadTimeHours > 0 ? `${roadTimeHours}h ${roadTimeMins}m` : `${roadTimeMins} min`;

  // Espacios libres: slots totales (6 días * 20 slots = 120) menos los slots ocupados (o con bloqueos)
  const totalWeeklySlots = 6 * 20;
  // Calculamos cuántos slots están tomados. Si una cita dura 60 min, consume 2 slots.
  let occupiedSlotsCount = 0;
  appointments.forEach(appt => {
    const duration = appt.duration_minutes || 30;
    const slots = Math.max(1, Math.ceil(duration / 30));
    occupiedSlotsCount += slots;
  });
  const freeSlots = Math.max(0, totalWeeklySlots - occupiedSlotsCount);

  // Mapear color e icono por tipo de actividad comercial
  const getBadgeStyle = (type: string) => {
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
  };

  // Lista ordenada cronológicamente de citas para la vista de Ruta
  const sortedAppointments = [...appointments].sort((a, b) => 
    new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
  );

  return (
    <div className="space-y-6">
      
      {/* 1. KPIs DE PRODUCTIVIDAD (TOP PANEL) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* KPI 1: Actividades */}
        <div className="bg-[#1E293B] p-5 rounded-2xl border border-white/5 flex items-center gap-4 shadow-xl">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-slate-400 text-xs uppercase tracking-wider font-semibold">Actividades Comerciales</p>
            <h3 className="text-2xl font-bold text-white mt-1">{totalActivities} <span className="text-xs font-normal text-slate-400">citas activas</span></h3>
            <p className="text-[11px] text-emerald-400/80 mt-0.5">Visitas, valoraciones y firmas</p>
          </div>
        </div>

        {/* KPI 2: Carretera Heurística */}
        <div className="bg-[#1E293B] p-5 rounded-2xl border border-white/5 flex items-center gap-4 shadow-xl">
          <div className="w-12 h-12 rounded-xl bg-sky-500/10 flex items-center justify-center text-sky-400 shrink-0">
            <Map className="w-6 h-6" />
          </div>
          <div>
            <p className="text-slate-400 text-xs uppercase tracking-wider font-semibold">Carretera Estimado</p>
            <h3 className="text-2xl font-bold text-white mt-1">{roadTimeStr}</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">20 min / desplazamiento comercial</p>
          </div>
        </div>

        {/* KPI 3: Huecos Disponibles */}
        <div className="bg-[#1E293B] p-5 rounded-2xl border border-white/5 flex items-center gap-4 shadow-xl">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 shrink-0">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-slate-400 text-xs uppercase tracking-wider font-semibold">Huecos Agendables AI</p>
            <h3 className="text-2xl font-bold text-white mt-1">{freeSlots} <span className="text-xs font-normal text-slate-400">libres</span></h3>
            <p className="text-[11px] text-amber-400/80 mt-0.5">Disponibles para visitas/chatbot</p>
          </div>
        </div>

      </div>

      {/* 2. CALENDAR NAV & VIEWS SELECTOR */}
      <div className="bg-[#1E293B] p-5 rounded-2xl border border-white/5 flex flex-col md:flex-row justify-between items-center gap-4 shadow-xl">
        
        {/* Navigation */}
        <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-start">
          <div className="flex items-center gap-1">
            <button 
              onClick={handlePrevWeek} 
              className="p-2 hover:bg-white/5 rounded-xl border border-white/5 text-slate-300 transition-colors"
              title="Semana anterior"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button 
              onClick={handleJumpToToday} 
              className="px-4 py-2 hover:bg-white/5 rounded-xl border border-white/5 text-slate-200 text-sm font-semibold transition-colors"
            >
              Hoy
            </button>
            <button 
              onClick={handleNextWeek} 
              className="p-2 hover:bg-white/5 rounded-xl border border-white/5 text-slate-300 transition-colors"
              title="Semana siguiente"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <h2 className="text-white font-bold text-sm md:text-lg">
            Semana del {weekDates[0].toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} al {weekDates[5].toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
          </h2>
        </div>

        {/* View Toggle */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
          <div className="bg-slate-900 p-1 rounded-xl border border-white/5 flex">
            <button
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${viewMode === 'grid' ? 'bg-[#FBBF24] text-[#2C3E50]' : 'text-slate-400 hover:text-white'}`}
            >
              <Grid className="w-4 h-4" /> Cuadrícula Semanal
            </button>
            <button
              onClick={() => setViewMode('route')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${viewMode === 'route' ? 'bg-[#FBBF24] text-[#2C3E50]' : 'text-slate-400 hover:text-white'}`}
            >
              <List className="w-4 h-4" /> Lista de Ruta (Móvil)
            </button>
          </div>

          <button
            onClick={() => handleOpenCreateModal()}
            className="flex items-center gap-2 bg-[#FBBF24] hover:bg-yellow-500 text-[#2C3E50] font-bold text-xs px-4 py-2.5 rounded-xl transition-all shadow-md shadow-[#FBBF24]/10 shrink-0"
          >
            <Plus className="w-4 h-4" /> Nueva Cita / Bloqueo
          </button>
        </div>

      </div>

      {/* 3. CALENDAR BODY */}
      {loading ? (
        <div className="bg-[#1E293B] p-12 rounded-2xl border border-white/5 flex flex-col items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-[#FBBF24] mb-3"></div>
          <p className="text-slate-400 text-sm">Cargando agenda de Álvaro...</p>
        </div>
      ) : viewMode === 'grid' ? (
        
        // --- A. GRID VIEW (DESKTOP WEEKLY GRID) ---
        <div className="bg-[#1E293B] rounded-2xl border border-white/5 overflow-hidden shadow-2xl">
          
          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              
              {/* Header Days Row */}
              <div className="grid grid-cols-7 border-b border-white/5 bg-slate-900/60 sticky top-0 z-10">
                <div className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-center border-r border-white/5 flex items-center justify-center">
                  Hora
                </div>
                {weekDates.map((date, idx) => {
                  const isToday = new Date().toDateString() === date.toDateString();
                  return (
                    <div 
                      key={idx} 
                      className={`p-3 text-center border-r border-white/5 flex flex-col justify-center relative ${isToday ? 'bg-[#FBBF24]/5' : ''}`}
                    >
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{DAYS_OF_WEEK[idx]}</span>
                      <span className={`text-lg font-black mt-0.5 ${isToday ? 'text-[#FBBF24]' : 'text-white'}`}>
                        {date.getDate()}
                      </span>
                      {isToday && (
                        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#FBBF24] shadow-md shadow-[#FBBF24]/50" />
                      )}
                      
                      {/* Bloqueo rápido de día */}
                      <button
                        onClick={() => handleBlockFullDay(date)}
                        className="text-[9px] hover:text-red-400 text-slate-500 font-semibold absolute top-1 right-2 transition-colors"
                        title="Bloquear día completo"
                      >
                        Bloquear
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Grid Body */}
              <div className="divide-y divide-white/5">
                {TIME_SLOTS.map((timeSlot) => (
                  <div key={timeSlot} className="grid grid-cols-7 group/row">
                    
                    {/* Hour Column */}
                    <div className="py-2.5 px-3 text-xs font-semibold text-slate-400 bg-slate-900/20 border-r border-white/5 flex items-center justify-center gap-1.5 select-none">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      {timeSlot}
                    </div>

                    {/* Day Columns */}
                    {weekDates.map((date, dayIdx) => {
                      const appt = getAppointmentForSlot(date, timeSlot);
                      const isToday = new Date().toDateString() === date.toDateString();
                      
                      return (
                        <div 
                          key={dayIdx} 
                          className={`p-1.5 min-h-[60px] border-r border-white/5 transition-all relative group flex flex-col justify-stretch ${isToday ? 'bg-[#FBBF24]/[0.01]' : ''} hover:bg-white/[0.02]`}
                        >
                          {appt ? (
                            // Render Slot Event Card
                            (() => {
                              const style = getBadgeStyle(appt.type || "visita");
                              // Mostrar datos de lead, propiedad o custom title
                              const eventTitle = appt.title || 
                                (appt.type === "blocked" ? "Bloqueado" : 
                                 appt.leads?.name ? `${appt.type === "captacion" ? "Captación:" : "Visita:"} ${appt.leads.name}` : 
                                 "Sin título");
                              
                              const leadPhone = appt.leads?.phone;
                              
                              // Solo renderizar el inicio real en el slot de tiempo correspondiente (evitar repetir visualmente)
                              const apptDate = new Date(appt.scheduled_at);
                              const apptHours = String(apptDate.getHours()).padStart(2, '0');
                              const apptMinutes = String(apptDate.getMinutes()).padStart(2, '0');
                              const apptTime = `${apptHours}:${apptMinutes}`;
                              
                              if (apptTime !== timeSlot) {
                                // Devolver un div fantasma con diseño continuado de fondo
                                return (
                                  <div className={`text-[10px] py-1 px-2 rounded-lg border border-dashed flex items-center justify-center opacity-40 select-none ${style.bg}`}>
                                    (continuación)
                                  </div>
                                );
                              }

                              return (
                                <div 
                                  onClick={() => handleOpenEditModal(appt)}
                                  className={`rounded-xl p-2 border transition-all text-left flex flex-col justify-between cursor-pointer select-none shadow-md h-full relative overflow-hidden group ${style.bg}`}
                                >
                                  {/* Color Indicator tag */}
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                                    <span className="text-[9px] uppercase tracking-wider font-extrabold opacity-80">{style.label}</span>
                                  </div>

                                  <p className="text-[11px] font-black text-white leading-tight line-clamp-1">
                                    {eventTitle}
                                  </p>

                                  {appt.properties?.title && appt.type !== 'blocked' && (
                                    <span className="text-[9px] text-slate-300 mt-1 line-clamp-1 italic">
                                      🏠 {appt.properties.title}
                                    </span>
                                  )}

                                  {appt.location && (
                                    <span className="text-[9px] text-slate-400 mt-0.5 line-clamp-1 flex items-center gap-0.5">
                                      📍 {appt.location}
                                    </span>
                                  )}
                                </div>
                              );
                            })()
                          ) : (
                            // Empty slot (Hover creation helper)
                            <button
                              onClick={() => handleOpenCreateModal(date, timeSlot)}
                              className="w-full h-full rounded-xl border border-dashed border-white/0 group-hover:border-white/10 group-hover:bg-white/5 flex items-center justify-center text-slate-500 opacity-0 group-hover:opacity-100 transition-all py-3 gap-1"
                            >
                              <PlusCircle className="w-4 h-4 text-[#FBBF24]" />
                              <span className="text-[10px] font-bold text-slate-400">Agendar</span>
                            </button>
                          )}
                        </div>
                      );
                    })}

                  </div>
                ))}
              </div>

            </div>
          </div>
          
        </div>

      ) : (

        // --- B. ROUTE LIST VIEW (MOBILE OPTIMIZED TIMELINE) ---
        <div className="space-y-4">
          {sortedAppointments.length === 0 ? (
            <div className="bg-[#1E293B] p-10 rounded-2xl border border-white/5 text-center flex flex-col items-center justify-center">
              <CalendarIcon size={48} className="text-slate-500 mb-3" />
              <h4 className="text-white font-bold text-base">Sin citas para esta semana</h4>
              <p className="text-slate-400 text-sm max-w-sm mt-1">Disfruta del tiempo libre o bloquea slots adicionales usando el botón "Nueva Cita".</p>
            </div>
          ) : (
            <div className="relative border-l border-white/10 ml-4 md:ml-6 pl-6 space-y-6">
              {sortedAppointments.map((appt) => {
                const style = getBadgeStyle(appt.type || "visita");
                const dateObj = new Date(appt.scheduled_at);
                const dayName = dateObj.toLocaleDateString('es-ES', { weekday: 'long' });
                const dayNum = dateObj.getDate();
                const monthName = dateObj.toLocaleDateString('es-ES', { month: 'short' });
                const hour = String(dateObj.getHours()).padStart(2, '0');
                const minutes = String(dateObj.getMinutes()).padStart(2, '0');
                
                const apptTitle = appt.title || 
                  (appt.type === "blocked" ? "Bloqueado" : 
                   appt.leads?.name ? `${appt.type === "captacion" ? "Captación:" : "Visita:"} ${appt.leads.name}` : 
                   "Cita comercial");

                return (
                  <div key={appt.id} className="relative group">
                    
                    {/* Circle Indicator on the line */}
                    <span className={`absolute -left-[31px] top-1.5 w-4 h-4 rounded-full border-4 border-[#1E293B] shadow ${style.dot}`} />

                    {/* Card container */}
                    <div className="bg-[#1E293B] rounded-2xl border border-white/5 p-5 shadow-xl hover:border-white/10 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4">
                      
                      <div className="space-y-2">
                        {/* Time tag */}
                        <div className="flex items-center gap-2">
                          <span className="bg-slate-900 border border-white/5 px-2.5 py-1 rounded-lg text-xs font-bold text-[#FBBF24] uppercase flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5" />
                            {dayName} {dayNum} {monthName} - {hour}:{minutes}
                          </span>
                          <span className={`px-2 py-0.5 rounded-md text-[10px] uppercase font-black border ${style.bg}`}>
                            {style.label}
                          </span>
                        </div>

                        {/* Title & Info */}
                        <h4 className="text-white font-extrabold text-lg group-hover:text-[#FBBF24] transition-colors">
                          {apptTitle}
                        </h4>

                        {/* Lead / Phone detail */}
                        {appt.leads && (
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-400 text-xs mt-1">
                            <span className="flex items-center gap-1 text-slate-300">
                              <User className="w-3.5 h-3.5 text-slate-500" />
                              Lead: {appt.leads.name} ({appt.leads.email || "Sin email"})
                            </span>
                            {appt.leads.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="w-3.5 h-3.5 text-slate-500" />
                                {appt.leads.phone}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Property linked */}
                        {appt.properties && (
                          <p className="text-slate-300 text-xs flex items-center gap-1 italic">
                            <Home className="w-3.5 h-3.5 text-slate-500" />
                            Propiedad: {appt.properties.title} - {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(appt.properties.price)}
                          </p>
                        )}

                        {/* Notes */}
                        {appt.notes && (
                          <p className="text-slate-400 text-xs bg-slate-900/40 p-2.5 rounded-xl border border-white/5 mt-2 italic max-w-xl">
                            📝 "{appt.notes}"
                          </p>
                        )}

                        {/* Location */}
                        {appt.location && (
                          <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                            <MapPin className="w-4 h-4 text-red-400" />
                            <span>Dirección: {appt.location}</span>
                          </div>
                        )}

                      </div>

                      {/* --- RESPONSIVE MOBILE DEEP LINKS & ACTIONS --- */}
                      <div className="flex items-center gap-2 mt-2 md:mt-0 shrink-0">
                        
                        {/* 1. Google Maps Navigation */}
                        {appt.location && (
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(appt.location)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 bg-[#FBBF24]/10 hover:bg-[#FBBF24]/20 border border-[#FBBF24]/30 text-[#FBBF24] font-bold text-xs px-4 py-2.5 rounded-xl transition-all w-full md:w-auto justify-center"
                          >
                            <MapPin className="w-4 h-4" /> Cómo llegar
                          </a>
                        )}

                        {/* 2. Direct Lead Call */}
                        {appt.leads?.phone && (
                          <a
                            href={`tel:${appt.leads.phone}`}
                            className="flex items-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-bold text-xs px-4 py-2.5 rounded-xl transition-all w-full md:w-auto justify-center"
                          >
                            <Phone className="w-4 h-4" /> Llamar cliente
                          </a>
                        )}

                        {/* 3. General edit */}
                        <button
                          onClick={() => handleOpenEditModal(appt)}
                          className="p-2.5 hover:bg-white/5 border border-white/5 text-slate-400 hover:text-white rounded-xl transition-colors"
                          title="Editar"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                      </div>

                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      )}

      {/* 4. DETAILS / CREATION DIALOG (MODAL) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#0F172A]/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#1E293B] border border-white/10 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 relative">
            
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>

            <h3 className="text-white font-black text-xl mb-4 flex items-center gap-2">
              <CalendarIcon className="text-[#FBBF24] w-6 h-6" />
              {editingAppointment ? "Editar Cita comercial" : "Programar Nueva Actividad o Bloqueo"}
            </h3>

            <form onSubmit={handleSaveAppointment} className="space-y-4">
              
              {/* Tipo de Cita / Impacto */}
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Tipo de Evento</label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {[
                    { id: "visita", label: "🔵 Visita", desc: "Visita comprador" },
                    { id: "captacion", label: "🟢 Captación", desc: "Valoración / Exclusiva" },
                    { id: "cierre", label: "🟡 Cierre", desc: "Arras / Notaría" },
                    { id: "admin", label: "⚫ Admin", desc: "Oficina / Marketing" },
                    { id: "blocked", label: "🚫 Bloqueo", desc: "Agenda Álvaro" }
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setFormData({ ...formData, type: opt.id as any })}
                      className={`px-2 py-2 rounded-xl text-xs font-bold border transition-all text-center flex flex-col justify-center items-center gap-0.5 ${formData.type === opt.id ? 'bg-[#FBBF24] text-[#2C3E50] border-[#FBBF24]' : 'bg-slate-900 hover:bg-slate-800 text-slate-400 border-white/5'}`}
                      title={opt.desc}
                    >
                      <span>{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Título personalizado */}
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Título / Descripción corta</label>
                <input
                  type="text"
                  required
                  placeholder={formData.type === "blocked" ? "Tarde de descanso / Reunión personal" : "Ej. Visita c/ Familia Gómez"}
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all"
                />
              </div>

              {/* Link a Lead (Comprador o Vendedor) */}
              {formData.type !== "blocked" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Lead Asociado</label>
                    <select
                      value={formData.lead_id}
                      onChange={(e) => setFormData({ ...formData, lead_id: e.target.value })}
                      className="w-full bg-slate-900 border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all"
                    >
                      <option value="">-- Sin lead asignado --</option>
                      {leads.map((lead) => (
                        <option key={lead.id} value={lead.id}>
                          {lead.name} ({lead.type === 'buyer' ? 'Pedido/Comprador' : 'Vendedor'})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Link a Propiedad */}
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Inmueble de Interés</label>
                    <select
                      value={formData.property_id}
                      onChange={(e) => setFormData({ ...formData, property_id: e.target.value })}
                      className="w-full bg-slate-900 border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all"
                    >
                      <option value="">-- Sin propiedad asociada --</option>
                      {properties.map((prop) => (
                        <option key={prop.id} value={prop.id}>
                          {prop.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Fecha, Hora y Duración */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Fecha</label>
                  <input
                    type="date"
                    required
                    value={formData.scheduled_date}
                    onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Hora de Inicio</label>
                  <select
                    value={formData.scheduled_time}
                    onChange={(e) => setFormData({ ...formData, scheduled_time: e.target.value })}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all"
                  >
                    {TIME_SLOTS.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Duración (minutos)</label>
                  <select
                    value={formData.duration_minutes}
                    onChange={(e) => setFormData({ ...formData, duration_minutes: Number(e.target.value) })}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all"
                  >
                    <option value={30}>30 min (Medio slot)</option>
                    <option value={60}>60 min (1 slot)</option>
                    <option value={90}>90 min (1.5 slots)</option>
                    <option value={120}>120 min (2 slots)</option>
                    <option value={180}>180 min (3 slots)</option>
                  </select>
                </div>
              </div>

              {/* Dirección / Ubicación */}
              {formData.type !== "blocked" && (
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Ubicación / Dirección exacta</label>
                  <input
                    type="text"
                    placeholder="Ej. Calle Sierpes 45, Sevilla (para link Google Maps)"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all"
                  />
                </div>
              )}

              {/* Estado */}
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Estado</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all"
                >
                  <option value="pending">Pendiente (Sin confirmar por Álvaro)</option>
                  <option value="confirmed">Confirmado / Activo</option>
                  <option value="completed">Completado / Realizado</option>
                  <option value="cancelled">Cancelado</option>
                </select>
              </div>

              {/* Notas adicionales */}
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Notas / Comentarios adicionales</label>
                <textarea
                  placeholder="Detalles complementarios de la reunión..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all resize-none"
                />
              </div>

              {/* Footer Buttons */}
              <div className="flex flex-col sm:flex-row justify-between gap-3 pt-4 border-t border-white/5">
                
                {editingAppointment ? (
                  <button
                    type="button"
                    onClick={handleDeleteAppointment}
                    className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 font-bold text-sm px-4 py-2.5 rounded-xl transition-all justify-center order-2 sm:order-1"
                  >
                    <Trash2 className="w-4 h-4" /> Eliminar Cita
                  </button>
                ) : (
                  <div className="order-2 sm:order-1" />
                )}

                <div className="flex gap-2 order-1 sm:order-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm rounded-xl transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex items-center gap-2 bg-[#FBBF24] hover:bg-yellow-500 text-[#2C3E50] font-bold text-sm px-5 py-2.5 rounded-xl transition-all shadow-md shadow-[#FBBF24]/10"
                  >
                    <Check className="w-4 h-4" />
                    {editingAppointment ? "Guardar Cambios" : "Programar Evento"}
                  </button>
                </div>

              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
