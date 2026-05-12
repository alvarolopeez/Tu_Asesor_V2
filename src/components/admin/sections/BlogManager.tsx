export default function BlogManager() {
  return (
    <div className="bg-[#1E293B] p-6 rounded-2xl border border-white/5 min-h-[500px]">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-white">Gestor de Artículos (Blog)</h2>
        <button className="bg-[#FBBF24] text-[#2C3E50] px-4 py-2 rounded-xl font-bold transition-transform hover:scale-105">Nuevo Artículo</button>
      </div>
      <div className="flex items-center justify-center h-64 border-2 border-dashed border-white/10 rounded-xl">
        <p className="text-slate-400 text-center max-w-md">Lista de entradas del blog.<br/><br/>Podrás crear, editar y subir artículos para mejorar el posicionamiento orgánico (SEO) y aportar valor.</p>
      </div>
    </div>
  );
}
