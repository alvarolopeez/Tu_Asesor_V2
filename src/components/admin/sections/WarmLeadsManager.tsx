"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Lead, LeadStatus, SellerActivityLog } from "@/types";
import { formatCurrency } from "@/lib/utils";
import { 
  Users, 
  Search, 
  Filter, 
  Trash2, 
  X, 
  Briefcase, 
  TrendingUp, 
  DollarSign, 
  Phone, 
  Mail, 
  MapPin, 
  Home, 
  Check, 
  Calendar, 
  ChevronRight, 
  AlertTriangle,
  PlusCircle,
  CheckCircle,
  Clock,
  Compass,
  MessageSquare,
  Sparkles,
  Bot,
  RefreshCw,
  GitCommit,
  PhoneCall,
  Megaphone,
  Eye,
  Percent,
  Calculator,
  User,
  Activity,
  FileText
} from "lucide-react";
import toast from "react-hot-toast";
import EncargoFormModal, { type EncargoInitialValues } from "./encargos/EncargoFormModal";
import { displaySource, LEAD_SOURCE, LEAD_SOURCE_OPTIONS } from "@/lib/leadSources";
import { normalizeEsPhone } from "@/lib/phone";

// ─── INTERFACES & HELPER TYPES ──────────────────────────────────────────
interface WarmLeadsManagerProps {
  leads: Lead[];
  /** Brief #008 T4: navegar a Documentos con un intent de documento prerellenado. */
  onGoToDocuments?: (intent: import("./DocumentsManager.types").DocIntent) => void;
}

interface SellerPreferences {
  property_address?: string;
  property_type?: string;
  sqm?: number;
  rooms?: number;
  baths?: number;
  // Características capturadas en la calculadora pública de valoración
  street?: string;
  number?: string;
  floor?: string;
  elevator?: boolean;
  city?: string;
  zipcode?: string;
  condition?: string;
  hasTerrace?: boolean;
  hasGarage?: boolean;
  estimated_value?: number;
  agent_valuation?: number;
  commission_pct?: number;
  additionalNotes?: string;
  rgpd_accepted?: boolean;
}

// Brief #011 F2.1 (R8/D1): el funnel del VENDEDOR usa 4 estados en la UI.
// El CHECK de BD conserva los 6 por compatibilidad; las filas legacy con
// qualified/visit_scheduled se renderizan con LEGACY_STATUS_BADGE (en BD hoy
// no hay ninguna, verificado #007 T1.0, pero no rompemos si aparece).
const STATUS_CONFIG: Partial<Record<LeadStatus, { label: string; color: string; dot: string; bg: string }>> = {
  'new': { label: 'Nuevo Lead', color: 'text-amber-400 border-amber-500/20', dot: 'bg-amber-400', bg: 'bg-amber-500/10' },
  'contacted': { label: 'Contacto Establecido', color: 'text-blue-400 border-blue-500/20', dot: 'bg-blue-400', bg: 'bg-blue-500/10' },
  'closed': { label: 'Adquisición Hecha', color: 'text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-400', bg: 'bg-emerald-500/10' },
  'lost': { label: 'Inactivo / Perdido', color: 'text-slate-400 border-slate-500/20', dot: 'bg-slate-400', bg: 'bg-slate-500/10' }
};

const LEGACY_STATUS_BADGE = { label: 'Estado legacy', color: 'text-slate-400 border-slate-500/20', dot: 'bg-slate-400', bg: 'bg-slate-500/10' };

// Orígenes canónicos centralizados (fix #7).
const SOURCE_OPTIONS = LEAD_SOURCE_OPTIONS;

const PROPERTY_TYPES = ["Piso", "Casa", "Ático", "Dúplex", "Chalet", "Local", "Oficina", "Suelo", "Cualquiera"];

