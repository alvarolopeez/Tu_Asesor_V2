import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
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
import BuyersBreakdown from "./operaciones/BuyersBreakdown";
import PropertyViewsRanking from "./operaciones/PropertyViewsRanking";
import PropertyReportSelector from "./operaciones/PropertyReportSelector";
import CaptacionReportModal from "./operaciones/CaptacionReportModal";

/**
 * Pestaña "Operaciones" del dashboard admin.
 *
 * Orquestador puro: carga propiedades/leads/citas/actividad, ejecuta las
 * derivaciones analíticas (en `operaciones/operacionesUtils`) y reparte los
 * resultados a los subcomponentes de visualización bajo `./operaciones/`.
 */
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

  // Derivaciones analíticas (lógica pura en operacionesUtils)
  const pipelineMap = computePipeline(sellerLeads);
  const maxStageCount = Math.max(...Object.values(pipelineMap), 1);
  const marketDaysPerRange = computeMarketDays(properties);
  const mergedSevillaDemand = computeSevillaDemand(buyerLeads);
  const growthData = computeGrowth(buyerLeads);
  const buyerProfiles = computeBuyerProfiles(buyerLeads);
  const { top3, bottom3, platformAvgViews, platformAvgDays } = computePropertyViews(properties);

  // Propiedad seleccionada en el generador de informes + sus métricas
  const selectedProperty = properties.find(p => p.id === selectedPropertyId);
  const selectedMetrics = computeSelectedMetrics(selectedProperty);

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
      <BuyersBreakdown profiles={buyerProfiles} />

      {/* Visitas Top 3 vs Bottom 3 Row */}
      <PropertyViewsRanking top3={top3} bottom3={bottom3} />

      {/* Individual Property Report Selector (Informe de Captador) */}
      <PropertyReportSelector
        properties={properties}
        selectedPropertyId={selectedPropertyId}
        onSelectProperty={setSelectedPropertyId}
        selectedProperty={selectedProperty}
        metrics={selectedMetrics}
        platformAvgViews={platformAvgViews}
        platformAvgDays={platformAvgDays}
        onPrint={() => setShowPrintModal(true)}
      />

      {/* PDF Export Overlay modal template */}
      {showPrintModal && selectedProperty && (
        <CaptacionReportModal
          selectedProperty={selectedProperty}
          metrics={selectedMetrics}
          platformAvgViews={platformAvgViews}
          platformAvgDays={platformAvgDays}
          appointments={appointments}
          buyerActivityLogs={buyerActivityLogs}
          buyersDemands={buyersDemands}
          onClose={() => setShowPrintModal(false)}
        />
      )}
    </div>
  );
}
