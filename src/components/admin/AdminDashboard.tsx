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
  Lock
} from "lucide-react";

export default function AdminDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  const [activeTab, setActiveTab] = useState<'leads' | 'reviews' | 'tools'>('leads');
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

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-200 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-[#1E293B] border-r border-white/5 flex flex-col">
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

        <nav className="flex-grow p-4 space-y-2">
          <button 
            onClick={() => setActiveTab('leads')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'leads' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'hover:bg-white/5 text-slate-400'}`}
          >
            <Users size={20} /> Leads
          </button>
          <button 
            onClick={() => setActiveTab('tools')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'tools' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'hover:bg-white/5 text-slate-400'}`}
          >
            <Calculator size={20} /> Herramientas
          </button>
          <button 
            onClick={() => setActiveTab('reviews')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'reviews' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'hover:bg-white/5 text-slate-400'}`}
          >
            <MessageSquare size={20} /> Reseñas
          </button>
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
            <h1 className="text-3xl font-bold text-white capitalize">{activeTab === 'tools' ? 'Peticiones de Herramientas' : activeTab}</h1>
            <p className="text-slate-400">Gestiona los datos capturados de la web.</p>
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
            
            {activeTab === 'leads' && (
              <div className="bg-[#1E293B] rounded-2xl border border-white/5 overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-white/5 text-xs uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="px-6 py-4">Nombre</th>
                      <th className="px-6 py-4">Contacto</th>
                      <th className="px-6 py-4">Origen</th>
                      <th className="px-6 py-4">Tipo</th>
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
                            {lead.source}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm capitalize">{lead.type}</td>
                        <td className="px-6 py-4 text-xs text-slate-500">
                          {new Date(lead.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 flex gap-2">
                          <a 
                            href={`https://wa.me/34${lead.phone.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#25D366] hover:underline text-sm font-bold flex items-center gap-1"
                          >
                            WhatsApp <ExternalLink size={14} />
                          </a>
                          <a 
                            href={`tel:${lead.phone.replace(/\D/g, '')}`}
                            className="text-[#FBBF24] hover:underline text-sm font-bold flex items-center gap-1"
                          >
                            Llamar
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'tools' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {calculations.map((calc) => (
                  <div key={calc.id} className="bg-[#1E293B] p-6 rounded-2xl border border-white/5 space-y-4">
                    <div className="flex justify-between items-start">
                      <div className="bg-blue-600 p-2 rounded-lg">
                        <Calculator size={20} className="text-white" />
                      </div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        {new Date(calc.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-lg">{calc.leads?.name || 'Cliente Anónimo'}</h3>
                      <p className="text-blue-400 text-sm font-medium">{calc.leads?.phone}</p>
                    </div>
                    <div className="py-3 border-y border-white/5">
                      <p className="text-xs text-slate-500 uppercase mb-2">Herramienta: <span className="text-white">{calc.tool_type}</span></p>
                      <div className="space-y-1">
                        {calc.tool_type === 'plusvalia' ? (
                          <>
                            <p className="text-sm">Venta: <span className="text-white font-bold">{calc.inputs.valorVenta}€</span></p>
                            <p className="text-sm text-green-400">Cuota: {calc.results.cuotaFinal.toFixed(2)}€</p>
                          </>
                        ) : (
                          <>
                            <p className="text-sm">Precio: <span className="text-white font-bold">{calc.inputs.precioCompra}€</span></p>
                            <p className="text-sm text-[#FBBF24]">ROE: {calc.results.roe.toFixed(2)}%</p>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button className="w-full py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2">
                        <Eye size={14} /> Informe
                      </button>
                      {calc.leads?.phone && (
                        <a 
                          href={`https://wa.me/34${calc.leads.phone.replace(/\D/g, '')}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="w-full py-2 bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2"
                        >
                           WhatsApp
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'reviews' && (
              <div className="space-y-4">
                {reviews.map((review) => (
                  <div key={review.id} className="bg-[#1E293B] p-6 rounded-2xl border border-white/5 flex gap-6">
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
                    <div className="flex flex-col gap-2 justify-center">
                      <button 
                        onClick={() => toggleReviewStatus(review.id, review.is_published)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${review.is_published ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-[#FBBF24]/10 text-[#FBBF24] border border-[#FBBF24]/20'}`}
                      >
                        {review.is_published ? <CheckCircle size={14} /> : <Clock size={14} />}
                        {review.is_published ? 'Publicada' : 'Pendiente'}
                      </button>
                      <button 
                        onClick={() => deleteReview(review.id)}
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all flex items-center gap-2"
                      >
                        <XCircle size={14} /> Eliminar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>
        )}
      </main>
    </div>
  );
}