export default function WarmLeadsManager({ leads, onGoToDocuments }: WarmLeadsManagerProps) {
  // Brief #011 F3.2 (D12): el click en la fila abre la página completa
  // /admin/sellers/[id]. El drawer se CONSERVA como vista rápida (botón ojo)
  // porque transporta promoción a Encargo y DocIntent, flujos del dashboard.
  const router = useRouter();
  // ─── STATE MANAGEMENT ──────────────────────────────────────────────────
  const [sellerLeads, setSellerLeads] = useState<Lead[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [timelineLogs, setTimelineLogs] = useState<SellerActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Filters State
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterSource, setFilterSource] = useState<string>("");

  // Drawer Tabs State
  const [drawerTab, setDrawerTab] = useState<'profile' | 'property' | 'timeline'>('profile');

  // Timeline New Event Form State
  const [newLogType, setNewLogType] = useState<string>("Llamada");
  const [newLogTitle, setNewLogTitle] = useState<string>("");
  const [newLogNotes, setNewLogNotes] = useState<string>("");
  // Opcional: si se rellena, el hito también se agenda en el Calendario (appointment)
  const [newLogDateTime, setNewLogDateTime] = useState<string>("");

  // Promoción de lead → Encargo en exclusiva (reutiliza el form de Inmuebles)
  const [showPromoteForm, setShowPromoteForm] = useState(false);

  // Brief #011 F2.2 (R6): alta manual de vendedores
  const [showNewSellerModal, setShowNewSellerModal] = useState(false);
  const [newSellerName, setNewSellerName] = useState("");
  const [newSellerPhone, setNewSellerPhone] = useState("");
  const [newSellerEmail, setNewSellerEmail] = useState("");
  const [newSellerSource, setNewSellerSource] = useState<string>(LEAD_SOURCE.MANUAL);
  const [newSellerAddress, setNewSellerAddress] = useState("");
  const [creatingSeller, setCreatingSeller] = useState(false);

  // ─── INITIALIZATION & SYNC ─────────────────────────────────────────────
  useEffect(() => {
    if (leads) {
      // Filter strictly by lead type = 'seller', EXCLUDING captados en exclusiva.
      // Cuando un lead pasa a status='closed' (al crear su Encargo) deja de
      // pertenecer al pipeline de captación y pasa a vivir en el módulo
      // Encargos. Ver tarea de refactor 2026-06-03.
      const sellers = leads.filter(l => l.type === 'seller' && l.status !== 'closed');
      setSellerLeads(sellers);
      setLoading(false);
    }
  }, [leads]);

  // Sync selected lead when the central list updates
  useEffect(() => {
    if (selectedLead) {
      const updated = sellerLeads.find(l => l.id === selectedLead.id);
      if (updated) {
        setSelectedLead(updated);
      }
    }
  }, [sellerLeads]);


  // Handle opening drawer smoothly
  const openDrawer = (lead: Lead) => {
    setSelectedLead(lead);
    setDrawerTab('profile');
    setIsDrawerOpen(true);
    fetchTimelineLogs(lead.id);
  };

  const closeDrawer = () => {
    setIsDrawerOpen(false);
    setTimeout(() => {
      setSelectedLead(null);
      setTimelineLogs([]);
    }, 300); // Wait for transition out
  };

  // Safe helper to extract typed values from JSONB preferences
  const getPreferences = (lead: Lead | null): SellerPreferences => {
    if (!lead || !lead.preferences) return {};
    return lead.preferences as SellerPreferences;
  };

  // ─── DATABASE OPERATIONS ───────────────────────────────────────────────
  
  // Reload sellers locally from database to guarantee freshness
  const fetchSellers = async () => {
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('type', 'seller')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSellerLeads(data || []);
    } catch (err: any) {
      console.error("Error al recargar vendedores:", err.message);
    }
  };

  // ─── Alta manual de vendedores (Brief #011 F2.2 / R6) ────────────────────
  const resetNewSellerForm = () => {
    setNewSellerName("");
    setNewSellerPhone("");
    setNewSellerEmail("");
    setNewSellerSource(LEAD_SOURCE.MANUAL);
    setNewSellerAddress("");
  };

  /** Dedupe: el phone ya existe → mostrar el lead existente, NO duplicar. */
  const showExistingLead = (lead: Lead) => {
    setShowNewSellerModal(false);
    resetNewSellerForm();
    if (lead.type === 'seller' && lead.status !== 'closed') {
      toast(`Ese teléfono ya pertenece a ${lead.name} — abriendo su ficha`, { icon: 'ℹ️' });
      setSellerLeads(prev => (prev.some(l => l.id === lead.id) ? prev : [lead, ...prev]));
      openDrawer(lead);
    } else if (lead.type === 'seller') {
      toast(`Ese teléfono pertenece a ${lead.name}, ya captado en exclusiva (ver módulo Encargos)`, { icon: 'ℹ️' });
    } else {
      toast(`Ese teléfono ya pertenece al comprador ${lead.name} — no se ha creado el vendedor`, { icon: '⚠️' });
    }
  };

  const handleCreateSeller = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSellerName.trim()) {
      toast.error("El nombre del vendedor es obligatorio");
      return;
    }
    const normalizedPhone = normalizeEsPhone(newSellerPhone);
    if (!normalizedPhone) {
      toast.error("El teléfono es obligatorio");
      return;
    }

    setCreatingSeller(true);
    try {
      const findExisting = async (): Promise<Lead | null> => {
        const { data } = await supabase
          .from('leads')
          .select('*')
          .eq('phone', normalizedPhone)
          .limit(1);
        return data && data.length > 0 ? (data[0] as Lead) : null;
      };

      const existing = await findExisting();
      if (existing) {
        showExistingLead(existing);
        return;
      }

      const nowIso = new Date().toISOString();
      const { data: inserted, error } = await supabase
        .from('leads')
        .insert([{
          name: newSellerName.trim(),
          phone: normalizedPhone,
          email: newSellerEmail.trim() || null,
          source: newSellerSource,
          type: 'seller',
          status: 'new',
          preferences: newSellerAddress.trim() ? { property_address: newSellerAddress.trim() } : {},
          created_at: nowIso,
          updated_at: nowIso,
        }])
        .select('*')
        .single();

      if (error) {
        // Race 23505 (patrón leadService): otro proceso insertó el mismo phone
        // entre el SELECT y el INSERT → reintenta el SELECT y muestra el existente.
        if ((error as any).code === '23505') {
          const raced = await findExisting();
          if (raced) {
            showExistingLead(raced);
            return;
          }
        }
        throw error;
      }

      // Log inicial del timeline (fire-and-soft: el alta no se rompe si falla).
      const { error: logError } = await supabase.from('seller_activity_logs').insert({
        lead_id: inserted.id,
        event_type: 'Alta en CRM',
        title: 'Vendedor dado de alta manualmente',
        notes: `Alta manual desde el CRM (origen: ${newSellerSource}).`,
      });
      if (logError) console.warn('[WarmLeads] log Alta en CRM falló:', logError.message);

      toast.success(`Vendedor ${inserted.name} creado`);
      setShowNewSellerModal(false);
      resetNewSellerForm();
      setSellerLeads(prev => [inserted as Lead, ...prev]);
    } catch (err: any) {
      console.error("Error creando vendedor:", err.message);
      toast.error("No se pudo crear el vendedor");
    } finally {
      setCreatingSeller(false);
    }
  };

  // Fetch timeline event logs for a specific lead
  const fetchTimelineLogs = async (leadId: string) => {
    setLogsLoading(true);
    try {
      const { data, error } = await supabase
        .from('seller_activity_logs')
        .select('*')
        .eq('lead_id', leadId)
        .order('event_date', { ascending: false });

      if (error) throw error;
      setTimelineLogs(data || []);
    } catch (err: any) {
      console.error("Error al cargar logs de vendedor:", err.message);
    } finally {
      setLogsLoading(false);
    }
  };

  // Hot inline saving of individual fields (both root lead columns and JSONB preferences)
  const handleUpdateLeadField = async (leadId: string, field: string, value: string | number | boolean | null | undefined, isPreference: boolean = false) => {
    try {
      const leadToUpdate = sellerLeads.find(l => l.id === leadId);
      if (!leadToUpdate) return;

      let updatedPayload: Record<string, unknown> = {};
      if (isPreference) {
        updatedPayload = {
          preferences: {
            ...leadToUpdate.preferences,
            [field]: value
          }
        };
      } else {
        updatedPayload = {
          [field]: value
        };
      }

      const { error } = await supabase
        .from('leads')
        .update(updatedPayload)
        .eq('id', leadId);

      if (error) throw error;

      // Update state locally for real-time reactivity
      setSellerLeads(prev => prev.map(l => {
        if (l.id === leadId) {
          if (isPreference) {
            return {
              ...l,
              preferences: {
                ...l.preferences,
                [field]: value
              }
            };
          } else {
            return {
              ...l,
              [field]: value
            };
          }
        }
        return l;
      }));

      toast.success("Cambio guardado en caliente");
    } catch (err: any) {
      console.error("Error en edición en caliente:", err.message);
      toast.error("No se pudo guardar la modificación");
    }
  };

  // Handle status change in the funnel with autoinjection of activity logs
  const handleStatusChange = async (leadId: string, newStatus: LeadStatus) => {
    try {
      const leadToUpdate = sellerLeads.find(l => l.id === leadId);
      if (!leadToUpdate) return;

      const oldStatus = leadToUpdate.status;
      if (oldStatus === newStatus) return;

      // Update base record in Supabase
      const { error } = await supabase
        .from('leads')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', leadId);

      if (error) throw error;

      const oldLabel = STATUS_CONFIG[oldStatus || 'new']?.label || 'Estado legacy';
      const newLabel = STATUS_CONFIG[newStatus]?.label || newStatus;

      // Autoinject log into public.seller_activity_logs
      const { error: logError } = await supabase
        .from('seller_activity_logs')
        .insert({
          lead_id: leadId,
          event_type: 'Cambio Estado',
          title: 'Funnel Actualizado',
          notes: `El asesor actualizó el estado del lead de "${oldLabel}" a "${newLabel}".`
        });

      if (logError) throw logError;

      // Update locally
      setSellerLeads(prev => prev.map(l => {
        if (l.id === leadId) {
          return { ...l, status: newStatus, updated_at: new Date().toISOString() };
        }
        return l;
      }));

      // Update drawer details if open
      if (selectedLead && selectedLead.id === leadId) {
        setSelectedLead(prev => prev ? { ...prev, status: newStatus, updated_at: new Date().toISOString() } : null);
        fetchTimelineLogs(leadId);
      }

      toast.success(`Captación actualizada a: ${newLabel}`);
    } catch (err: any) {
      console.error("Error al actualizar estado del vendedor:", err.message);
      toast.error("No se pudo guardar el cambio de estado");
    }
  };

  // Manual submission of a new milestone in the timeline
  const handleAddTimelineLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead) return;
    if (!newLogTitle.trim()) {
      toast.error("El título de la actividad es obligatorio");
      return;
    }

    try {
      const { error } = await supabase
        .from('seller_activity_logs')
        .insert({
          lead_id: selectedLead.id,
          event_type: newLogType,
          title: newLogTitle,
          notes: newLogNotes || null,
          // Si se programó, el hito queda fechado en el momento de la cita
          event_date: newLogDateTime ? new Date(newLogDateTime).toISOString() : new Date().toISOString()
        });

      if (error) throw error;

      // Brief #007 T6.2: enviar la valoración ES un contacto saliente → el
      // vendedor queda al menos en "Contacto establecido". El helper de
      // funnel es server-side (service-role) → pasamos por /api/leads/funnel.
      // Forward-only: no-op si ya está más avanzado. ⚠️ target='contacted',
      // nunca 'qualified' (no existe en el funnel del vendedor, decisión 3).
      if (newLogType === 'Valoración') {
        void fetch("/api/leads/funnel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadId: selectedLead.id, action: "advance", target: "contacted" }),
        })
          .then(() => fetchSellers())
          .catch((err) => console.warn("[WarmLeadsManager] advance funnel falló:", err));
      }

      // Brief #008 T4: 'Adquisición' abre la Nota de Encargo prerellenada en
      // Documentos (el log narrativo ya quedó insertado arriba).
      if (newLogType === 'Adquisición') {
        onGoToDocuments?.({ kind: 'nota', leadId: selectedLead.id });
      }

      // Si el asesor eligió fecha/hora, además creamos una cita en el Calendario
      // vinculada al lead (recordatorio + visibilidad en agenda).
      if (newLogDateTime) {
        // Mapea el tipo de hito al tipo de cita existente (sin tocar el enum de BD).
        const apptType =
          newLogType === 'Nota de visita' ? 'visita' :
          newLogType === 'Adquisición' ? 'captacion' :
          'admin'; // Llamada / Email / Valoración → administrativo
        const typeLabel =
          newLogType === 'Nota de visita' ? '🏠 Visita' :
          newLogType === 'Adquisición' ? '📍 Adquisición' :
          newLogType === 'Llamada' ? '📞 Llamada' : newLogType;

        const { error: apptError } = await supabase
          .from('appointments')
          .insert({
            lead_id: selectedLead.id,
            scheduled_at: new Date(newLogDateTime).toISOString(),
            type: apptType,
            status: 'pending',
            title: `${typeLabel}: ${selectedLead.name}`,
            notes: newLogNotes || newLogTitle || null,
          });
        if (apptError) {
          console.error("No se pudo crear la cita en el calendario:", apptError.message);
          toast.error("Hito guardado, pero no se pudo agendar en el calendario");
        } else {
          toast.success("Hito registrado y agendado en el Calendario 📅");
        }
      } else {
        toast.success("Actividad registrada en la línea de tiempo");
      }

      setNewLogTitle("");
      setNewLogNotes("");
      setNewLogDateTime("");
      fetchTimelineLogs(selectedLead.id);
    } catch (err: any) {
      console.error("Error al insertar hito:", err.message);
      toast.error("No se pudo registrar el hito de actividad");
    }
  };

  // ─── PROMOCIÓN A ENCARGO ───────────────────────────────────────────────
  // Brief #007 T3: camino único vía POST /api/encargos. El endpoint ya hace
  // la transición del lead a 'closed' (con _prev_status) y el log de
  // timeline 'Adquisición' — aquí NO se duplica nada, solo se prerellena el
  // modal desde leads.preferences y se refresca el estado local al crear.
  const buildEncargoInitialValues = (lead: Lead): EncargoInitialValues => {
    const prefs = getPreferences(lead);
    return {
      direccion: prefs.property_address || '',
      sqm: prefs.sqm != null ? Number(prefs.sqm) : undefined,
      rooms: prefs.rooms != null ? Number(prefs.rooms) : undefined,
      baths: prefs.baths != null ? Number(prefs.baths) : undefined,
      precio_captacion: prefs.agent_valuation != null ? Number(prefs.agent_valuation) : undefined,
    };
  };

  const handleEncargoCreated = () => {
    if (!selectedLead) return;
    const leadId = selectedLead.id;
    // El lead pasó a 'closed' en el server → desaparece del pipeline de Vendedores.
    setSellerLeads(prev => prev.filter(l => l.id !== leadId));
    setShowPromoteForm(false);
    closeDrawer();
    toast.success("Lead promovido a Encargo en exclusiva 🎉 Gestiónalo en la pestaña Encargos.");
  };

  // Delete lead record with database cascade
  const handleDeleteLead = async (leadId: string) => {
    if (!confirm("¿Estás seguro de que deseas eliminar permanentemente a este propietario vendedor y todo su historial de actividad?")) return;

    try {
      const { error } = await supabase
        .from('leads')
        .delete()
        .eq('id', leadId);

      if (error) throw error;

      toast.success("Vendedor eliminado con éxito");
      setSellerLeads(prev => prev.filter(l => l.id !== leadId));
      if (selectedLead?.id === leadId) {
        closeDrawer();
      }
    } catch (err: any) {
      console.error("Error al borrar lead vendedor:", err.message);
      toast.error("No se pudo eliminar al vendedor");
    }
  };

  // ─── FILTER LOGIC ──────────────────────────────────────────────────────
  const filteredSellers = sellerLeads.filter(l => {
    const prefs = getPreferences(l);
    const matchesSearch = 
      l.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (l.phone && l.phone.includes(searchTerm)) ||
      (l.email && l.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (prefs.property_address && prefs.property_address.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (l.source && l.source.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = !filterStatus || l.status === filterStatus;
    const matchesSource = !filterSource || l.source === filterSource;

    return matchesSearch && matchesStatus && matchesSource;
  });

  // ─── KPI METRICS CALCULATIONS ──────────────────────────────────────────
  const totalSellers = sellerLeads.length;
  
  // Conversions rate (leads marked 'closed' representing mandatos en exclusiva firmados)
  const exclusiveSellers = sellerLeads.filter(l => l.status === 'closed').length;
  const conversionRate = totalSellers > 0 ? ((exclusiveSellers / totalSellers) * 100).toFixed(1) : "0.0";

  // Estimated Ticket (Valuation average)
  const valuedSellers = sellerLeads.filter(l => {
    const prefs = getPreferences(l);
    return prefs.estimated_value && Number(prefs.estimated_value) > 0;
  });
  const avgValuation = valuedSellers.length > 0 
    ? valuedSellers.reduce((sum, l) => sum + Number(getPreferences(l).estimated_value || 0), 0) / valuedSellers.length
    : 0;

  // Proyected Agent Fees volume (Agent valuation * commission %)
  const projectedFees = sellerLeads.reduce((sum, l) => {
    const prefs = getPreferences(l);
    const referenceValue = Number(prefs.agent_valuation || prefs.estimated_value || 0);
    const commPct = Number(prefs.commission_pct || 0);
    if (referenceValue > 0 && commPct > 0) {
      return sum + (referenceValue * (commPct / 100));
    }
    return sum;
  }, 0);

  // Helper formatting currencies — centralizado en @/lib/utils

  // Mapping timeline icons for various activity event types
  const getTimelineIcon = (type: string) => {
    switch (type) {
      case 'Llamada':
        return <PhoneCall size={14} className="text-blue-400" />;
      case 'Nota de visita':
        return <Eye size={14} className="text-indigo-400" />;
      case 'Adquisición':
        return <Briefcase size={14} className="text-[#FBBF24]" />;
      case 'Valoración':
        return <Calculator size={14} className="text-amber-400" />;
      case 'Email':
        return <Mail size={14} className="text-sky-400" />;
      case 'IA WhatsApp':
        return <Bot size={14} className="text-purple-400" />;
      case 'Meta Ads':
        return <Megaphone size={14} className="text-pink-400" />;
      case 'Cambio Estado':
        return <GitCommit size={14} className="text-emerald-400" />;
      default:
        return <FileText size={14} className="text-slate-400" />;
    }
  };

  return (
    <div className="space-y-6">
      
      {/* ─── METRICS KPI CARD DECK (Dark Glassmorphic) ─────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        
        <div className="bg-[#1E293B]/40 border border-white/5 p-5 rounded-2xl flex items-center justify-between shadow-xl backdrop-blur-md hover:border-[#FBBF24]/10 transition-all duration-300">
          <div>
            <span className="text-xs text-slate-400 font-medium block">Vendedores Captados</span>
            <span className="text-3xl font-extrabold text-white mt-1 block">{totalSellers}</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-[#FBBF24]">
            <Users size={22} />
          </div>
        </div>

        <div className="bg-[#1E293B]/40 border border-white/5 p-5 rounded-2xl flex items-center justify-between shadow-xl backdrop-blur-md hover:border-[#FBBF24]/10 transition-all duration-300">
          <div>
            <span className="text-xs text-slate-400 font-medium block">Tasa de Exclusivas</span>
            <span className="text-3xl font-extrabold text-[#FBBF24] mt-1 block">{conversionRate}%</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Percent size={22} />
          </div>
        </div>

        <div className="bg-[#1E293B]/40 border border-white/5 p-5 rounded-2xl flex items-center justify-between shadow-xl backdrop-blur-md hover:border-[#FBBF24]/10 transition-all duration-300">
          <div>
            <span className="text-xs text-slate-400 font-medium block">Ticket Medio Estimado</span>
            <span className="text-2xl font-black text-white mt-1.5 block tracking-tight">
              {formatCurrency(avgValuation)}
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <TrendingUp size={22} />
          </div>
        </div>

        <div className="bg-[#1E293B]/40 border border-white/5 p-5 rounded-2xl flex items-center justify-between shadow-xl backdrop-blur-md hover:border-[#FBBF24]/10 transition-all duration-300">
          <div>
            <span className="text-xs text-slate-400 font-medium block">Honorarios Proyectados</span>
            <span className="text-2xl font-black text-emerald-400 mt-1.5 block tracking-tight">
              {formatCurrency(projectedFees)}
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <DollarSign size={22} />
          </div>
        </div>

      </div>

      {/* ─── SEARCH & FILTERS BAR ────────────────────────────────────────── */}
      <div className="bg-[#1E293B]/40 border border-white/5 p-6 rounded-2xl shadow-xl backdrop-blur-md space-y-4">
        <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <Briefcase className="text-[#FBBF24]" size={22} />
              Módulo Premium de Vendedores (Warm CRM)
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Administración de propietarios de Sevilla procedentes de calculadoras y captaciones manuales.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchSellers}
              className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300 hover:text-white transition-all duration-200 active:scale-95"
              title="Refrescar datos Supabase"
            >
              <RefreshCw size={18} />
            </button>
            <button
              onClick={() => setShowNewSellerModal(true)}
              className="flex items-center justify-center gap-2 bg-[#FBBF24] text-[#2C3E50] font-bold px-5 py-2.5 rounded-xl hover:bg-[#F59E0B] active:scale-95 transition-all shadow-md text-sm cursor-pointer"
            >
              <PlusCircle size={16} />
              Nuevo Vendedor
            </button>
          </div>
        </div>

        {/* Filters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          {/* Text Search */}
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Search size={16} />
            </span>
            <input 
              type="text" 
              placeholder="Buscar por nombre, tlf, dirección..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#0F172A]/50 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#FBBF24] transition-all"
            />
          </div>

          {/* Status filter dropdown */}
          <div className="relative">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full bg-[#0F172A]/50 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#FBBF24] transition-all"
            >
              <option value="">Todos los Estados</option>
              {Object.entries(STATUS_CONFIG).map(([key, value]) => (
                <option key={key} value={key}>{value.label}</option>
              ))}
            </select>
          </div>

          {/* Source filter dropdown */}
          <div>
            <select
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value)}
              className="w-full bg-[#0F172A]/50 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#FBBF24] transition-all"
            >
              <option value="">Todos los Orígenes</option>
              {SOURCE_OPTIONS.map(src => (
                <option key={src} value={src}>{src}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ─── LEADS DATA TABLE ────────────────────────────────────────────── */}
      <div className="bg-[#1E293B]/20 border border-white/5 rounded-2xl shadow-xl overflow-hidden backdrop-blur-md">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center space-y-3">
            <div className="w-10 h-10 border-4 border-[#FBBF24] border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-400 font-medium">Recuperando registros comerciales...</p>
          </div>
        ) : filteredSellers.length === 0 ? (
          <div className="py-24 text-center">
            <Compass className="mx-auto text-slate-500 mb-4 animate-pulse" size={48} />
            <h3 className="text-white font-bold text-base">No hay vendedores para mostrar</h3>
            <p className="text-slate-400 text-xs mt-1 max-w-sm mx-auto">
              Prueba a cambiar tus filtros de búsqueda o registra nuevos leads desde la web.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-[#0F172A]/40 text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                  <th className="py-4 px-6">Propietario / Teléfono</th>
                  <th className="py-4 px-6">Dirección Inmueble</th>
                  <th className="py-4 px-6">Tasación Web</th>
                  <th className="py-4 px-6">Origen</th>
                  <th className="py-4 px-6">Estado Captación</th>
                  <th className="py-4 px-6">F. Registro</th>
                  <th className="py-4 px-6 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredSellers.map((lead) => {
                  const prefs = getPreferences(lead);
                  const status = lead.status || 'new';
                  const conf = STATUS_CONFIG[status] || LEGACY_STATUS_BADGE;

                  return (
                    <tr
                      key={lead.id}
                      onClick={() => router.push(`/admin/sellers/${lead.id}`)}
                      className="hover:bg-white/[0.03] cursor-pointer transition-all group"
                    >
                      {/* Name & Contact */}
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-[#2C3E50]/80 border border-white/10 flex items-center justify-center font-bold text-white text-xs group-hover:border-[#FBBF24] transition-all">
                            {lead.name.charAt(0)}
                          </div>
                          <div>
                            <span className="font-bold text-white text-sm block group-hover:text-[#FBBF24] transition-all">{lead.name}</span>
                            <span className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                              {lead.phone && <span className="flex items-center gap-1"><Phone size={10} /> {lead.phone}</span>}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Property Address */}
                      <td className="py-4 px-6 max-w-[200px] truncate">
                        <div className="flex items-center gap-1.5 text-slate-300 text-xs">
                          <MapPin size={12} className="text-slate-500 shrink-0" />
                          <span>{prefs.property_address || "No especificada"}</span>
                        </div>
                      </td>

                      {/* Web Valuation */}
                      <td className="py-4 px-6 font-semibold text-white text-xs">
                        {prefs.estimated_value 
                          ? formatCurrency(Number(prefs.estimated_value)) 
                          : <span className="text-slate-500 font-normal">Sin tasar</span>
                        }
                      </td>

                      {/* Source */}
                      <td className="py-4 px-6">
                        <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded text-[10px] font-bold border border-blue-500/15 uppercase">
                          {displaySource(lead.source)}
                        </span>
                      </td>

                      {/* Funnel Status */}
                      <td className="py-4 px-6">
                        <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full border flex items-center gap-1.5 w-fit ${conf.color} ${conf.bg}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${conf.dot} animate-pulse`} />
                          {conf.label}
                        </span>
                      </td>

                      {/* Date */}
                      <td className="py-4 px-6 text-[11px] text-slate-400 font-medium">
                        {new Date(lead.created_at).toLocaleDateString("es-ES")}
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-6 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => openDrawer(lead)}
                            className="p-2 rounded-lg bg-white/5 hover:bg-[#FBBF24]/10 text-slate-300 hover:text-[#FBBF24] border border-white/5 transition-all hover:scale-105"
                            title="Gestionar Ficha Vendedor"
                          >
                            <Eye size={14} />
                          </button>

                          <button
                            onClick={() => handleDeleteLead(lead.id)}
                            className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white border border-rose-500/20 transition-all hover:scale-105"
                            title="Eliminar Lead"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── LATERAL SLIDE-IN DRAWER (SellersDrawer) ─────────────────────── */}
      {selectedLead && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
          {/* Translucent backdrop click overlay */}
          <div 
            className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${isDrawerOpen ? 'opacity-100' : 'opacity-0'}`}
            onClick={closeDrawer}
          />

          {/* Sliding container */}
          <div 
            className={`relative w-full max-w-[620px] h-full bg-[#111827]/95 backdrop-blur-md shadow-2xl border-l border-white/10 flex flex-col z-50 transition-transform duration-300 ease-in-out transform ${isDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`}
          >
            {/* Drawer Header */}
            <div className="p-6 border-b border-white/5 bg-[#0F172A]/70 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#FBBF24]/10 border border-[#FBBF24]/20 flex items-center justify-center font-black text-[#FBBF24] text-sm">
                  {selectedLead.name.charAt(0)}
                </div>
                <div>
                  <h3 className="font-bold text-white text-base leading-none">{selectedLead.name}</h3>
                  <span className="text-[10px] text-slate-400 mt-1.5 block">
                    ID: {selectedLead.id.substring(0, 8)}... | Actualizado: {new Date(selectedLead.updated_at || selectedLead.created_at).toLocaleTimeString("es-ES")}
                  </span>
                </div>
              </div>

              {/* Funnel Selector with Status drop-down */}
              <div className="flex items-center gap-3">
                <select
                  value={selectedLead.status || 'new'}
                  onChange={(e) => handleStatusChange(selectedLead.id, e.target.value as LeadStatus)}
                  className={`bg-[#1E293B] text-xs font-bold py-1.5 px-3 rounded-lg border border-white/10 focus:outline-none focus:border-[#FBBF24] text-white cursor-pointer`}
                >
                  {Object.entries(STATUS_CONFIG).map(([key, val]) => (
                    <option key={key} value={key} className="bg-[#111827]">
                      {val.label}
                    </option>
                  ))}
                </select>

                <button 
                  onClick={closeDrawer}
                  className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Sub-navigation tabs inside drawer */}
            <div className="flex border-b border-white/5 bg-[#0F172A]/30">
              <button
                onClick={() => setDrawerTab('profile')}
                className={`flex-1 py-3 text-xs font-bold border-b-2 transition-all flex items-center justify-center gap-1.5 ${drawerTab === 'profile' ? 'border-[#FBBF24] text-white bg-white/[0.01]' : 'border-transparent text-slate-400 hover:text-white hover:bg-white/[0.005]'}`}
              >
                <User size={14} />
                Perfil Personal
              </button>
              <button
                onClick={() => setDrawerTab('property')}
                className={`flex-1 py-3 text-xs font-bold border-b-2 transition-all flex items-center justify-center gap-1.5 ${drawerTab === 'property' ? 'border-[#FBBF24] text-white bg-white/[0.01]' : 'border-transparent text-slate-400 hover:text-white hover:bg-white/[0.005]'}`}
              >
                <Home size={14} />
                Ficha Inmueble
              </button>
              <button
                onClick={() => setDrawerTab('timeline')}
                className={`flex-1 py-3 text-xs font-bold border-b-2 transition-all flex items-center justify-center gap-1.5 ${drawerTab === 'timeline' ? 'border-[#FBBF24] text-white bg-white/[0.01]' : 'border-transparent text-slate-400 hover:text-white hover:bg-white/[0.005]'}`}
              >
                <Activity size={14} />
                Historial / Timeline
              </button>
            </div>

            {/* Drawer Body Scroll Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* ─── TAB 1: PROFILE PERSONAL ────────────────────────────────────── */}
              {drawerTab === 'profile' && (
                <div className="space-y-4">
                  
                  {/* Name field (hot edit onBlur / Enter) */}
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Nombre Completo</label>
                    <input 
                      type="text"
                      defaultValue={selectedLead.name}
                      onBlur={(e) => {
                        if (e.target.value.trim() && e.target.value !== selectedLead.name) {
                          handleUpdateLeadField(selectedLead.id, 'name', e.target.value.trim());
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.currentTarget.blur();
                        }
                      }}
                      className="w-full bg-[#0F172A]/50 border border-white/5 hover:border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#FBBF24] focus:ring-1 focus:ring-[#FBBF24] transition-all"
                    />
                  </div>

                  {/* Phone field (hot edit onBlur / Enter) */}
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Teléfono Móvil</label>
                    <div className="flex gap-2">
                      <input 
                        type="text"
                        defaultValue={selectedLead.phone || ""}
                        placeholder="Ej. +34694216833"
                        onBlur={(e) => {
                          if (e.target.value !== (selectedLead.phone || "")) {
                            handleUpdateLeadField(selectedLead.id, 'phone', e.target.value.trim() || null);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.currentTarget.blur();
                          }
                        }}
                        className="flex-1 bg-[#0F172A]/50 border border-white/5 hover:border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#FBBF24] focus:ring-1 focus:ring-[#FBBF24] transition-all"
                      />
                      {selectedLead.phone && (
                        <a 
                          href={`https://wa.me/${selectedLead.phone.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-[#25D366] hover:bg-[#20ba56] text-white flex items-center justify-center px-4 rounded-xl active:scale-95 transition-all text-xs font-bold"
                        >
                          WhatsApp
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Email field (hot edit onBlur / Enter) */}
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Correo Electrónico</label>
                    <input 
                      type="email"
                      defaultValue={selectedLead.email || ""}
                      placeholder="propietario@email.com"
                      onBlur={(e) => {
                        if (e.target.value !== (selectedLead.email || "")) {
                          handleUpdateLeadField(selectedLead.id, 'email', e.target.value.trim() || null);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.currentTarget.blur();
                        }
                      }}
                      className="w-full bg-[#0F172A]/50 border border-white/5 hover:border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#FBBF24] focus:ring-1 focus:ring-[#FBBF24] transition-all"
                    />
                  </div>

                  {/* Source / Origen (hot edit onChange) */}
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Origen del Lead</label>
                    <select
                      value={selectedLead.source || ""}
                      onChange={(e) => handleUpdateLeadField(selectedLead.id, 'source', e.target.value || null)}
                      className="w-full bg-[#0F172A]/50 border border-white/5 hover:border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#FBBF24] transition-all cursor-pointer"
                    >
                      <option value="">No especificado</option>
                      {SOURCE_OPTIONS.map(src => (
                        <option key={src} value={src}>{src}</option>
                      ))}
                    </select>
                  </div>

                  {/* Legal RGPD Consent Info */}
                  <div className="p-4 bg-white/[0.02] border border-white/5 rounded-xl text-xs text-slate-400 space-y-2">
                    <p className="font-bold text-slate-300 flex items-center gap-1.5">
                      <CheckCircle size={14} className="text-emerald-400" />
                      Consentimiento RGPD Aceptado
                    </p>
                    <p>
                      El propietario consintió el tratamiento de datos para tasaciones inmobiliarias en fecha {" "}
                      <span className="text-slate-300 font-semibold">
                        {new Date(selectedLead.created_at).toLocaleDateString()} a las {new Date(selectedLead.created_at).toLocaleTimeString()}
                      </span>.
                    </p>
                  </div>

                </div>
              )}

              {/* ─── TAB 2: INMUEBLE & TASACIÓN CONSOLE ──────────────────────────── */}
              {drawerTab === 'property' && (
                <div className="space-y-5">

                  {/* Brief #011 F2.3 (R9): abre Documentos con la Nota de
                      Encargo prerellenada vía DocIntent (#008). Oculto si el
                      lead ya está closed (captado: vive en Encargos). */}
                  {selectedLead.status !== 'closed' && (
                    <button
                      onClick={() => onGoToDocuments?.({ kind: 'nota', leadId: selectedLead.id })}
                      className="w-full flex items-center justify-center gap-2 bg-[#FBBF24]/10 border border-[#FBBF24]/30 hover:bg-[#FBBF24]/20 text-[#FBBF24] font-bold py-3 rounded-xl transition-all text-sm cursor-pointer"
                    >
                      <FileText size={16} />
                      Firmar Nota de Encargo
                    </button>
                  )}

                  {/* Address (hot edit onBlur / Enter) */}
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Dirección del Inmueble</label>
                    <input 
                      type="text"
                      defaultValue={getPreferences(selectedLead).property_address || ""}
                      placeholder="Calle, Número, Planta, Sevilla"
                      onBlur={(e) => {
                        if (e.target.value !== (getPreferences(selectedLead).property_address || "")) {
                          handleUpdateLeadField(selectedLead.id, 'property_address', e.target.value, true);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.currentTarget.blur();
                        }
                      }}
                      className="w-full bg-[#0F172A]/50 border border-white/5 hover:border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#FBBF24] focus:ring-1 focus:ring-[#FBBF24] transition-all"
                    />
                  </div>

                  {/* Physical features Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    
                    {/* Property type */}
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Tipo Inmueble</label>
                      <select
                        value={getPreferences(selectedLead).property_type || "Piso"}
                        onChange={(e) => handleUpdateLeadField(selectedLead.id, 'property_type', e.target.value, true)}
                        className="w-full bg-[#0F172A]/50 border border-white/5 hover:border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#FBBF24] transition-all cursor-pointer"
                      >
                        {PROPERTY_TYPES.map(type => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </div>

                    {/* Sqm */}
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">M² Útiles</label>
                      <input 
                        type="number"
                        defaultValue={getPreferences(selectedLead).sqm || ""}
                        placeholder="M²"
                        onBlur={(e) => {
                          const val = e.target.value === "" ? undefined : Number(e.target.value);
                          if (val !== getPreferences(selectedLead).sqm) {
                            handleUpdateLeadField(selectedLead.id, 'sqm', val, true);
                          }
                        }}
                        className="w-full bg-[#0F172A]/50 border border-white/5 hover:border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#FBBF24] transition-all"
                      />
                    </div>

                    {/* Rooms */}
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Habitaciones</label>
                      <input 
                        type="number"
                        defaultValue={getPreferences(selectedLead).rooms || ""}
                        placeholder="Nº"
                        onBlur={(e) => {
                          const val = e.target.value === "" ? undefined : Number(e.target.value);
                          if (val !== getPreferences(selectedLead).rooms) {
                            handleUpdateLeadField(selectedLead.id, 'rooms', val, true);
                          }
                        }}
                        className="w-full bg-[#0F172A]/50 border border-white/5 hover:border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#FBBF24] transition-all"
                      />
                    </div>

                    {/* Baths */}
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Cuartos de Baño</label>
                      <input 
                        type="number"
                        defaultValue={getPreferences(selectedLead).baths || ""}
                        placeholder="Nº"
                        onBlur={(e) => {
                          const val = e.target.value === "" ? undefined : Number(e.target.value);
                          if (val !== getPreferences(selectedLead).baths) {
                            handleUpdateLeadField(selectedLead.id, 'baths', val, true);
                          }
                        }}
                        className="w-full bg-[#0F172A]/50 border border-white/5 hover:border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#FBBF24] transition-all"
                      />
                    </div>

                  </div>

                  {/* ────────────────────────────────────────────────────────── */}
                  {/* CONSOLA DE TASACIÓN Y NEGOCIACIÓN (ÁMBAR EXQUISITE DESIGN) */}
                  <div className="p-5 rounded-2xl bg-amber-500/[0.02] border border-[#FBBF24]/30 space-y-4">
                    <div className="flex items-center gap-2 text-[#FBBF24] font-bold text-xs uppercase tracking-widest">
                      <Sparkles size={16} />
                      Consola de Tasación & Negociación CRM
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {/* Web automatic estimation (calculadora read-only) */}
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 block mb-1">Valoración Algoritmo Web</span>
                        <span className="text-lg font-black text-slate-300 block bg-[#0F172A]/40 px-3 py-2.5 rounded-xl border border-white/5">
                          {getPreferences(selectedLead).estimated_value 
                            ? formatCurrency(Number(getPreferences(selectedLead).estimated_value))
                            : "Sin calcular"
                          }
                        </span>
                      </div>

                      {/* Official Agent Valuation (hot editable) */}
                      <div>
                        <label className="block text-[10px] font-bold text-[#FBBF24] mb-1">Tasación del Agente (€)</label>
                        <input 
                          type="number"
                          defaultValue={getPreferences(selectedLead).agent_valuation || ""}
                          placeholder="Fijar tasación final..."
                          onBlur={(e) => {
                            const val = e.target.value === "" ? undefined : Number(e.target.value);
                            if (val !== getPreferences(selectedLead).agent_valuation) {
                              handleUpdateLeadField(selectedLead.id, 'agent_valuation', val, true);
                            }
                          }}
                          className="w-full bg-[#0F172A]/50 border border-[#FBBF24]/20 focus:border-[#FBBF24] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#FBBF24] transition-all font-semibold"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 items-center">
                      {/* Commission pct (hot editable) */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 mb-1">Comisión Pactada (%)</label>
                        <div className="relative">
                          <input 
                            type="number"
                            step="0.5"
                            defaultValue={getPreferences(selectedLead).commission_pct || ""}
                            placeholder="Ej. 3"
                            onBlur={(e) => {
                              const val = e.target.value === "" ? undefined : Number(e.target.value);
                              if (val !== getPreferences(selectedLead).commission_pct) {
                                handleUpdateLeadField(selectedLead.id, 'commission_pct', val, true);
                              }
                            }}
                            className="w-full bg-[#0F172A]/50 border border-white/5 rounded-xl pl-3 pr-8 py-2 text-sm text-white focus:outline-none focus:border-[#FBBF24] transition-all font-semibold"
                          />
                          <span className="absolute right-3 inset-y-0 flex items-center text-xs text-slate-500 font-bold">%</span>
                        </div>
                      </div>

                      {/* Fee calculator (dynamic cac projection) */}
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 block mb-1">Honorarios Estimados (Sin IVA)</span>
                        <span className="text-lg font-black text-emerald-400 block bg-[#0F172A]/40 px-3 py-2 rounded-xl border border-white/5 tracking-tight leading-none h-[38px] flex items-center">
                          {(() => {
                            const refValue = Number(getPreferences(selectedLead).agent_valuation || getPreferences(selectedLead).estimated_value || 0);
                            const comm = Number(getPreferences(selectedLead).commission_pct || 0);
                            if (refValue > 0 && comm > 0) {
                              return formatCurrency(refValue * (comm / 100));
                            }
                            return "0 €";
                          })()}
                        </span>
                      </div>
                    </div>
                  </div>
                  {/* ────────────────────────────────────────────────────────── */}

                  {/* Notes & Comments field (hot edit onBlur / Enter) */}
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Notas Comerciales / Comentarios</label>
                    <textarea 
                      rows={4}
                      defaultValue={getPreferences(selectedLead).additionalNotes || ""}
                      placeholder="Registra cualquier anotación sobre el inmueble..."
                      onBlur={(e) => {
                        if (e.target.value !== (getPreferences(selectedLead).additionalNotes || "")) {
                          handleUpdateLeadField(selectedLead.id, 'additionalNotes', e.target.value, true);
                        }
                      }}
                      className="w-full bg-[#0F172A]/50 border border-white/5 hover:border-white/10 rounded-xl px-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#FBBF24] transition-all"
                    />
                  </div>

                  {/* ─── PROMOCIÓN A ENCARGO EN EXCLUSIVA ─────────────────────── */}
                  {selectedLead.property_id ? (
                    <div className="p-4 rounded-2xl bg-emerald-500/[0.05] border border-emerald-500/30 flex items-center gap-3 text-sm text-emerald-300">
                      <CheckCircle size={18} className="shrink-0" />
                      <span>Este lead ya está promovido a <strong>Encargo en exclusiva</strong>. Gestiónalo desde la pestaña “Encargos”.</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowPromoteForm(true)}
                      className="w-full flex items-center justify-center gap-2 bg-[#FBBF24] hover:bg-yellow-500 text-[#2C3E50] font-extrabold py-3.5 rounded-2xl transition-all active:scale-[0.99] shadow-lg shadow-[#FBBF24]/10"
                    >
                      <Briefcase size={18} />
                      Promover a Encargo en exclusiva
                    </button>
                  )}

                </div>
              )}

              {/* ─── TAB 3: TIMELINE & ACTIVITY LOGS ────────────────────────────── */}
              {drawerTab === 'timeline' && (
                <div className="space-y-6">
                  
                  {/* New Event Form */}
                  <form onSubmit={handleAddTimelineLogSubmit} className="bg-white/[0.01] border border-white/5 p-4 rounded-xl space-y-3">
                    <span className="text-[10px] uppercase font-bold text-[#FBBF24] tracking-wider block">Registrar Hito de Gestión</span>
                    
                    <div className="grid grid-cols-3 gap-2">
                      <select
                        value={newLogType}
                        onChange={(e) => setNewLogType(e.target.value)}
                        className="col-span-1 bg-[#0F172A]/50 border border-white/10 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-[#FBBF24] transition-all cursor-pointer"
                      >
                        <option value="Llamada">📞 Llamada</option>
                        <option value="Nota de visita">🏠 Visita</option>
                        <option value="Adquisición">📍 Adquisición</option>
                        <option value="Valoración">📊 Tasación</option>
                        <option value="Email">✉️ Email</option>
                      </select>

                      <input 
                        type="text"
                        placeholder="Hito (ej. Llamada de seguimiento)"
                        value={newLogTitle}
                        onChange={(e) => setNewLogTitle(e.target.value)}
                        className="col-span-2 bg-[#0F172A]/50 border border-white/10 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-[#FBBF24] transition-all"
                      />
                    </div>

                    <input
                      type="text"
                      placeholder="Detalles y comentarios de la gestión..."
                      value={newLogNotes}
                      onChange={(e) => setNewLogNotes(e.target.value)}
                      className="w-full bg-[#0F172A]/50 border border-white/10 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-[#FBBF24] transition-all"
                    />

                    {/* Programar en calendario (opcional) */}
                    <div className="flex items-center gap-2">
                      <Calendar size={14} className="text-slate-400 shrink-0" />
                      <input
                        type="datetime-local"
                        value={newLogDateTime}
                        onChange={(e) => setNewLogDateTime(e.target.value)}
                        className="flex-1 bg-[#0F172A]/50 border border-white/10 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-[#FBBF24] transition-all [color-scheme:dark]"
                      />
                      {newLogDateTime && (
                        <button
                          type="button"
                          onClick={() => setNewLogDateTime("")}
                          className="text-slate-400 hover:text-white p-1"
                          title="Quitar fecha (no agendar)"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500 -mt-1">
                      Opcional: si fijas fecha y hora, el hito también se agenda en el Calendario y queda vinculado a este vendedor.
                    </p>

                    <button
                      type="submit"
                      className="w-full bg-[#FBBF24] hover:bg-yellow-500 text-[#2C3E50] text-xs font-bold py-2 rounded-lg transition-all active:scale-95 cursor-pointer"
                    >
                      {newLogDateTime ? "Añadir y Agendar en Calendario" : "Añadir a la Línea de Tiempo"}
                    </button>
                  </form>

                  {/* Render activity logs timeline */}
                  <div className="relative border-l border-white/10 pl-5 ml-3 space-y-5 py-2">
                    
                    {logsLoading ? (
                      <div className="py-10 flex flex-col items-center justify-center space-y-2">
                        <div className="w-6 h-6 border-2 border-[#FBBF24] border-t-transparent rounded-full animate-spin" />
                        <span className="text-[10px] text-slate-500">Cargando eventos...</span>
                      </div>
                    ) : timelineLogs.length === 0 ? (
                      <div className="py-8 text-center text-slate-500 text-xs">
                        No se ha registrado ninguna actividad para este propietario.
                      </div>
                    ) : (
                      timelineLogs.map((log) => (
                        <div key={log.id} className="relative group">
                          
                          {/* Timeline dot icon placement */}
                          <span className="absolute -left-[27px] top-0 w-4.5 h-4.5 rounded-full bg-[#1F2937] border border-white/10 flex items-center justify-center z-10 group-hover:border-[#FBBF24]/50 transition-colors">
                            {getTimelineIcon(log.event_type)}
                          </span>

                          <div className="bg-[#1E293B]/30 border border-white/5 p-3.5 rounded-xl space-y-1 hover:border-white/10 transition-colors">
                            <div className="flex justify-between items-start">
                              <span className="font-bold text-white text-xs block">{log.title}</span>
                              <span className="text-[9px] text-slate-500">
                                {new Date(log.event_date).toLocaleDateString("es-ES")} {new Date(log.event_date).toLocaleTimeString("es-ES", { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            {log.notes && (
                              <p className="text-[11px] text-slate-400 leading-normal">{log.notes}</p>
                            )}
                          </div>
                        </div>
                      ))
                    )}

                  </div>

                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: PROMOVER LEAD → ENCARGO (camino único POST /api/encargos) ─── */}
      {showPromoteForm && selectedLead && (
        <EncargoFormModal
          open
          prefilledLeadId={selectedLead.id}
          initialValues={buildEncargoInitialValues(selectedLead)}
          onClose={() => setShowPromoteForm(false)}
          onCreated={handleEncargoCreated}
        />
      )}

      {/* ─── MODAL: ALTA MANUAL DE VENDEDOR (Brief #011 F2.2 / R6) ────────── */}
      {showNewSellerModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-start justify-center z-[60] p-4 md:p-6 overflow-y-auto">
          <form
            onSubmit={handleCreateSeller}
            className="bg-[#1E293B] border border-white/10 p-6 md:p-8 rounded-2xl w-full max-w-lg shadow-2xl relative text-left my-auto space-y-4"
          >
            <button
              type="button"
              onClick={() => { setShowNewSellerModal(false); resetNewSellerForm(); }}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 hover:bg-white/10 rounded-full transition-all"
            >
              <X size={20} />
            </button>

            <div>
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <PlusCircle className="text-[#FBBF24]" size={20} />
                Nuevo Vendedor
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Alta manual de un propietario. Si el teléfono ya existe, se abre la ficha del lead existente (sin duplicar).
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-300 font-medium">Nombre *</label>
              <input
                type="text"
                value={newSellerName}
                onChange={(e) => setNewSellerName(e.target.value)}
                required
                className="w-full bg-[#0F172A] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#FBBF24] transition-all"
                placeholder="Nombre y apellidos"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-slate-300 font-medium">Teléfono *</label>
                <input
                  type="tel"
                  value={newSellerPhone}
                  onChange={(e) => setNewSellerPhone(e.target.value)}
                  required
                  className="w-full bg-[#0F172A] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#FBBF24] transition-all"
                  placeholder="697 223 944"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-300 font-medium">Email</label>
                <input
                  type="email"
                  value={newSellerEmail}
                  onChange={(e) => setNewSellerEmail(e.target.value)}
                  className="w-full bg-[#0F172A] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#FBBF24] transition-all"
                  placeholder="opcional@email.com"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-300 font-medium">Origen</label>
              <select
                value={newSellerSource}
                onChange={(e) => setNewSellerSource(e.target.value)}
                className="w-full bg-[#0F172A] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#FBBF24] transition-all"
              >
                {LEAD_SOURCE_OPTIONS.map(src => (
                  <option key={src} value={src}>{src}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-300 font-medium">Dirección del inmueble</label>
              <input
                type="text"
                value={newSellerAddress}
                onChange={(e) => setNewSellerAddress(e.target.value)}
                className="w-full bg-[#0F172A] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#FBBF24] transition-all"
                placeholder="C/ Ejemplo 12, Sevilla (opcional)"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setShowNewSellerModal(false); resetNewSellerForm(); }}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl transition-all"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={creatingSeller}
                className="flex-1 bg-[#FBBF24] hover:bg-[#F59E0B] disabled:opacity-50 text-[#2C3E50] font-extrabold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2"
              >
                {creatingSeller ? "Creando..." : "Crear Vendedor"}
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
