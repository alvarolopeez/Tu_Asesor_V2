import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { 
  FileText, 
  DollarSign, 
  Bot, 
  AlertTriangle, 
  Zap, 
  RefreshCw, 
  Layers, 
  Printer, 
  Globe
} from "lucide-react";
import MarketingTab from "./dashboard/MarketingTab";
import OperacionesTab from "./dashboard/OperacionesTab";
import FinanzasTab from "./dashboard/FinanzasTab";
import EcosistemaTab from "./dashboard/EcosistemaTab";
import type {
  PropertyRow,
  LeadRow,
  AppointmentRow,
  ConversationRow,
  MessageRow,
  WebhookLogRow,
  WebVisitRow,
  ExpenseRow,
  SystemErrorRow,
  BuyerActivityLogRow,
  BuyerDemandRow,
} from "./dashboard/types";

type ActiveTab = "marketing" | "operaciones" | "finanzas" | "ecosistema";

export default function DashboardOverview() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("marketing");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Rich client-side datasets derived from Supabase
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [webhookLogs, setWebhookLogs] = useState<WebhookLogRow[]>([]);
  const [webVisits, setWebVisits] = useState<WebVisitRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [systemErrors, setSystemErrors] = useState<SystemErrorRow[]>([]);
  const [buyerActivityLogs, setBuyerActivityLogs] = useState<BuyerActivityLogRow[]>([]);
  const [buyersDemands, setBuyersDemands] = useState<BuyerDemandRow[]>([]);
  const [selectedErrorId, setSelectedErrorId] = useState<string | null>(null);
  const [dbLatency, setDbLatency] = useState<number | null>(14);
  const [apiLatency, setApiLatency] = useState<number | null>(null);
  const [measuringLatency, setMeasuringLatency] = useState<boolean>(false);

  // Interactive individual property selector state
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [sevillaSearchQuery, setSevillaSearchQuery] = useState("");
  const [showPrintModal, setShowPrintModal] = useState(false);

  // Gastos interactivos form states
  const [newExpenseName, setNewExpenseName] = useState("");
  const [newExpenseCategory, setNewExpenseCategory] = useState("publicidad");
  const [newExpenseAmount, setNewExpenseAmount] = useState("");
  const [isSavingExpense, setIsSavingExpense] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);

  // Finanzas interactiva overrides & inputs
  const [commissionRate, setCommissionRate] = useState<number>(2.0);
  const [irpfRate, setIrpfRate] = useState<number>(15.0);
  const [overrideFacturado, setOverrideFacturado] = useState<string>("");
  const [overridePrevision, setOverridePrevision] = useState<string>("");
  const [overrideCac, setOverrideCac] = useState<string>("");
  const [showFinanceConfig, setShowFinanceConfig] = useState<boolean>(false);

  useEffect(() => {
    fetchDashboardData();
    measureLatency();
  }, []);

  // Latency measurement handler
  const measureLatency = async () => {
    setMeasuringLatency(true);
    try {
      // 1. Supabase real query ping
      const t0 = performance.now();
      await supabase.from("properties").select("id").limit(1);
      const t1 = performance.now();
      setDbLatency(Math.round(t1 - t0));

      // 2. Next.js API route ping
      const t2 = performance.now();
      await fetch("/api/health").catch(() => null);
      const t3 = performance.now();
      setApiLatency(Math.round(t3 - t2));
    } catch (err) {
      console.error("Error measuring system latency:", err);
    } finally {
      setMeasuringLatency(false);
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
          await fetchDashboardData();
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
          await fetchDashboardData();
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
    try {
      const { error } = await supabase.from("operating_expenses").delete().eq("id", id);
      if (!error) {
        await fetchDashboardData();
      }
    } catch (err) {
      console.error("Error deleting expense:", err);
    }
  };

  const handleSimulateError = async () => {
    const errorTypes = ["database", "webhook", "api"];
    const randomType = errorTypes[Math.floor(Math.random() * errorTypes.length)];
    
    let message = "";
    let severity = "error";
    let details = {};

    if (randomType === "database") {
      message = "PostgreSQL deadlock detected on simultaneous transactions on public.appointments";
      severity = "error";
      details = { query: "UPDATE public.appointments SET status = 'confirmed'", duration: "5124ms", pid: 820 };
    } else if (randomType === "webhook") {
      message = "WhatsApp Webhook failed: Signature verification mismatch on incoming event payload";
      severity = "critical";
      details = { x_hub_signature: "sha256=invalid", length_bytes: 4096 };
    } else {
      message = "Idealista API Rate Limit Exceeded: 429 Too Many Requests";
      severity = "warning";
      details = { window_remaining_sec: 120, rate_limit: "500/hr" };
    }

    try {
      const { error } = await supabase.from("system_errors").insert({
        error_type: randomType,
        message,
        severity,
        details
      });
      if (!error) {
        await fetchDashboardData();
      }
    } catch (err) {
      console.error("Error simulating system error:", err);
    }
  };

  const handleClearErrors = async () => {
    try {
      const { error } = await supabase.from("system_errors").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (!error) {
        await fetchDashboardData();
      }
    } catch (err) {
      console.error("Error clearing system errors:", err);
    }
  };

  const fetchDashboardData = async () => {
    setRefreshing(true);
    try {
      const [
        { data: propsData },
        { data: leadsData },
        { data: apptsData },
        { data: convsData },
        { data: msgsData },
        { data: logsData },
        { data: visitsData },
        { data: expensesData },
        { data: errorsData },
        { data: activityLogsData },
        { data: buyersDemandsData }
      ] = await Promise.all([
        supabase.from("properties").select("*"),
        supabase.from("leads").select("*"),
        supabase.from("appointments").select("*"),
        supabase.from("chatbot_conversations").select("*"),
        supabase.from("chatbot_messages").select("*"),
        supabase.from("n8n_webhook_logs").select("*"),
        supabase.from("web_visits").select("*"),
        supabase.from("operating_expenses").select("*").order("created_at", { ascending: false }),
        supabase.from("system_errors").select("*").order("created_at", { ascending: false }),
        supabase.from("buyer_activity_logs").select("*").order("event_date", { ascending: false }),
        supabase.from("buyers_demands").select("id, name, phone, email, max_budget, status")
      ]);

      setProperties(propsData || []);
      setLeads(leadsData || []);
      setAppointments(apptsData || []);
      setConversations(convsData || []);
      setMessages(msgsData || []);
      setWebhookLogs(logsData || []);
      setWebVisits(visitsData || []);
      setSystemErrors(errorsData || []);
      setBuyerActivityLogs(activityLogsData || []);
      setBuyersDemands(buyersDemandsData || []);

      // Auto-seeding default baseline operating expenses if they are missing
      let finalExpenses = expensesData || [];
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

      if (seedItems.length > 0) {
        try {
          const { data: insertedData, error: seedError } = await supabase
            .from("operating_expenses")
            .insert(seedItems)
            .select();
          
          if (!seedError && insertedData) {
            finalExpenses = [...finalExpenses, ...insertedData].sort(
              (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );
          }
        } catch (seedErr) {
          console.error("Error auto-seeding baseline expenses:", seedErr);
        }
      }
      setExpenses(finalExpenses);

      // Default the selector to the first property if available
      if (propsData && propsData.length > 0 && !selectedPropertyId) {
        setSelectedPropertyId(propsData[0].id);
      }
    } catch (error) {
      console.error("Error loading dashboard metrics:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Helper properties average calculations
  const platformAvgViews = properties.length > 0 
    ? Math.round(properties.reduce((acc, p) => acc + Number(p.features?.visitas_count || 0), 0) / properties.length)
    : 0;

  const platformAvgDays = properties.length > 0
    ? Math.round(properties.reduce((acc, p) => acc + Number(p.features?.dias_mercado || 0), 0) / properties.length)
    : 0;

  // Selected Property Metrics
  const selectedProperty = properties.find(p => p.id === selectedPropertyId);
  const selectedViews = selectedProperty ? Number(selectedProperty.features?.visitas_count || 0) : 0;
  const selectedDays = selectedProperty ? Number(selectedProperty.features?.dias_mercado || 0) : 0;
  const selectedPrice = selectedProperty ? Number(selectedProperty.price || 0) : 0;
  const selectedValuation = selectedProperty ? Number(selectedProperty.features?.precio_valoracion || 0) : 0;

  // Valuation difference
  const valuationDiffPct = selectedValuation > 0
    ? ((selectedPrice - selectedValuation) / selectedValuation) * 100
    : 0;

  let correlationRating = "Normal";
  let correlationColor = "text-yellow-400";
  if (valuationDiffPct <= -10) {
    correlationRating = "Precio Excelente";
    correlationColor = "text-green-400";
  } else if (valuationDiffPct <= -5) {
    correlationRating = "Precio Competitivo";
    correlationColor = "text-emerald-400";
  } else if (valuationDiffPct > 10) {
    correlationRating = "Precio Fuera de Mercado";
    correlationColor = "text-red-400 font-extrabold";
  } else if (valuationDiffPct > 0) {
    correlationRating = "Precio Elevado";
    correlationColor = "text-orange-400";
  }

  // --- RENDERING TABS ---

  return (
    <div className="space-y-6 text-slate-100 pb-16">
      {/* Dynamic Glassmorphic Tab Navigation Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#1E293B]/80 backdrop-blur-md p-4 rounded-2xl border border-white/5 shadow-xl">
        <div className="flex flex-wrap gap-2">
          {(["marketing", "operaciones", "finanzas", "ecosistema"] as ActiveTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition-all duration-300 flex items-center gap-2 ${
                activeTab === tab
                  ? "bg-[#FBBF24] text-slate-950 shadow-lg shadow-[#FBBF24]/20 scale-105"
                  : "bg-slate-800/40 hover:bg-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              {tab === "marketing" && <Zap size={16} />}
              {tab === "operaciones" && <Layers size={16} />}
              {tab === "finanzas" && <DollarSign size={16} />}
              {tab === "ecosistema" && <Globe size={16} />}
              <span className="capitalize">{tab}</span>
            </button>
          ))}
        </div>

        <button
          onClick={fetchDashboardData}
          disabled={refreshing}
          className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-xs font-semibold flex items-center gap-2 text-slate-300 disabled:opacity-50"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          Sincronizar Supabase
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#FBBF24]"></div>
          <p className="text-slate-400 text-sm font-medium">Cargando base de datos en tiempo real...</p>
        </div>
      ) : (
        <div className="transition-all duration-500">
          {activeTab === "marketing" && (
            <MarketingTab
              properties={properties}
              leads={leads}
              appointments={appointments}
              conversations={conversations}
              webVisits={webVisits}
            />
          )}
          {activeTab === "operaciones" && (
            <OperacionesTab
              properties={properties}
              leads={leads}
              appointments={appointments}
              selectedPropertyId={selectedPropertyId}
              setSelectedPropertyId={setSelectedPropertyId}
              showPrintModal={showPrintModal}
              setShowPrintModal={setShowPrintModal}
              sevillaSearchQuery={sevillaSearchQuery}
              setSevillaSearchQuery={setSevillaSearchQuery}
            />
          )}
          {activeTab === "finanzas" && (
            <FinanzasTab
              properties={properties}
              expenses={expenses}
              commissionRate={commissionRate}
              irpfRate={irpfRate}
              overrideFacturado={overrideFacturado}
              overridePrevision={overridePrevision}
              overrideCac={overrideCac}
              showFinanceConfig={showFinanceConfig}
              newExpenseName={newExpenseName}
              newExpenseCategory={newExpenseCategory}
              newExpenseAmount={newExpenseAmount}
              isSavingExpense={isSavingExpense}
              editingExpenseId={editingExpenseId}
              setCommissionRate={setCommissionRate}
              setIrpfRate={setIrpfRate}
              setOverrideFacturado={setOverrideFacturado}
              setOverridePrevision={setOverridePrevision}
              setOverrideCac={setOverrideCac}
              setShowFinanceConfig={setShowFinanceConfig}
              setNewExpenseName={setNewExpenseName}
              setNewExpenseCategory={setNewExpenseCategory}
              setNewExpenseAmount={setNewExpenseAmount}
              handleAddExpense={handleAddExpense}
              startEditExpense={startEditExpense}
              cancelEditExpense={cancelEditExpense}
              handleDeleteExpense={handleDeleteExpense}
            />
          )}
          {activeTab === "ecosistema" && (
            <EcosistemaTab
              properties={properties}
              leads={leads}
              appointments={appointments}
              conversations={conversations}
              messages={messages}
              systemErrors={systemErrors}
              webhookLogs={webhookLogs}
              dbLatency={dbLatency}
              apiLatency={apiLatency}
              measuringLatency={measuringLatency}
              selectedErrorId={selectedErrorId}
              setSelectedErrorId={setSelectedErrorId}
              measureLatency={measureLatency}
              handleSimulateError={handleSimulateError}
              handleClearErrors={handleClearErrors}
            />
          )}
        </div>
      )}

      {/* PDF Export Overlay modal template */}
      {showPrintModal && renderPrintPreview()}
    </div>
  );

  

  // ==========================================
  // PRINT PREVIEW REPORT GENERATOR (INFORME PDF)
  // ==========================================
  function renderPrintPreview() {
    if (!selectedProperty) return null;

    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
        {/* Printable styled report container */}
        <div className="bg-[#1E293B] border border-white/10 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col justify-between max-h-[90vh]">
          {/* Header */}
          <div className="bg-slate-900 px-6 py-4 border-b border-white/10 flex justify-between items-center">
            <h4 className="text-white font-extrabold flex items-center gap-2">
              <FileText size={18} className="text-[#FBBF24]" />
              Vista Previa de Informe de Captación
            </h4>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  window.print();
                }}
                className="px-4 py-2 bg-[#FBBF24] hover:bg-[#FBBF24]/90 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all"
              >
                <Printer size={14} /> Imprimir Dossier
              </button>
              <button
                onClick={() => setShowPrintModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition-all"
              >
                Cerrar
              </button>
            </div>
          </div>

          {/* Dossier Sheet */}
          <div className="p-8 space-y-6 overflow-y-auto text-slate-900 bg-white" id="printable-area">
            {/* Dossier Letterhead */}
            <div className="flex justify-between items-start border-b-2 border-[#FBBF24] pb-6">
              <div>
                <h1 className="text-2xl font-black tracking-tight text-slate-950">TU ASESOR INMOBILIARIO</h1>
                <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold mt-0.5">Dossier de Valoración Exclusivo</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">Fecha de Emisión</p>
                <p className="text-sm font-bold text-slate-950">{new Date().toLocaleDateString()}</p>
              </div>
            </div>

            {/* Property Overview */}
            <div className="space-y-2">
              <span className="text-[10px] font-black text-[#FBBF24] uppercase tracking-widest bg-[#FBBF24]/10 px-2 py-0.5 rounded">Informe de Propiedad</span>
              <h2 className="text-xl font-bold text-slate-950">{selectedProperty.title}</h2>
              <p className="text-sm text-slate-600 leading-relaxed">{selectedProperty.description || "Sin descripción adicional de la propiedad."}</p>
            </div>

            {/* Core comparative table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 text-xs">
                  <tr>
                    <th className="px-4 py-3">Métrica Analizada</th>
                    <th className="px-4 py-3 text-right">Inmueble</th>
                    <th className="px-4 py-3 text-right">Media de Zona/Plataforma</th>
                    <th className="px-4 py-3 text-right">Diferencial</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  <tr>
                    <td className="px-4 py-3 text-slate-600">Precio Publicado</td>
                    <td className="px-4 py-3 text-right text-slate-900 font-bold">{selectedPrice.toLocaleString()}€</td>
                    <td className="px-4 py-3 text-right text-slate-500">{(selectedValuation || selectedPrice).toLocaleString()}€</td>
                    <td className="px-4 py-3 text-right text-slate-900">
                      {valuationDiffPct > 0 ? "+" : ""}{valuationDiffPct.toFixed(1)}%
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-slate-600">Visitas Totales</td>
                    <td className="px-4 py-3 text-right text-slate-900 font-bold">{selectedViews} visitas</td>
                    <td className="px-4 py-3 text-right text-slate-500">{platformAvgViews} visitas</td>
                    <td className={`px-4 py-3 text-right font-bold ${selectedViews >= platformAvgViews ? "text-green-600" : "text-orange-600"}`}>
                      {selectedViews >= platformAvgViews ? "+" : ""}{((selectedViews / Math.max(1, platformAvgViews) - 1) * 100).toFixed(0)}%
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-slate-600">Días en Mercado</td>
                    <td className="px-4 py-3 text-right text-slate-900 font-bold">{selectedDays} días</td>
                    <td className="px-4 py-3 text-right text-slate-500">{platformAvgDays} días</td>
                    <td className={`px-4 py-3 text-right font-bold ${selectedDays <= platformAvgDays ? "text-green-600" : "text-orange-600"}`}>
                      {selectedDays - platformAvgDays > 0 ? "+" : ""}{selectedDays - platformAvgDays}d
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Buyer Feedback & System Activity */}
            <div className="space-y-3">
              <h3 className="text-xs font-black text-slate-950 uppercase tracking-widest border-b border-slate-200 pb-1 flex items-center gap-1.5">
                Feedback Real y Actividad de Compradores
              </h3>
              
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <p className="text-slate-500 font-semibold">Visitas Físicas Realizadas</p>
                  <p className="text-base font-bold text-slate-950">
                    {appointments.filter(appt => appt.property_id === selectedProperty.id && appt.type === 'visita').length} visitas
                  </p>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <p className="text-slate-500 font-semibold">Comentarios / Interacciones</p>
                  <p className="text-base font-bold text-slate-950">
                    {buyerActivityLogs.filter(act => act.property_id === selectedProperty.id).length} interacciones
                  </p>
                </div>
              </div>

              {buyerActivityLogs.filter(act => act.property_id === selectedProperty.id).length > 0 ? (
                <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2">Fecha</th>
                        <th className="px-3 py-2">Comprador</th>
                        <th className="px-3 py-2">Tipo</th>
                        <th className="px-3 py-2">Notas y Comentarios de la Visita</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {buyerActivityLogs
                        .filter(act => act.property_id === selectedProperty.id)
                        .map(act => {
                          const buyer = buyersDemands.find(b => b.id === act.buyer_id);
                          const buyerName = buyer ? buyer.name : "Comprador Interesado";
                          return (
                            <tr key={act.id}>
                              <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                                {new Date(act.event_date).toLocaleDateString()}
                              </td>
                              <td className="px-3 py-2 text-slate-900 font-bold">
                                {buyerName}
                              </td>
                              <td className="px-3 py-2">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  act.event_type === 'oferta' ? 'bg-emerald-100 text-emerald-800' :
                                  act.event_type === 'visita' ? 'bg-blue-100 text-blue-800' :
                                  'bg-slate-100 text-slate-800'
                                }`}>
                                  {act.event_type.toUpperCase()}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-slate-600 leading-normal">
                                {act.notes || act.title}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic bg-slate-50 p-3 rounded-lg border border-slate-100 text-center">
                  No se han registrado comentarios ni feedback directo de compradores para esta propiedad aún.
                </p>
              )}
            </div>

            {/* AI Advisor opinion text */}
            <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
              <h4 className="text-xs font-black text-slate-950 uppercase tracking-widest mb-2 flex items-center gap-1">
                <Bot size={14} className="text-[#FBBF24]" />
                Opinión Consultora del Sistema IA
              </h4>
              <p className="text-xs text-slate-700 leading-relaxed">
                El inmueble se encuentra catalogado como <strong className="text-slate-950">{correlationRating}</strong> con una desviación de <strong>{valuationDiffPct.toFixed(1)}%</strong> respecto a la valoración media histórica de escrituración de la zona. {valuationDiffPct > 5 ? "Se recomienda encarecidamente una corrección de precio de venta a la baja para alinear la propiedad con los rangos de captación firmables ante notario en menos de 45 días." : "La propiedad mantiene una excelente sintonía de demanda en relación al ticket medio de venta."}
              </p>
            </div>

            {/* Signatures */}
            <div className="pt-12 grid grid-cols-2 gap-8 text-center text-xs">
              <div className="border-t border-slate-200 pt-4 font-semibold text-slate-500">
                Firma de la Consultora
              </div>
              <div className="border-t border-slate-200 pt-4 font-semibold text-slate-500">
                Conformidad del Propietario
              </div>
            </div>
          </div>
        </div>

        {/* Global style tag specifically for print media formatting */}
        <style dangerouslySetInnerHTML={{__html: `
          @media print {
            body * {
              visibility: hidden;
            }
            #printable-area, #printable-area * {
              visibility: visible;
            }
            #printable-area {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              height: auto;
              margin: 0;
              padding: 0;
              box-shadow: none;
            }
          }
        `}} />
      </div>
    );
  }
}

