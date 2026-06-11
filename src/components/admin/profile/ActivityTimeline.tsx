"use client";

// Brief #011 F3 (D12): timeline de actividad editable y compartido por las
// páginas completas de comprador, vendedor y encargo. Replica el patrón del
// timeline del drawer de BuyersManager (form inline + lista cronológica +
// editar/borrar con confirmación) parametrizado por tabla y columna dueña.

import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Plus, X, Edit3, Trash2, AlertTriangle, Home } from "lucide-react";
import toast from "react-hot-toast";
import type { TimelineIconConfig } from "./timelineIcons";

export interface TimelineLogRow {
  id: string;
  event_type: string;
  title: string;
  notes: string | null;
  event_date: string;
  property_id?: string | null;
}

export interface TimelinePropertyOption {
  id: string;
  title: string;
  price?: number | null;
}

export interface NewTimelineEvent {
  event_type: string;
  title: string;
  notes: string | null;
  event_date: string; // ISO
}

/**
 * Entrada adicional de SOLO LECTURA fusionada cronológicamente con los logs
 * propios (hotfix post-Sesión B: el timeline del encargo muestra también la
 * actividad del comprador sobre ese inmueble, como hacía el drawer antiguo).
 * Trae su propia config de icono y un badge de procedencia.
 */
export interface ExtraTimelineLog {
  id: string;
  event_type: string;
  title: string;
  notes: string | null;
  event_date: string;
  iconConfig: TimelineIconConfig;
  badge?: string;
}

interface ActivityTimelineProps {
  table: "buyer_activity_logs" | "seller_activity_logs";
  ownerColumn: "buyer_id" | "lead_id";
  ownerId: string;
  eventTypes: { value: string; label: string }[];
  getIconConfig: (type: string) => TimelineIconConfig;
  /** Filtro adicional del timeline del encargo: WHERE property_id = X. */
  filterPropertyId?: string;
  /** Campos fijos añadidos a cada INSERT/UPDATE (p.ej. property_id del encargo). */
  insertExtras?: Record<string, unknown>;
  /** Si se pasa, el form muestra "Vincular a inmueble" (timeline del comprador). */
  properties?: TimelinePropertyOption[];
  /** Side-effects tras CREAR un evento (citas en calendario, etc.). */
  onEventCreated?: (event: NewTimelineEvent) => void | Promise<void>;
  /** Nota de alcance visible (p.ej. "Mostrando el timeline completo del vendedor"). */
  scopeNote?: string;
  /** Entradas read-only de otras fuentes, fusionadas por fecha (sin editar/borrar). */
  extraLogs?: ExtraTimelineLog[];
}

