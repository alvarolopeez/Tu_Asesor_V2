import { useMemo, useState } from "react";
import { Plus, Trash2, Edit, Image as ImageIcon, Search, MapPin, Sparkles, Info } from "lucide-react";
import type { Property } from "./types";
import { formatPrice, getStatusBadge } from "./propertyUtils";

interface PropertiesTableProps {
  properties: Property[];
  loading: boolean;
  /** Callback al pulsar "Añadir Inmueble". */
  onAddClick: () => void;
  /** Callback al pulsar "Difundir" sobre una fila. */
  onMatchClick: (property: Property) => void;
  /** Callback al pulsar el lápiz de edición. */
  onEditClick: (property: Property) => void;
  /** Callback al pulsar la papelera. Recibe el id de la propiedad. */
  onDeleteClick: (id: string) => void;
}

/**
 * Tabla del catálogo de propiedades + barra de búsqueda y botón de alta.
 * Maneja el filtrado local por título / descripción / dirección.
 */
export default function PropertiesTable({
  properties,
  loading,
  onAddClick,
  onMatchClick,
  onEditClick,
  onDeleteClick,
}: PropertiesTableProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredProperties = useMemo(() => {
    return properties.filter(prop => {
      const query = searchQuery.toLowerCase();
      return (
        prop.title.toLowerCase().includes(query) ||
        (prop.description || "").toLowerCase().includes(query) ||
        (prop.features?.address || "").toLowerCase().includes(query)
      );
    });
  }, [properties, searchQuery]);

  return (
    <>
      {/* Search and Action Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 bg-[#1E293B] p-6 rounded-2xl border border-white/5 shadow-xl">
        <div className="relative flex-1">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search size={20} />
          </span>
          <input
            type="text"
            placeholder="Buscar por dirección, título, tipo..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#0F172A] border border-white/10 rounded-xl py-3 pl-11 pr-4 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all"
          />
        </div>
        <button
          onClick={onAddClick}
          className="bg-[#FBBF24] text-[#2C3E50] px-6 py-3 rounded-xl font-extrabold transition-all hover:bg-yellow-500 active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-[#FBBF24]/10"
        >
          <Plus size={20} /> Añadir Inmueble
        </button>
      </div>

      {/* Grid of properties styled elegantly */}
      <div className="bg-[#1E293B] rounded-2xl border border-white/5 overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#0F172A]/50 text-xs uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-6 py-4 font-bold">Inmueble / Multimedia</th>
                <th className="px-6 py-4 font-bold">Precio</th>
                <th className="px-6 py-4 font-bold">Características</th>
                <th className="px-6 py-4 font-bold">Estado</th>
                <th className="px-6 py-4 font-bold text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#FBBF24]"></div>
                      <span className="text-sm font-medium">Cargando catálogo...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredProperties.length > 0 ? (
                filteredProperties.map((property) => (
                  <tr key={property.id} className="hover:bg-white/5 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-12 rounded-lg bg-[#0F172A] border border-white/5 overflow-hidden flex items-center justify-center text-slate-500 relative flex-shrink-0">
                          {property.images && property.images.length > 0 ? (
                            <img src={property.images[0]} alt="Propiedad" className="w-full h-full object-cover" />
                          ) : (
                            <ImageIcon size={20} />
                          )}
                          <span className="absolute bottom-0 right-0 bg-black/60 px-1 py-0.5 text-[8px] text-white rounded-tl">
                            {(property.images || []).length}
                          </span>
                        </div>
                        <div>
                          <div className="font-extrabold text-white group-hover:text-[#FBBF24] transition-colors">{property.title}</div>
                          <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                            <MapPin size={12} className="text-[#FBBF24]" />
                            <span className="truncate max-w-[200px]">{property.features?.address || "Sin dirección fija"}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="font-extrabold text-[#FBBF24] text-base">{formatPrice(property.price)}</span>
                      {property.features?.sqm ? (
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {Math.round(property.price / property.features.sqm)} € / m²
                        </div>
                      ) : null}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-300">
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        <span>🚪 <strong>{property.features?.rooms ?? '-'}</strong> habs</span>
                        <span>🛁 <strong>{property.features?.baths ?? '-'}</strong> baños</span>
                        <span>📐 <strong>{property.features?.sqm ?? '-'}</strong> m²</span>
                        {property.features?.is_visitable_online && (
                          <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-[9px] font-bold">
                            Reserva Online Activa
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(property.status)}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => onMatchClick(property)}
                          className="bg-purple-600/20 hover:bg-purple-600/35 border border-purple-500/30 text-purple-300 px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1"
                          title="Cruzar con Leads en base de datos"
                        >
                          <Sparkles size={14} className="text-purple-400" /> Difundir
                        </button>
                        <button
                          onClick={() => onEditClick(property)}
                          className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 p-2 rounded-lg transition-all"
                          title="Editar Ficha"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => onDeleteClick(property.id)}
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10 p-2 rounded-lg transition-all"
                          title="Eliminar Inmueble"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    <Info size={40} className="mx-auto mb-3 opacity-20" />
                    <span>No se encontraron inmuebles cargados. Añade uno con el botón superior.</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
