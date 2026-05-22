import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { N8nWebhookLog } from "@/types";
import { Server, Filter, ChevronDown, ChevronUp, AlertCircle, CheckCircle2 } from "lucide-react";

export default function WebhooksManager() {
  const [logs, setLogs] = useState<N8nWebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSource, setFilterSource] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  
  // Server-side pagination states
  const [page, setPage] = useState<number>(0);
  const [totalCount, setTotalCount] = useState<number>(0);
  const limit = 20;

  useEffect(() => {
    fetchLogs(page, filterSource);
  }, [page, filterSource]);

  const fetchLogs = async (currentPage: number, currentSource: string) => {
    setLoading(true);
    try {
      let query = supabase
        .from('n8n_webhook_logs')
        .select('*', { count: 'exact' });

      if (currentSource !== "all") {
        query = query.eq('source', currentSource);
      }

      const from = currentPage * limit;
      const to = from + limit - 1;

      const { data, error, count } = await query
        .order('processed_at', { ascending: false })
        .range(from, to);
      
      if (error) throw error;
      if (data) {
        setLogs(data as N8nWebhookLog[]);
        if (count !== null) {
          setTotalCount(count);
        }
      }
    } catch (error) {
      console.error("Error fetching webhook logs:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSourceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilterSource(e.target.value);
    setPage(0);
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#1E293B] p-4 rounded-xl border border-white/5">
        <div className="flex items-center gap-2 text-slate-300">
          <Filter size={20} className="text-[#FBBF24]" />
          <span className="font-medium">Filtros:</span>
        </div>
        
        <div className="flex gap-2 w-full md:w-auto">
          <select 
            value={filterSource}
            onChange={handleSourceChange}
            className="bg-[#0F172A] border border-white/10 text-white text-sm rounded-lg focus:ring-[#FBBF24] focus:border-[#FBBF24] block p-2.5"
          >
            <option value="all">Todas las fuentes</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="n8n">N8N</option>
            <option value="chatwoot">Chatwoot</option>
            <option value="web">Web</option>
          </select>
        </div>
      </div>

      <div className="bg-[#1E293B] rounded-2xl border border-white/5 overflow-hidden">
        {loading ? (
          <div className="p-8 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#FBBF24]"></div>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Server size={48} className="mx-auto mb-4 opacity-20" />
            <p>No se encontraron logs de webhooks.</p>
          </div>
        ) : (
          <div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-[#0F172A]/50 text-xs uppercase text-slate-400">
                  <tr>
                    <th className="px-6 py-4 rounded-tl-2xl">Fecha</th>
                    <th className="px-6 py-4">Nombre</th>
                    <th className="px-6 py-4">Fuente</th>
                    <th className="px-6 py-4">Estado</th>
                    <th className="px-6 py-4 rounded-tr-2xl text-right">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {logs.map((log) => {
                    const isError = log.response_status && log.response_status >= 400;
                    const isExpanded = expandedId === log.id;
                    
                    return (
                      <React.Fragment key={log.id}>
                        <tr className={`hover:bg-white/5 transition-colors ${isExpanded ? 'bg-white/5' : ''}`}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {new Date(log.processed_at).toLocaleString('es-ES', { 
                              day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' 
                            })}
                          </td>
                          <td className="px-6 py-4 font-medium text-white">{log.webhook_name}</td>
                          <td className="px-6 py-4">
                            <span className="px-2.5 py-1 bg-white/10 rounded-full text-xs font-medium">
                              {log.source}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {isError ? (
                              <span className="flex items-center gap-1.5 text-red-400">
                                <AlertCircle size={16} /> {log.response_status || 'Error'}
                              </span>
                            ) : (
                              <span className="flex items-center gap-1.5 text-green-400">
                                <CheckCircle2 size={16} /> {log.response_status || 'OK'}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button 
                              onClick={() => toggleExpand(log.id)}
                              className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
                            >
                              {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-black/20">
                            <td colSpan={5} className="px-6 py-6">
                              <div className="grid grid-cols-1 gap-4">
                                {log.error_message && (
                                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
                                    <strong>Error:</strong> {log.error_message}
                                  </div>
                                )}
                                <div>
                                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Payload JSON</h4>
                                  <div className="bg-[#0F172A] p-4 rounded-xl border border-white/5 overflow-x-auto">
                                    <pre className="text-xs text-green-400/90 font-mono">
                                      {JSON.stringify(log.payload, null, 2)}
                                    </pre>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls Footer */}
            <div className="bg-[#0F172A]/40 border-t border-white/5 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <span className="text-xs text-slate-400">
                Mostrando <span className="font-bold text-white">{logs.length}</span> de{" "}
                <span className="font-bold text-white">{totalCount}</span> logs (Página{" "}
                <span className="font-bold text-[#FBBF24]">{page + 1}</span> de{" "}
                <span className="font-bold text-white">{totalPages}</span>)
              </span>
              
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(prev => Math.max(0, prev - 1))}
                  disabled={page === 0}
                  className="px-4 py-2 bg-slate-800 border border-white/10 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition-all disabled:opacity-30 disabled:pointer-events-none"
                >
                  Anterior
                </button>
                <button
                  onClick={() => setPage(prev => prev + 1)}
                  disabled={page + 1 >= totalPages}
                  className="px-4 py-2 bg-[#FBBF24] hover:bg-yellow-500 text-slate-950 font-bold rounded-xl text-xs transition-all disabled:opacity-30 disabled:pointer-events-none"
                >
                  Siguiente
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
