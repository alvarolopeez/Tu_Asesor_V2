"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/utils";
import ZoneSelectorPremium, { SEVILLA_TAXONOMY } from "./ZoneSelectorPremium";
import { 
  Users, 
  Search, 
  Filter, 
  Plus, 
  Trash2, 
  Edit3, 
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
  HelpCircle,
  PlusCircle,
  CheckCircle,
  Clock,
  Compass,
  MessageSquare
} from "lucide-react";
import toast from "react-hot-toast";

// ─── TYPES ─────────────────────────────────────────────────────────────
interface BuyerDemand {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  min_budget: number;
  max_budget: number;
  min_sqm: number;
  rooms: number;
  bathrooms: number;
  preferred_zones: string[];
  property_type: string;
  funding_type: 'Contado' | 'Hipoteca';
  savings_contribution: number;
  status: 'Búsqueda activa' | 'En negociación' | 'Con piso reservado' | 'Inactivo';
  created_at: string;
  updated_at: string;
  last_activity_at: string;
}

interface BuyerActivityLog {
  id: string;
  buyer_id: string;
  event_type: string;
  title: string;
  notes: string | null;
  event_date: string;
  created_at: string;
  property_id?: string | null;
}

// ─── CONSTANTS ──────────────────────────────────────────────────────────
const SEVILLA_ZONAS_CAPITAL = Object.entries(SEVILLA_TAXONOMY)
  .filter(([_, data]) => data.isCapital)
  .map(([key]) => key)
  .sort((a, b) => a.localeCompare(b, 'es'));

const SEVILLA_ZONAS_PUEBLOS = Object.entries(SEVILLA_TAXONOMY)
  .filter(([_, data]) => !data.isCapital)
  .map(([key]) => key)
  .sort((a, b) => a.localeCompare(b, 'es'));

const PROPERTY_TYPES = ["Piso", "Casa", "Ático", "Dúplex", "Chalet", "Local", "Oficina", "Cualquiera"];
const STATUS_OPTIONS = ['Búsqueda activa', 'En negociación', 'Con piso reservado', 'Inactivo'] as const;

