import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type {
  PropertyRow,
  LeadRow,
  AppointmentRow,
  BuyerActivityLogRow,
  BuyerDemandRow,
  EncargoRow,
  SellerActivityLogRow,
} from "./types";
import {
  computeZoneDemand,
  computeBuyerProfiles,
  computePropertyViews,
  computeSelectedMetrics,
  computePriceDropEstimate,
  daysOnMarket,
} from "./operaciones/operacionesUtils";
import PipelineCard from "./operaciones/PipelineCard";
import MarketDaysChart from "./operaciones/MarketDaysChart";
import SevillaDemandChart from "./operaciones/SevillaDemandChart";
import GrowthChart from "./operaciones/GrowthChart";
import BuyersBreakdown from "./operaciones/BuyersBreakdown";
import PropertyViewsRanking from "./operaciones/PropertyViewsRanking";
import PropertyReportSelector from "./operaciones/PropertyReportSelector";
import CaptacionReportModal from "./operaciones/CaptacionReportModal";
import PriceDropModal from "./operaciones/PriceDropModal";

/**
 * Pestaña "Operaciones" del dashboard admin.
 * Orquestador: carga datos y los reparte a subcomponentes en `./operaciones/`.
 * Los paneles interactivos (PipelineCard, MarketDaysChart, GrowthChart) gestionan
 * sus propios filtros internamente y reciben datos crudos como props.
 */
