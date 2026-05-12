export default function SellersManager() {
  return (
    <div className="bg-[#1E293B] p-6 rounded-2xl border border-white/5 min-h-[500px]">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-white">Encargos Activos (Exclusivas)</h2>
        <button className="bg-[#FBBF24] text-[#2C3E50] px-4 py-2 rounded-xl font-bold transition-transform hover:scale-105">Nuevo Encargo</button>
      </div>
      <div className="flex items-center justify-center h-64 border-2 border-dashed border-white/10 rounded-xl">
        <p className="text-slate-400 text-center max-w-md">Seguimiento de propiedades en exclusiva.<br/><br/>Podrás añadir notas sobre las visitas, ver cruces con compradores (Pedidos), registrar propuestas económicas y generar documentos automáticos por fases.</p>
      </div>
    </div>
  );
}
