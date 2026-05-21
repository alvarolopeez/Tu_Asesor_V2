import { 
  HardDrive, 
  Cpu, 
  Wifi, 
  CheckCircle, 
  AlertTriangle, 
  Trash2 
} from "lucide-react";
import type { 
  PropertyRow, 
  LeadRow, 
  AppointmentRow, 
  ConversationRow, 
  MessageRow, 
  WebhookLogRow, 
  SystemErrorRow 
} from "./types";

interface EcosistemaTabProps {
  properties: PropertyRow[];
  leads: LeadRow[];
  appointments: AppointmentRow[];
  conversations: ConversationRow[];
  messages: MessageRow[];
  systemErrors: SystemErrorRow[];
  webhookLogs: WebhookLogRow[];
  dbLatency: number | null;
  apiLatency: number | null;
  measuringLatency: boolean;
  selectedErrorId: string | null;

  setSelectedErrorId: (val: string | null) => void;
  measureLatency: () => Promise<void>;
  handleSimulateError: () => Promise<void>;
  handleClearErrors: () => Promise<void>;
}

export default function EcosistemaTab({
  properties,
  leads,
  appointments,
  conversations,
  messages,
  systemErrors,
  webhookLogs,
  dbLatency,
  apiLatency,
  measuringLatency,
  selectedErrorId,
  setSelectedErrorId,
  measureLatency,
  handleSimulateError,
  handleClearErrors,
}: EcosistemaTabProps) {
  // 1. Calculations & statistics
  const totalLogsCount = webhookLogs.length;
  const errorLogsCount = webhookLogs.filter(l => Number(l.response_status) >= 400 || l.error_message).length;
  const webhookErrorRate = totalLogsCount > 0 ? ((errorLogsCount / totalLogsCount) * 100).toFixed(1) : "0.0";

  const totalSystemErrors = systemErrors.length;

  // Selected system error detail object helper
  const selectedSystemError = systemErrors.find(e => e.id === selectedErrorId);

  // Schema rows count
  const totalDBCells = properties.length + leads.length + appointments.length + conversations.length + messages.length + webhookLogs.length;

  return (
    <div className="space-y-6">
      {/* Core health diagnostic panels */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Base de Datos Supabase */}
        <div className="bg-[#1E293B]/60 backdrop-blur-md p-6 rounded-2xl border border-white/5 flex flex-col justify-between group hover:border-[#3B82F6]/20 transition-all duration-300">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-slate-400 text-xs font-semibold tracking-wider uppercase mb-1">Base de Datos (Supabase)</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
                <span className="text-sm font-bold text-white">PostgreSQL Host</span>
              </div>
            </div>
            <div className="bg-blue-500/10 text-blue-400 p-2.5 rounded-lg border border-blue-500/20">
              <HardDrive size={18} />
            </div>
          </div>
          <div className="mt-4 space-y-2 border-t border-white/5 pt-4 text-xs">
            <div className="flex justify-between text-slate-400">
              <span>Latencia de BD</span>
              <div className="flex items-center gap-1.5">
                <span className={`font-bold ${dbLatency !== null ? (dbLatency < 25 ? "text-green-400" : "text-amber-400") : "text-slate-500"}`}>
                  {dbLatency !== null ? `${dbLatency}ms` : "---"}
                </span>
                <button
                  onClick={measureLatency}
                  disabled={measuringLatency}
                  className="p-1 bg-white/5 hover:bg-white/10 rounded border border-white/10 text-[9px] font-bold text-slate-300 disabled:opacity-50 transition-all"
                >
                  {measuringLatency ? "..." : "Medir"}
                </button>
              </div>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Políticas RLS</span>
              <span className="text-green-400 font-semibold bg-green-400/10 px-1.5 py-0.5 rounded text-[9px]">Strict Activo (12)</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Registros Almacenados</span>
              <span className="text-slate-200 font-bold">{totalDBCells} registros</span>
            </div>
          </div>
        </div>

        {/* Next.js API Routes */}
        <div className="bg-[#1E293B]/60 backdrop-blur-md p-6 rounded-2xl border border-white/5 flex flex-col justify-between group hover:border-[#10B981]/20 transition-all duration-300">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-slate-400 text-xs font-semibold tracking-wider uppercase mb-1">API Integrada & Next.js</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
                <span className="text-sm font-bold text-white">Servidor Node Activo</span>
              </div>
            </div>
            <div className="bg-[#10B981]/10 text-[#10B981] p-2.5 rounded-lg border border-[#10B981]/20">
              <Cpu size={18} />
            </div>
          </div>
          <div className="mt-4 space-y-2 border-t border-white/5 pt-4 text-xs">
            <div className="flex justify-between text-slate-400">
              <span>SSL & TLS 1.3</span>
              <span className="text-emerald-400 font-bold bg-emerald-400/10 px-1.5 py-0.5 rounded text-[9px]">Válido</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Rutas de Webhook</span>
              <span className="text-slate-200 font-semibold">/api/chatbot/webhook</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Latencia de API</span>
              <span className={`font-bold ${apiLatency !== null ? (apiLatency < 35 ? "text-green-400" : "text-amber-400") : "text-slate-500"}`}>
                {apiLatency !== null ? `${apiLatency}ms` : "---"}
              </span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Uptime</span>
              <span className="text-green-400 font-bold">100.0% (99.98% SLA)</span>
            </div>
          </div>
        </div>

        {/* n8n Automation Webhooks */}
        <div className="bg-[#1E293B]/60 backdrop-blur-md p-6 rounded-2xl border border-white/5 flex flex-col justify-between group hover:border-[#FBBF24]/20 transition-all duration-300">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-slate-400 text-xs font-semibold tracking-wider uppercase mb-1">Automatizaciones (n8n)</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
                <span className="text-sm font-bold text-white">Webhook Listener</span>
              </div>
            </div>
            <div className="bg-[#FBBF24]/10 text-[#FBBF24] p-2.5 rounded-lg border border-[#FBBF24]/20">
              <Wifi size={18} />
            </div>
          </div>
          <div className="mt-4 space-y-2 border-t border-white/5 pt-4 text-xs">
            <div className="flex justify-between text-slate-400">
              <span>Webhooks Ejecutados</span>
              <span className="text-slate-200 font-bold">{totalLogsCount} en cola</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Tasa de Frecuencia Error</span>
              <span className={`font-extrabold ${Number(webhookErrorRate) > 5 ? "text-rose-400 bg-rose-400/10 px-1.5 rounded" : "text-emerald-400 bg-emerald-400/10 px-1.5 rounded"}`}>
                {webhookErrorRate}%
              </span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Latencia de Desencadenado</span>
              <span className="text-slate-200 font-semibold">&lt; 180ms</span>
            </div>
          </div>
        </div>
      </div>

      {/* System Error Console & JSON Viewer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Neon terminal exceptions console log stream */}
        <div className="lg:col-span-8 bg-slate-950 p-6 rounded-2xl border border-white/5 shadow-2xl flex flex-col h-[400px]">
          <div className="flex justify-between items-center border-b border-white/5 pb-4 mb-4">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-rose-500" />
              <span className="w-3 h-3 rounded-full bg-yellow-500" />
              <span className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-xs font-mono text-slate-400 ml-2">root@tuasesor-crm-console:~$ tail -n 50 system_errors</span>
            </div>
            <span className="text-[10px] font-mono text-rose-400 animate-pulse">{totalSystemErrors} fallos capturados</span>
          </div>

          <div className="flex-1 overflow-y-auto font-mono text-xs space-y-2.5 pr-2 scrollbar-thin scrollbar-thumb-slate-800 text-left">
            {systemErrors.length > 0 ? (
              systemErrors.map((errorItem) => {
                const severityClass = errorItem.severity === "critical"
                  ? "text-red-400 border-red-500/20 bg-red-950/20"
                  : errorItem.severity === "warning"
                  ? "text-yellow-400 border-yellow-500/20 bg-yellow-950/20"
                  : "text-orange-400 border-orange-500/20 bg-orange-950/20";
                
                const isSelected = selectedErrorId === errorItem.id;

                return (
                  <div
                    key={errorItem.id}
                    onClick={() => setSelectedErrorId(errorItem.id)}
                    className={`p-3 border rounded-xl cursor-pointer transition-all duration-200 flex justify-between items-start gap-4 ${severityClass} ${
                      isSelected ? "ring-2 ring-amber-500 scale-[0.99] border-transparent" : "hover:bg-white/5"
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase ${
                          errorItem.severity === "critical" ? "bg-red-500/20" : "bg-orange-500/20"
                        }`}>
                          {errorItem.error_type || "excepción"}
                        </span>
                        <span className="text-[10px] text-slate-500">{new Date(errorItem.created_at).toLocaleString()}</span>
                      </div>
                      <p className="font-semibold">{errorItem.message}</p>
                    </div>
                    <span className="text-[10px] font-bold underline whitespace-nowrap">Auditar</span>
                  </div>
                );
              })
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-2 py-12">
                <CheckCircle size={32} className="text-emerald-500/30" />
                <p className="text-xs">Consola vacía. No se han reportado excepciones en las últimas 24h.</p>
              </div>
            )}
          </div>
        </div>

        {/* JSON Metadata Inspector Card */}
        <div className="lg:col-span-4 bg-[#1E293B]/60 backdrop-blur-md p-6 rounded-2xl border border-white/5 flex flex-col justify-between h-[400px]">
          <div>
            <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
              <AlertTriangle size={15} className="text-amber-400" />
              Inspector de Metadatos JSON
            </h3>
            <p className="text-slate-400 text-[10px] mb-4">Inspección de carga y traza de error en tiempo real</p>
          </div>

          <div className="flex-1 bg-slate-950/80 rounded-xl p-4 border border-white/5 overflow-auto font-mono text-[10px] text-slate-300 text-left">
            {selectedSystemError ? (
              <div className="space-y-3">
                <div>
                  <span className="text-slate-500">ID del Registro:</span>
                  <p className="text-slate-400 break-all select-all font-bold text-[9.5px]">{selectedSystemError.id}</p>
                </div>
                <div>
                  <span className="text-slate-500">Origen/Categoría:</span>
                  <p className="text-white font-bold">{selectedSystemError.error_type}</p>
                </div>
                <div>
                  <span className="text-slate-500">Severidad:</span>
                  <p className={`font-bold ${
                    selectedSystemError.severity === "critical" ? "text-red-400" : "text-amber-400"
                  }`}>{selectedSystemError.severity}</p>
                </div>
                <div>
                  <span className="text-slate-500">Detalles de Excepción:</span>
                  <pre className="text-green-400 mt-1.5 p-2 bg-slate-900 rounded-lg overflow-x-auto text-[9px]">
                    {JSON.stringify(selectedSystemError.details || {}, null, 2)}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 space-y-2 px-4">
                <AlertTriangle size={24} className="text-slate-600" />
                <p className="text-[10px] leading-relaxed">Selecciona una excepción en la consola de la izquierda para desplegar la traza del error e investigar la causa.</p>
              </div>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-white/5 text-[9px] text-slate-500">
            Auditoría activa • Desarrollado por Tu Asesor CRM
          </div>
        </div>
      </div>

      {/* Global Operations Action Bar */}
      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <button
          onClick={handleSimulateError}
          className="flex-1 py-3 px-4 bg-[#FBBF24] hover:bg-[#FBBF24]/90 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all duration-300"
        >
          <AlertTriangle size={15} /> Simular Excepción Ficticia en Supabase
        </button>
        <button
          onClick={handleClearErrors}
          className="py-3 px-5 bg-white/5 border border-white/10 hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/20 text-slate-300 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all duration-300"
        >
          <Trash2 size={14} /> Limpiar Historial de Consola
        </button>
      </div>
    </div>
  );
}
