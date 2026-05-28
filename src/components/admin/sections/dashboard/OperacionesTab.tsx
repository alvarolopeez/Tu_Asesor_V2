import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  ArrowUpRight,
  ArrowDownRight,
  Printer,
  PieChart,
  FileText,
  Bot
} from "lucide-react";
import type {
  PropertyRow,
  LeadRow,
  AppointmentRow,
  BuyerActivityLogRow,
  BuyerDemandRow
} from "./types";
import {
  computePipeline,
  computeMarketDays,
  computeSevillaDemand,
  computeGrowth,
  computeBuyerProfiles,
  computePropertyViews,
  computeSelectedMetrics,
} from "./operaciones/operacionesUtils";
import PipelineCard from "./operaciones/PipelineCard";
import MarketDaysChart from "./operaciones/MarketDaysChart";
import SevillaDemandChart from "./operaciones/SevillaDemandChart";
import GrowthChart from "./operaciones/GrowthChart";

export default function OperacionesTab() {
  const [loading, setLoading] = useState(true);
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [buyerActivityLogs, setBuyerActivityLogs] = useState<BuyerActivityLogRow[]>([]);
  const [buyersDemands, setBuyersDemands] = useState<BuyerDemandRow[]>([]);

  // Interactive individual property selector state
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [sevillaSearchQuery, setSevillaSearchQuery] = useState("");
  const [showPrintModal, setShowPrintModal] = useState(false);

  useEffect(() => {
    fetchOperacionesData();
  }, []);

  const fetchOperacionesData = async () => {
    setLoading(true);
    try {
      const [
        { data: propsData },
        { data: leadsData },
        { data: apptsData },
        { data: logsData },
        { data: buyersDemandsData }
      ] = await Promise.all([
        supabase.from("properties").select("*"),
        supabase.from("leads").select("*"),
        supabase.from("appointments").select("*"),
        supabase.from("buyer_activity_logs").select("*").order("event_date", { ascending: false }),
        supabase.from("buyers_demands").select("id, name, phone, email, max_budget, status")
      ]);

      const propsList = (propsData || []) as PropertyRow[];
      setProperties(propsList);
      setLeads((leadsData || []) as LeadRow[]);
      setAppointments((apptsData || []) as AppointmentRow[]);
      setBuyerActivityLogs((logsData || []) as BuyerActivityLogRow[]);
      setBuyersDemands((buyersDemandsData || []) as BuyerDemandRow[]);

      // Default the selector to the first property if available
      if (propsList.length > 0) {
        setSelectedPropertyId(propsList[0].id);
      }
    } catch (error) {
      console.error("Error loading dashboard operations metrics:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#FBBF24]"></div>
        <p className="text-slate-400 text-sm font-medium">Analizando operaciones, embudos e informes de captación...</p>
      </div>
    );
  }

  const buyerLeads = leads.filter((l) => l.type === "buyer");
  const sellerLeads = leads.filter((l) => l.type === "seller");

  // 1. Estado de cartera (embudo de propietarios)
  const pipelineMap = computePipeline(sellerLeads);
  const maxStageCount = Math.max(...Object.values(pipelineMap), 1);

  // 2. Días en mercado por rango de precio (geometría SVG en MarketDaysChart)
  const marketDaysPerRange = computeMarketDays(properties);

  // 3. Demanda por barrios de Sevilla (filtro/orden + buscador en SevillaDemandChart)
  const mergedSevillaDemand = computeSevillaDemand(buyerLeads);

  // 4. Crecimiento acumulado de compradores (geometría SVG en GrowthChart)
  const growthData = computeGrowth(buyerLeads);

  // 5. Perfil financiero e intención de compra
  const {
    sinEstudioCount, estudioHechoCount, preconcedidaCount, contadoCount,
    habitualCount, inversionCount, totalFinCount, totalIntentCount,
  } = computeBuyerProfiles(buyerLeads);

  // 6. Ranking de visitas (top/bottom 3) y medias de plataforma
  const { top3, bottom3, platformAvgViews, platformAvgDays } = computePropertyViews(properties);

  // 7. Métricas de la propiedad seleccionada en el generador de informes
  const selectedProperty = properties.find(p => p.id === selectedPropertyId);
  const {
    selectedViews, selectedDays, selectedPrice, selectedValuation,
    valuationDiffPct, correlationRating, correlationColor,
  } = computeSelectedMetrics(selectedProperty);

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

  return (
    <div className="space-y-6">

      {/* Pipeline & Market Days Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PipelineCard pipelineMap={pipelineMap} maxStageCount={maxStageCount} />
        <MarketDaysChart marketDaysPerRange={marketDaysPerRange} platformAvgDays={platformAvgDays} />
      </div>

      {/* Zonas de Demanda e Historial (Sevilla Province & Growth) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SevillaDemandChart
          demand={mergedSevillaDemand}
          searchQuery={sevillaSearchQuery}
          onSearchChange={setSevillaSearchQuery}
        />
        <GrowthChart growthData={growthData} />
      </div>

      {/* Active Buyers breakdown Section */}
      <div className="bg-[#1E293B]/60 backdrop-blur-md p-6 rounded-2xl border border-white/5">
        <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
          <PieChart size={18} className="text-[#FBBF24]" />
          Desglose de Compradores Activos
        </h3>
        <p className="text-slate-400 text-xs mb-6">Clasificación por capacidad financiera y propósito de adquisición</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* Column 1: Financial Profile */}
          <div className="space-y-4">
            <h4 className="text-xs text-[#FBBF24] font-bold tracking-wider uppercase border-b border-white/5 pb-2">Capacidad Financiera</h4>
            
            <div className="space-y-4">
              {[
                { 
                  label: "Hipoteca y sin estudio", 
                  count: sinEstudioCount, 
                  percent: ((sinEstudioCount / totalFinCount) * 100).toFixed(1),
                  color: "bg-rose-500" 
                },
                { 
                  label: "Hipoteca con estudio hecho", 
                  count: estudioHechoCount, 
                  percent: ((estudioHechoCount / totalFinCount) * 100).toFixed(1),
                  color: "bg-blue-500" 
                },
                { 
                  label: "Hipoteca preconcedida", 
                  count: preconcedidaCount, 
                  percent: ((preconcedidaCount / totalFinCount) * 100).toFixed(1),
                  color: "bg-amber-500" 
                },
                { 
                  label: "Al contado", 
                  count: contadoCount, 
                  percent: ((contadoCount / totalFinCount) * 100).toFixed(1),
                  color: "bg-emerald-500" 
                }
              ].map((item, idx) => (
                <div key={idx} className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-300">{item.label}</span>
                    <span className="text-slate-400 font-normal">
                      <strong className="text-white font-semibold font-mono">{item.count}</strong> ({item.percent}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-950/80 rounded-full h-2 relative overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-1000 ${item.color}`}
                      style={{ width: `${item.percent}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Column 2: Purchase Intent */}
          <div className="space-y-4">
            <h4 className="text-xs text-[#FBBF24] font-bold tracking-wider uppercase border-b border-white/5 pb-2">Propósito de Adquisición</h4>
            
            <div className="space-y-6 pt-2">
              {[
                { 
                  label: "Vivienda Habitual", 
                  count: habitualCount, 
                  percent: ((habitualCount / totalIntentCount) * 100).toFixed(1),
                  color: "bg-indigo-500" 
                },
                { 
                  label: "Vivienda de Inversión", 
                  count: inversionCount, 
                  percent: ((inversionCount / totalIntentCount) * 100).toFixed(1),
                  color: "bg-purple-500" 
                }
              ].map((item, idx) => (
                <div key={idx} className="space-y-2">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-300 text-sm">{item.label}</span>
                    <span className="text-slate-400 font-normal">
                      <strong className="text-white font-semibold font-mono">{item.count}</strong> ({item.percent}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-950/80 rounded-full h-3 relative overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-1000 ${item.color}`}
                      style={{ width: `${item.percent}%` }}
                    ></div>
                  </div>
                </div>
              ))}

              {/* Micro-insight box */}
              <div className="bg-slate-950/40 border border-white/5 p-3 rounded-xl text-[11px] text-slate-400 leading-relaxed mt-4">
                <strong className="text-slate-200">Insight Operativo:</strong> El <strong className="text-[#FBBF24] font-mono">{((preconcedidaCount + contadoCount) / totalFinCount * 100).toFixed(0)}%</strong> de tus compradores activos tienen liquidez inmediata o pre-aprobación bancaria consolidada, óptimo para campañas de venta exprés.
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Visitas Top 3 vs Bottom 3 Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 3 most visited */}
        <div className="bg-[#1E293B]/60 backdrop-blur-md p-6 rounded-2xl border border-white/5">
          <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2 text-green-400">
            <ArrowUpRight size={18} /> Top 3 Inmuebles Más Visitados
          </h3>
          <div className="space-y-3">
            {top3.map((prop, idx) => (
              <div key={idx} className="bg-slate-900/40 p-3 rounded-xl border border-white/5 flex justify-between items-center">
                <div>
                  <p className="text-sm font-bold text-white">{prop.title}</p>
                  <p className="text-xs text-slate-400">{(Number(prop.price)).toLocaleString()}€</p>
                </div>
                <div className="text-right">
                  <span className="bg-green-500/10 text-green-400 px-2 py-1 rounded text-xs font-bold border border-green-500/20">
                    {(prop.features as Record<string, any>)?.visitas_count || 0} visitas
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom 3 least visited */}
        <div className="bg-[#1E293B]/60 backdrop-blur-md p-6 rounded-2xl border border-white/5">
          <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2 text-orange-400">
            <ArrowDownRight size={18} /> Bottom 3 Inmuebles Menos Visitados
          </h3>
          <div className="space-y-3">
            {bottom3.map((prop, idx) => (
              <div key={idx} className="bg-slate-900/40 p-3 rounded-xl border border-white/5 flex justify-between items-center">
                <div>
                  <p className="text-sm font-bold text-white">{prop.title}</p>
                  <p className="text-xs text-slate-400">{(Number(prop.price)).toLocaleString()}€</p>
                </div>
                <div className="text-right">
                  <span className="bg-orange-500/10 text-orange-400 px-2 py-1 rounded text-xs font-bold border border-orange-500/20">
                    {(prop.features as Record<string, any>)?.visitas_count || 0} visitas
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Individual Property Report Selector (Informe de Captador) */}
      <div className="bg-[#1E293B]/85 backdrop-blur-md p-6 rounded-2xl border border-[#FBBF24]/30 shadow-xl">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
              <Printer size={18} className="text-[#FBBF24]" />
              Generador de Informes de Captación
            </h3>
            <p className="text-slate-400 text-xs">Compara propiedades individuales e imprime el dossier de valoración</p>
          </div>
          
          {/* Properties Dropdown */}
          <select
            value={selectedPropertyId}
            onChange={(e) => setSelectedPropertyId(e.target.value)}
            className="bg-slate-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
          >
            {properties.map(p => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        </div>

        {selectedProperty ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
            {/* Left detail card */}
            <div className="space-y-4 bg-slate-900/40 p-5 rounded-xl border border-white/5">
              <h4 className="font-bold text-white text-base">{selectedProperty.title}</h4>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between pb-1 border-b border-white/5">
                  <span className="text-slate-400">Precio de Publicación</span>
                  <span className="font-bold text-white">{selectedPrice.toLocaleString()}€</span>
                </div>
                <div className="flex justify-between pb-1 border-b border-white/5">
                  <span className="text-slate-400">Valoración por IA</span>
                  <span className="font-bold text-white">{selectedValuation > 0 ? `${selectedValuation.toLocaleString()}€` : "N/D"}</span>
                </div>
                <div className="flex justify-between pb-1 border-b border-white/5">
                  <span className="text-slate-400">Días en el Mercado</span>
                  <span className="font-bold text-white">{selectedDays} días</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Visitas Totales</span>
                  <span className="font-bold text-white">{selectedViews} visitas</span>
                </div>
              </div>
            </div>

            {/* Middle Comparison Metrics */}
            <div className="space-y-4">
              <div className="bg-slate-900/40 p-4 rounded-xl border border-white/5">
                <div className="flex justify-between items-center mb-1 text-xs">
                  <span className="text-slate-400">Rendimiento de Visitas</span>
                  <span className={`font-bold ${selectedViews >= platformAvgViews ? "text-green-400" : "text-orange-400"}`}>
                    {selectedViews >= platformAvgViews ? "+" : ""}{selectedViews - platformAvgViews} vs Media
                  </span>
                </div>
                <p className="text-xs text-slate-500">Media de la plataforma: {platformAvgViews} visitas</p>
              </div>

              <div className="bg-slate-900/40 p-4 rounded-xl border border-white/5">
                <div className="flex justify-between items-center mb-1 text-xs">
                  <span className="text-slate-400">Velocidad de Cierre</span>
                  <span className={`font-bold ${selectedDays <= platformAvgDays ? "text-green-400" : "text-orange-400"}`}>
                    {selectedDays - platformAvgDays > 0 ? "+" : ""}{selectedDays - platformAvgDays} días vs Media
                  </span>
                </div>
                <p className="text-xs text-slate-500">Media de la plataforma: {platformAvgDays} días</p>
              </div>
            </div>

            {/* Offer correlation visual gauge */}
            <div className="bg-slate-900/40 p-5 rounded-xl border border-white/5 flex flex-col justify-between h-full min-h-[140px]">
              <div className="text-center">
                <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Correlación de Ofertas</p>
                <span className={`text-lg font-extrabold ${correlationColor}`}>{correlationRating}</span>
                <p className="text-2xl font-black text-white mt-2">
                  {valuationDiffPct > 0 ? "+" : ""}{valuationDiffPct.toFixed(1)}%
                </p>
                <p className="text-[10px] text-slate-500 mt-1">Desviación respecto a Valoración de Mercado</p>
              </div>

              <button
                onClick={() => setShowPrintModal(true)}
                className="w-full mt-4 py-2 bg-[#FBBF24] hover:bg-[#FBBF24]/90 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all duration-300"
              >
                <Printer size={14} /> Generar Informe PDF
              </button>
            </div>
          </div>
        ) : (
          <p className="text-slate-500 text-sm text-center py-6">Selecciona una propiedad para ver el análisis de valoración</p>
        )}
      </div>

      {/* PDF Export Overlay modal template */}
      {showPrintModal && renderPrintPreview()}
    </div>
  );
}
