import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Eye, FileText, DollarSign, MessageCircle, TrendingUp, Activity, Home, Bot, AlertTriangle, CheckCircle, BarChart3 } from "lucide-react";

export default function DashboardOverview() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    active: 0,
    escalated: 0,
    closed: 0,
    messagesToday: 0,
    messagesWeek: 0,
    topIntents: [] as { intent: string, count: number }[]
  });

  useEffect(() => {
    fetchAIStats();
  }, []);

  const fetchAIStats = async () => {
    try {
      // 1. Fetch conversations
      const { data: convData } = await supabase
        .from('chatbot_conversations')
        .select('status');
      
      let active = 0, escalated = 0, closed = 0;
      if (convData) {
        convData.forEach(c => {
          if (c.status === 'active') active++;
          else if (c.status === 'escalated') escalated++;
          else if (c.status === 'closed') closed++;
        });
      }

      // 2. Fetch messages for timeframe
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      const { data: msgData } = await supabase
        .from('chatbot_messages')
        .select('created_at, intent_detected')
        .gte('created_at', weekAgo.toISOString());

      let msgsToday = 0;
      let msgsWeek = 0;
      const intentCounts: Record<string, number> = {};

      if (msgData) {
        msgData.forEach(m => {
          msgsWeek++;
          if (new Date(m.created_at) >= today) {
            msgsToday++;
          }
          if (m.intent_detected) {
            intentCounts[m.intent_detected] = (intentCounts[m.intent_detected] || 0) + 1;
          }
        });
      }

      const topIntents = Object.entries(intentCounts)
        .map(([intent, count]) => ({ intent, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      setStats({
        active,
        escalated,
        closed,
        messagesToday: msgsToday,
        messagesWeek: msgsWeek,
        topIntents
      });
    } catch (error) {
      console.error("Error fetching AI stats:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Kpis estáticos web - Opcional, pero los mantenemos para no romper la vista anterior */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
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
          <h3 className="text-3xl font-bold text-white mt-1">
            {loading ? "..." : stats.active}
          </h3>
        </div>
      </div>

      {/* DASHBOARD IA */}
      <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2 mt-12">
        <Bot size={24} className="text-[#FBBF24]" /> 
        Rendimiento Inteligencia Artificial
      </h2>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* KPI Conversaciones */}
        <div className="bg-[#1E293B] p-6 rounded-2xl border border-white/5">
          <h3 className="text-slate-400 font-medium mb-6">Estado de Conversaciones</h3>
          
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="flex items-center gap-2 text-slate-300">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div> Activas
              </span>
              <span className="text-white font-bold">{loading ? "-" : stats.active}</span>
            </div>
            <div className="w-full bg-white/5 rounded-full h-1.5">
              <div className="bg-green-400 h-1.5 rounded-full" style={{ width: `${stats.active + stats.escalated + stats.closed > 0 ? (stats.active / (stats.active + stats.escalated + stats.closed)) * 100 : 0}%` }}></div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <span className="flex items-center gap-2 text-slate-300">
                <AlertTriangle size={14} className="text-red-400" /> Escaladas
              </span>
              <span className="text-red-400 font-bold">{loading ? "-" : stats.escalated}</span>
            </div>
            <div className="w-full bg-white/5 rounded-full h-1.5">
              <div className="bg-red-400 h-1.5 rounded-full" style={{ width: `${stats.active + stats.escalated + stats.closed > 0 ? (stats.escalated / (stats.active + stats.escalated + stats.closed)) * 100 : 0}%` }}></div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <span className="flex items-center gap-2 text-slate-300">
                <CheckCircle size={14} className="text-slate-500" /> Cerradas
              </span>
              <span className="text-white font-bold">{loading ? "-" : stats.closed}</span>
            </div>
            <div className="w-full bg-white/5 rounded-full h-1.5">
              <div className="bg-slate-500 h-1.5 rounded-full" style={{ width: `${stats.active + stats.escalated + stats.closed > 0 ? (stats.closed / (stats.active + stats.escalated + stats.closed)) * 100 : 0}%` }}></div>
            </div>
          </div>
        </div>

        {/* Mensajes Procesados */}
        <div className="bg-[#1E293B] p-6 rounded-2xl border border-white/5 flex flex-col justify-between">
          <h3 className="text-slate-400 font-medium mb-4">Volumen de Mensajes</h3>
          
          <div className="grid grid-cols-2 gap-4 flex-1">
            <div className="bg-[#0F172A] p-4 rounded-xl flex flex-col justify-center items-center text-center border border-white/5">
              <p className="text-slate-400 text-sm mb-1">Hoy</p>
              <h4 className="text-3xl font-bold text-white">{loading ? "-" : stats.messagesToday}</h4>
              <p className="text-xs text-green-400 mt-2 flex items-center gap-1"><TrendingUp size={12} /> procesados</p>
            </div>
            <div className="bg-[#0F172A] p-4 rounded-xl flex flex-col justify-center items-center text-center border border-white/5">
              <p className="text-slate-400 text-sm mb-1">Últimos 7 días</p>
              <h4 className="text-3xl font-bold text-white">{loading ? "-" : stats.messagesWeek}</h4>
              <p className="text-xs text-[#FBBF24] mt-2 flex items-center gap-1"><BarChart3 size={12} /> total</p>
            </div>
          </div>
        </div>

        {/* Intenciones Frecuentes */}
        <div className="bg-[#1E293B] p-6 rounded-2xl border border-white/5">
          <h3 className="text-slate-400 font-medium mb-4">Top Intenciones Detectadas</h3>
          
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-[#FBBF24]"></div>
            </div>
          ) : stats.topIntents.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">No hay datos suficientes</p>
          ) : (
            <div className="space-y-3">
              {stats.topIntents.map((intent, idx) => (
                <div key={idx} className="flex justify-between items-center p-2.5 bg-[#0F172A] rounded-lg border border-white/5">
                  <span className="text-sm text-white capitalize">{intent.intent.replace(/_/g, ' ')}</span>
                  <span className="text-xs font-bold px-2 py-1 bg-white/10 rounded-md text-[#FBBF24]">
                    {intent.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
