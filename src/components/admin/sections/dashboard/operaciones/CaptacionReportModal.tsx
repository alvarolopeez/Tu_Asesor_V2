import { Printer, FileText, Bot } from "lucide-react";
import type { PropertyRow, AppointmentRow, BuyerActivityLogRow, BuyerDemandRow } from "../types";
import type { SelectedMetrics } from "./operacionesUtils";

interface CaptacionReportModalProps {
  selectedProperty: PropertyRow;
  metrics: SelectedMetrics;
  platformAvgViews: number;
  platformAvgDays: number;
  appointments: AppointmentRow[];
  buyerActivityLogs: BuyerActivityLogRow[];
  buyersDemands: BuyerDemandRow[];
  onClose: () => void;
}

/** Vista previa imprimible (dossier PDF) del informe de captación de un inmueble. */
export default function CaptacionReportModal({
  selectedProperty,
  metrics,
  platformAvgViews,
  platformAvgDays,
  appointments,
  buyerActivityLogs,
  buyersDemands,
  onClose,
}: CaptacionReportModalProps) {
  const { selectedViews, selectedDays, selectedPrice, selectedValuation, valuationDiffPct, correlationRating } = metrics;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
      {/* Printable styled report container */}
      <div className="bg-[#1E293B] border border-white/10 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col justify-between max-h-[90vh]">
        {/* Header */}
        <div className="bg-slate-900 px-6 py-4 border-b border-white/10 flex justify-between items-center">
          <h4 className="text-white font-extrabold flex items-center gap-2">
            <FileText size={18} className="text-[#FBBF24]" />
            Vista Previa de Informe de Captación
          </h4>
          <div className="flex gap-2">
            <button
              onClick={() => {
                window.print();
              }}
              className="px-4 py-2 bg-[#FBBF24] hover:bg-[#FBBF24]/90 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all"
            >
              <Printer size={14} /> Imprimir Dossier
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition-all"
            >
              Cerrar
            </button>
          </div>
        </div>

        {/* Dossier Sheet */}
        <div className="p-8 space-y-6 overflow-y-auto text-slate-900 bg-white" id="printable-area">
          {/* Dossier Letterhead */}
          <div className="flex justify-between items-start border-b-2 border-[#FBBF24] pb-6">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-950">TU ASESOR INMOBILIARIO</h1>
              <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold mt-0.5">Dossier de Valoración Exclusivo</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500">Fecha de Emisión</p>
              <p className="text-sm font-bold text-slate-950">{new Date().toLocaleDateString()}</p>
            </div>
          </div>

          {/* Property Overview */}
          <div className="space-y-2">
            <span className="text-[10px] font-black text-[#FBBF24] uppercase tracking-widest bg-[#FBBF24]/10 px-2 py-0.5 rounded">Informe de Propiedad</span>
            <h2 className="text-xl font-bold text-slate-950">{selectedProperty.title}</h2>
            <p className="text-sm text-slate-600 leading-relaxed">{selectedProperty.description || "Sin descripción adicional de la propiedad."}</p>
          </div>

          {/* Core comparative table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 text-xs">
                <tr>
                  <th className="px-4 py-3">Métrica Analizada</th>
                  <th className="px-4 py-3 text-right">Inmueble</th>
                  <th className="px-4 py-3 text-right">Media de Zona/Plataforma</th>
                  <th className="px-4 py-3 text-right">Diferencial</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                <tr>
                  <td className="px-4 py-3 text-slate-600">Precio Publicado</td>
                  <td className="px-4 py-3 text-right text-slate-900 font-bold">{selectedPrice.toLocaleString()}€</td>
                  <td className="px-4 py-3 text-right text-slate-500">{(selectedValuation || selectedPrice).toLocaleString()}€</td>
                  <td className="px-4 py-3 text-right text-slate-900">
                    {valuationDiffPct > 0 ? "+" : ""}{valuationDiffPct.toFixed(1)}%
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-slate-600">Visitas Totales</td>
                  <td className="px-4 py-3 text-right text-slate-900 font-bold">{selectedViews} visitas</td>
                  <td className="px-4 py-3 text-right text-slate-500">{platformAvgViews} visitas</td>
                  <td className={`px-4 py-3 text-right font-bold ${selectedViews >= platformAvgViews ? "text-green-600" : "text-orange-600"}`}>
                    {selectedViews >= platformAvgViews ? "+" : ""}{((selectedViews / Math.max(1, platformAvgViews) - 1) * 100).toFixed(0)}%
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-slate-600">Días en Mercado</td>
                  <td className="px-4 py-3 text-right text-slate-900 font-bold">{selectedDays} días</td>
                  <td className="px-4 py-3 text-right text-slate-500">{platformAvgDays} días</td>
                  <td className={`px-4 py-3 text-right font-bold ${selectedDays <= platformAvgDays ? "text-green-600" : "text-orange-600"}`}>
                    {selectedDays - platformAvgDays > 0 ? "+" : ""}{selectedDays - platformAvgDays}d
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Buyer Feedback & System Activity */}
          <div className="space-y-3">
            <h3 className="text-xs font-black text-slate-950 uppercase tracking-widest border-b border-slate-200 pb-1 flex items-center gap-1.5">
              Feedback Real y Actividad de Compradores
            </h3>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                <p className="text-slate-500 font-semibold">Visitas Físicas Realizadas</p>
                <p className="text-base font-bold text-slate-950">
                  {appointments.filter(appt => appt.property_id === selectedProperty.id && appt.type === 'visita').length} visitas
                </p>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                <p className="text-slate-500 font-semibold">Comentarios / Interacciones</p>
                <p className="text-base font-bold text-slate-950">
                  {buyerActivityLogs.filter(act => act.property_id === selectedProperty.id).length} interacciones
                </p>
              </div>
            </div>

            {buyerActivityLogs.filter(act => act.property_id === selectedProperty.id).length > 0 ? (
              <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2">Fecha</th>
                      <th className="px-3 py-2">Comprador</th>
                      <th className="px-3 py-2">Tipo</th>
                      <th className="px-3 py-2">Notas y Comentarios de la Visita</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {buyerActivityLogs
                      .filter(act => act.property_id === selectedProperty.id)
                      .map(act => {
                        const buyer = buyersDemands.find(b => b.id === act.buyer_id);
                        const buyerName = buyer ? buyer.name : "Comprador Interesado";
                        return (
                          <tr key={act.id}>
                            <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                              {new Date(act.event_date).toLocaleDateString()}
                            </td>
                            <td className="px-3 py-2 text-slate-900 font-bold">
                              {buyerName}
                            </td>
                            <td className="px-3 py-2">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                act.event_type === 'oferta' ? 'bg-emerald-100 text-emerald-800' :
                                act.event_type === 'visita' ? 'bg-blue-100 text-blue-800' :
                                'bg-slate-100 text-slate-800'
                              }`}>
                                {act.event_type.toUpperCase()}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-slate-600 leading-normal">
                              {act.notes || act.title}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic bg-slate-50 p-3 rounded-lg border border-slate-100 text-center">
                No se han registrado comentarios ni feedback directo de compradores para esta propiedad aún.
              </p>
            )}
          </div>

          {/* AI Advisor opinion text */}
          <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
            <h4 className="text-xs font-black text-slate-950 uppercase tracking-widest mb-2 flex items-center gap-1">
              <Bot size={14} className="text-[#FBBF24]" />
              Opinión Consultora del Sistema IA
            </h4>
            <p className="text-xs text-slate-700 leading-relaxed">
              El inmueble se encuentra catalogado como <strong className="text-slate-950">{correlationRating}</strong> con una desviación de <strong>{valuationDiffPct.toFixed(1)}%</strong> respecto a la valoración media histórica de escrituración de la zona. {valuationDiffPct > 5 ? "Se recomienda encarecidamente una corrección de precio de venta a la baja para alinear la propiedad con los rangos de captación firmables ante notario en menos de 45 días." : "La propiedad mantiene una excelente sintonía de demanda en relación al ticket medio de venta."}
            </p>
          </div>

          {/* Signatures */}
          <div className="pt-12 grid grid-cols-2 gap-8 text-center text-xs">
            <div className="border-t border-slate-200 pt-4 font-semibold text-slate-500">
              Firma de la Consultora
            </div>
            <div className="border-t border-slate-200 pt-4 font-semibold text-slate-500">
              Conformidad del Propietario
            </div>
          </div>
        </div>
      </div>

      {/* Global style tag specifically for print media formatting */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-area, #printable-area * {
            visibility: visible;
          }
          #printable-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            height: auto;
            margin: 0;
            padding: 0;
            box-shadow: none;
          }
        }
      `}} />
    </div>
  );
}
