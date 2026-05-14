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
  Lock,
  Calendar as CalendarIcon,
  Home,
  FileText,
  UserPlus,
  MessageCircle,
  Star,
  PenTool,
  Activity,
  Briefcase,
  TrendingUp,
  DollarSign,
  Server
} from "lucide-react";
import DashboardOverview from "./sections/DashboardOverview";
import PropertiesManager from "./sections/PropertiesManager";
import ReviewsManager from "./sections/ReviewsManager";
import WarmLeadsManager from "./sections/WarmLeadsManager";
import CalendarManager from "./sections/CalendarManager";
import BuyersManager from "./sections/BuyersManager";
import SellersManager from "./sections/SellersManager";
import ChatManager from "./sections/ChatManager";
import BlogManager from "./sections/BlogManager";
import HeatmapManager from "./sections/HeatmapManager";
import WebhooksManager from "./sections/WebhooksManager";

type TabType = 'dashboard' | 'calendar' | 'properties' | 'buyers' | 'sellers' | 'warm_sellers' | 'chat' | 'reviews' | 'blog' | 'heatmap' | 'webhooks';

export default function AdminDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [leads, setLeads] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [calculations, setCalculations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      setIsAuthenticated(true);
      fetchData();
    } else {
      setIsAuthenticated(false);
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError("");
    
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setAuthError("Credenciales incorrectas.");
      setAuthLoading(false);
    } else {
      setIsAuthenticated(true);
      fetchData();
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setIsAuthenticated(false);
  };

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

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-4">
        <div className="bg-[#1E293B] p-8 rounded-2xl border border-white/10 w-full max-w-md shadow-2xl">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-[#FBBF24] rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock size={32} className="text-[#2C3E50]" />
            </div>
            <h1 className="text-2xl font-bold text-white">Acceso Administrativo</h1>
            <p className="text-slate-400 text-sm mt-2">Introduce tus credenciales para acceder al panel.</p>
          </div>
          
          <form onSubmit={handleLogin} className="space-y-4">
            {authError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg text-center">
                {authError}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
              <input 
                type="email" 
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#0F172A] border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all"
                placeholder="tu@email.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Contraseña</label>
              <input 
                type="password" 
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#0F172A] border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all"
                placeholder="••••••••"
              />
            </div>
            <button 
              type="submit" 
              disabled={authLoading}
              className="w-full bg-[#FBBF24] hover:bg-yellow-500 text-[#2C3E50] font-bold py-3 rounded-xl transition-all disabled:opacity-50 mt-4"
            >
              {authLoading ? 'Verificando...' : 'Entrar al Dashboard'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const TABS: { id: TabType; label: string; icon: any }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'calendar', label: 'Calendario', icon: CalendarIcon },
    { id: 'properties', label: 'Inmuebles', icon: Home },
    { id: 'buyers', label: 'Pedidos', icon: Users },
    { id: 'sellers', label: 'Encargos', icon: Briefcase },
    { id: 'warm_sellers', label: 'Vendedores', icon: UserPlus },
    { id: 'chat', label: 'Live Chat (IA)', icon: MessageCircle },
    { id: 'reviews', label: 'Reseñas', icon: Star },
    { id: 'blog', label: 'Blog', icon: PenTool },
    { id: 'heatmap', label: 'Mapa de Calor', icon: Activity },
    { id: 'webhooks', label: 'Webhook Logs', icon: Server },
  ];

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-200 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-[#1E293B] border-r border-white/5 flex flex-col shrink-0">
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
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === tab.id ? 'bg-[#FBBF24] text-[#2C3E50] font-bold shadow-lg shadow-[#FBBF24]/20' : 'hover:bg-white/5 text-slate-400'}`}
            >
              <tab.icon size={20} /> {tab.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-white/5">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-400/10 rounded-xl transition-all"
          >
            <LogOut size={20} /> Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-grow p-8 overflow-y-auto">
        <header className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-3xl font-bold text-white capitalize">{TABS.find(t => t.id === activeTab)?.label}</h1>
            <p className="text-slate-400">Panel de gestión y administración.</p>
          </div>
          <div className="flex gap-4">
            <button onClick={fetchData} className="p-2 hover:bg-white/5 rounded-lg text-slate-400 transition-colors">
              <Clock size={24} />
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
            {activeTab === 'buyers' && <BuyersManager />}

            {/* 5. ENCARGOS (VENDEDORES EXCLUSIVOS) */}
            {activeTab === 'sellers' && <SellersManager />}

            {/* 6. VENDEDORES (WARM LEADS) */}
            {activeTab === 'warm_sellers' && <WarmLeadsManager leads={leads} />}

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

          </div>
        )}
      </main>
    </div>
  );
}
