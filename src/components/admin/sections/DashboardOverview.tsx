import { useState } from "react";
import { 
  DollarSign, 
  Zap, 
  RefreshCw, 
  Layers, 
  Globe
} from "lucide-react";
import MarketingTab from "./dashboard/MarketingTab";
import OperacionesTab from "./dashboard/OperacionesTab";
import FinanzasTab from "./dashboard/FinanzasTab";
import EcosistemaTab from "./dashboard/EcosistemaTab";

type ActiveTab = "marketing" | "operaciones" | "finanzas" | "ecosistema";

export default function DashboardOverview() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("marketing");
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const handleSync = async () => {
    setRefreshing(true);
    setRefreshKey(prev => prev + 1);
    // Simulate a brief spinning animation for better UX feedback
    await new Promise(resolve => setTimeout(resolve, 600));
    setRefreshing(false);
  };

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
          onClick={handleSync}
          disabled={refreshing}
          className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-xs font-semibold flex items-center gap-2 text-slate-300 disabled:opacity-50"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          Sincronizar Supabase
        </button>
      </div>

      <div className="transition-all duration-500">
        {activeTab === "marketing" && <MarketingTab key={refreshKey} />}
        {activeTab === "operaciones" && <OperacionesTab key={refreshKey} />}
        {activeTab === "finanzas" && <FinanzasTab key={refreshKey} />}
        {activeTab === "ecosistema" && <EcosistemaTab key={refreshKey} />}
      </div>
    </div>
  );
}