export default function BuyersManager() {
  const [buyers, setBuyers] = useState<BuyerDemand[]>([]);
  const [selectedBuyer, setSelectedBuyer] = useState<BuyerDemand | null>(null);
  const [activityLogs, setActivityLogs] = useState<BuyerActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);

  // Filters state
  const [searchTerm, setSearchTerm] = useState("");
  const [filterZone, setFilterZone] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterMaxBudget, setFilterMaxBudget] = useState<number | "">("");
  const [filterActivityDays, setFilterActivityDays] = useState<string>("");

  // Create/Edit Modals state
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingBuyer, setEditingBuyer] = useState<BuyerDemand | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmLogDeleteId, setConfirmLogDeleteId] = useState<string | null>(null);

  // New/Edit Form state
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formMinBudget, setFormMinBudget] = useState<number>(0);
  const [formMaxBudget, setFormMaxBudget] = useState<number>(0);
  const [formMinSqm, setFormMinSqm] = useState<number>(0);
  const [formRooms, setFormRooms] = useState<number>(0);
  const [formBathrooms, setFormBathrooms] = useState<number>(0);
  const [formPropertyType, setFormPropertyType] = useState("Piso");
  const [formPreferredZones, setFormPreferredZones] = useState<string[]>([]);
  const [formFundingType, setFormFundingType] = useState<'Contado' | 'Hipoteca'>('Contado');
  const [formSavingsContribution, setFormSavingsContribution] = useState<number>(0);
  const [formStatus, setFormStatus] = useState<BuyerDemand['status']>('Búsqueda activa');

  // Timeline New Event Form state
  const [showLogForm, setShowLogForm] = useState(false);
  const [logType, setLogType] = useState("Llamada telefónica");
  const [logTitle, setLogTitle] = useState("");
  const [logNotes, setLogNotes] = useState("");
  const [logDate, setLogDate] = useState(new Date().toISOString().substring(0, 16));
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [formLogPropertyId, setFormLogPropertyId] = useState("");
  const [properties, setProperties] = useState<any[]>([]);

  // Fetch Buyers from Supabase
  const fetchBuyers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('buyers_demands')
        .select('*')
        .order('last_activity_at', { ascending: false });

      if (error) throw error;
      setBuyers(data as BuyerDemand[] || []);
    } catch (error: any) {
      console.error("Error al cargar compradores:", error.message);
      toast.error("Error al cargar la lista de compradores");
    } finally {
      setLoading(false);
    }
  };

  // Fetch Activity Logs for active buyer
  const fetchActivityLogs = async (buyerId: string) => {
    setLogsLoading(true);
    try {
      const { data, error } = await supabase
        .from('buyer_activity_logs')
        .select('*')
        .eq('buyer_id', buyerId)
        .order('event_date', { ascending: false });

      if (error) throw error;
      setActivityLogs(data as BuyerActivityLog[] || []);
    } catch (error: any) {
      console.error("Error al cargar historial:", error.message);
      toast.error("Error al cargar historial de actividad");
    } finally {
      setLogsLoading(false);
    }
  };

  const fetchProperties = async () => {
    try {
      const { data, error } = await supabase
        .from('properties')
        .select('id, title, price')
        .order('title', { ascending: true });

      if (error) throw error;
      setProperties(data || []);
    } catch (error: any) {
      console.error("Error al cargar propiedades:", error.message);
    }
  };

  useEffect(() => {
    fetchBuyers();
    fetchProperties();
  }, []);

  // Update selected buyer data dynamically when a change occurs
  useEffect(() => {
    if (selectedBuyer) {
      const updated = buyers.find(b => b.id === selectedBuyer.id);
      if (updated) {
        setSelectedBuyer(updated);
      }
    }
  }, [buyers]);

  // Handle Form Open (New vs Edit)
  const openFormModal = (buyer: BuyerDemand | null = null) => {
    if (buyer) {
      setEditingBuyer(buyer);
      setFormName(buyer.name || "");
      setFormPhone(buyer.phone || "");
      setFormEmail(buyer.email || "");
      setFormMinBudget(buyer.min_budget || 0);
      setFormMaxBudget(buyer.max_budget || 0);
      setFormMinSqm(buyer.min_sqm || 0);
      setFormRooms(buyer.rooms || 0);
      setFormBathrooms(buyer.bathrooms || 0);
      setFormPropertyType(buyer.property_type || "Piso");
      setFormPreferredZones(Array.isArray(buyer.preferred_zones) ? buyer.preferred_zones : []);
      setFormFundingType(buyer.funding_type || "Hipoteca");
      setFormSavingsContribution(buyer.savings_contribution || 0);
      setFormStatus(buyer.status || "Búsqueda activa");
    } else {
      setEditingBuyer(null);
      setFormName("");
      setFormPhone("");
      setFormEmail("");
      setFormMinBudget(0);
      setFormMaxBudget(150000);
      setFormMinSqm(80);
      setFormRooms(2);
      setFormBathrooms(1);
      setFormPropertyType("Piso");
      setFormPreferredZones([]);
      setFormFundingType("Hipoteca");
      setFormSavingsContribution(30000);
      setFormStatus("Búsqueda activa");
    }
    setShowFormModal(true);
  };

  // Submit Main CRUD Form
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      toast.error("El nombre del comprador es obligatorio");
      return;
    }

    const payload = {
      name: formName,
      phone: formPhone || null,
      email: formEmail || null,
      min_budget: Number(formMinBudget),
      max_budget: Number(formMaxBudget),
      min_sqm: Number(formMinSqm),
      rooms: Number(formRooms),
      bathrooms: Number(formBathrooms),
      property_type: formPropertyType,
      preferred_zones: formPreferredZones,
      funding_type: formFundingType,
      savings_contribution: formFundingType === 'Hipoteca' ? Number(formSavingsContribution) : Number(formMaxBudget),
      status: formStatus,
      updated_at: new Date().toISOString()
    };

    try {
      if (editingBuyer) {
        // Update
        const { error } = await supabase
          .from('buyers_demands')
          .update(payload)
          .eq('id', editingBuyer.id);

        if (error) throw error;
        toast.success("Perfil de comprador actualizado");
      } else {
        // Create
        const { data, error } = await supabase
          .from('buyers_demands')
          .insert([payload])
          .select();

        if (error) throw error;
        
        // Seed default initial activity for new buyers
        if (data && data[0]) {
          await supabase.from('buyer_activity_logs').insert([{
            buyer_id: data[0].id,
            event_type: 'Llamada telefónica',
            title: 'Perfil registrado en CRM',
            notes: `Se ha dado de alta a ${formName} con una demanda de compra de tipo ${formPropertyType} por un presupuesto máximo de ${Number(formMaxBudget).toLocaleString('es-ES')}€.`,
            event_date: new Date().toISOString()
          }]);
        }
        
        toast.success("Nuevo comprador añadido correctamente");
      }

      setShowFormModal(false);
      fetchBuyers();
    } catch (error: any) {
      console.error("Error al guardar comprador:", error.message);
      toast.error("No se pudo guardar la información en Supabase");
    }
  };

  // Quick Inline Save for Drawer (Sección A - Criterios de Matching)
  const saveMatchingCriteria = async (buyer: BuyerDemand, updates: Partial<BuyerDemand>) => {
    try {
      const { error } = await supabase
        .from('buyers_demands')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', buyer.id);

      if (error) throw error;
      toast.success("Criterios actualizados");
      fetchBuyers();
    } catch (error: any) {
      console.error("Error al guardar criterios rápidos:", error.message);
      toast.error("Error al guardar cambios");
    }
  };

  // Delete Buyer Demands
  const handleDeleteBuyer = async (id: string) => {
    try {
      const { error } = await supabase
        .from('buyers_demands')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success("Comprador eliminado con éxito");
      if (selectedBuyer && selectedBuyer.id === id) {
        setSelectedBuyer(null);
      }
      setConfirmDeleteId(null);
      fetchBuyers();
    } catch (error: any) {
      console.error("Error al borrar comprador:", error.message);
      toast.error("No se pudo eliminar el comprador");
    }
  };

  // Timeline Event Form Submit (Add/Edit)
  const handleLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBuyer) return;
    if (!logTitle.trim()) {
      toast.error("El título de la actividad es obligatorio");
      return;
    }

    const payload = {
      buyer_id: selectedBuyer.id,
      event_type: logType,
      title: logTitle,
      notes: logNotes || null,
      event_date: new Date(logDate).toISOString(),
      property_id: formLogPropertyId || null
    };

    try {
      if (editingLogId) {
        // Edit log
        const { error } = await supabase
          .from('buyer_activity_logs')
          .update(payload)
          .eq('id', editingLogId);

        if (error) throw error;
        toast.success("Hito de actividad actualizado");
      } else {
        // Create log
        const { error } = await supabase
          .from('buyer_activity_logs')
          .insert([payload]);

        if (error) throw error;
        toast.success("Actividad registrada en la línea de tiempo");
      }

      setLogTitle("");
      setLogNotes("");
      setFormLogPropertyId("");
      setLogDate(new Date().toISOString().substring(0, 16));
      setEditingLogId(null);
      setShowLogForm(false);
      fetchActivityLogs(selectedBuyer.id);
      fetchBuyers(); // Update last_activity_at in list
    } catch (error: any) {
      console.error("Error al registrar log de actividad:", error.message);
      toast.error("No se pudo registrar la actividad");
    }
  };

  // Timeline Event Delete
  const handleDeleteLog = async (id: string) => {
    if (!selectedBuyer) return;
    try {
      const { error } = await supabase
        .from('buyer_activity_logs')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success("Evento eliminado de la línea de tiempo");
      setConfirmLogDeleteId(null);
      fetchActivityLogs(selectedBuyer.id);
      fetchBuyers(); // Recalculate
    } catch (error: any) {
      console.error("Error al borrar hito:", error.message);
      toast.error("No se pudo eliminar el evento");
    }
  };

  // Toggle preferred zone in form list
  const toggleZoneInForm = (zone: string) => {
    if (formPreferredZones.includes(zone)) {
      setFormPreferredZones(formPreferredZones.filter(z => z !== zone));
    } else {
      setFormPreferredZones([...formPreferredZones, zone]);
    }
  };

  // Format budget currency visually
  // Helper formatting currencies — centralizado en @/lib/utils

  // Filter logic
  const filteredBuyers = buyers.filter(b => {
    // 1. Text Search (Name / Phone / Email)
    const nameStr = b.name || "";
    const matchesSearch = 
      nameStr.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (b.phone && b.phone.includes(searchTerm)) ||
      (b.email && b.email.toLowerCase().includes(searchTerm.toLowerCase()));

    // 2. Zone Filter
    const matchesZone = !filterZone || (Array.isArray(b.preferred_zones) && b.preferred_zones.some(z => {
      if (z === filterZone) return true;
      if (z.startsWith(`${filterZone} - `)) return true;
      return false;
    }));

    // 3. Status Filter
    const matchesStatus = !filterStatus || b.status === filterStatus;

    // 4. Max Budget Filter
    const matchesBudget = !filterMaxBudget || (b.max_budget || 0) <= Number(filterMaxBudget);

    // 5. Activity Date Filter
    let matchesActivity = true;
    if (filterActivityDays) {
      const days = parseInt(filterActivityDays);
      const activityLimit = new Date();
      activityLimit.setDate(activityLimit.getDate() - days);
      const lastActivity = b.last_activity_at || b.created_at || new Date().toISOString();
      matchesActivity = new Date(lastActivity) >= activityLimit;
    }

    return matchesSearch && matchesZone && matchesStatus && matchesBudget && matchesActivity;
  });

  // Calculate high-level metrics for dashboard cards
  const activeCount = buyers.filter(b => b.status === 'Búsqueda activa').length;
  const negotiationCount = buyers.filter(b => b.status === 'En negociación').length;
  const reservedCount = buyers.filter(b => b.status === 'Con piso reservado').length;
  const totalVolume = buyers.reduce((sum, b) => sum + Number(b.max_budget), 0);

  // Timeline item visual mapping (Colors/Design elements)
  const getTimelineIconConfig = (type: string) => {
    switch (type) {
      case 'Llamada telefónica':
        return { color: 'bg-blue-500 border-blue-600', textColor: 'text-blue-400', label: '📞 Llamada' };
      case 'Visita física realizada':
        return { color: 'bg-indigo-500 border-indigo-600', textColor: 'text-indigo-400', label: '🏠 Visita Física' };
      case 'Oferta presentada':
        return { color: 'bg-amber-500 border-amber-600', textColor: 'text-amber-400', label: '💰 Oferta' };
      case 'Contrato firmado':
        return { color: 'bg-emerald-500 border-emerald-600', textColor: 'text-emerald-400', label: '✍️ Contrato' };
      case 'IA WhatsApp':
        return { color: 'bg-purple-500 border-purple-600', textColor: 'text-purple-400', label: '🤖 IA WhatsApp' };
      case 'Visita web':
        return { color: 'bg-sky-500 border-sky-600', textColor: 'text-sky-400', label: '🌐 Web' };
      default:
        return { color: 'bg-slate-500 border-slate-600', textColor: 'text-slate-400', label: '📌 Actividad' };
    }
  };

  return (
    <div className="space-y-6">
      
      {/* ─── METRICS CARDS ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-[#1E293B] border border-white/5 p-5 rounded-2xl flex items-center justify-between shadow-lg">
          <div>
            <span className="text-xs text-slate-400 font-medium block">Búsqueda Activa</span>
            <span className="text-3xl font-extrabold text-white mt-1 block">{activeCount}</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Users size={24} />
          </div>
        </div>

        <div className="bg-[#1E293B] border border-white/5 p-5 rounded-2xl flex items-center justify-between shadow-lg">
          <div>
            <span className="text-xs text-slate-400 font-medium block">En Negociación</span>
            <span className="text-3xl font-extrabold text-white mt-1 block">{negotiationCount}</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <TrendingUp size={24} />
          </div>
        </div>

        <div className="bg-[#1E293B] border border-white/5 p-5 rounded-2xl flex items-center justify-between shadow-lg">
          <div>
            <span className="text-xs text-slate-400 font-medium block">Pisos Reservados</span>
            <span className="text-3xl font-extrabold text-[#FBBF24] mt-1 block">{reservedCount}</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-[#FBBF24]">
            <CheckCircle size={24} />
          </div>
        </div>

        <div className="bg-[#1E293B] border border-white/5 p-5 rounded-2xl flex items-center justify-between shadow-lg">
          <div>
            <span className="text-xs text-slate-400 font-medium block">Presupuesto Acumulado</span>
            <span className="text-2xl font-black text-white mt-1 block tracking-tight">
              {formatCurrency(totalVolume)}
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <DollarSign size={24} />
          </div>
        </div>
      </div>

      {/* ─── FILTER TOOLBAR ───────────────────────────────────────────────── */}
      <div className="bg-[#1E293B] border border-white/5 p-6 rounded-2xl shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <Briefcase className="text-[#FBBF24]" size={22} />
              Gestión Avanzada de Compradores (Pedidos)
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Filtra demandas, administra criterios de matching de pisos y registra el historial cronológico de leads.
            </p>
          </div>

          <button 
            onClick={() => openFormModal()}
            className="flex items-center justify-center gap-2 bg-[#FBBF24] text-[#2C3E50] font-bold px-5 py-2.5 rounded-xl hover:bg-[#F59E0B] active:scale-95 transition-all shadow-md text-sm cursor-pointer"
          >
            <Plus size={18} />
            Añadir Comprador
          </button>
        </div>

        {/* Filters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 pt-2">
          {/* Text Search */}
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Search size={16} />
            </span>
            <input 
              type="text" 
              placeholder="Buscar por nombre/teléfono..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#0F172A] border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#FBBF24] transition-all"
            />
          </div>

          {/* Zone filter dropdown */}
          <div className="relative">
            <select
              value={filterZone}
              onChange={(e) => setFilterZone(e.target.value)}
              className="w-full bg-[#0F172A] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#FBBF24] appearance-none transition-all"
            >
              <option value="">Todas las zonas</option>
              <optgroup label="Sevilla Capital">
                {SEVILLA_ZONAS_CAPITAL.map(z => <option key={z} value={z}>{z}</option>)}
              </optgroup>
              <optgroup label="Aljarafe / Provincia">
                {SEVILLA_ZONAS_PUEBLOS.map(z => <option key={z} value={z}>{z}</option>)}
              </optgroup>
            </select>
          </div>

          {/* Status filter dropdown */}
          <div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full bg-[#0F172A] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#FBBF24] appearance-none transition-all"
            >
              <option value="">Todos los estados</option>
              {STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>

          {/* Max Budget filter input */}
          <div>
            <input 
              type="number" 
              placeholder="Presupuesto máx. €" 
              value={filterMaxBudget}
              onChange={(e) => setFilterMaxBudget(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full bg-[#0F172A] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#FBBF24] transition-all"
            />
          </div>

          {/* Last Activity filter dropdown */}
          <div>
            <select
              value={filterActivityDays}
              onChange={(e) => setFilterActivityDays(e.target.value)}
              className="w-full bg-[#0F172A] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#FBBF24] appearance-none transition-all"
            >
              <option value="">Cualquier actividad</option>
              <option value="3">Activo hace menos de 3 días</option>
              <option value="7">Activo hace menos de 7 días</option>
              <option value="30">Activo hace menos de 30 días</option>
            </select>
          </div>
        </div>
      </div>

      {/* ─── DATA TABLE / GRID ────────────────────────────────────────────── */}
      <div className="bg-[#1E293B] border border-white/5 rounded-2xl shadow-xl overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center space-y-3">
            <div className="w-10 h-10 border-4 border-[#FBBF24] border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-400 font-medium">Cargando demandas de compradores...</p>
          </div>
        ) : filteredBuyers.length === 0 ? (
          <div className="py-24 text-center">
            <Compass className="mx-auto text-slate-500 mb-4 animate-pulse" size={48} />
            <h3 className="text-white font-bold text-base">No se encontraron compradores</h3>
            <p className="text-slate-400 text-xs mt-1 max-w-sm mx-auto">
              Prueba a ajustar tus términos de búsqueda o filtros rápidos para encontrar la demanda que necesitas.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-[#0F172A]/50 text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                  <th className="py-4 px-6">Comprador / Contacto</th>
                  <th className="py-4 px-6">Presupuesto Máx.</th>
                  <th className="py-4 px-6">Zona de Interés</th>
                  <th className="py-4 px-6">Tipo Inmueble</th>
                  <th className="py-4 px-6">Forma de Pago</th>
                  <th className="py-4 px-6">Estado</th>
                  <th className="py-4 px-6 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredBuyers.map((buyer) => {
                  let statusBg = "bg-slate-500/10 text-slate-400 border-slate-500/20";
                  if (buyer.status === 'Búsqueda activa') statusBg = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
                  else if (buyer.status === 'En negociación') statusBg = "bg-blue-500/10 text-blue-400 border-blue-500/20";
                  else if (buyer.status === 'Con piso reservado') statusBg = "bg-amber-500/10 text-amber-400 border-amber-500/20";

                  return (
                    <tr 
                      key={buyer.id} 
                      onClick={() => {
                        setSelectedBuyer(buyer);
                        fetchActivityLogs(buyer.id);
                      }}
                      className="hover:bg-white/[0.02] cursor-pointer transition-all group"
                    >
                      {/* Name & Contact */}
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-[#2C3E50] border border-white/10 flex items-center justify-center font-bold text-white text-xs group-hover:border-[#FBBF24] transition-all">
                            {buyer.name.charAt(0)}
                          </div>
                          <div>
                            <span className="font-bold text-white text-sm block group-hover:text-[#FBBF24] transition-all">{buyer.name}</span>
                            <span className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                              {buyer.phone && <span className="flex items-center gap-1"><Phone size={10} /> {buyer.phone}</span>}
                              {buyer.email && <span className="flex items-center gap-1"><Mail size={10} /> {buyer.email}</span>}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Budget */}
                      <td className="py-4 px-6 font-semibold text-white text-sm">
                        {formatCurrency(buyer.max_budget)}
                      </td>

                      {/* Zones */}
                      <td className="py-4 px-6">
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {buyer.preferred_zones && buyer.preferred_zones.length > 0 ? (
                            buyer.preferred_zones.slice(0, 2).map((zone, idx) => (
                              <span key={idx} className="bg-[#0F172A] text-slate-300 text-[10px] px-2 py-0.5 rounded border border-white/5 flex items-center gap-0.5">
                                <MapPin size={8} className="text-[#FBBF24]" />
                                {zone}
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-500 text-xs">-</span>
                          )}
                          {buyer.preferred_zones && buyer.preferred_zones.length > 2 && (
                            <span className="bg-[#0F172A] text-[#FBBF24] text-[9px] px-1.5 py-0.5 rounded border border-white/5 font-extrabold">
                              +{buyer.preferred_zones.length - 2}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Property Type */}
                      <td className="py-4 px-6 text-slate-300 text-xs font-medium">
                        {buyer.property_type}
                      </td>

                      {/* Funding Type & Savings */}
                      <td className="py-4 px-6">
                        <div>
                          <span className={`text-[10px] font-bold uppercase ${buyer.funding_type === 'Hipoteca' ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {buyer.funding_type}
                          </span>
                          {buyer.funding_type === 'Hipoteca' && buyer.savings_contribution > 0 && (
                            <span className="text-[10px] text-slate-400 block">
                              Ahorro: {formatCurrency(buyer.savings_contribution)}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-4 px-6">
                        <span className={`px-2.5 py-1 text-[10px] font-semibold rounded-full border ${statusBg}`}>
                          {buyer.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-6 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-2">
                          <button 
                            onClick={() => openFormModal(buyer)}
                            className="p-2 rounded-lg bg-white/5 hover:bg-[#FBBF24] text-slate-300 hover:text-[#2C3E50] border border-white/5 transition-all hover:scale-105 active:scale-95 cursor-pointer"
                            title="Editar Comprador"
                          >
                            <Edit3 size={14} />
                          </button>
                          
                          <button 
                            onClick={() => setConfirmDeleteId(buyer.id)}
                            className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white border border-rose-500/20 transition-all hover:scale-105 active:scale-95 cursor-pointer"
                            title="Eliminar Perfil"
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

      {/* ─── DRAWER: DETAILED BUYER PROFILE ───────────────────────────────── */}
      {selectedBuyer && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
          {/* Overlay background */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => setSelectedBuyer(null)}
          />

          {/* Drawer Container */}
          <div className="relative w-full max-w-[620px] h-full bg-[#111827]/95 backdrop-blur-md shadow-2xl border-l border-white/10 flex flex-col z-50 animate-slide-in">
            {/* Header */}
            <div className="p-6 border-b border-white/10 bg-[#1E293B]/90 backdrop-blur-md flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-[#FBBF24] text-[#2C3E50] font-black text-lg flex items-center justify-center border border-white/10 shadow-inner">
                  {(selectedBuyer.name || "C").charAt(0)}
                </div>
                <div>
                  <h3 className="text-lg font-black text-white">{selectedBuyer.name}</h3>
                  <div className="flex flex-wrap items-center gap-3 mt-1.5">
                    <span className="flex items-center gap-1 text-xs text-slate-400"><Phone size={12} className="text-[#FBBF24]" /> {selectedBuyer.phone || "Sin tel."}</span>
                    <span className="flex items-center gap-1 text-xs text-slate-400"><Mail size={12} className="text-[#FBBF24]" /> {selectedBuyer.email || "Sin email"}</span>
                    
                    <select
                      value={selectedBuyer.status || "Búsqueda activa"}
                      onChange={(e) => saveMatchingCriteria(selectedBuyer, { status: e.target.value as BuyerDemand['status'] })}
                      className={`bg-[#0F172A] border border-white/10 rounded-full px-2.5 py-0.5 text-[10px] font-bold focus:outline-none focus:border-[#FBBF24] cursor-pointer transition-all ${
                        selectedBuyer.status === 'Búsqueda activa' ? 'text-emerald-400 border-emerald-500/20' :
                        selectedBuyer.status === 'En negociación' ? 'text-blue-400 border-blue-500/20' :
                        selectedBuyer.status === 'Con piso reservado' ? 'text-amber-400 border-amber-500/20' :
                        'text-slate-400 border-slate-500/20'
                      }`}
                    >
                      {STATUS_OPTIONS.map(opt => <option key={opt} value={opt} className="text-white bg-[#0F172A]">{opt}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setSelectedBuyer(null)}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content Body (Scrollable) */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              
              {/* SECTION A: MATCHING CRITERIA */}
              <div className="space-y-4">
                <h4 className="text-xs font-black text-[#FBBF24] uppercase tracking-wider flex items-center gap-2">
                  <Compass size={14} />
                  Sección A: Criterios de Búsqueda y Financiación (Edición en caliente)
                </h4>
                
                <div className="bg-[#1E293B] border border-white/5 rounded-2xl p-5 space-y-4 shadow-lg">
                  {/* Criterias Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wide">Presupuesto Máximo</span>
                      <div className="relative mt-1">
                        <input
                          type="number"
                          defaultValue={selectedBuyer.max_budget || 0}
                          onBlur={(e) => {
                            const val = Number(e.target.value);
                            if (val !== selectedBuyer.max_budget) {
                              saveMatchingCriteria(selectedBuyer, { max_budget: val });
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const val = Number((e.target as HTMLInputElement).value);
                              if (val !== selectedBuyer.max_budget) {
                                saveMatchingCriteria(selectedBuyer, { max_budget: val });
                                (e.target as HTMLInputElement).blur();
                              }
                            }
                          }}
                          className="w-full bg-[#0F172A] border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-[#FBBF24]"
                        />
                        <span className="absolute right-2.5 top-1.5 text-[10px] text-slate-500 font-bold">€</span>
                      </div>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wide">Tipo de Inmueble</span>
                      <select
                        value={selectedBuyer.property_type || "Piso"}
                        onChange={(e) => saveMatchingCriteria(selectedBuyer, { property_type: e.target.value })}
                        className="w-full bg-[#0F172A] border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-[#FBBF24] mt-1 block"
                      >
                        {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wide">Dormitorios / Baños</span>
                      <div className="flex gap-2 mt-1">
                        <select
                          value={selectedBuyer.rooms || 0}
                          onChange={(e) => saveMatchingCriteria(selectedBuyer, { rooms: Number(e.target.value) })}
                          className="bg-[#0F172A] border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-[#FBBF24] w-full cursor-pointer"
                        >
                          {[0,1,2,3,4,5].map(n => <option key={n} value={n}>{n} hab</option>)}
                        </select>
                        <select
                          value={selectedBuyer.bathrooms || 0}
                          onChange={(e) => saveMatchingCriteria(selectedBuyer, { bathrooms: Number(e.target.value) })}
                          className="bg-[#0F172A] border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-[#FBBF24] w-full cursor-pointer"
                        >
                          {[0,1,2,3,4].map(n => <option key={n} value={n}>{n} baños</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wide">Metros Cuadrados Mín.</span>
                      <div className="relative mt-1">
                        <input
                          type="number"
                          defaultValue={selectedBuyer.min_sqm || 0}
                          onBlur={(e) => {
                            const val = Number(e.target.value);
                            if (val !== selectedBuyer.min_sqm) {
                              saveMatchingCriteria(selectedBuyer, { min_sqm: val });
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const val = Number((e.target as HTMLInputElement).value);
                              if (val !== selectedBuyer.min_sqm) {
                                saveMatchingCriteria(selectedBuyer, { min_sqm: val });
                                (e.target as HTMLInputElement).blur();
                              }
                            }
                          }}
                          className="w-full bg-[#0F172A] border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-[#FBBF24]"
                        />
                        <span className="absolute right-2.5 top-1.5 text-[10px] text-slate-500 font-bold">m²</span>
                      </div>
                    </div>
                  </div>

                  {/* Financial calculation metrics block */}
                  <div className="border-t border-white/10 pt-4 mt-2">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wide mb-2">Análisis Financiero del Lead</span>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-[#0F172A] p-2.5 rounded-xl border border-white/5">
                        <span className="text-[9px] text-slate-400 block font-semibold">Forma Pago</span>
                        <select
                          value={selectedBuyer.funding_type || "Hipoteca"}
                          onChange={(e) => saveMatchingCriteria(selectedBuyer, { funding_type: e.target.value as 'Contado' | 'Hipoteca' })}
                          className={`bg-transparent border-none p-0 text-xs font-black uppercase mt-1 block w-full focus:outline-none cursor-pointer ${
                            selectedBuyer.funding_type === 'Contado' ? 'text-emerald-400' : 'text-amber-400'
                          }`}
                        >
                          <option value="Hipoteca" className="text-white bg-[#0F172A]">Hipoteca</option>
                          <option value="Contado" className="text-white bg-[#0F172A]">Contado</option>
                        </select>
                      </div>
                      
                      {(selectedBuyer.funding_type || "Hipoteca") === 'Hipoteca' ? (
                        <>
                          <div className="bg-[#0F172A] p-2.5 rounded-xl border border-white/5">
                            <span className="text-[9px] text-slate-400 block font-semibold text-ellipsis overflow-hidden whitespace-nowrap">Aportación Ahorros</span>
                            <input
                              type="number"
                              key={selectedBuyer.savings_contribution}
                              defaultValue={selectedBuyer.savings_contribution || 0}
                              onBlur={(e) => {
                                const val = Number(e.target.value);
                                if (val !== selectedBuyer.savings_contribution) {
                                  saveMatchingCriteria(selectedBuyer, { savings_contribution: val });
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const val = Number((e.target as HTMLInputElement).value);
                                  if (val !== selectedBuyer.savings_contribution) {
                                    saveMatchingCriteria(selectedBuyer, { savings_contribution: val });
                                    (e.target as HTMLInputElement).blur();
                                  }
                                }
                              }}
                              className="bg-transparent border-none p-0 text-xs font-black text-white mt-1 block w-full focus:outline-none"
                            />
                          </div>
                          <div className="bg-[#0F172A] p-2.5 rounded-xl border border-white/5">
                            <span className="text-[9px] text-slate-400 block font-semibold text-ellipsis overflow-hidden whitespace-nowrap">Hipoteca Requerida</span>
                            <span className="text-xs font-black text-purple-300 mt-1 block">
                              {formatCurrency(Math.max(0, (selectedBuyer.max_budget || 0) - (selectedBuyer.savings_contribution || 0)))}
                            </span>
                          </div>
                        </>
                      ) : (
                        <div className="bg-[#0F172A] col-span-2 p-2.5 rounded-xl border border-white/5 flex items-center justify-between">
                          <div>
                            <span className="text-[9px] text-slate-400 block font-semibold">Aportación al Contado</span>
                            <span className="text-xs font-black text-emerald-400 block">Fondos Propios 100% disponibles</span>
                          </div>
                          <Check size={16} className="text-emerald-400 mr-1" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Zones tags list */}
                  <div className="border-t border-white/10 pt-4">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wide mb-2">Zonas de Interés (Haz clic para quitar)</span>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedBuyer.preferred_zones && selectedBuyer.preferred_zones.length > 0 ? (
                        selectedBuyer.preferred_zones.map((zone, idx) => (
                          <button 
                            key={idx} 
                            onClick={() => {
                              const updatedZones = selectedBuyer.preferred_zones.filter(z => z !== zone);
                              saveMatchingCriteria(selectedBuyer, { preferred_zones: updatedZones });
                            }}
                            className="bg-[#0F172A] hover:bg-rose-500/20 hover:text-rose-300 hover:border-rose-500/30 text-slate-300 text-xs px-2.5 py-1 rounded-lg border border-white/10 flex items-center gap-1 transition-all group/zone cursor-pointer"
                            title="Haz clic para quitar esta zona"
                          >
                            <MapPin size={10} className="text-[#FBBF24] group-hover/zone:text-rose-400" />
                            {zone}
                            <span className="text-[9px] text-slate-500 group-hover/zone:text-rose-400 ml-1">×</span>
                          </button>
                        ))
                      ) : (
                        <span className="text-slate-500 text-xs">Ninguna zona seleccionada</span>
                      )}
                    </div>
                    
                    {/* Premium Zone Selector with Tree, Search & AI Copilot */}
                    <div className="mt-4 border-t border-white/5 pt-4">
                      <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wide mb-2">Asistente de Zonas (Árbol, Buscador y Copilot IA)</span>
                      <ZoneSelectorPremium
                        selectedZones={selectedBuyer.preferred_zones || []}
                        onChange={(updatedZones) => saveMatchingCriteria(selectedBuyer, { preferred_zones: updatedZones })}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION B: ACTIVITY TIMELINE */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-black text-[#FBBF24] uppercase tracking-wider flex items-center gap-2">
                    <Clock size={14} />
                    Sección B: Historial de Actividad (Línea de Tiempo)
                  </h4>
                  
                  <button 
                    onClick={() => {
                      setEditingLogId(null);
                      setLogTitle("");
                      setLogNotes("");
                      setFormLogPropertyId("");
                      setShowLogForm(!showLogForm);
                    }}
                    className="text-xs font-bold text-[#FBBF24] hover:text-white flex items-center gap-1 transition-colors bg-white/5 border border-white/15 px-2.5 py-1 rounded-lg cursor-pointer"
                  >
                    {showLogForm ? <X size={12} /> : <Plus size={12} />}
                    {showLogForm ? "Cancelar" : "Nuevo Evento"}
                  </button>
                </div>

                {/* Inline Add/Edit Event Form */}
                {showLogForm && (
                  <form onSubmit={handleLogSubmit} className="bg-[#1E293B] border border-[#FBBF24]/30 rounded-2xl p-4 space-y-3 animate-fade-in">
                    <h5 className="text-xs font-bold text-white uppercase tracking-wide">
                      {editingLogId ? "✍️ Editar Hito Manual" : "➕ Registrar Hito Manual"}
                    </h5>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-1">Tipo de Evento</label>
                        <select
                          value={logType}
                          onChange={(e) => setLogType(e.target.value)}
                          className="w-full bg-[#0F172A] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#FBBF24]"
                        >
                          <option value="Llamada telefónica">📞 Llamada Telefónica</option>
                          <option value="Visita física realizada">🏠 Visita Física Realizada</option>
                          <option value="Oferta presentada">💰 Oferta Presentada</option>
                          <option value="Contrato firmado">✍️ Contrato Firmado</option>
                          <option value="Visita web">🌐 Visita Web</option>
                          <option value="IA WhatsApp">🤖 IA WhatsApp</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-400 block mb-1">Fecha y Hora</label>
                        <input
                          type="datetime-local"
                          value={logDate}
                          onChange={(e) => setLogDate(e.target.value)}
                          className="w-full bg-[#0F172A] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#FBBF24]"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1">Título de la Actividad</label>
                      <input
                        type="text"
                        placeholder="Ej. Llamada de seguimiento de Triana"
                        value={logTitle}
                        onChange={(e) => setLogTitle(e.target.value)}
                        className="w-full bg-[#0F172A] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#FBBF24]"
                        required
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1">Notas Detalladas (Opcional)</label>
                      <textarea
                        placeholder="Escribe comentarios, feedback del comprador..."
                        value={logNotes}
                        onChange={(e) => setLogNotes(e.target.value)}
                        rows={2}
                        className="w-full bg-[#0F172A] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#FBBF24] resize-none"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1">Vincular a Inmueble (Opcional)</label>
                      <select
                        value={formLogPropertyId}
                        onChange={(e) => setFormLogPropertyId(e.target.value)}
                        className="w-full bg-[#0F172A] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#FBBF24]"
                      >
                        <option value="">-- No vincular a ningún inmueble --</option>
                        {properties.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title} ({p.price.toLocaleString("es-ES")}€)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowLogForm(false)}
                        className="px-3 py-1.5 text-xs bg-white/5 text-slate-400 rounded-lg hover:bg-white/10 cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="px-3.5 py-1.5 text-xs bg-[#FBBF24] text-[#2C3E50] font-black rounded-lg hover:bg-[#F59E0B] transition-colors cursor-pointer"
                      >
                        {editingLogId ? "Guardar Cambios" : "Registrar Hito"}
                      </button>
                    </div>
                  </form>
                )}

                {/* TIMELINE LIST */}
                <div className="relative pl-6 border-l-2 border-white/10 space-y-6 pt-2 ml-3">
                  {logsLoading ? (
                    <div className="py-8 text-center text-xs text-slate-400">Cargando historial...</div>
                  ) : activityLogs.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-500">Historial vacío. Registra el primer evento de seguimiento.</div>
                  ) : (
                    activityLogs.map((log) => {
                      const iconConf = getTimelineIconConfig(log.event_type);

                      return (
                        <div key={log.id} className="relative group/log">
                          {/* Circle on the line */}
                          <div className={`absolute -left-[31px] top-1.5 w-4 h-4 rounded-full border-2 ${iconConf.color} bg-[#111827] shadow-lg transition-transform group-hover/log:scale-125`} />

                          {/* Event card */}
                          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2 hover:bg-white/[0.08] transition-all">
                            <div className="flex justify-between items-start">
                              <div>
                                <span className={`text-[9px] font-black uppercase tracking-wider ${iconConf.textColor}`}>
                                  {iconConf.label}
                                </span>
                                <h5 className="font-bold text-white text-sm mt-0.5">{log.title}</h5>
                              </div>
                              <span className="text-[10px] text-slate-500 font-medium">
                                {new Date(log.event_date).toLocaleString('es-ES', { 
                                  day: '2-digit', 
                                  month: '2-digit', 
                                  hour: '2-digit', 
                                  minute: '2-digit' 
                                })}
                              </span>
                            </div>

                            {log.notes && (
                              <p className="text-xs text-slate-300 leading-relaxed font-light whitespace-pre-line">
                                {log.notes}
                              </p>
                            )}

                            {log.property_id && (
                              <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-2 py-1 rounded-lg text-[10px] text-slate-300 w-fit mt-2">
                                <Home size={10} className="text-[#FBBF24]" />
                                <span className="font-medium">Vinculado a:</span>
                                <span className="font-semibold text-[#FBBF24]">
                                  {properties.find(p => p.id === log.property_id)?.title || "Inmueble"}
                                </span>
                              </div>
                            )}

                            {/* Hover Edit/Delete controls for Manual logs */}
                            <div className="flex justify-end gap-2 pt-1 opacity-0 group-hover/log:opacity-100 transition-opacity">
                              <button
                                onClick={() => {
                                  setEditingLogId(log.id);
                                  setLogType(log.event_type);
                                  setLogTitle(log.title);
                                  setLogNotes(log.notes || "");
                                  setFormLogPropertyId(log.property_id || "");
                                  setLogDate(new Date(log.event_date).toISOString().substring(0, 16));
                                  setShowLogForm(true);
                                }}
                                className="text-[10px] text-slate-400 hover:text-[#FBBF24] flex items-center gap-0.5 cursor-pointer"
                              >
                                <Edit3 size={10} /> Editar
                              </button>
                              <button
                                onClick={() => setConfirmLogDeleteId(log.id)}
                                className="text-[10px] text-rose-500/80 hover:text-rose-400 flex items-center gap-0.5 cursor-pointer"
                              >
                                <Trash2 size={10} /> Eliminar
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: CREATE / EDIT BUYER ───────────────────────────────────── */}
      {showFormModal && (
        <div className="fixed inset-0 z-50 flex items-start md:items-center justify-center p-4 overflow-y-auto">
          {/* Backdrop overlay */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowFormModal(false)} />
          
          {/* Modal Container */}
          <div className="relative w-full max-w-2xl bg-[#1E293B] border border-white/10 rounded-2xl shadow-2xl my-auto max-h-[90vh] overflow-y-auto z-50 animate-zoom-in">
            {/* Header */}
            <div className="p-6 border-b border-white/10 flex justify-between items-center sticky top-0 bg-[#1E293B] z-10">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <PlusCircle className="text-[#FBBF24]" size={20} />
                {editingBuyer ? "Editar Perfil del Comprador" : "Dar de Alta Nuevo Comprador"}
              </h3>
              <button 
                onClick={() => setShowFormModal(false)}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleFormSubmit} className="p-6 space-y-6">
              
              {/* Bloque 1: Datos Personales */}
              <div className="space-y-4">
                <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">1. Datos Personales y Contacto</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs text-slate-300 font-medium">Nombre Completo *</label>
                    <input
                      type="text"
                      placeholder="Manuel Benítez"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="w-full bg-[#0F172A] border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-[#FBBF24]"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-300 font-medium">Teléfono Móvil</label>
                    <input
                      type="text"
                      placeholder="697223944"
                      value={formPhone}
                      onChange={(e) => setFormPhone(e.target.value)}
                      className="w-full bg-[#0F172A] border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-[#FBBF24]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-300 font-medium">Correo Electrónico</label>
                    <input
                      type="email"
                      placeholder="comprador@correo.com"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      className="w-full bg-[#0F172A] border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-[#FBBF24]"
                    />
                  </div>
                </div>
              </div>

              {/* Bloque 2: Criterios del Inmueble */}
              <div className="space-y-4 border-t border-white/5 pt-4">
                <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">2. Criterios de Demanda e Inmueble</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  
                  <div className="space-y-1">
                    <label className="text-xs text-slate-300 font-medium">Tipo Inmueble</label>
                    <select
                      value={formPropertyType}
                      onChange={(e) => setFormPropertyType(e.target.value)}
                      className="w-full bg-[#0F172A] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#FBBF24]"
                    >
                      {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-300 font-medium">Presupuesto Máx. (€) *</label>
                    <input
                      type="number"
                      value={formMaxBudget || ""}
                      onChange={(e) => setFormMaxBudget(Number(e.target.value))}
                      className="w-full bg-[#0F172A] border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-[#FBBF24]"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-300 font-medium">Mín. Metros (m²)</label>
                    <input
                      type="number"
                      value={formMinSqm || ""}
                      onChange={(e) => setFormMinSqm(Number(e.target.value))}
                      className="w-full bg-[#0F172A] border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-[#FBBF24]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-300 font-medium">Min. Habitaciones</label>
                    <input
                      type="number"
                      value={formRooms || ""}
                      onChange={(e) => setFormRooms(Number(e.target.value))}
                      className="w-full bg-[#0F172A] border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-[#FBBF24]"
                    />
                  </div>
                </div>
              </div>

              {/* Bloque 3: Financiación */}
              <div className="space-y-4 border-t border-white/5 pt-4">
                <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">3. Condiciones Financieras de Pago</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs text-slate-300 font-medium">Forma de Pago</label>
                    <select
                      value={formFundingType}
                      onChange={(e) => setFormFundingType(e.target.value as 'Contado' | 'Hipoteca')}
                      className="w-full bg-[#0F172A] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#FBBF24]"
                    >
                      <option value="Hipoteca">Hipoteca</option>
                      <option value="Contado">Al Contado</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-300 font-medium">
                      Aportación Ahorros (€)
                    </label>
                    <input
                      type="number"
                      placeholder="Fondos disponibles propios"
                      value={formSavingsContribution || ""}
                      onChange={(e) => setFormSavingsContribution(Number(e.target.value))}
                      disabled={formFundingType === 'Contado'}
                      className="w-full bg-[#0F172A] border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-[#FBBF24] disabled:opacity-40 disabled:cursor-not-allowed"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-300 font-medium">Estado Comercial</label>
                    <select
                      value={formStatus}
                      onChange={(e) => setFormStatus(e.target.value as BuyerDemand['status'])}
                      className="w-full bg-[#0F172A] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#FBBF24]"
                    >
                      {STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>
                </div>
                
                {formFundingType === 'Hipoteca' && (
                  <p className="text-[10px] text-amber-400 font-medium">
                    * Con {formatCurrency(formSavingsContribution)} de aportación propia, el comprador requerirá una financiación bancaria de aproximadamente {formatCurrency(Math.max(0, formMaxBudget - formSavingsContribution))}€ (equivalente al {formMaxBudget > 0 ? Math.round((Math.max(0, formMaxBudget - formSavingsContribution) / formMaxBudget) * 100) : 0}% del importe).
                  </p>
                )}
              </div>

              {/* Bloque 4: Zonas de Sevilla */}
              <div className="space-y-3 border-t border-white/5 pt-4">
                <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">4. Barrios y Zonas de Sevilla de Interés</h4>
                <ZoneSelectorPremium
                  selectedZones={formPreferredZones}
                  onChange={setFormPreferredZones}
                />
              </div>

              {/* Form Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-sm transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-[#FBBF24] text-[#2C3E50] font-bold rounded-xl hover:bg-[#F59E0B] active:scale-95 transition-all text-sm cursor-pointer shadow-md"
                >
                  {editingBuyer ? "Actualizar Perfil" : "Dar de Alta Comprador"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── SECURITY CONFIRMATION MODALS ─────────────────────────────────── */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmDeleteId(null)} />
          <div className="relative bg-[#1E293B] border border-rose-500/30 p-6 rounded-2xl shadow-2xl max-w-sm w-full z-50 text-center space-y-4 animate-zoom-in">
            <AlertTriangle className="text-rose-500 mx-auto" size={48} />
            <div>
              <h4 className="text-white font-bold text-base">¿Estás seguro?</h4>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Esta acción eliminará de forma permanente el perfil del comprador y todo su historial de la línea de tiempo. No se puede deshacer.
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
                onClick={() => confirmDeleteId && handleDeleteBuyer(confirmDeleteId)}
                className="flex-1 py-2 bg-rose-500 text-white rounded-xl text-xs font-bold hover:bg-rose-600 transition-colors cursor-pointer shadow-md"
              >
                Sí, Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmLogDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmLogDeleteId(null)} />
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
                onClick={() => setConfirmLogDeleteId(null)}
                className="flex-1 py-2 bg-white/5 text-slate-300 rounded-xl text-xs font-semibold hover:bg-white/10 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button 
                onClick={() => confirmLogDeleteId && handleDeleteLog(confirmLogDeleteId)}
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
