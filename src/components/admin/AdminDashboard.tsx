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
  DollarSign
} from "lucide-react";

type TabType = 'dashboard' | 'calendar' | 'properties' | 'buyers' | 'sellers' | 'warm_sellers' | 'chat' | 'reviews' | 'blog' | 'heatmap';

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

  const toggleReviewStatus = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('reviews')
        .update({ is_published: !currentStatus })
        .eq('id', id);
      
      if (error) throw error;
      fetchData();
    } catch (error) {
      alert("Error al actualizar la reseña");
    }
  };

  const deleteReview = async (id: string) => {
    if (!confirm("¿Seguro que quieres borrar esta reseña?")) return;
    try {
      await supabase.from('reviews').delete().eq('id', id);
      fetchData();
    } catch (error) {
      alert("Error al borrar");
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
            {activeTab === 'dashboard' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="bg-[#1E293B] p-6 rounded-2xl border border-white/5">
                    <div className="flex justify-between items-start mb-4">
                      <div className="bg-blue-500/20 p-3 rounded-lg"><Eye className="text-blue-400" size={24} /></div>
                      <span className="text-green-400 text-sm font-bold flex items-center"><TrendingUp size={14} className="mr-1"/> +12%</span>
                    </div>
                    <p className="text-slate-400 text-sm">Visitas Web (30d)</p>
                    <h3 className="text-3xl font-bold text-white mt-1">4,205</h3>
                  </div>
                  
                  <div className="bg-[#1E293B] p-6 rounded-2xl border border-white/5">
                    <div className="flex justify-between items-start mb-4">
                      <div className="bg-green-500/20 p-3 rounded-lg"><FileText className="text-green-400" size={24} /></div>
                      <span className="text-green-400 text-sm font-bold flex items-center"><TrendingUp size={14} className="mr-1"/> +5%</span>
                    </div>
                    <p className="text-slate-400 text-sm">Formularios Rellenos</p>
                    <h3 className="text-3xl font-bold text-white mt-1">128</h3>
                  </div>

                  <div className="bg-[#1E293B] p-6 rounded-2xl border border-white/5">
                    <div className="flex justify-between items-start mb-4">
                      <div className="bg-[#FBBF24]/20 p-3 rounded-lg"><DollarSign className="text-[#FBBF24]" size={24} /></div>
                    </div>
                    <p className="text-slate-400 text-sm">Ingresos (Últimos 30d)</p>
                    <h3 className="text-3xl font-bold text-white mt-1">12,450€</h3>
                  </div>

                  <div className="bg-[#1E293B] p-6 rounded-2xl border border-white/5">
                    <div className="flex justify-between items-start mb-4">
                      <div className="bg-purple-500/20 p-3 rounded-lg"><MessageCircle className="text-purple-400" size={24} /></div>
                    </div>
                    <p className="text-slate-400 text-sm">Chats Activos IA</p>
                    <h3 className="text-3xl font-bold text-white mt-1">45</h3>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-[#1E293B] p-6 rounded-2xl border border-white/5 min-h-[300px] flex flex-col items-center justify-center">
                    <Activity size={48} className="text-slate-600 mb-4" />
                    <p className="text-slate-400 text-center px-4">Gráfico de ingresos vs gastos (Previsiones)<br/>Próximamente</p>
                  </div>
                  <div className="bg-[#1E293B] p-6 rounded-2xl border border-white/5 min-h-[300px] flex flex-col items-center justify-center">
                    <Home size={48} className="text-slate-600 mb-4" />
                    <p className="text-slate-400 text-center px-4">Top Inmuebles más visitados de la web<br/>Próximamente</p>
                  </div>
                </div>
              </div>
            )}

            {/* 2. CALENDARIO */}
            {activeTab === 'calendar' && (
              <div className="bg-[#1E293B] p-6 rounded-2xl border border-white/5 min-h-[500px] flex flex-col items-center justify-center">
                <CalendarIcon size={64} className="text-[#FBBF24] mb-4 opacity-50" />
                <h2 className="text-2xl font-bold text-white mb-2">Gestor de Citas</h2>
                <p className="text-slate-400 max-w-md text-center">Aquí integraremos un calendario visual (tipo Google Calendar) para gestionar visitas a inmuebles y reuniones con clientes agendadas por ti o por la IA.</p>
              </div>
            )}

            {/* 3. INMUEBLES */}
            {activeTab === 'properties' && (
              <div className="bg-[#1E293B] p-6 rounded-2xl border border-white/5 min-h-[500px]">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold text-white">Catálogo de Inmuebles</h2>
                  <button className="bg-[#FBBF24] text-[#2C3E50] px-4 py-2 rounded-xl font-bold transition-transform hover:scale-105">Añadir Inmueble</button>
                </div>
                <div className="flex items-center justify-center h-64 border-2 border-dashed border-white/10 rounded-xl">
                  <p className="text-slate-400 text-center max-w-md">Lista de inmuebles. Desde aquí podrás subir, editar o eliminar propiedades. También podrás seleccionar grupos de compradores y hacer envíos de anuncios por WhatsApp.</p>
                </div>
              </div>
            )}

            {/* 4. PEDIDOS (COMPRADORES) */}
            {activeTab === 'buyers' && (
              <div className="bg-[#1E293B] p-6 rounded-2xl border border-white/5 min-h-[500px]">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold text-white">Leads de Compradores (Pedidos)</h2>
                  <div className="flex gap-2">
                    <input type="text" placeholder="Buscar comprador..." className="bg-[#0F172A] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none" />
                    <button className="bg-white/5 p-2 rounded-lg text-slate-300 hover:bg-white/10 transition-colors"><Filter size={20}/></button>
                  </div>
                </div>
                <div className="flex items-center justify-center h-64 border-2 border-dashed border-white/10 rounded-xl">
                  <p className="text-slate-400 text-center max-w-md">Base de datos de compradores.<br/><br/>Incluirá información de zonas, hipoteca preconcedida, historial de interacciones y resúmenes diarios redactados por la IA.</p>
                </div>
              </div>
            )}

            {/* 5. ENCARGOS (VENDEDORES EXCLUSIVOS) */}
            {activeTab === 'sellers' && (
               <div className="bg-[#1E293B] p-6 rounded-2xl border border-white/5 min-h-[500px]">
               <div className="flex justify-between items-center mb-6">
                 <h2 className="text-xl font-bold text-white">Encargos Activos (Exclusivas)</h2>
                 <button className="bg-[#FBBF24] text-[#2C3E50] px-4 py-2 rounded-xl font-bold transition-transform hover:scale-105">Nuevo Encargo</button>
               </div>
               <div className="flex items-center justify-center h-64 border-2 border-dashed border-white/10 rounded-xl">
                 <p className="text-slate-400 text-center max-w-md">Seguimiento de propiedades en exclusiva.<br/><br/>Podrás añadir notas sobre las visitas, ver cruces con compradores (Pedidos), registrar propuestas económicas y generar documentos automáticos por fases.</p>
               </div>
             </div>
            )}

            {/* 6. VENDEDORES (WARM LEADS) */}
            {activeTab === 'warm_sellers' && (
              <div className="bg-[#1E293B] rounded-2xl border border-white/5 overflow-hidden">
                <div className="p-6 border-b border-white/5 flex justify-between items-center">
                  <div>
                    <h2 className="text-xl font-bold text-white">Posibles Vendedores (Leads de Valoración y Contacto)</h2>
                    <p className="text-sm text-slate-400 mt-1">Personas que han usado las calculadoras o rellenado formularios generales.</p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-white/5 text-xs uppercase tracking-wider text-slate-400">
                      <tr>
                        <th className="px-6 py-4">Nombre</th>
                        <th className="px-6 py-4">Contacto</th>
                        <th className="px-6 py-4">Origen</th>
                        <th className="px-6 py-4">Fecha</th>
                        <th className="px-6 py-4">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {leads.map((lead) => (
                        <tr key={lead.id} className="hover:bg-white/5 transition-colors">
                          <td className="px-6 py-4 font-bold text-white">{lead.name}</td>
                          <td className="px-6 py-4">
                            <p className="text-sm">{lead.phone}</p>
                            <p className="text-xs text-slate-500">{lead.email}</p>
                          </td>
                          <td className="px-6 py-4">
                            <span className="px-2 py-1 bg-blue-500/10 text-blue-400 rounded text-[10px] font-bold uppercase">
                              {lead.source || 'Formulario Web'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-500">
                            {new Date(lead.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 flex gap-2">
                            <a 
                              href={`https://wa.me/34${lead.phone?.replace(/\D/g, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#25D366] hover:underline text-sm font-bold flex items-center gap-1"
                            >
                              WhatsApp
                            </a>
                          </td>
                        </tr>
                      ))}
                      {leads.length === 0 && (
                        <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">No hay vendedores registrados aún.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 7. LIVE CHAT */}
            {activeTab === 'chat' && (
              <div className="bg-[#1E293B] p-6 rounded-2xl border border-white/5 min-h-[500px] flex flex-col items-center justify-center">
                <MessageCircle size={64} className="text-purple-400 mb-4 opacity-50" />
                <h2 className="text-2xl font-bold text-white mb-2">Intervención de IA / Live Chat</h2>
                <p className="text-slate-400 max-w-md text-center">Aquí conectaremos el sistema de N8N. Podrás ver en tiempo real las conversaciones del Bot de WhatsApp con clientes y tomar el control manual si es necesario.</p>
              </div>
            )}

            {/* 8. RESEÑAS */}
            {activeTab === 'reviews' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold text-white">Gestión de Reseñas</h2>
                </div>
                {reviews.map((review) => (
                  <div key={review.id} className="bg-[#1E293B] p-6 rounded-2xl border border-white/5 flex flex-col sm:flex-row gap-6">
                    <div className="flex-grow">
                      <div className="flex items-center gap-4 mb-2">
                        <h3 className="font-bold text-white">{review.client_name}</h3>
                        <div className="flex gap-1">
                          {Array.from({ length: review.rating }).map((_, i) => (
                            <div key={i} className="text-[#FBBF24] text-xs">★</div>
                          ))}
                        </div>
                      </div>
                      <p className="text-slate-400 italic">"{review.comment}"</p>
                      <p className="text-[10px] text-slate-600 mt-4">{new Date(review.created_at).toLocaleString()}</p>
                    </div>
                    <div className="flex flex-col gap-2 justify-center shrink-0">
                      <button 
                        onClick={() => toggleReviewStatus(review.id, review.is_published)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${review.is_published ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-[#FBBF24]/10 text-[#FBBF24] border border-[#FBBF24]/20'}`}
                      >
                        {review.is_published ? <CheckCircle size={14} /> : <Clock size={14} />}
                        {review.is_published ? 'Ocultar Reseña' : 'Publicar en Web'}
                      </button>
                      <button 
                        onClick={() => deleteReview(review.id)}
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all flex items-center justify-center gap-2"
                      >
                        <XCircle size={14} /> Eliminar
                      </button>
                    </div>
                  </div>
                ))}
                {reviews.length === 0 && (
                  <div className="bg-[#1E293B] p-8 text-center rounded-2xl border border-white/5 text-slate-400">
                    No hay reseñas todavía.
                  </div>
                )}
              </div>
            )}

            {/* 9. BLOG */}
            {activeTab === 'blog' && (
              <div className="bg-[#1E293B] p-6 rounded-2xl border border-white/5 min-h-[500px]">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold text-white">Gestor de Artículos (Blog)</h2>
                  <button className="bg-[#FBBF24] text-[#2C3E50] px-4 py-2 rounded-xl font-bold transition-transform hover:scale-105">Nuevo Artículo</button>
                </div>
                <div className="flex items-center justify-center h-64 border-2 border-dashed border-white/10 rounded-xl">
                  <p className="text-slate-400 text-center max-w-md">Lista de entradas del blog.<br/><br/>Podrás crear, editar y subir artículos para mejorar el posicionamiento orgánico (SEO) y aportar valor.</p>
                </div>
              </div>
            )}

            {/* 10. MAPA DE CALOR */}
            {activeTab === 'heatmap' && (
              <div className="bg-[#1E293B] p-6 rounded-2xl border border-white/5 min-h-[500px] flex flex-col items-center justify-center">
                <Activity size={64} className="text-red-400 mb-4 opacity-50" />
                <h2 className="text-2xl font-bold text-white mb-2">Mapa de Calor y Analíticas</h2>
                <p className="text-slate-400 max-w-md text-center">Aquí incrustaremos el panel visual para monitorizar el comportamiento de los usuarios en la web (dónde hacen clic, cuánto tiempo se quedan, etc.).</p>
              </div>
            )}

          </div>
        )}
      </main>
    </div>
  );
}
