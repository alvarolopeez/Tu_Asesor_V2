import { useState, useEffect } from "react";
import { Plus, Trash2, Edit } from "lucide-react";
import { useForm } from "react-hook-form";
import type { Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabase";

const propertySchema = z.object({
  title: z.string().min(3, "El título es muy corto"),
  description: z.string().optional(),
  price: z.number().min(0, "El precio no puede ser negativo"),
  status: z.enum(['active', 'sold', 'rented', 'draft']).default('draft'),
  propertyType: z.enum(['Piso', 'Casa', 'Parcela', 'Indiferente']).default('Piso'),
  rooms: z.number().min(0, "Mínimo 0 habitaciones").default(1),
  baths: z.number().min(0, "Mínimo 0 baños").default(1),
  latitude: z.number({ message: "La latitud debe ser un número" }).min(-90).max(90),
  longitude: z.number({ message: "La longitud debe ser un número" }).min(-180).max(180),
});

type PropertyFormValues = z.infer<typeof propertySchema>;

interface Property {
  id: string;
  title: string;
  price: number;
  status: string;
  created_at: string;
  features?: {
    propertyType?: string;
    rooms?: number;
    baths?: number;
    latitude?: number;
    longitude?: number;
  };
}

export default function PropertiesManager() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);

  // Matchmaker states
  const [matchedBuyers, setMatchedBuyers] = useState<any[]>([]);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [newPropertyTitle, setNewPropertyTitle] = useState("");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, handleSubmit, reset, formState: { errors } } = useForm<PropertyFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(propertySchema) as Resolver<PropertyFormValues, any>,
    defaultValues: {
      status: 'draft',
      price: 0,
      propertyType: 'Piso',
      rooms: 2,
      baths: 1,
      latitude: 37.3891,
      longitude: -5.9845
    }
  });

  const fetchProperties = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      setProperties(data as Property[] || []);
    } catch (error) {
      console.error(error);
      toast.error("Error al cargar los inmuebles");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProperties();
  }, []);


  const isPointInPolygon = (point: [number, number], polygon: [number, number][]): boolean => {
    const [lat, lng] = point;
    let isInside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [latI, lngI] = polygon[i];
      const [latJ, lngJ] = polygon[j];

      const intersect = ((lngI > lng) !== (lngJ > lng))
          && (lat < (latJ - latI) * (lng - lngI) / (lngJ - lngI) + latI);
          
      if (intersect) isInside = !isInside;
    }

    return isInside;
  };

  const runMatchmaker = async (property: any) => {
    try {
      const propLat = property.features?.latitude;
      const propLng = property.features?.longitude;
      const propPrice = Number(property.price);
      const propType = property.features?.propertyType;
      const propRooms = Number(property.features?.rooms || 0);
      const propBaths = Number(property.features?.baths || 0);

      if (propLat === undefined || propLng === undefined) return;

      // Fetch active buyer leads
      const { data: buyers, error } = await supabase
        .from('leads')
        .select('*')
        .eq('type', 'buyer')
        .not('status', 'in', '("lost","closed")');

      if (error) throw error;

      const matches = (buyers || []).filter((buyer: any) => {
        const prefs = buyer.preferences || {};
        const area = prefs.area;

        // 1. Spatial filter (polygon containment)
        if (!area || !Array.isArray(area) || area.length < 3) return false;
        const isInside = isPointInPolygon([propLat, propLng], area as [number, number][]);
        if (!isInside) return false;

        // 2. Price filter
        if (prefs.maxPrice && propPrice > Number(prefs.maxPrice)) return false;

        // 3. Property type filter
        if (prefs.propertyType && prefs.propertyType !== "Indiferente" && propType && propType !== "Indiferente" && prefs.propertyType !== propType) return false;

        // 4. Rooms filter
        if (prefs.minRooms && propRooms < Number(prefs.minRooms)) return false;

        // 5. Baths filter
        if (prefs.minBaths && propBaths < Number(prefs.minBaths)) return false;

        return true;
      });

      if (matches.length > 0) {
        setMatchedBuyers(matches);
        setNewPropertyTitle(property.title);
        setShowMatchModal(true);
      }
    } catch (err) {
      console.error("Error matching buyers:", err);
    }
  };

  const onSubmit = async (data: PropertyFormValues) => {
    try {
      const { title, description, price, status, ...featData } = data;
      const dbPayload = {
        title,
        description,
        price,
        status,
        features: {
          propertyType: featData.propertyType,
          rooms: featData.rooms,
          baths: featData.baths,
          latitude: featData.latitude,
          longitude: featData.longitude,
        }
      };

      const { data: insertedData, error } = await supabase
        .from('properties')
        .insert([dbPayload])
        .select()
        .single();
        
      if (error) throw error;
      
      toast.success("Inmueble añadido correctamente");
      setShowAddModal(false);
      reset();
      fetchProperties();

      // Trigger matchmaking alert if successful
      if (insertedData) {
        await runMatchmaker(insertedData);
      }
    } catch (error) {
      console.error(error);
      toast.error("Error al añadir inmueble");
    }
  };

  const deleteProperty = async (id: string) => {
    if (!confirm("¿Seguro que quieres borrar este inmueble?")) return;
    try {
      const { error } = await supabase.from('properties').delete().eq('id', id);
      if (error) throw error;
      
      toast.success("Inmueble eliminado");
      fetchProperties();
    } catch (error) {
      console.error(error);
      toast.error("Error al eliminar el inmueble");
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(price);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <span className="px-2 py-1 bg-green-500/10 text-green-400 rounded text-[10px] font-bold uppercase">Activo</span>;
      case 'sold':
        return <span className="px-2 py-1 bg-red-500/10 text-red-400 rounded text-[10px] font-bold uppercase">Vendido</span>;
      case 'rented':
        return <span className="px-2 py-1 bg-blue-500/10 text-blue-400 rounded text-[10px] font-bold uppercase">Alquilado</span>;
      case 'draft':
      default:
        return <span className="px-2 py-1 bg-slate-500/10 text-slate-400 rounded text-[10px] font-bold uppercase">Borrador</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-white">Catálogo de Inmuebles</h2>
        <button 
          onClick={() => setShowAddModal(true)}
          className="bg-[#FBBF24] text-[#2C3E50] px-4 py-2 rounded-xl font-bold transition-transform hover:scale-105 flex items-center gap-2"
        >
          <Plus size={20} /> Añadir Inmueble
        </button>
      </div>

      <div className="bg-[#1E293B] rounded-2xl border border-white/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-white/5 text-xs uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-6 py-4">Título</th>
                <th className="px-6 py-4">Precio</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4">Subido Hace</th>
                <th className="px-6 py-4">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    <div className="flex justify-center">
                      <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-[#FBBF24]"></div>
                    </div>
                  </td>
                </tr>
              ) : properties.length > 0 ? (
                properties.map((property) => (
                  <tr key={property.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 font-bold text-white">{property.title}</td>
                    <td className="px-6 py-4 text-slate-300">{formatPrice(property.price)}</td>
                    <td className="px-6 py-4">{getStatusBadge(property.status)}</td>
                    <td className="px-6 py-4 text-xs text-slate-500">
                      {new Date(property.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 flex gap-2">
                      <button className="text-blue-400 hover:text-blue-300 transition-colors" title="Editar">
                        <Edit size={18} />
                      </button>
                      <button 
                        onClick={() => deleteProperty(property.id)}
                        className="text-red-400 hover:text-red-300 transition-colors" 
                        title="Eliminar"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    Aún no has subido ningún inmueble.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#1E293B] p-8 rounded-2xl border border-white/10 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-white">Subir Nuevo Inmueble</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Título del Anuncio</label>
                <input 
                  {...register("title")} 
                  className="w-full bg-[#0F172A] border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-[#FBBF24]" 
                  placeholder="Ej: Piso luminoso en el centro"
                />
                {errors.title && <span className="text-red-400 text-xs mt-1">{errors.title.message}</span>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Precio (€)</label>
                  <input 
                    type="number"
                    {...register("price", { valueAsNumber: true })} 
                    className="w-full bg-[#0F172A] border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-[#FBBF24]" 
                  />
                  {errors.price && <span className="text-red-400 text-xs mt-1">{errors.price.message}</span>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Estado</label>
                  <select 
                    {...register("status")}
                    className="w-full bg-[#0F172A] border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                  >
                    <option value="draft">Borrador</option>
                    <option value="active">Activo</option>
                    <option value="sold">Vendido</option>
                    <option value="rented">Alquilado</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Tipo de Inmueble</label>
                  <select 
                    {...register("propertyType")}
                    className="w-full bg-[#0F172A] border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-[#FBBF24]"
                  >
                    <option value="Piso">Piso</option>
                    <option value="Casa">Casa</option>
                    <option value="Parcela">Parcela</option>
                    <option value="Indiferente">Indiferente</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Habitaciones</label>
                  <input 
                    type="number"
                    {...register("rooms", { valueAsNumber: true })} 
                    className="w-full bg-[#0F172A] border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-[#FBBF24]" 
                  />
                  {errors.rooms && <span className="text-red-400 text-xs mt-1">{errors.rooms.message}</span>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Baños</label>
                  <input 
                    type="number"
                    {...register("baths", { valueAsNumber: true })} 
                    className="w-full bg-[#0F172A] border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-[#FBBF24]" 
                  />
                  {errors.baths && <span className="text-red-400 text-xs mt-1">{errors.baths.message}</span>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Latitud *</label>
                  <input 
                    type="number"
                    step="any"
                    {...register("latitude", { valueAsNumber: true })} 
                    placeholder="Ej: 37.3891"
                    className="w-full bg-[#0F172A] border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-[#FBBF24]" 
                  />
                  {errors.latitude && <span className="text-red-400 text-xs mt-1">{errors.latitude.message}</span>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Longitud *</label>
                  <input 
                    type="number"
                    step="any"
                    {...register("longitude", { valueAsNumber: true })} 
                    placeholder="Ej: -5.9845"
                    className="w-full bg-[#0F172A] border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-[#FBBF24]" 
                  />
                  {errors.longitude && <span className="text-red-400 text-xs mt-1">{errors.longitude.message}</span>}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Descripción</label>
                <textarea 
                  {...register("description")} 
                  rows={3}
                  className="w-full bg-[#0F172A] border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-[#FBBF24]" 
                  placeholder="Describe las características principales..."
                />
              </div>

              <button 
                type="submit" 
                className="w-full bg-[#FBBF24] text-[#2C3E50] font-bold py-3 rounded-xl transition-all hover:bg-yellow-500 mt-6"
              >
                Guardar Inmueble
              </button>
            </form>
          </div>
        </div>
      )}

      {showMatchModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[60] p-4 animate-fadeIn">
          <div className="bg-[#1E293B] border border-[#FBBF24]/30 p-8 rounded-2xl w-full max-w-lg shadow-2xl relative text-left">
            <div className="absolute top-4 right-4">
              <button 
                onClick={() => setShowMatchModal(false)} 
                className="text-slate-400 hover:text-white text-xl"
              >
                ✕
              </button>
            </div>
            
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-[#FBBF24]/20 text-[#FBBF24] rounded-full flex items-center justify-center mx-auto mb-4 border border-[#FBBF24]/40 animate-pulse">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-white font-heading">¡Coincidencia Inmobiliaria!</h3>
              <p className="text-slate-300 text-sm mt-2">
                El nuevo inmueble <span className="text-[#FBBF24] font-semibold">"{newPropertyTitle}"</span> encaja perfectamente con las preferencias de <span className="font-bold text-white">{matchedBuyers.length}</span> compradores registrados en tu base de datos.
              </p>
            </div>

            <div className="space-y-4 max-h-60 overflow-y-auto pr-2 custom-scrollbar mb-6">
              {matchedBuyers.map((buyer) => (
                <div key={buyer.id} className="bg-slate-800/50 p-4 rounded-xl border border-white/5 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-white text-sm">{buyer.name}</span>
                    <span className="text-xs px-2 py-0.5 bg-[#FBBF24]/10 text-[#FBBF24] border border-[#FBBF24]/20 rounded-full font-medium">Comprador</span>
                  </div>
                  
                  <div className="text-xs text-slate-400 space-y-1">
                    <div><span className="font-semibold text-slate-300">Precio máximo:</span> {buyer.preferences?.maxPrice ? `${new Intl.NumberFormat('es-ES').format(buyer.preferences.maxPrice)} €` : "Cualquiera"}</div>
                    <div><span className="font-semibold text-slate-300">Tipo:</span> {buyer.preferences?.propertyType || "Indiferente"}</div>
                    <div><span className="font-semibold text-slate-300">Habitaciones:</span> {buyer.preferences?.minRooms || "Cualquiera"}</div>
                  </div>

                  <div className="flex gap-2 mt-2 pt-2 border-t border-white/5">
                    {buyer.phone && (
                      <a 
                        href={`https://wa.me/${buyer.phone.replace(/\D/g, '')}`}
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="flex-1 bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-500/20 py-2 rounded-lg text-xs font-bold text-center transition-colors flex items-center justify-center gap-1.5"
                      >
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.73-1.455L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.625 1.451 5.437.002 9.861-4.416 9.863-9.864.001-2.639-1.023-5.122-2.883-6.985C16.388 1.892 13.916.865 11.29.864 5.85.864 1.43 5.28 1.428 10.72c-.001 1.562.413 3.09 1.198 4.448l-.992 3.626 3.716-.975z"/>
                        </svg>
                        WhatsApp
                      </a>
                    )}
                    {buyer.email && (
                      <a 
                        href={`mailto:${buyer.email}`}
                        className="flex-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/20 py-2 rounded-lg text-xs font-bold text-center transition-colors flex items-center justify-center gap-1.5"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        Email
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <button 
              onClick={() => setShowMatchModal(false)}
              className="w-full bg-[#FBBF24] hover:bg-yellow-500 text-[#2C3E50] font-bold py-3 rounded-xl transition-all active:scale-95"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
