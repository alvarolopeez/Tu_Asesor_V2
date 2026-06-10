import { useState } from "react";
import { supabase } from "@/lib/supabase";
import toast from "react-hot-toast";
import { Calendar as CalendarIcon, Trash2, X, Check } from "lucide-react";
import type { AppointmentRow, LeadRow, PropertyRow } from "../dashboard/types";
import { TIME_SLOTS } from "./types";
import type { AppointmentWithRelations, AppointmentFormData, AppointmentType } from "./types";

interface AppointmentFormModalProps {
  /** Cita a editar; `null` abre el formulario en modo creación. */
  editingAppointment: AppointmentWithRelations | null;
  /** Fecha pre-seleccionada al crear desde un slot del grid. */
  initialDate?: Date;
  /** Hora pre-seleccionada (HH:MM) al crear desde un slot del grid. */
  initialTimeSlot?: string;
  leads: LeadRow[];
  properties: PropertyRow[];
  onClose: () => void;
  /** Tras guardar/eliminar con éxito: el padre cierra y refresca. */
  onSaved: () => void;
}

/**
 * Funnel (Brief #007 T2.3): al cancelar/eliminar una cita desde el CRM, el
 * lead revierte de visit_scheduled a su estado previo. El helper es
 * server-side (service-role) → pasamos por POST /api/leads/funnel.
 * Fire-and-soft: si falla, la cita ya quedó cancelada igualmente.
 */
function revertLeadVisitStatus(leadId: string | null | undefined): void {
  if (!leadId) return;
  void fetch("/api/leads/funnel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leadId, action: "revert_visit" }),
  }).catch((err) => console.warn("[AppointmentFormModal] revert funnel falló:", err));
}

/** Convierte una fecha a `YYYY-MM-DD` en horario local. */
function toLocalDateStr(date: Date): string {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60 * 1000);
  return localDate.toISOString().split("T")[0];
}

function buildInitialFormData(
  editing: AppointmentWithRelations | null,
  initialDate?: Date,
  initialTimeSlot?: string
): AppointmentFormData {
  if (editing) {
    const dateObj = new Date(editing.scheduled_at);
    const hours = String(dateObj.getHours()).padStart(2, '0');
    const minutes = String(dateObj.getMinutes()).padStart(2, '0');
    return {
      lead_id: editing.lead_id || "",
      property_id: editing.property_id || "",
      scheduled_date: toLocalDateStr(dateObj),
      scheduled_time: `${hours}:${minutes}`,
      status: editing.status || "confirmed",
      type: editing.type || "visita",
      title: editing.title || "",
      location: editing.location || "",
      notes: editing.notes || "",
      duration_minutes: editing.duration_minutes || 30,
    };
  }
  return {
    lead_id: "",
    property_id: "",
    scheduled_date: initialDate ? toLocalDateStr(initialDate) : new Date().toISOString().split("T")[0],
    scheduled_time: initialTimeSlot || "10:00",
    status: "confirmed",
    type: "visita",
    title: "",
    location: "",
    notes: "",
    duration_minutes: 30,
  };
}

/**
 * Modal de alta/edición de citas y bloqueos. Posee todo el estado del
 * formulario y de los buscadores de lead/inmueble, y persiste en Supabase.
 */