export default function ActivityTimeline({
  table,
  ownerColumn,
  ownerId,
  eventTypes,
  getIconConfig,
  filterPropertyId,
  insertExtras,
  properties,
  onEventCreated,
  scopeNote,
  extraLogs,
}: ActivityTimelineProps) {
  const [logs, setLogs] = useState<TimelineLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formType, setFormType] = useState(eventTypes[0]?.value || "Nota");
  const [formTitle, setFormTitle] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formDate, setFormDate] = useState(new Date().toISOString().substring(0, 16));
  const [formPropertyId, setFormPropertyId] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from(table)
        .select("*")
        .eq(ownerColumn, ownerId)
        .order("event_date", { ascending: false });
      if (filterPropertyId) {
        query = query.eq("property_id", filterPropertyId);
      }
      const { data, error } = await query;
      if (error) throw error;
      setLogs((data as TimelineLogRow[]) || []);
    } catch (err: any) {
      console.error(`[ActivityTimeline] fetch ${table}:`, err.message);
      toast.error("Error al cargar el historial de actividad");
    } finally {
      setLoading(false);
    }
  }, [table, ownerColumn, ownerId, filterPropertyId]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  const resetForm = () => {
    setEditingId(null);
    setFormType(eventTypes[0]?.value || "Nota");
    setFormTitle("");
    setFormNotes("");
    setFormDate(new Date().toISOString().substring(0, 16));
    setFormPropertyId("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      toast.error("El título de la actividad es obligatorio");
      return;
    }
    setSaving(true);

    const payload: Record<string, unknown> = {
      [ownerColumn]: ownerId,
      event_type: formType,
      title: formTitle,
      notes: formNotes || null,
      event_date: new Date(formDate).toISOString(),
      ...(insertExtras || {}),
    };
    if (properties) {
      payload.property_id = formPropertyId || null;
    }

    try {
      if (editingId) {
        const { error } = await supabase.from(table).update(payload).eq("id", editingId);
        if (error) throw error;
        toast.success("Hito de actividad actualizado");
      } else {
        const { error } = await supabase.from(table).insert([payload]);
        if (error) throw error;
        toast.success("Actividad registrada en la línea de tiempo");
        // Side-effects del padre (cita en calendario, funnel...). Fire-and-soft:
        // el log ya quedó insertado; un fallo aquí no debe romper el alta.
        try {
          await onEventCreated?.({
            event_type: formType,
            title: formTitle,
            notes: formNotes || null,
            event_date: new Date(formDate).toISOString(),
          });
        } catch (sideErr: any) {
          console.warn("[ActivityTimeline] side-effect falló:", sideErr?.message || sideErr);
        }
      }
      resetForm();
      setShowForm(false);
      void fetchLogs();
    } catch (err: any) {
      console.error("[ActivityTimeline] guardar:", err.message);
      toast.error("No se pudo guardar la actividad");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
      toast.success("Evento eliminado de la línea de tiempo");
      setConfirmDeleteId(null);
      void fetchLogs();
    } catch (err: any) {
      console.error("[ActivityTimeline] borrar:", err.message);
      toast.error("No se pudo eliminar el evento");
    }
  };

  const startEdit = (log: TimelineLogRow) => {
    setEditingId(log.id);
    setFormType(log.event_type);
    setFormTitle(log.title);
    setFormNotes(log.notes || "");
    setFormPropertyId(log.property_id || "");
    setFormDate(new Date(log.event_date).toISOString().substring(0, 16));
    setShowForm(true);
  };

  const knownType = (type: string) => eventTypes.some((t) => t.value === type);

  // Fusión cronológica de los logs propios (editables) con los extras
  // read-only. Cada item lleva resuelta su config de icono y si es editable.
  const mergedLogs = [
    ...logs.map((log) => ({
      log,
      iconConf: getIconConfig(log.event_type),
      badge: undefined as string | undefined,
      editable: true,
    })),
    ...(extraLogs || []).map((ex) => ({
      log: ex as TimelineLogRow,
      iconConf: ex.iconConfig,
      badge: ex.badge,
      editable: false,
    })),
  ].sort((a, b) => new Date(b.log.event_date).getTime() - new Date(a.log.event_date).getTime());

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          {scopeNote && <p className="text-[10px] text-slate-500 italic">{scopeNote}</p>}
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowForm(!showForm);
          }}
          className="text-xs font-bold text-[#FBBF24] hover:text-white flex items-center gap-1 transition-colors bg-white/5 border border-white/15 px-2.5 py-1 rounded-lg cursor-pointer"
        >
          {showForm ? <X size={12} /> : <Plus size={12} />}
          {showForm ? "Cancelar" : "Nuevo Evento"}
        </button>
      </div>

      {/* Form inline alta/edición */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-[#1E293B] border border-[#FBBF24]/30 rounded-2xl p-4 space-y-3 animate-fade-in">
          <h5 className="text-xs font-bold text-white uppercase tracking-wide">
            {editingId ? "✍️ Editar Hito" : "➕ Registrar Hito"}
          </h5>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Tipo de Evento</label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
                className="w-full bg-[#0F172A] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#FBBF24]"
              >
                {eventTypes.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
                {/* Al editar un evento de tipo no ofertado (auto/legacy), consérvalo. */}
                {editingId && !knownType(formType) && (
                  <option value={formType}>{formType}</option>
                )}
              </select>
            </div>

            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Fecha y Hora</label>
              <input
                type="datetime-local"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="w-full bg-[#0F172A] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#FBBF24] [color-scheme:dark]"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Título de la Actividad</label>
            <input
              type="text"
              placeholder="Ej. Llamada de seguimiento"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              className="w-full bg-[#0F172A] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#FBBF24]"
              required
            />
          </div>

          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Notas Detalladas (Opcional)</label>
            <textarea
              placeholder="Comentarios y detalle de la gestión..."
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              rows={2}
              className="w-full bg-[#0F172A] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#FBBF24] resize-none"
            />
          </div>

          {properties && (
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Vincular a Inmueble (Opcional)</label>
              <select
                value={formPropertyId}
                onChange={(e) => setFormPropertyId(e.target.value)}
                className="w-full bg-[#0F172A] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#FBBF24]"
              >
                <option value="">-- No vincular a ningún inmueble --</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}{p.price != null ? ` (${Number(p.price).toLocaleString("es-ES")}€)` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 text-xs bg-white/5 text-slate-400 rounded-lg hover:bg-white/10 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-3.5 py-1.5 text-xs bg-[#FBBF24] text-[#2C3E50] font-black rounded-lg hover:bg-[#F59E0B] transition-colors cursor-pointer disabled:opacity-50"
            >
              {editingId ? "Guardar Cambios" : "Registrar Hito"}
            </button>
          </div>
        </form>
      )}

      {/* Lista cronológica */}
      <div className="relative pl-6 border-l-2 border-white/10 space-y-6 pt-2 ml-3">
        {loading ? (
          <div className="py-8 text-center text-xs text-slate-400">Cargando historial...</div>
        ) : mergedLogs.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-500">Historial vacío. Registra el primer evento de seguimiento.</div>
        ) : (
          mergedLogs.map(({ log, iconConf, badge, editable }) => {
            return (
              <div key={log.id} className="relative group/log">
                <div className={`absolute -left-[31px] top-1.5 w-4 h-4 rounded-full border-2 ${iconConf.color} bg-[#111827] shadow-lg transition-transform group-hover/log:scale-125`} />

                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2 hover:bg-white/[0.08] transition-all">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className={`text-[9px] font-black uppercase tracking-wider ${iconConf.textColor}`}>
                        {iconConf.label}
                      </span>
                      {badge && (
                        <span className="ml-2 text-[9px] font-bold uppercase tracking-wider text-slate-300 bg-white/10 border border-white/10 px-1.5 py-0.5 rounded">
                          {badge}
                        </span>
                      )}
                      <h5 className="font-bold text-white text-sm mt-0.5">{log.title}</h5>
                    </div>
                    <span className="text-[10px] text-slate-500 font-medium">
                      {new Date(log.event_date).toLocaleString("es-ES", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>

                  {log.notes && (
                    <p className="text-xs text-slate-300 leading-relaxed font-light whitespace-pre-line">
                      {log.notes}
                    </p>
                  )}

                  {properties && log.property_id && (
                    <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-2 py-1 rounded-lg text-[10px] text-slate-300 w-fit mt-2">
                      <Home size={10} className="text-[#FBBF24]" />
                      <span className="font-medium">Vinculado a:</span>
                      <span className="font-semibold text-[#FBBF24]">
                        {properties.find((p) => p.id === log.property_id)?.title || "Inmueble"}
                      </span>
                    </div>
                  )}

                  {editable && (
                    <div className="flex justify-end gap-2 pt-1 opacity-0 group-hover/log:opacity-100 transition-opacity">
                      <button
                        onClick={() => startEdit(log)}
                        className="text-[10px] text-slate-400 hover:text-[#FBBF24] flex items-center gap-0.5 cursor-pointer"
                      >
                        <Edit3 size={10} /> Editar
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(log.id)}
                        className="text-[10px] text-rose-500/80 hover:text-rose-400 flex items-center gap-0.5 cursor-pointer"
                      >
                        <Trash2 size={10} /> Eliminar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Confirmación de borrado */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmDeleteId(null)} />
          <div className="relative bg-[#1E293B] border border-rose-500/30 p-6 rounded-2xl shadow-2xl max-w-sm w-full z-50 text-center space-y-4 animate-zoom-in">
            <AlertTriangle className="text-rose-500 mx-auto" size={48} />
            <div>
              <h4 className="text-white font-bold text-base">Eliminar Hito del Historial</h4>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                ¿Estás seguro de que quieres borrar permanentemente esta actividad de la línea de tiempo?
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 py-2 bg-white/5 text-slate-300 rounded-xl text-xs font-semibold hover:bg-white/10 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={() => confirmDeleteId && handleDelete(confirmDeleteId)}
                className="flex-1 py-2 bg-rose-500 text-white rounded-xl text-xs font-bold hover:bg-rose-600 transition-colors cursor-pointer shadow-md"
              >
                Sí, Borrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
