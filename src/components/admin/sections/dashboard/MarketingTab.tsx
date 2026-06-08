import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Eye,
  FileCheck2,
  Bot,
  Calendar,
  Layers,
  BarChart3,
} from "lucide-react";
import type { PropertyRow, LeadRow, AppointmentRow, ConversationRow, WebVisitRow } from "./types";

export default function MarketingTab() {
  const [loading, setLoading] = useState(true);
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [webVisits, setWebVisits] = useState<WebVisitRow[]>([]);

  useEffect(() => {
    fetchMarketingData();
  }, []);

  const fetchMarketingData = async () => {
    setLoading(true);
    try {
      const [
        { data: propsData },
        { data: leadsData },
        { data: apptsData },
        { data: convsData },
        { data: visitsData }
      ] = await Promise.all([
        supabase.from("properties").select("id, status, price, created_at, updated_at, features"),
        supabase.from("leads").select("id, status, source, type, preferences"),
        supabase.from("appointments").select("id, status, property_id, type"),
        supabase.from("chatbot_conversations").select("id, started_at, metadata"),
        supabase.from("web_visits").select("id, session_id")
      ]);

      setProperties((propsData || []) as any[]);
      setLeads((leadsData || []) as any[]);
      setAppointments((apptsData || []) as any[]);
      setConversations((convsData || []) as any[]);
      setWebVisits((visitsData || []) as any[]);
    } catch (error) {
      console.error("Error loading marketing tab metrics:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#FBBF24]"></div>
        <p className="text-slate-400 text-sm font-medium">Analizando tráfico y conversiones de marketing...</p>
      </div>
    );
  }
  // 1. Funnel data values
  const uniqueWebVisitors = new Set(webVisits.map((v) => v.session_id)).size;
  // Dato REAL de visitantes únicos (sesiones). Antes se inflaba con
  // Math.max(leads.length + 5, ...) — un +5 artificial sin base. @cleanup R1.
  const webVisitors = uniqueWebVisitors;
  const formsFilled = leads.length;
  const qualifiedLeads = leads.filter((l) =>
    ["qualified", "visit_scheduled", "closed"].includes(l.status ?? "")
  ).length;
  const scheduledVisits = appointments.length;
  const confirmedVisits = appointments.filter(
    (a) => a.status === "confirmed"
  ).length;

  // Funnel rates. Guard div/0: al usar visitantes reales, webVisitors puede
  // ser 0 si aún no hay tracking de sesiones → evitamos Infinity/NaN. @cleanup R1.
  const formsRate = webVisitors > 0 ? ((formsFilled / webVisitors) * 100).toFixed(1) : "0.0";
  const qualifiedRate =
    formsFilled > 0
      ? ((qualifiedLeads / formsFilled) * 100).toFixed(1)
      : "0.0";
  const visitsRate =
    qualifiedLeads > 0
      ? ((scheduledVisits / qualifiedLeads) * 100).toFixed(1)
      : "0.0";
  const confirmRate =
    scheduledVisits > 0
      ? ((confirmedVisits / scheduledVisits) * 100).toFixed(1)
      : "0.0";

  // 2. Traffic Source Pie Chart preparation
  const sourcesMap: Record<string, number> = {};
  leads.forEach((l) => {
    const src = l.source || "web_form";
    sourcesMap[src] = (sourcesMap[src] || 0) + 1;
  });

  const totalLeads = leads.length || 1;
  const trafficSources = Object.entries(sourcesMap)
    .map(([name, count]) => ({
      name:
        name === "web_form"
          ? "Formulario Web"
          : name === "whatsapp"
          ? "WhatsApp Bot"
          : name === "n8n"
          ? "Campañas n8n"
          : name,
      count,
      pct: Math.round((count / totalLeads) * 100),
    }))
    .sort((a, b) => b.count - a.count);

  // Donut chart path drawing logic
  let accumulatedPercent = 0;
  const donutSegments = trafficSources.map((source, index) => {
    const startPercent = accumulatedPercent;
    accumulatedPercent += source.pct;
    const endPercent = accumulatedPercent;

    const getCoordinatesForPercent = (percent: number) => {
      const x = Math.cos(2 * Math.PI * percent);
      const y = Math.sin(2 * Math.PI * percent);
      return [x, y];
    };

    const [startX, startY] = getCoordinatesForPercent(startPercent / 100);
    const [endX, endY] = getCoordinatesForPercent(endPercent / 100);
    const largeArcFlag = source.pct > 50 ? 1 : 0;

    const pathData = [
      `M ${startX * 35 + 50} ${startY * 35 + 50}`,
      `A 35 35 0 ${largeArcFlag} 1 ${endX * 35 + 50} ${endY * 35 + 50}`,
    ].join(" ");

    const colors = [
      "stroke-[#FBBF24]",
      "stroke-[#10B981]",
      "stroke-[#3B82F6]",
      "stroke-[#8B5CF6]",
    ];
    const bgColors = [
      "bg-[#FBBF24]",
      "bg-[#10B981]",
      "bg-[#3B82F6]",
      "bg-[#8B5CF6]",
    ];

    return {
      pathData,
      color: colors[index % colors.length],
      bgColor: bgColors[index % bgColors.length],
      ...source,
    };
  });

  // 3. AI Performance metrics
  const dayAgo = new Date();
  dayAgo.setHours(dayAgo.getHours() - 24);
  const chats24h = conversations.filter(
    (c) => new Date(c.started_at) >= dayAgo
  ).length;

  const autoAppts = appointments.filter((a) => a.status === "pending").length;

  const buyers = leads.filter((l) => l.type === "buyer");
  const lowBudgetRedirects = buyers.filter(
    (b) => (b.preferences as Record<string, unknown>)?.financiera_derivado === true
  ).length;
  const redirectPct =
    buyers.length > 0
      ? Math.round((lowBudgetRedirects / buyers.length) * 100)
      : 0;

  // [Eliminado @cleanup] La métrica "Tiempo de Primer Contacto" (avgDelay) se
  // retiró: su fallback era "4.8s" inventado cuando no había datos, y el bot
  // responde de forma automática en segundos, así que no era una métrica
  // accionable. Si en el futuro se quiere medir latencia real, leer
  // `first_response_delay_sec` de metadata y mostrar "—" cuando no haya datos.

  return (
    <div className="space-y-6">
      {/* KPI Panel */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-[#1E293B]/60 backdrop-blur-md p-6 rounded-2xl border border-white/5 hover:scale-[1.02] transition-all duration-300">
          <div className="flex justify-between items-start mb-4">
            <div className="bg-blue-500/10 p-3 rounded-xl border border-blue-500/20">
              <Eye className="text-blue-400" size={24} />
            </div>
            {/* Badge de tendencia eliminado: era un "+14.2%" hardcodeado, no
                calculado. Reañadir solo cuando haya cálculo MoM real. @cleanup R1. */}
          </div>
          <p className="text-slate-400 text-xs font-semibold tracking-wider uppercase">
            Visitas Web Únicas
          </p>
          <h3 className="text-3xl font-extrabold text-white mt-2">
            {webVisitors.toLocaleString()}
          </h3>
          <p className="text-xs text-slate-500 mt-2">
            Visitas únicas reales en tiempo real
          </p>
        </div>

        <div className="bg-[#1E293B]/60 backdrop-blur-md p-6 rounded-2xl border border-white/5 hover:scale-[1.02] transition-all duration-300">
          <div className="flex justify-between items-start mb-4">
            <div className="bg-green-500/10 p-3 rounded-xl border border-green-500/20">
              <FileCheck2 className="text-green-400" size={24} />
            </div>
            {/* Badge de tendencia eliminado: era un "+8.7%" hardcodeado, no
                calculado. Reañadir solo cuando haya cálculo MoM real. @cleanup R1. */}
          </div>
          <p className="text-slate-400 text-xs font-semibold tracking-wider uppercase">
            Registros de Leads
          </p>
          <h3 className="text-3xl font-extrabold text-white mt-2">
            {formsFilled}
          </h3>
          <p className="text-xs text-slate-500 mt-2">
            Guardados en Supabase en tiempo real
          </p>
        </div>

        <div className="bg-[#1E293B]/60 backdrop-blur-md p-6 rounded-2xl border border-white/5 hover:scale-[1.02] transition-all duration-300">
          <div className="flex justify-between items-start mb-4">
            <div className="bg-[#FBBF24]/10 p-3 rounded-xl border border-[#FBBF24]/20">
              <Bot className="text-[#FBBF24]" size={24} />
            </div>
            <span className="text-[#FBBF24] text-xs font-bold bg-[#FBBF24]/10 px-2 py-1 rounded-md flex items-center">
              Alta Eficacia
            </span>
          </div>
          <p className="text-slate-400 text-xs font-semibold tracking-wider uppercase">
            Leads Cualificados IA
          </p>
          <h3 className="text-3xl font-extrabold text-white mt-2">
            {qualifiedLeads}
          </h3>
          <p className="text-xs text-slate-500 mt-2">
            Filtrados y validados por el bot
          </p>
        </div>

        <div className="bg-[#1E293B]/60 backdrop-blur-md p-6 rounded-2xl border border-white/5 hover:scale-[1.02] transition-all duration-300">
          <div className="flex justify-between items-start mb-4">
            <div className="bg-purple-500/10 p-3 rounded-xl border border-purple-500/20">
              <Calendar className="text-purple-400" size={24} />
            </div>
            <span className="text-purple-400 text-xs font-bold bg-purple-500/10 px-2 py-1 rounded-md flex items-center">
              Calendario
            </span>
          </div>
          <p className="text-slate-400 text-xs font-semibold tracking-wider uppercase">
            Citas Agendadas
          </p>
          <h3 className="text-3xl font-extrabold text-white mt-2">
            {scheduledVisits}
          </h3>
          <p className="text-xs text-slate-500 mt-2">
            Auto-asignados a inmuebles activos
          </p>
        </div>
      </div>

      {/* Visual Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Conversions Funnel */}
        <div className="bg-[#1E293B]/60 backdrop-blur-md p-6 rounded-2xl border border-white/5 flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
              <Layers size={18} className="text-[#FBBF24]" />
              Embudo de Conversión Comercial
            </h3>
            <p className="text-slate-400 text-xs mb-6">
              Tasas de avance desde la visita web hasta la reserva
            </p>
          </div>

          <div className="flex flex-col md:flex-row items-center gap-8">
            {/* Funnel SVG component */}
            <div className="relative w-full max-w-[280px] h-[260px] flex items-center justify-center">
              <svg
                viewBox="0 0 200 180"
                className="w-full h-full drop-shadow-2xl"
              >
                <polygon
                  points="20,10 180,10 165,40 35,40"
                  fill="url(#grad1)"
                  opacity="0.95"
                />
                <polygon
                  points="37,43 163,43 148,73 52,73"
                  fill="url(#grad2)"
                  opacity="0.95"
                />
                <polygon
                  points="54,76 146,76 131,106 69,106"
                  fill="url(#grad3)"
                  opacity="0.95"
                />
                <polygon
                  points="71,109 129,109 114,139 86,139"
                  fill="url(#grad4)"
                  opacity="0.95"
                />
                <polygon
                  points="88,142 112,142 104,172 96,172"
                  fill="url(#grad5)"
                  opacity="0.95"
                />
                <defs>
                  <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#1E40AF" />
                    <stop offset="100%" stopColor="#3B82F6" />
                  </linearGradient>
                  <linearGradient id="grad2" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#065F46" />
                    <stop offset="100%" stopColor="#10B981" />
                  </linearGradient>
                  <linearGradient id="grad3" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#854D0E" />
                    <stop offset="100%" stopColor="#FBBF24" />
                  </linearGradient>
                  <linearGradient id="grad4" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#5B21B6" />
                    <stop offset="100%" stopColor="#8B5CF6" />
                  </linearGradient>
                  <linearGradient id="grad5" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#B91C1C" />
                    <stop offset="100%" stopColor="#EF4444" />
                  </linearGradient>
                </defs>
              </svg>
            </div>

            {/* Legend with ratios */}
            <div className="flex-1 space-y-4 w-full text-sm">
              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <span className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div>{" "}
                  1. Visitas Web
                </span>
                <span className="font-bold text-white">{webVisitors}</span>
              </div>
              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <span className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>{" "}
                  2. Form Formularios
                </span>
                <span className="font-bold text-emerald-400">
                  {formsFilled}{" "}
                  <span className="text-xs text-slate-500">
                    ({formsRate}%)
                  </span>
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <span className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>{" "}
                  3. Cualificados IA
                </span>
                <span className="font-bold text-amber-400">
                  {qualifiedLeads}{" "}
                  <span className="text-xs text-slate-500">
                    ({qualifiedRate}%)
                  </span>
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <span className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-purple-500"></div>{" "}
                  4. Citas Solicitadas
                </span>
                <span className="font-bold text-purple-400">
                  {scheduledVisits}{" "}
                  <span className="text-xs text-slate-500">
                    ({visitsRate}%)
                  </span>
                </span>
              </div>
              <div className="flex items-center justify-between pb-1">
                <span className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div> 5.
                  Visitas Confirmadas
                </span>
                <span className="font-bold text-red-400">
                  {confirmedVisits}{" "}
                  <span className="text-xs text-slate-500">
                    ({confirmRate}%)
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Traffic Source Donut Chart */}
        <div className="bg-[#1E293B]/60 backdrop-blur-md p-6 rounded-2xl border border-white/5 flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
              <BarChart3 size={18} className="text-[#FBBF24]" />
              Canales de Captación de Tráfico
            </h3>
            <p className="text-slate-400 text-xs mb-6">
              Orígenes de leads procesados en la plataforma
            </p>
          </div>

          <div className="flex flex-col md:flex-row items-center gap-8 justify-center">
            {/* Donut SVG */}
            <div className="relative w-44 h-44 flex items-center justify-center">
              <svg
                viewBox="0 0 100 100"
                className="w-full h-full transform -rotate-90"
              >
                <circle
                  cx="50"
                  cy="50"
                  r="35"
                  className="stroke-slate-800 fill-none"
                  strokeWidth="12"
                />
                {donutSegments.map((seg, idx) => (
                  <path
                    key={idx}
                    d={seg.pathData}
                    className={`${seg.color} fill-none`}
                    strokeWidth="12"
                    strokeLinecap="round"
                  />
                ))}
              </svg>
              {/* Center metric */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-extrabold text-white">
                  {totalLeads}
                </span>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider">
                  Leads Totales
                </span>
              </div>
            </div>

            {/* Legends list */}
            <div className="flex-1 space-y-3 w-full">
              {donutSegments.map((seg, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2 rounded-xl bg-slate-900/40 border border-white/5"
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${seg.bgColor}`} />
                    <span className="text-xs font-medium text-slate-300">
                      {seg.name}
                    </span>
                  </div>
                  <div className="text-right text-xs">
                    <span className="font-bold text-white mr-1.5">
                      {seg.count}
                    </span>
                    <span className="text-slate-500 font-bold">
                      ({seg.pct}%)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* AI Performance & Reaction Speed Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-[#1E293B]/60 backdrop-blur-md p-6 rounded-2xl border border-white/5 flex flex-col justify-between">
          <div>
            <p className="text-slate-400 text-xs font-semibold tracking-wider uppercase mb-1">
              Conversaciones 24h
            </p>
            <h3 className="text-4xl font-extrabold text-[#FBBF24]">
              {chats24h}
            </h3>
          </div>
          <div className="mt-4 pt-4 border-t border-white/5 flex justify-between items-center text-xs">
            <span className="text-slate-400">
              Citas Auto-agendadas (Pendientes)
            </span>
            <span className="bg-[#FBBF24]/10 text-[#FBBF24] px-2.5 py-1 rounded-lg font-bold border border-[#FBBF24]/20">
              {autoAppts}
            </span>
          </div>
        </div>

        <div className="bg-[#1E293B]/60 backdrop-blur-md p-6 rounded-2xl border border-white/5 flex flex-col justify-between">
          <div>
            <p className="text-slate-400 text-xs font-semibold tracking-wider uppercase mb-1">
              Desviación Financiera (% Compradores)
            </p>
            <h3 className="text-4xl font-extrabold text-emerald-400">
              {redirectPct}%
            </h3>
          </div>
          <div className="mt-4 pt-4 border-t border-white/5 flex justify-between items-center text-xs">
            <span className="text-slate-400">
              Derivados a Financiera Externa
            </span>
            <span className="bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-lg font-bold border border-emerald-500/20">
              {lowBudgetRedirects} leads
            </span>
          </div>
        </div>

        {/* Card "Tiempo de Primer Contacto" eliminada @cleanup: mostraba un
            avgDelay con fallback inventado y no era una métrica accionable. */}
      </div>
    </div>
  );
}