export default function AppointmentFormModal({
  editingAppointment,
  initialDate,
  initialTimeSlot,
  leads,
  properties,
  onClose,
  onSaved,
}: AppointmentFormModalProps) {
  const [formData, setFormData] = useState<AppointmentFormData>(() =>
    buildInitialFormData(editingAppointment, initialDate, initialTimeSlot)
  );

  // Búsqueda interactiva de Leads e Inmuebles
  const [leadSearch, setLeadSearch] = useState(() => {
    const m = editingAppointment ? leads.find(l => l.id === editingAppointment.lead_id) : null;
    return m ? m.name : "";
  });
  const [propSearch, setPropSearch] = useState(() => {
    const m = editingAppointment ? properties.find(p => p.id === editingAppointment.property_id) : null;
    return m ? m.title : "";
  });
  const [isLeadDropdownOpen, setIsLeadDropdownOpen] = useState(false);
  const [isPropDropdownOpen, setIsPropDropdownOpen] = useState(false);

  const filteredLeads = leads.filter(lead => {
    if (!leadSearch) return true;
    const searchLower = leadSearch.toLowerCase();
    const nameMatch = lead.name.toLowerCase().includes(searchLower);
    const phoneMatch = lead.phone ? lead.phone.toLowerCase().includes(searchLower) : false;
    return nameMatch || phoneMatch;
  });

  const filteredProperties = properties.filter(prop => {
    if (!propSearch) return true;
    const searchLower = propSearch.toLowerCase();
    const titleMatch = prop.title.toLowerCase().includes(searchLower);
    const descMatch = prop.description ? prop.description.toLowerCase().includes(searchLower) : false;
    return titleMatch || descMatch;
  });

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
        const { error } = await supabase
          .from("appointments")
          .update(payload)
          .eq("id", editingAppointment.id);
        if (error) throw error;

        // Cancelación manual → revertir el funnel del lead (Brief #007 T2.3).
        if (formData.status === "cancelled" && editingAppointment.status !== "cancelled") {
          revertLeadVisitStatus(editingAppointment.lead_id || formData.lead_id);
        }
      } else {
        const { error } = await supabase
          .from("appointments")
          .insert([payload]);
        if (error) throw error;
      }

      onSaved();
    } catch (err) {
      console.error("Error saving appointment:", err);
      toast.error("Hubo un error al guardar la cita.");
    }
  };

  const handleDeleteAppointment = async () => {
    if (!editingAppointment) return;
    if (!window.confirm("¿Seguro que deseas eliminar/cancelar esta cita o bloqueo?")) return;

    try {
      const { error } = await supabase
        .from("appointments")
        .delete()
        .eq("id", editingAppointment.id);
      if (error) throw error;

      // Borrado físico → mismo efecto de funnel que una cancelación.
      if (editingAppointment.status !== "cancelled") {
        revertLeadVisitStatus(editingAppointment.lead_id);
      }

      onSaved();
    } catch (err) {
      console.error("Error deleting appointment:", err);
      toast.error("Hubo un error al eliminar la cita.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0F172A]/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#1E293B] border border-white/10 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 relative">

        <button
          onClick={onClose}
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
                  onClick={() => setFormData({ ...formData, type: opt.id as AppointmentType })}
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
              {/* Lead Asociado */}
              <div className="relative">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Lead Asociado</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="🔍 Buscar lead por nombre o tel..."
                    value={leadSearch}
                    onChange={(e) => {
                      setLeadSearch(e.target.value);
                      setIsLeadDropdownOpen(true);
                    }}
                    onFocus={() => setIsLeadDropdownOpen(true)}
                    onBlur={() => {
                      setTimeout(() => {
                        setIsLeadDropdownOpen(false);
                        const selected = leads.find(l => l.id === formData.lead_id);
                        if (selected) {
                          setLeadSearch(selected.name);
                        } else {
                          setLeadSearch("");
                        }
                      }, 250);
                    }}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl py-2.5 pl-4 pr-10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all"
                  />
                  {formData.lead_id && (
                    <button
                      type="button"
                      onClick={() => {
                        setFormData({ ...formData, lead_id: "" });
                        setLeadSearch("");
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-lg font-bold"
                    >
                      &times;
                    </button>
                  )}
                </div>
                {isLeadDropdownOpen && (
                  <div className="absolute left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-slate-900 border border-white/10 rounded-xl shadow-2xl z-50 divide-y divide-white/5 scrollbar-thin scrollbar-thumb-slate-700">
                    {filteredLeads.length === 0 ? (
                      <div className="p-3 text-xs text-slate-400 italic">No se encontraron leads</div>
                    ) : (
                      filteredLeads.map((lead) => (
                        <button
                          key={lead.id}
                          type="button"
                          onClick={() => {
                            setFormData({ ...formData, lead_id: lead.id });
                            setLeadSearch(lead.name);
                            setIsLeadDropdownOpen(false);
                          }}
                          className="w-full text-left p-3 hover:bg-slate-800 focus:bg-slate-800 focus:outline-none transition-colors block"
                        >
                          <div className="text-sm font-semibold text-white">{lead.name}</div>
                          <div className="flex justify-between text-xs text-slate-400 mt-0.5">
                            <span>{lead.type === 'buyer' ? '🟢 Pedido/Comprador' : '🔵 Vendedor'}</span>
                            {lead.phone && <span>📞 {lead.phone}</span>}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Link a Propiedad */}
              <div className="relative">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Inmueble de Interés</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="🔍 Buscar dirección o título..."
                    value={propSearch}
                    onChange={(e) => {
                      setPropSearch(e.target.value);
                      setIsPropDropdownOpen(true);
                    }}
                    onFocus={() => setIsPropDropdownOpen(true)}
                    onBlur={() => {
                      setTimeout(() => {
                        setIsPropDropdownOpen(false);
                        const selected = properties.find(p => p.id === formData.property_id);
                        if (selected) {
                          setPropSearch(selected.title);
                        } else {
                          setPropSearch("");
                        }
                      }, 250);
                    }}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl py-2.5 pl-4 pr-10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all"
                  />
                  {formData.property_id && (
                    <button
                      type="button"
                      onClick={() => {
                        setFormData({ ...formData, property_id: "" });
                        setPropSearch("");
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-lg font-bold"
                    >
                      &times;
                    </button>
                  )}
                </div>
                {isPropDropdownOpen && (
                  <div className="absolute left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-slate-900 border border-white/10 rounded-xl shadow-2xl z-50 divide-y divide-white/5 scrollbar-thin scrollbar-thumb-slate-700">
                    {filteredProperties.length === 0 ? (
                      <div className="p-3 text-xs text-slate-400 italic">No se encontraron propiedades</div>
                    ) : (
                      filteredProperties.map((prop) => (
                        <button
                          key={prop.id}
                          type="button"
                          onClick={() => {
                            setFormData({ ...formData, property_id: prop.id });
                            setPropSearch(prop.title);
                            setIsPropDropdownOpen(false);
                          }}
                          className="w-full text-left p-3 hover:bg-slate-800 focus:bg-slate-800 focus:outline-none transition-colors block"
                        >
                          <div className="text-sm font-semibold text-white">{prop.title}</div>
                          <div className="flex justify-between text-xs text-slate-400 mt-0.5">
                            <span className="line-clamp-1 max-w-[180px]">{prop.description || 'Sin dirección'}</span>
                            {prop.price && <span className="text-[#FBBF24] font-bold">{new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(prop.price)}</span>}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
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
                onClick={onClose}
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
  );
}
