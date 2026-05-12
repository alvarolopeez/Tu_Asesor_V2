import { Lead } from "@/types";

interface WarmLeadsManagerProps {
  leads: Lead[];
}

export default function WarmLeadsManager({ leads }: WarmLeadsManagerProps) {
  return (
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
  );
}
