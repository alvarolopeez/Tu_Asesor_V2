import { Filter } from "lucide-react";

export default function BuyersManager() {
  return (
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
  );
}
