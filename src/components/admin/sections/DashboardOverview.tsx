import { Eye, FileText, DollarSign, MessageCircle, TrendingUp, Activity, Home } from "lucide-react";

export default function DashboardOverview() {
  return (
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
  );
}