export default function OperacionesTab() {
  const [loading, setLoading] = useState(true);
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [buyerActivityLogs, setBuyerActivityLogs] = useState<BuyerActivityLogRow[]>([]);
  const [buyersDemands, setBuyersDemands] = useState<BuyerDemandRow[]>([]);
  const [encargos, setEncargos] = useState<EncargoRow[]>([]);
  const [sellerActivityLogs, setSellerActivityLogs] = useState<SellerActivityLogRow[]>([]);
  const [webVisits, setWebVisits] = useState<{ page_path: string }[]>([]);

  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [sevillaSearchQuery, setSevillaSearchQuery] = useState("");
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showPriceDropModal, setShowPriceDropModal] = useState(false);

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
        { data: buyersDemandsData },
        { data: encargosData },
        { data: sellerLogsData },
        { data: webVisitsData },
      ] = await Promise.all([
        supabase.from("properties").select("*"),
        supabase.from("leads").select("*"),
        supabase.from("appointments").select("*"),
        supabase.from("buyer_activity_logs").select("*").order("event_date", { ascending: false }),
        supabase
          .from("buyers_demands")
          .select("id, name, phone, email, max_budget, status, preferred_zones, created_at, funding_type, lead_id"),
        supabase
          .from("encargos")
          .select("id, seller_lead_id, property_id, fecha_firma, status, created_at, updated_at"),
        supabase
          .from("seller_activity_logs")
          .select("id, lead_id, event_type, event_date, property_id")
          .then(res => ({ data: res.data ?? [], error: res.error })), // tabla puede estar vacía
        supabase.from("web_visits").select("page_path"),
      ]);

      const propsList = (propsData || []) as PropertyRow[];
      setProperties(propsList);
      setLeads((leadsData || []) as LeadRow[]);
      setAppointments((apptsData || []) as AppointmentRow[]);
      setBuyerActivityLogs((logsData || []) as BuyerActivityLogRow[]);
      setBuyersDemands((buyersDemandsData || []) as BuyerDemandRow[]);
      setEncargos((encargosData || []) as EncargoRow[]);
      setSellerActivityLogs((sellerLogsData || []) as SellerActivityLogRow[]);
      setWebVisits((webVisitsData || []) as { page_path: string }[]);

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
        <p className="text-slate-400 text-sm font-medium">
          Analizando operaciones, embudos e informes de captación...
        </p>
      </div>
    );
  }

  const sellerLeads = leads.filter(l => l.type === "seller");

  // Visitas web y físicas por propiedad
  const visitsByProperty: Record<string, number> = {};
  const physicalCompletedByProperty: Record<string, number> = {};
  const physicalPendingByProperty: Record<string, number> = {};
  for (const p of properties) {
    visitsByProperty[p.id] = webVisits.filter(v => v.page_path?.includes(p.id)).length;
    physicalCompletedByProperty[p.id] = appointments.filter(
      a => a.property_id === p.id && a.status === "completed",
    ).length;
    physicalPendingByProperty[p.id] = appointments.filter(
      a => a.property_id === p.id && a.status === "pending",
    ).length;
  }

  // Valoración de referencia por propiedad
  const valuationByProperty: Record<string, number> = {};
  for (const l of sellerLeads) {
    if (!l.property_id) continue;
    const prefs = l.preferences || {};
    const v = Number((prefs as Record<string, unknown>).agent_valuation || (prefs as Record<string, unknown>).estimated_value || 0);
    if (v > 0) valuationByProperty[l.property_id] = v;
  }

  // Derivaciones analíticas
  const mergedZoneDemand = computeZoneDemand(buyersDemands);
  const buyerProfiles = computeBuyerProfiles(buyersDemands, leads);
  const { top3, bottom3, platformAvgViews, platformAvgDays } = computePropertyViews(
    properties,
    visitsByProperty,
  );
  const publishedCount = properties.filter(p => p.published_at).length;

  // Propiedad seleccionada en el generador de informes
  const selectedProperty = properties.find(p => p.id === selectedPropertyId);
  const selectedDays = selectedProperty ? daysOnMarket(selectedProperty) : null;
  const selectedVisits = selectedProperty ? (visitsByProperty[selectedProperty.id] ?? 0) : 0;
  const selectedValuation = selectedProperty ? (valuationByProperty[selectedProperty.id] ?? 0) : 0;
  const selectedPhysicalCompleted = selectedProperty
    ? (physicalCompletedByProperty[selectedProperty.id] ?? 0)
    : 0;
  const selectedPhysicalPending = selectedProperty
    ? (physicalPendingByProperty[selectedProperty.id] ?? 0)
    : 0;
  const selectedMetrics = computeSelectedMetrics(selectedProperty, {
    days: selectedDays,
    views: selectedVisits,
    physicalCompleted: selectedPhysicalCompleted,
    physicalPending: selectedPhysicalPending,
    valuation: selectedValuation,
  });

  const priceDrop = selectedProperty
    ? computePriceDropEstimate({
        price: Number(selectedProperty.price || 0),
        valuation: selectedValuation,
        daysOnMarket: selectedDays,
        avgDays: platformAvgDays,
        visits: selectedVisits,
        avgVisits: platformAvgViews,
        marketSampleSize: publishedCount,
      })
    : undefined;

  return (
    <div className="space-y-6">

      {/* Pipeline & Market Days Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PipelineCard
          sellerLeads={sellerLeads}
          encargos={encargos}
          sellerActivityLogs={sellerActivityLogs}
        />
        <MarketDaysChart properties={properties} platformAvgDays={platformAvgDays} />
      </div>

      {/* Zonas de Demanda e Historial (Zonas & Growth) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SevillaDemandChart
          demand={mergedZoneDemand}
          searchQuery={sevillaSearchQuery}
          onSearchChange={setSevillaSearchQuery}
        />
        <GrowthChart buyersDemands={buyersDemands} />
      </div>

      {/* Active Buyers breakdown */}
      <BuyersBreakdown profiles={buyerProfiles} />

      {/* Visitas Top 3 vs Bottom 3 */}
      <PropertyViewsRanking top3={top3} bottom3={bottom3} visitsByProperty={visitsByProperty} />

      {/* Generador de informes de captación */}
      <PropertyReportSelector
        properties={properties}
        selectedPropertyId={selectedPropertyId}
        onSelectProperty={setSelectedPropertyId}
        selectedProperty={selectedProperty}
        metrics={selectedMetrics}
        platformAvgViews={platformAvgViews}
        platformAvgDays={platformAvgDays}
        priceDrop={priceDrop}
        onPrint={() => setShowPrintModal(true)}
        onGeneratePriceDropReport={() => setShowPriceDropModal(true)}
      />

      {showPriceDropModal && selectedProperty && (
        <PriceDropModal
          propertyId={selectedProperty.id}
          propertyTitle={selectedProperty.title}
          priceDrop={priceDrop}
          onClose={() => setShowPriceDropModal(false)}
        />
      )}

      {showPrintModal && selectedProperty && (
        <CaptacionReportModal
          selectedProperty={selectedProperty}
          metrics={selectedMetrics}
          platformAvgViews={platformAvgViews}
          platformAvgDays={platformAvgDays}
          appointments={appointments}
          buyerActivityLogs={buyerActivityLogs}
          buyersDemands={buyersDemands}
          priceDrop={priceDrop}
          onClose={() => setShowPrintModal(false)}
        />
      )}
    </div>
  );
}
