"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { 
  Users, 
  MessageSquare, 
  Calculator, 
  CheckCircle, 
  XCircle, 
  Eye, 
  Clock, 
  Search,
  Filter,
  LogOut,
  LayoutDashboard,
  ExternalLink,
  Calendar as CalendarIcon,
  Home,
  FileText,
  UserPlus,
  MessageCircle,
  Star,
  PenTool,
  Briefcase,
  TrendingUp,
  DollarSign,
  Server
} from "lucide-react";
import AdminAuthGate from "./AdminAuthGate";
import DashboardOverview from "./sections/DashboardOverview";
import PropertiesManager from "./sections/PropertiesManager";
import ReviewsManager from "./sections/ReviewsManager";
import WarmLeadsManager from "./sections/WarmLeadsManager";
import CalendarManager from "./sections/CalendarManager";
import BuyersManager from "./sections/BuyersManager";
import EncargosManager from "./sections/EncargosManager";
import ChatManager from "./sections/ChatManager";
import BlogManager from "./sections/BlogManager";
import HeatmapManager from "./sections/HeatmapManager";
import WebhooksManager from "./sections/WebhooksManager";
import DocumentsManager from "./sections/DocumentsManager";
import type { DocIntent } from "./sections/DocumentsManager.types";

// Brief #009 T3: ids coherentes con lo que renderizan — 'encargos' →
// EncargosManager y 'sellers' → WarmLeadsManager (antes 'sellers' abría
// Encargos y 'warm_sellers' abría Vendedores: trampa de mantenimiento).
// activeTab no se persiste en ningún sitio → sin mapeo de compatibilidad.
type TabType = 'dashboard' | 'calendar' | 'properties' | 'buyers' | 'encargos' | 'sellers' | 'documents' | 'chat' | 'reviews' | 'blog' | 'heatmap' | 'webhooks';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  // Brief #008 T4: intent de documento lanzado desde un evento de timeline
  // (Pedidos/Vendedores). DocumentsManager lo consume al montar y lo limpia.
  const [docIntent, setDocIntent] = useState<DocIntent | null>(null);
  const goToDocuments = (intent: DocIntent) => {
    setDocIntent(intent);
    setActiveTab('documents');
  };

  // Brief #011 F3.2: puente DocIntent entre rutas. Las páginas completas
  // (/admin/sellers|buyers|encargos/[id]) no pueden setear docIntent en este
  // componente → llegan a /admin/dashboard?docKind=nota&docLeadId=... y aquí
  // se convierte en DocIntent (y se limpia la URL). La página se carga con
  // ssr:false, así que window está disponible.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const kind = params.get('docKind');
    if (kind === 'nota' || kind === 'propuesta' || kind === 'contrato') {
      setDocIntent({
        kind,
        leadId: params.get('docLeadId') || undefined,
        buyerId: params.get('docBuyerId') || undefined,
        encargoId: params.get('docEncargoId') || undefined,
      });
      setActiveTab('documents');
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [leads, setLeads] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [calculations, setCalculations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [leadsRes, reviewsRes, calcsRes] = await Promise.all([
        supabase.from('leads').select('*').order('created_at', { ascending: false }),
        supabase.from('reviews').select('*').order('created_at', { ascending: false }),
        supabase.from('tool_calculations').select('*, leads(name, phone)').order('created_at', { ascending: false })
      ]);

      if (leadsRes.data) setLeads(leadsRes.data);
      if (reviewsRes.data) setReviews(reviewsRes.data);
      if (calcsRes.data) setCalculations(calcsRes.data);
    } catch (error) {
      console.error("Error fetching admin data:", error);
    } finally {
      setLoading(false);
    }
  };

  const TABS: { id: TabType; label: string; icon: React.ElementType }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'calendar', label: 'Calendario', icon: CalendarIcon },
    { id: 'properties', label: 'Inmuebles', icon: Home },
    { id: 'buyers', label: 'Pedidos', icon: Users },
    { id: 'encargos', label: 'Encargos', icon: Briefcase },
    { id: 'sellers', label: 'Vendedores', icon: UserPlus },
    { id: 'documents', label: 'Documentos', icon: FileText },
    { id: 'chat', label: 'Live Chat (IA)', icon: MessageCircle },
    { id: 'reviews', label: 'Reseñas', icon: Star },
    { id: 'blog', label: 'Blog', icon: PenTool },
    // 'heatmap' oculto del menú: HeatmapManager es un placeholder de 11 líneas
    // sin datos. Para reactivar cuando se implemente (con web_visits agrupadas
    // por page_path): descomentar la línea de abajo Y re-importar `Activity`
    // de lucide-react. El type 'heatmap' y el render se dejan intactos. @cleanup R4.
    // { id: 'heatmap', label: 'Mapa de Calor', icon: Activity },
    { id: 'webhooks', label: 'Webhook Logs', icon: Server },
  ];

  // Brief #011 F3.0: el gate de auth vive en AdminAuthGate (reutilizado por
  // las páginas completas /admin/buyers|sellers|encargos/[id]). fetchData se
  // dispara via onAuthenticated — mismo momento que antes (sesión/login/bypass).
  return (
    <AdminAuthGate onAuthenticated={fetchData}>
      {({ logout }) => (
    <div className="min-h-screen bg-[#0F172A] text-slate-200 flex flex-col md:flex-row">
      {/* Mobile Header */}
      <header className="md:hidden flex items-center justify-between px-5 py-4 bg-[#1E293B] border-b border-white/5 sticky top-0 z-30 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#FBBF24] rounded-lg flex items-center justify-center font-bold text-[#2C3E50] text-sm">
            AA
          </div>
          <div>
            <p className="font-bold text-white text-xs">Álvaro | CRM</p>
            <p className="text-[8px] text-slate-400 uppercase tracking-widest">Administrador</p>
          </div>
        </div>
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="p-2 hover:bg-white/5 rounded-lg text-slate-300 focus:outline-none transition-colors"
          aria-label="Toggle Menu"
        >
          {isSidebarOpen ? (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </header>

      {/* Mobile Sidebar Overlay Backdrop */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden transition-opacity duration-300"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-[#1E293B] border-r border-white/5 flex flex-col shrink-0
        transform transition-transform duration-300 ease-in-out
        md:static md:translate-x-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-6 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#FBBF24] rounded-lg flex items-center justify-center font-bold text-[#2C3E50]">
              AA
            </div>
            <div>
              <p className="font-bold text-white text-sm">Álvaro | CRM</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest">Administrador</p>
            </div>
          </div>
        </div>

        <nav className="flex-grow p-4 space-y-1 overflow-y-auto hide-scrollbar">
          {TABS.map((tab) => (
            <button 
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setIsSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === tab.id ? 'bg-[#FBBF24] text-[#2C3E50] font-bold shadow-lg shadow-[#FBBF24]/20' : 'hover:bg-white/5 text-slate-400'}`}
            >
              <tab.icon size={20} /> {tab.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-white/5">
          <button
            onClick={() => {
              logout();
              setIsSidebarOpen(false);
            }}
            className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-400/10 rounded-xl transition-all"
          >
            <LogOut size={20} /> Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-grow p-4 md:p-8 overflow-y-auto w-full">
        <header className="flex justify-between items-center mb-6 md:mb-10">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white capitalize">{TABS.find(t => t.id === activeTab)?.label}</h1>
            <p className="text-slate-400 text-xs md:text-sm">Panel de gestión y administración.</p>
          </div>
          <div className="flex gap-4">
            <button onClick={fetchData} className="p-2 hover:bg-white/5 rounded-lg text-slate-400 transition-colors">
              <Clock size={20} className="md:w-6 md:h-6" />
            </button>
          </div>
        </header>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#FBBF24]"></div>
          </div>
        ) : (
          <div className="space-y-6">
            
            {/* 1. DASHBOARD */}
            {activeTab === 'dashboard' && <DashboardOverview />}

            {/* 2. CALENDARIO */}
            {activeTab === 'calendar' && <CalendarManager />}

            {/* 3. INMUEBLES */}
            {activeTab === 'properties' && <PropertiesManager />}

            {/* 4. PEDIDOS (COMPRADORES) */}
            {activeTab === 'buyers' && <BuyersManager onGoToDocuments={goToDocuments} />}

            {/* 5. ENCARGOS (VENDEDORES EXCLUSIVOS) */}
            {activeTab === 'encargos' && <EncargosManager />}

            {/* 6. VENDEDORES (WARM LEADS) */}
            {activeTab === 'sellers' && <WarmLeadsManager leads={leads} onGoToDocuments={goToDocuments} />}

            {/* 7. LIVE CHAT */}
            {activeTab === 'chat' && <ChatManager />}

            {/* 8. RESEÑAS */}
            {activeTab === 'reviews' && <ReviewsManager reviews={reviews} onRefresh={fetchData} />}

            {/* 9. BLOG */}
            {activeTab === 'blog' && <BlogManager />}

            {/* 10. MAPA DE CALOR */}
            {activeTab === 'heatmap' && <HeatmapManager />}

            {/* 11. WEBHOOKS */}
            {activeTab === 'webhooks' && <WebhooksManager />}

            {/* 12. DOCUMENTOS */}
            {activeTab === 'documents' && (
              <DocumentsManager docIntent={docIntent} onIntentConsumed={() => setDocIntent(null)} />
            )}

          </div>
        )}
      </main>
    </div>
      )}
    </AdminAuthGate>
  );
}
