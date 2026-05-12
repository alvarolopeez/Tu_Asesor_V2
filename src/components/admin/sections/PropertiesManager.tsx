import { useState, useEffect } from "react";
import { Plus, Trash2, Edit } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabase";

const propertySchema = z.object({
  title: z.string().min(3, "El título es muy corto"),
  description: z.string().optional(),
  price: z.number().min(0, "El precio no puede ser negativo"),
  status: z.enum(['active', 'sold', 'rented', 'draft']).default('draft'),
  features: z.any().optional(), // Later we'll refine this structure
});

type PropertyFormValues = z.infer<typeof propertySchema>;

export default function PropertiesManager() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [properties, setProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<PropertyFormValues>({
    resolver: zodResolver(propertySchema),
    defaultValues: {
      status: 'draft',
      price: 0
    }
  });

  useEffect(() => {
    fetchProperties();
  }, []);

  const fetchProperties = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      setProperties(data || []);
    } catch (error) {
      console.error(error);
      toast.error("Error al cargar los inmuebles");
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: PropertyFormValues) => {
    try {
      const { error } = await supabase.from('properties').insert([data]);
      if (error) throw error;
      
      toast.success("Inmueble añadido correctamente");
      setShowAddModal(false);
      reset();
      fetchProperties();
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

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Descripción</label>
                <textarea 
                  {...register("description")} 
                  rows={4}
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
    </div>
  );
}
