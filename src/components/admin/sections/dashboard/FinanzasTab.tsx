import React, { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { 
  Settings, 
  DollarSign, 
  Percent, 
  TrendingUp, 
  Users, 
  BarChart3, 
  PlusCircle, 
  Edit, 
  Trash2, 
  Plus, 
  RefreshCw, 
  Save 
} from "lucide-react";
import type { PropertyRow, ExpenseRow } from "./types";

export default function FinanzasTab() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  
  // Interactive individual property selector state
  const [commissionRate, setCommissionRate] = useState<number>(2.0);
  const [irpfRate, setIrpfRate] = useState<number>(15.0);
  const [overrideFacturado, setOverrideFacturado] = useState<string>("");
  const [overridePrevision, setOverridePrevision] = useState<string>("");
  const [overrideCac, setOverrideCac] = useState<string>("");
  const [showFinanceConfig, setShowFinanceConfig] = useState<boolean>(false);

  // Gastos interactivos form states
  const [newExpenseName, setNewExpenseName] = useState("");
  const [newExpenseCategory, setNewExpenseCategory] = useState("publicidad");
  const [newExpenseAmount, setNewExpenseAmount] = useState("");
  const [isSavingExpense, setIsSavingExpense] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);

  // Guard de ejecución única para el auto-seed de gastos baseline.
  // La causa real de gastos duplicados NO es el check por categoría (que es
  // correcto), sino el doble-montaje: React StrictMode en dev monta el
  // componente dos veces, y dos `fetchFinanceData` concurrentes leen la tabla
  // vacía a la vez, ambos ven que falta el baseline y ambos insertan. Este ref
  // garantiza que el seed se intenta UNA sola vez por instancia. @cleanup R2.
  // (Cierre definitivo contra concurrencia entre pestañas/usuarios = índice
  //  único parcial en operating_expenses(category) WHERE is_automated — Ola 2.)
  const seedAttemptedRef = useRef(false);

  useEffect(() => {
    fetchFinanceData();
  }, []);

  const fetchFinanceData = async () => {
    setLoading(true);
    try {
      const [
        { data: propsData },
        { data: expensesData }
      ] = await Promise.all([
        supabase.from("properties").select("*"),
        supabase.from("operating_expenses").select("*").order("created_at", { ascending: false })
      ]);

      setProperties((propsData || []) as any[]);
      
      // Auto-seeding default baseline operating expenses if they are missing
      let finalExpenses = (expensesData || []) as ExpenseRow[];
      const hasAutonomos = finalExpenses.some(e => e.category === "autonomos");
      const hasIdealista = finalExpenses.some(e => e.category === "idealista" || e.category === "portales");
      const hasTecnologia = finalExpenses.some(e => e.category === "tecnologia" || e.category === "stack");
      
      const seedItems = [];
      if (!hasAutonomos) {
        seedItems.push({
          name: "Cuota de Autónomos (Fija)",
          category: "autonomos",
          amount: 294.00,
          is_automated: true
        });
      }
      if (!hasIdealista) {
        seedItems.push({
          name: "Suscripción Idealista (Baseline)",
          category: "idealista",
          amount: 120.00,
          is_automated: true
        });
      }
      if (!hasTecnologia) {
        seedItems.push({
          name: "Stack de Infraestructura Cloud",
          category: "tecnologia",
          amount: 80.00,
          is_automated: true
        });
      }

      if (seedItems.length > 0 && !seedAttemptedRef.current) {
        seedAttemptedRef.current = true;
        try {
          const { data: insertedData, error: seedError } = await supabase
            .from("operating_expenses")
            .insert(seedItems)
            .select();
          
          if (!seedError && insertedData) {
            finalExpenses = [...finalExpenses, ...(insertedData as any[])].sort(
              (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );
          }
        } catch (seedErr) {
          console.error("Error auto-seeding baseline expenses:", seedErr);
        }
      }
      setExpenses(finalExpenses);
    } catch (error) {
      console.error("Error loading financial metrics:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExpenseName || !newExpenseAmount) return;
    setIsSavingExpense(true);
    try {
      if (editingExpenseId) {
        // Modo Edición
        const { error } = await supabase
          .from("operating_expenses")
          .update({
            name: newExpenseName,
            category: newExpenseCategory,
            amount: parseFloat(newExpenseAmount),
          })
          .eq("id", editingExpenseId);
        
        if (!error) {
          setEditingExpenseId(null);
          setNewExpenseName("");
          setNewExpenseAmount("");
          await fetchFinanceData();
        }
      } else {
        // Modo Creación
        const { error } = await supabase.from("operating_expenses").insert({
          name: newExpenseName,
          category: newExpenseCategory,
          amount: parseFloat(newExpenseAmount),
          is_automated: false
        });
        if (!error) {
          setNewExpenseName("");
          setNewExpenseAmount("");
          await fetchFinanceData();
        }
      }
    } catch (err) {
      console.error("Error saving expense:", err);
    } finally {
      setIsSavingExpense(false);
    }
  };

  const startEditExpense = (expense: ExpenseRow) => {
    setEditingExpenseId(expense.id);
    setNewExpenseName(expense.name);
    setNewExpenseCategory(expense.category);
    setNewExpenseAmount(expense.amount.toString());
  };

  const cancelEditExpense = () => {
    setEditingExpenseId(null);
    setNewExpenseName("");
    setNewExpenseCategory("publicidad");
    setNewExpenseAmount("");
  };

  const handleDeleteExpense = async (id: string) => {
    if (!confirm("¿Seguro que quieres eliminar este gasto?")) return;
    try {
      const { error } = await supabase.from("operating_expenses").delete().eq("id", id);
      if (!error) {
        await fetchFinanceData();
      }
    } catch (err) {
      console.error("Error deleting expense:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#FBBF24]"></div>
        <p className="text-slate-400 text-sm font-medium">Analizando balances contables...</p>
      </div>
    );
  }
  // 1. Calculations
  const soldProperties = properties.filter(p => p.status === "sold");
  const salesVolume = soldProperties.reduce((acc, p) => acc + Number(p.price || 0), 0);
  const calculatedCommissionsGenerated = salesVolume * (commissionRate / 100);
  const commissionsGenerated = overrideFacturado !== "" ? parseFloat(overrideFacturado) : calculatedCommissionsGenerated;

  // Prevision: 2% of the price of all properties with proposal made (we use active properties with scheduled visits or draft status as standby for proposals)
  const proposalProperties = properties.filter(p => p.status === "rented" || p.status === "draft");
  const calculatedPrevisionRevenue = proposalProperties.reduce((acc, p) => acc + Number(p.price || 0), 0) * (commissionRate / 100);
  const previsionRevenue = overridePrevision !== "" ? parseFloat(overridePrevision) : calculatedPrevisionRevenue;

  // 2. Gastos calculations
  const totalPublicidad = expenses.filter(e => e.category === "publicidad").reduce((acc, e) => acc + Number(e.amount), 0);
  const totalPortales = expenses.filter(e => e.category === "idealista" || e.category === "portales").reduce((acc, e) => acc + Number(e.amount), 0);
  const totalStack = expenses.filter(e => e.category === "tecnologia" || e.category === "stack").reduce((acc, e) => acc + Number(e.amount), 0);
  const totalAutonomos = expenses.filter(e => e.category === "autonomos").reduce((acc, e) => acc + Number(e.amount), 0);
  const totalIrpf = commissionsGenerated * (irpfRate / 100); // dynamic estimated IRPF on generated comissions
  const totalOtros = expenses.filter(e => e.category === "otros").reduce((acc, e) => acc + Number(e.amount), 0);

  const totalExpenses = totalPublicidad + totalPortales + totalStack + totalAutonomos + totalIrpf + totalOtros;
  const beneficioNeto = commissionsGenerated - totalExpenses;

  // CAC: Inversion en publicidad / total exclusive properties
  const exclusiveProperties = properties.filter(p => p.features?.exclusiva === true);
  const calculatedCac = exclusiveProperties.length > 0 ? Math.round(totalPublicidad / exclusiveProperties.length) : 0;
  const cac = overrideCac !== "" ? parseFloat(overrideCac) : calculatedCac;

  // 3. Earnings cumulative monthly projection (Combined Chart data)
  const monthsList = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const currentMonthNum = new Date().getMonth();
  const last6Months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(currentMonthNum - 5 + i);
    return {
      monthName: monthsList[d.getMonth()],
      monthNum: d.getMonth(),
      year: d.getFullYear(),
      cobrado: 0,
      prevision: 0
    };
  });

  // Distribute actual sold commissions into corresponding months
  soldProperties.forEach(p => {
    const date = new Date(p.updated_at || p.created_at);
    const m = date.getMonth();
    const y = date.getFullYear();
    const match = last6Months.find(lm => lm.monthNum === m && lm.year === y);
    if (match) {
      match.cobrado += Number(p.price || 0) * (commissionRate / 100);
    }
  });

  // Distribute draft/rented properties (proposals) commissions into corresponding months
  proposalProperties.forEach(p => {
    const date = new Date(p.updated_at || p.created_at);
    const m = date.getMonth();
    const y = date.getFullYear();
    const match = last6Months.find(lm => lm.monthNum === m && lm.year === y);
    if (match) {
      match.prevision += Number(p.price || 0) * (commissionRate / 100);
    }
  });

  // Calculate maximum monthly value to scale the chart correctly
  const maxMonthlyVal = Math.max(...last6Months.map(m => m.cobrado + m.prevision), 2000) || 2000;

  // Combined chart cumulative trend points
  let cumulativeTrendSum = 0;
  const combinedTrendPoints = last6Months.map((m, idx) => {
    cumulativeTrendSum += m.cobrado + m.prevision;
    return {
      x: 45 + idx * 56,
      y: 120 - (cumulativeTrendSum / Math.max(cumulativeTrendSum, 25000)) * 90,
      cumulativeValue: cumulativeTrendSum
    };
  });

  const trendLinePath = combinedTrendPoints.map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  // Donut chart percentages logic
  const expenseCategoriesList = [
    { name: "Inversión Publicidad", value: totalPublicidad, color: "#3B82F6", category: "publicidad" },
    { name: "Idealista & Portales", value: totalPortales, color: "#F43F5E", category: "idealista" },
    { name: "Stack Tecnológico", value: totalStack, color: "#8B5CF6", category: "tecnologia" },
    { name: "Cuota Autónomos", value: totalAutonomos, color: "#10B981", category: "autonomos" },
    { name: "IRPF Previsto (15%)", value: totalIrpf, color: "#FBBF24", category: "irpf" },
    { name: "Otros Gastos", value: totalOtros, color: "#64748B", category: "otros" }
  ];

  const totalCalculatedExpenses = expenseCategoriesList.reduce((sum, c) => sum + c.value, 0) || 1;
  const expenseCategoriesWithPct = expenseCategoriesList.map(c => ({
    ...c,
    pct: Math.round((c.value / totalCalculatedExpenses) * 100)
  })).sort((a, b) => b.value - a.value);

  // Build Donut Circles SVG layout
  let accumulatedDonutPct = 0;
  const donutCircles = expenseCategoriesWithPct.map((c) => {
    const radius = 35;
    const circumference = 2 * Math.PI * radius; // 219.9
    const strokeDashoffset = circumference - (circumference * c.pct) / 100;
    const rotation = (accumulatedDonutPct / 100) * 360;
    accumulatedDonutPct += c.pct;
    return {
      ...c,
      circumference,
      strokeDashoffset,
      rotation
    };
  });

  return (
    <div className="space-y-6">
      {/* Toggle Simulation Panel Button */}
      <div className="flex justify-between items-center bg-[#1E293B]/40 backdrop-blur-sm px-6 py-3.5 rounded-2xl border border-white/5">
        <div>
          <h3 className="text-sm font-bold text-white">Consola de Simulación Financiera</h3>
          <p className="text-[10px] text-slate-400">Modifica honorarios, impuestos y sobreescribe KPIs en tiempo real</p>
        </div>
        <button
          onClick={() => setShowFinanceConfig(!showFinanceConfig)}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
            showFinanceConfig 
              ? "bg-[#FBBF24] text-slate-950 border-[#FBBF24]" 
              : "bg-slate-900/60 text-slate-300 border-white/5 hover:bg-slate-800"
          }`}
        >
          <Settings size={14} className={showFinanceConfig ? "animate-spin-slow" : ""} />
          {showFinanceConfig ? "Cerrar Ajustes" : "Configurar Simulación"}
        </button>
      </div>

      {/* Dynamic Simulation Panel */}
      {showFinanceConfig && (
        <div className="bg-[#1E293B]/80 backdrop-blur-md p-6 rounded-2xl border border-[#FBBF24]/30 animate-fadeIn space-y-6">
          <div className="border-b border-white/5 pb-3">
            <h4 className="text-xs font-bold text-[#FBBF24] uppercase tracking-wider flex items-center gap-2">
              <Settings size={16} />
              Panel de Simulación de Escenarios y Modificaciones de KPI
            </h4>
            <p className="text-[10px] text-slate-400 mt-1">Ajusta los porcentajes globales de comisiones e IRPF, o sobreescribe de forma manual los valores del dashboard.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            {/* Comisiones Slider */}
            <div className="space-y-2 bg-slate-900/40 p-4 rounded-xl border border-white/5">
              <div className="flex justify-between text-xs font-bold text-slate-300">
                <span>Comisión Honorarios</span>
                <span className="text-[#FBBF24]">{commissionRate}%</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="10"
                step="0.1"
                value={commissionRate}
                onChange={(e) => setCommissionRate(parseFloat(e.target.value))}
                className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-[#FBBF24]"
              />
              <p className="text-[9px] text-slate-500">Calculado sobre el valor total de inmuebles en cartera.</p>
            </div>

            {/* IRPF Slider */}
            <div className="space-y-2 bg-slate-900/40 p-4 rounded-xl border border-white/5">
              <div className="flex justify-between text-xs font-bold text-slate-300">
                <span>Retención IRPF</span>
                <span className="text-[#FBBF24]">{irpfRate}%</span>
              </div>
              <input
                type="range"
                min="5"
                max="35"
                step="1"
                value={irpfRate}
                onChange={(e) => setIrpfRate(parseInt(e.target.value))}
                className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-[#FBBF24]"
              />
              <p className="text-[9px] text-slate-500">Estimación de retenciones sobre comisiones facturadas.</p>
            </div>

            {/* Override Facturado */}
            <div className="space-y-2 bg-slate-900/40 p-4 rounded-xl border border-white/5">
              <label className="block text-xs font-bold text-slate-300">Sobreescribir Facturado (€)</label>
              <input
                type="number"
                placeholder="Ej. 45000"
                value={overrideFacturado}
                onChange={(e) => setOverrideFacturado(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-950 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-[#FBBF24]"
              />
              <p className="text-[9px] text-slate-500">Deja en blanco para calcular automáticamente.</p>
            </div>

            {/* Override Previsión */}
            <div className="space-y-2 bg-slate-900/40 p-4 rounded-xl border border-white/5">
              <label className="block text-xs font-bold text-slate-300">Sobreescribir Previsión (€)</label>
              <input
                type="number"
                placeholder="Ej. 18500"
                value={overridePrevision}
                onChange={(e) => setOverridePrevision(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-950 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-[#FBBF24]"
              />
              <p className="text-[9px] text-slate-500">Deja en blanco para calcular automáticamente.</p>
            </div>

            {/* Override CAC */}
            <div className="space-y-2 bg-slate-900/40 p-4 rounded-xl border border-white/5">
              <label className="block text-xs font-bold text-slate-300">Sobreescribir CAC (€)</label>
              <input
                type="number"
                placeholder="Ej. 300"
                value={overrideCac}
                onChange={(e) => setOverrideCac(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-950 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-[#FBBF24]"
              />
              <p className="text-[9px] text-slate-500">Deja en blanco para calcular automáticamente.</p>
            </div>
          </div>
          
          <div className="flex justify-end gap-3 text-xs pt-2">
            <button
              onClick={() => {
                setCommissionRate(2.0);
                setIrpfRate(15);
                setOverrideFacturado("");
                setOverridePrevision("");
                setOverrideCac("");
              }}
              className="text-slate-400 hover:text-white px-3 py-1.5 bg-slate-800 rounded-lg transition-all"
            >
              Reestablecer Valores
            </button>
          </div>
        </div>
      )}

      {/* KPI Panel */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-[#1E293B]/60 backdrop-blur-md p-6 rounded-2xl border border-white/5 hover:scale-[1.02] transition-all duration-300">
          <div className="flex justify-between items-start mb-4">
            <div className="bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20">
              <DollarSign className="text-emerald-400" size={24} />
            </div>
            <span className="text-green-400 text-xs font-bold bg-green-500/10 px-2 py-1 rounded-md">Facturado</span>
          </div>
          <p className="text-slate-400 text-xs font-semibold tracking-wider uppercase">Ingresos Cobrados</p>
          <h3 className="text-3xl font-extrabold text-white mt-2">{commissionsGenerated.toLocaleString()}€</h3>
          <p className="text-xs text-slate-500 mt-2">Honorarios del {commissionRate}% de inmuebles vendidos</p>
        </div>

        <div className="bg-[#1E293B]/60 backdrop-blur-md p-6 rounded-2xl border border-[#FBBF24]/30 hover:scale-[1.02] transition-all duration-300">
          <div className="flex justify-between items-start mb-4">
            <div className="bg-[#FBBF24]/10 p-3 rounded-xl border border-[#FBBF24]/20">
              <Percent className="text-[#FBBF24]" size={24} />
            </div>
            <span className="text-[#FBBF24] text-xs font-bold bg-[#FBBF24]/10 px-2 py-1 rounded-md">Previsión {commissionRate}%</span>
          </div>
          <p className="text-slate-400 text-xs font-semibold tracking-wider uppercase">Previsión Ingresos</p>
          <h3 className="text-3xl font-extrabold text-[#FBBF24] mt-2">{previsionRevenue.toLocaleString()}€</h3>
          <p className="text-xs text-slate-500 mt-2">{commissionRate}% de inmuebles con propuesta hecha</p>
        </div>

        <div className="bg-[#1E293B]/60 backdrop-blur-md p-6 rounded-2xl border border-white/5 hover:scale-[1.02] transition-all duration-300">
          <div className="flex justify-between items-start mb-4">
            <div className="bg-blue-500/10 p-3 rounded-xl border border-blue-500/20">
              <TrendingUp className="text-blue-400" size={24} />
            </div>
            <span className="text-blue-400 text-xs font-bold bg-blue-500/10 px-2 py-1 rounded-md">Beneficio</span>
          </div>
          <p className="text-slate-400 text-xs font-semibold tracking-wider uppercase">Beneficio Neto Mensual</p>
          <h3 className={`text-3xl font-extrabold mt-2 ${beneficioNeto >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {beneficioNeto.toLocaleString()}€
          </h3>
          <p className="text-xs text-slate-500 mt-2">Ingresos cobrados menos gastos operativos</p>
        </div>

        <div className="bg-[#1E293B]/60 backdrop-blur-md p-6 rounded-2xl border border-white/5 hover:scale-[1.02] transition-all duration-300">
          <div className="flex justify-between items-start mb-4">
            <div className="bg-purple-500/10 p-3 rounded-xl border border-purple-500/20">
              <Users className="text-purple-400" size={24} />
            </div>
            <span className="text-purple-400 text-xs font-bold bg-purple-500/10 px-2 py-1 rounded-md">Eficiencia Ads</span>
          </div>
          <p className="text-slate-400 text-xs font-semibold tracking-wider uppercase">Coste Adquisición Cliente</p>
          <h3 className="text-3xl font-extrabold text-white mt-2">{cac.toLocaleString()}€</h3>
          <p className="text-xs text-slate-500 mt-2">Gasto en anuncios por encargo exclusivo</p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Combined Projection Chart */}
        <div className="lg:col-span-2 bg-[#1E293B]/60 backdrop-blur-md p-6 rounded-2xl border border-white/5 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-1">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <BarChart3 size={18} className="text-[#FBBF24]" />
                Proyección de Ingresos Acumulados (6 Meses)
              </h3>
              <div className="flex gap-3 text-[10px] font-semibold text-slate-400">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-500" /> Cobrado</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-[#FBBF24]" /> Previsión</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-orange-500" /> Acumulado</span>
              </div>
            </div>
            <p className="text-slate-400 text-xs mb-6">Comparativa de ingresos reales vs previsiones con línea de tendencia acumulativa</p>
          </div>

          <div className="w-full h-[220px] bg-slate-900/40 border border-white/5 rounded-2xl p-4 relative flex items-center justify-center">
            <svg viewBox="0 0 360 140" className="w-full h-full">
              <defs>
                <linearGradient id="greenBarGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10B981" />
                  <stop offset="100%" stopColor="#059669" />
                </linearGradient>
                <linearGradient id="yellowBarGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FBBF24" />
                  <stop offset="100%" stopColor="#D97706" />
                </linearGradient>
                <linearGradient id="trendLineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#F97316" />
                  <stop offset="100%" stopColor="#EA580C" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              <line x1="25" y1="30" x2="345" y2="30" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
              <line x1="25" y1="75" x2="345" y2="75" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
              <line x1="25" y1="120" x2="345" y2="120" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />

              {/* Draw side axis labels */}
              <text x="18" y="32" fill="#64748B" fontSize="6" textAnchor="end">25k€</text>
              <text x="18" y="77" fill="#64748B" fontSize="6" textAnchor="end">12k€</text>
              <text x="18" y="122" fill="#64748B" fontSize="6" textAnchor="end">0€</text>

              {/* Render bar pairs for each month */}
              {last6Months.map((m, idx) => {
                const xCenter = 45 + idx * 56;
                const maxBarHeight = 70;
                const cobradoHeight = (m.cobrado / maxMonthlyVal) * maxBarHeight;
                const previsionHeight = (m.prevision / maxMonthlyVal) * maxBarHeight;

                const yCobrado = 120 - cobradoHeight;
                const yPrevision = 120 - cobradoHeight - previsionHeight;

                return (
                  <g key={idx} className="group cursor-pointer">
                    {/* Cobrado Bar */}
                    {m.cobrado > 0 && (
                      <rect
                        x={xCenter - 8}
                        y={yCobrado}
                        width="6"
                        height={cobradoHeight}
                        rx="1.5"
                        fill="url(#greenBarGrad)"
                        className="transition-all duration-300 group-hover:brightness-110"
                      />
                    )}
                    {/* Prevision Bar */}
                    {m.prevision > 0 && (
                      <rect
                        x={xCenter - 1}
                        y={yPrevision}
                        width="6"
                        height={previsionHeight}
                        rx="1.5"
                        fill="url(#yellowBarGrad)"
                        className="transition-all duration-300 group-hover:brightness-110"
                      />
                    )}
                    {/* Month Text Label */}
                    <text x={xCenter - 1} y="132" fill="#94A3B8" fontSize="7" fontWeight="semibold" textAnchor="middle">
                      {m.monthName}
                    </text>
                  </g>
                );
              })}

              {/* Cumulative trend line */}
              {combinedTrendPoints.length > 1 && (
                <>
                  <path
                    d={trendLinePath}
                    fill="none"
                    stroke="url(#trendLineGrad)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeDasharray="1 1"
                    className="animate-[dash_3s_linear_infinite]"
                  />
                  {combinedTrendPoints.map((pt, idx) => (
                    <g key={idx} className="group">
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r="3"
                        fill="#1E293B"
                        stroke="#EA580C"
                        strokeWidth="2"
                        className="cursor-pointer transition-all duration-300 hover:scale-150"
                      />
                      {/* Tooltip on hover */}
                      <text
                        x={pt.x}
                        y={pt.y - 8}
                        fill="#F97316"
                        fontSize="6.5"
                        fontWeight="bold"
                        textAnchor="middle"
                        className="opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                      >
                        {Math.round(pt.cumulativeValue).toLocaleString()}€
                      </text>
                    </g>
                  ))}
                </>
              )}
            </svg>
          </div>
        </div>

        {/* Gastos Operativos breakdown */}
        <div className="bg-[#1E293B]/60 backdrop-blur-md p-6 rounded-2xl border border-white/5 flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
              <Percent size={18} className="text-rose-400" />
              Desglose de Gastos
            </h3>
            <p className="text-slate-400 text-xs mb-4">Análisis por categorías del mes en curso</p>
          </div>

          <div className="flex flex-col items-center justify-center relative py-2">
            <svg viewBox="0 0 100 100" className="w-[110px] h-[110px] drop-shadow-lg">
              {/* Background Ring */}
              <circle cx="50" cy="50" r="35" fill="transparent" stroke="rgba(255,255,255,0.02)" strokeWidth="6.5" />
              {/* Donut slices */}
              {donutCircles.map((circle, idx) => (
                <circle
                  key={idx}
                  cx="50"
                  cy="50"
                  r="35"
                  fill="transparent"
                  stroke={circle.color}
                  strokeWidth="6.5"
                  strokeDasharray={circle.circumference}
                  strokeDashoffset={circle.strokeDashoffset}
                  transform={`rotate(${circle.rotation - 90} 50 50)`}
                  className="transition-all duration-500 cursor-pointer hover:stroke-[8px]"
                />
              ))}
              {/* Center text */}
              <text x="50" y="47" fill="#94A3B8" fontSize="6.5" fontWeight="bold" textAnchor="middle">Total Gastos</text>
              <text x="50" y="58" fill="#FFFFFF" fontSize="9" fontWeight="black" textAnchor="middle">
                {Math.round(totalExpenses).toLocaleString()}€
              </text>
            </svg>

            {/* Legend with bullet points */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 w-full mt-5 text-[10px] text-slate-300 font-semibold border-t border-white/5 pt-3">
              {expenseCategoriesWithPct.map((c, index) => (
                <div key={index} className="flex items-center gap-1.5 justify-start">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
                  <span className="truncate max-w-[90px] text-slate-400">{c.name}</span>
                  <span className="text-white ml-auto font-extrabold">{c.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Expense Console Manager */}
      <div className="bg-[#1E293B]/60 backdrop-blur-md p-6 rounded-2xl border border-white/5">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 border-b border-white/5 pb-4">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <PlusCircle size={18} className="text-[#FBBF24]" />
              Consola de Control de Gastos Operativos
            </h3>
            <p className="text-slate-400 text-xs mt-0.5">Añade facturas publicitarias manuales o modifica las partidas de coste</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left side list */}
          <div className="lg:col-span-7 space-y-3">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 flex justify-between">
              <span>Partidas Registradas</span>
              <span className="text-slate-500 lowercase font-normal">Sincronizado con Supabase</span>
            </h4>
            <div className="max-h-[260px] overflow-y-auto pr-2 space-y-2 scrollbar-thin scrollbar-thumb-slate-800">
              {/* Dynamic/Calculated IRPF row */}
              <div className="p-3 bg-slate-900/30 rounded-xl border border-white/5 flex justify-between items-center text-xs">
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-[#FBBF24]" />
                  <div>
                    <p className="font-bold text-white">IRPF Retención Estimado ({irpfRate}%)</p>
                    <p className="text-[10px] text-slate-500">Categoría: irpf • Calculado sobre comisiones</p>
                  </div>
                </div>
                <span className="font-extrabold text-[#FBBF24]">{Math.round(totalIrpf).toLocaleString()}€</span>
              </div>

              {/* Custom & Baseline Items from Supabase database */}
              {expenses.length > 0 ? (
                expenses.map((expense) => {
                  const badgeColors: Record<string, string> = {
                    publicidad: "#3B82F6",
                    idealista: "#F43F5E",
                    portales: "#F43F5E",
                    tecnologia: "#8B5CF6",
                    stack: "#8B5CF6",
                    autonomos: "#10B981",
                    irpf: "#FBBF24",
                    otros: "#64748B"
                  };
                  return (
                    <div key={expense.id} className="p-3 bg-slate-900/50 rounded-xl border border-white/5 hover:border-white/10 transition-all flex justify-between items-center text-xs group">
                      <div className="flex items-center gap-2.5">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: badgeColors[expense.category] || "#64748B" }} />
                        <div>
                          <p className="font-bold text-white">{expense.name}</p>
                          <p className="text-[10px] text-slate-500">
                            Categoría: {
                              expense.category === "publicidad" ? "Publicidad Ads" :
                              expense.category === "idealista" ? "Idealista & Portales" :
                              expense.category === "portales" ? "Idealista & Portales" :
                              expense.category === "tecnologia" ? "Stack Tecnológico" :
                              expense.category === "stack" ? "Stack Tecnológico" :
                              expense.category === "autonomos" ? "Autónomos" :
                              expense.category === "irpf" ? "IRPF" :
                              "Otros"
                            } • {expense.is_automated ? "Gasto automático" : "Gasto manual"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-white">{expense.amount}€</span>
                        <button
                          onClick={() => startEditExpense(expense)}
                          className="p-1.5 text-slate-400 hover:text-[#FBBF24] hover:bg-[#FBBF24]/10 rounded-lg transition-all"
                          title="Editar gasto"
                        >
                          <Edit size={13} />
                        </button>
                        <button
                          onClick={() => handleDeleteExpense(expense.id)}
                          className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
                          title="Eliminar gasto"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-6 text-center text-slate-500 text-xs">No hay gastos manuales cargados en la base de datos. ¡Añade uno a la derecha!</div>
              )}
            </div>
          </div>

          {/* Right side form */}
          <div className={`lg:col-span-5 p-5 rounded-2xl border h-fit transition-all duration-300 ${editingExpenseId ? 'bg-[#FBBF24]/5 border-[#FBBF24]/30' : 'bg-slate-900/30 border-white/5'}`}>
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                {editingExpenseId ? 'Editar Partida' : 'Añadir Nueva Partida'}
              </h4>
              {editingExpenseId && (
                <button
                  onClick={cancelEditExpense}
                  className="text-[10px] text-slate-400 hover:text-white bg-slate-800 px-2 py-0.5 rounded transition-all"
                >
                  Cancelar
                </button>
              )}
            </div>
            <form onSubmit={handleAddExpense} className="space-y-4">
              <div>
                <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">Nombre del Gasto / Proveedor</label>
                <input
                  type="text"
                  required
                  value={newExpenseName}
                  onChange={(e) => setNewExpenseName(e.target.value)}
                  placeholder="Ej. Meta Ads Campaña Mayo"
                  className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-[#FBBF24] transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">Categoría</label>
                  <select
                    value={newExpenseCategory}
                    onChange={(e) => setNewExpenseCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-[#FBBF24] transition-all"
                  >
                    <option value="publicidad">Publicidad Ads</option>
                    <option value="idealista">Portales Inmobiliarios (Idealista)</option>
                    <option value="tecnologia">Stack Tecnológico</option>
                    <option value="autonomos">Autónomos</option>
                    <option value="otros">Otros Gastos</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">Importe (€)</label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={newExpenseAmount}
                    onChange={(e) => setNewExpenseAmount(e.target.value)}
                    placeholder="Ej. 150"
                    className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-[#FBBF24] transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSavingExpense}
                className="w-full py-2.5 bg-[#FBBF24] hover:bg-[#FBBF24]/90 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 mt-2"
              >
                {isSavingExpense ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" /> Guardando...
                  </>
                ) : (
                  <>
                    {editingExpenseId ? <Save size={14} /> : <Plus size={14} />} 
                    {editingExpenseId ? ' Guardar Cambios' : ' Registrar Gasto en DB'}
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
