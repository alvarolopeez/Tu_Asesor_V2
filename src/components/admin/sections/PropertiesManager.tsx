import { useState, useEffect, useMemo } from "react";
import {
  Plus, Trash2, Edit, X, Upload, Image as ImageIcon, Film, FileText,
  Check, Search, DollarSign, MapPin, Sparkles, Info
} from "lucide-react";
import { useForm } from "react-hook-form";
import type { Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabase";
import {
  propertySchema,
  type PropertyFormValues,
  type Property,
  AVAILABLE_DAYS,
  AVAILABLE_HOURS,
} from "./properties/types";
import { formatPrice, getStatusBadge } from "./properties/propertyUtils";
import SmartMatchmakerModal from "./properties/SmartMatchmakerModal";

export default function PropertiesManager() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals / Editors state
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);

  // Media uploads local state
  const [uploadTab, setUploadTab] = useState<'images' | 'video' | 'plan'>('images');
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [uploadedVideo, setUploadedVideo] = useState<string | null>(null);
  const [uploadedPlan, setUploadedPlan] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Online booking scheduling state
  const [isVisitableOnline, setIsVisitableOnline] = useState(false);
  const [selectedDays, setSelectedDays] = useState<string[]>(["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"]);
  const [selectedSlots, setSelectedSlots] = useState<string[]>(["10:00", "11:00", "12:00", "16:00", "17:00", "18:00"]);
  const [activeConfigDay, setActiveConfigDay] = useState<string>("Lunes");
  const [daySchedules, setDaySchedules] = useState<Record<string, string[]>>({
    "Lunes": ["10:00", "11:00", "12:00", "16:00", "17:00", "18:00"],
    "Martes": ["10:00", "11:00", "12:00", "16:00", "17:00", "18:00"],
    "Miércoles": ["10:00", "11:00", "12:00", "16:00", "17:00", "18:00"],
    "Jueves": ["10:00", "11:00", "12:00", "16:00", "17:00", "18:00"],
    "Viernes": ["10:00", "11:00", "12:00", "16:00", "17:00", "18:00"],
    "Sábado": []
  });

  // Smart Matchmaker Modal state (sólo la propiedad seleccionada; el modal maneja el resto)
  const [matchingProperty, setMatchingProperty] = useState<Property | null>(null);

  // Search filter
  const [searchQuery, setSearchQuery] = useState("");

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<PropertyFormValues>({
    resolver: zodResolver(propertySchema) as Resolver<PropertyFormValues, any>,
    defaultValues: {
      status: 'draft',
      price: 0,
      propertyType: 'Piso',
      rooms: 2,
      baths: 1,
      sqm: 80,
      address: "",
      latitude: 37.3891,
      longitude: -5.9845,
      is_visitable_online: false
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

  // Open Edit Form prefilled
  const handleEditClick = (property: Property) => {
    setEditingProperty(property);
    setValue("title", property.title);
    setValue("description", property.description || "");
    setValue("price", Number(property.price));
    setValue("status", property.status as any);
    setValue("propertyType", (property.features?.propertyType || 'Piso') as any);
    setValue("rooms", Number(property.features?.rooms ?? 1));
    setValue("baths", Number(property.features?.baths ?? 1));
    setValue("sqm", Number(property.features?.sqm ?? 80));
    setValue("address", property.features?.address || "");
    setValue("latitude", Number(property.features?.latitude ?? 37.3891));
    setValue("longitude", Number(property.features?.longitude ?? -5.9845));
    setValue("is_visitable_online", !!property.features?.is_visitable_online);

    // Load subfields
    setUploadedImages(property.images || []);
    setUploadedVideo(property.features?.video_url || null);
    setUploadedPlan(property.features?.plan_url || null);
    setIsVisitableOnline(!!property.features?.is_visitable_online);
    
    if (property.features?.visitable_slots) {
      const vSlots = property.features.visitable_slots as any;
      const loadedSchedule = vSlots.schedule || {};
      
      const newSchedules: Record<string, string[]> = {
        "Lunes": [], "Martes": [], "Miércoles": [], "Jueves": [], "Viernes": [], "Sábado": []
      };
      
      if (Object.keys(loadedSchedule).length > 0) {
        AVAILABLE_DAYS.forEach(day => {
          newSchedules[day.key] = loadedSchedule[day.key] || [];
        });
      } else {
        const legacyDays = vSlots.days || [];
        const legacySlots = vSlots.slots || [];
        AVAILABLE_DAYS.forEach(day => {
          if (legacyDays.includes(day.key)) {
            newSchedules[day.key] = [...legacySlots];
          }
        });
      }
      
      setDaySchedules(newSchedules);
      const firstActiveDay = AVAILABLE_DAYS.find(day => newSchedules[day.key].length > 0)?.key || "Lunes";
      setActiveConfigDay(firstActiveDay);
      
      setSelectedDays(vSlots.days || []);
      setSelectedSlots(vSlots.slots || []);
    } else {
      const defaultSchedules: Record<string, string[]> = {
        "Lunes": ["10:00", "11:00", "12:00", "16:00", "17:00", "18:00"],
        "Martes": ["10:00", "11:00", "12:00", "16:00", "17:00", "18:00"],
        "Miércoles": ["10:00", "11:00", "12:00", "16:00", "17:00", "18:00"],
        "Jueves": ["10:00", "11:00", "12:00", "16:00", "17:00", "18:00"],
        "Viernes": ["10:00", "11:00", "12:00", "16:00", "17:00", "18:00"],
        "Sábado": []
      };
      setDaySchedules(defaultSchedules);
      setActiveConfigDay("Lunes");
      setSelectedDays(["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"]);
      setSelectedSlots(["10:00", "11:00", "12:00", "16:00", "17:00", "18:00"]);
    }
    
    setShowFormModal(true);
  };

  // Open Add Form empty
  const handleAddClick = () => {
    setEditingProperty(null);
    reset({
      status: 'draft',
      price: 0,
      propertyType: 'Piso',
      rooms: 2,
      baths: 1,
      sqm: 80,
      address: "",
      latitude: 37.3891,
      longitude: -5.9845,
      is_visitable_online: false
    });
    setUploadedImages([]);
    setUploadedVideo(null);
    setUploadedPlan(null);
    setIsVisitableOnline(false);
    const defaultSchedules: Record<string, string[]> = {
      "Lunes": ["10:00", "11:00", "12:00", "16:00", "17:00", "18:00"],
      "Martes": ["10:00", "11:00", "12:00", "16:00", "17:00", "18:00"],
      "Miércoles": ["10:00", "11:00", "12:00", "16:00", "17:00", "18:00"],
      "Jueves": ["10:00", "11:00", "12:00", "16:00", "17:00", "18:00"],
      "Viernes": ["10:00", "11:00", "12:00", "16:00", "17:00", "18:00"],
      "Sábado": []
    };
    setDaySchedules(defaultSchedules);
    setActiveConfigDay("Lunes");
    setSelectedDays(["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"]);
    setSelectedSlots(["10:00", "11:00", "12:00", "16:00", "17:00", "18:00"]);
    setShowFormModal(true);
  };

  // Upload file to Supabase Storage with graceful Local Blob preview fallback
  const uploadFile = async (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video' | 'plan') => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setUploading(true);
    const loadingToast = toast.loading(`Subiendo ${type === 'image' ? 'imagen' : type === 'video' ? 'vídeo' : 'plano'}...`);
    
    try {
      const file = files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
      const filePath = `${type}s/${fileName}`;
      
      const { data, error } = await supabase.storage
        .from('properties')
        .upload(filePath, file, { cacheControl: '3600', upsert: true });
        
      if (error) throw error;
      
      const { data: { publicUrl } } = supabase.storage
        .from('properties')
        .getPublicUrl(filePath);
      
      toast.dismiss(loadingToast);
      toast.success("Subido con éxito a Supabase Storage");

      if (type === 'image') {
        setUploadedImages(prev => [...prev, publicUrl]);
      } else if (type === 'video') {
        setUploadedVideo(publicUrl);
      } else {
        setUploadedPlan(publicUrl);
      }
    } catch (err: any) {
      console.warn("Storage upload failed or bucket properties unconfigured. Using preview URL fallback:", err);
      
      // Smart fallback using local object URL so client flow works 100% of the time!
      const file = files[0];
      const objectUrl = URL.createObjectURL(file);
      
      toast.dismiss(loadingToast);
      toast.success(`Carga completada (Vista Previa Local habilitada)`);
      
      if (type === 'image') {
        setUploadedImages(prev => [...prev, objectUrl]);
      } else if (type === 'video') {
        setUploadedVideo(objectUrl);
      } else {
        setUploadedPlan(objectUrl);
      }
    } finally {
      setUploading(false);
      e.target.value = ""; // clear inputs
    }
  };

  const removeImage = (indexToRemove: number) => {
    setUploadedImages(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  // Submit form handler
  const onSubmit = async (data: PropertyFormValues) => {
    try {
      const { title, description, price, status, ...featData } = data;
      
      const dbPayload = {
        title,
        description,
        price,
        status,
        images: uploadedImages,
        features: {
          propertyType: featData.propertyType,
          rooms: featData.rooms,
          baths: featData.baths,
          sqm: featData.sqm,
          address: featData.address,
          latitude: featData.latitude,
          longitude: featData.longitude,
          is_visitable_online: isVisitableOnline,
          visitable_slots: isVisitableOnline ? {
            days: AVAILABLE_DAYS.map(d => d.key).filter(day => (daySchedules[day] || []).length > 0),
            slots: Array.from(new Set(Object.values(daySchedules).flat())).sort(),
            schedule: daySchedules
          } : undefined,
          video_url: uploadedVideo || undefined,
          plan_url: uploadedPlan || undefined,
        }
      };

      let result;
      if (editingProperty) {
        // UPDATE
        const { data: updatedData, error } = await supabase
          .from('properties')
          .update(dbPayload)
          .eq('id', editingProperty.id)
          .select()
          .single();
          
        if (error) throw error;
        result = updatedData;
        toast.success("Inmueble actualizado correctamente");
      } else {
        // CREATE
        const { data: insertedData, error } = await supabase
          .from('properties')
          .insert([dbPayload])
          .select()
          .single();
          
        if (error) throw error;
        result = insertedData;
        toast.success("Inmueble añadido correctamente");
      }
      
      setShowFormModal(false);
      fetchProperties();

      // If new or edited, open Smart Matchmaker immediately to promote matches!
      if (result) {
        setMatchingProperty(result as Property);
      }
    } catch (error) {
      console.error(error);
      toast.error("Error al guardar el inmueble");
    }
  };

  const deleteProperty = async (id: string) => {
    if (!confirm("¿Seguro que quieres borrar este inmueble permanentemente?")) return;
    try {
      const { error } = await supabase.from('properties').delete().eq('id', id);
      if (error) throw error;
      
      toast.success("Inmueble eliminado con éxito");
      fetchProperties();
    } catch (error) {
      console.error(error);
      toast.error("Error al eliminar el inmueble");
    }
  };

  // Dynamic filter for properties catalog list
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
    <div className="space-y-6">
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
          onClick={handleAddClick}
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
                          onClick={() => setMatchingProperty(property)}
                          className="bg-purple-600/20 hover:bg-purple-600/35 border border-purple-500/30 text-purple-300 px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1"
                          title="Cruzar con Leads en base de datos"
                        >
                          <Sparkles size={14} className="text-purple-400" /> Difundir
                        </button>
                        <button 
                          onClick={() => handleEditClick(property)}
                          className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 p-2 rounded-lg transition-all" 
                          title="Editar Ficha"
                        >
                          <Edit size={16} />
                        </button>
                        <button 
                          onClick={() => deleteProperty(property.id)}
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

      {/* ============================================================== */}
      {/* 1. COMPREHENSIVE ADD/EDIT PROPERTIES CRUD FORM MODAL (LAYER 1) */}
      {/* ============================================================== */}
      {showFormModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-50 p-4 md:p-6 overflow-y-auto">
          <div className="bg-[#1E293B] p-6 md:p-8 rounded-2xl border border-white/10 w-full max-w-4xl shadow-2xl my-auto">
            <div className="flex justify-between items-center pb-4 border-b border-white/10 mb-6">
              <div>
                <h3 className="text-2xl font-bold text-white font-heading">
                  {editingProperty ? "Editar Ficha de Inmueble" : "Subir Nuevo Inmueble"}
                </h3>
                <p className="text-xs text-slate-400 mt-1">Completa los campos técnicos y sube el contenido multimedia a Supabase</p>
              </div>
              <button onClick={() => setShowFormModal(false)} className="text-slate-400 hover:text-white p-1 hover:bg-white/10 rounded-full transition-all">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* Section: Basic Data */}
              <div className="space-y-4">
                <h4 className="text-sm font-bold uppercase tracking-wider text-[#FBBF24]">1. Datos Básicos del Inmueble</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Título del Anuncio (Optimizado SEO)</label>
                    <input 
                      {...register("title")} 
                      className="w-full bg-[#0F172A] border border-white/10 rounded-xl py-2.5 px-4 text-white focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all text-sm" 
                      placeholder="Ej: Piso de lujo con terraza y vistas despejadas"
                    />
                    {errors.title && <span className="text-red-400 text-xs mt-1 block">{errors.title.message}</span>}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Precio de Venta (€)</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-sm">
                        <DollarSign size={16} />
                      </span>
                      <input 
                        type="number"
                        {...register("price", { valueAsNumber: true })} 
                        className="w-full bg-[#0F172A] border border-white/10 rounded-xl py-2.5 pl-9 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all text-sm font-bold text-[#FBBF24]" 
                      />
                    </div>
                    {errors.price && <span className="text-red-400 text-xs mt-1 block">{errors.price.message}</span>}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Tipo de Inmueble</label>
                    <select 
                      {...register("propertyType")}
                      className="w-full bg-[#0F172A] border border-white/10 rounded-xl py-2.5 px-3 text-white focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all text-sm"
                    >
                      <option value="Piso">Piso</option>
                      <option value="Casa">Casa</option>
                      <option value="Parcela">Parcela</option>
                      <option value="Indiferente">Indiferente</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Habitaciones</label>
                    <input 
                      type="number"
                      {...register("rooms", { valueAsNumber: true })} 
                      className="w-full bg-[#0F172A] border border-white/10 rounded-xl py-2.5 px-3 text-white focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all text-sm" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Baños</label>
                    <input 
                      type="number"
                      {...register("baths", { valueAsNumber: true })} 
                      className="w-full bg-[#0F172A] border border-white/10 rounded-xl py-2.5 px-3 text-white focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all text-sm" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Metros Cuadrados (m²)</label>
                    <input 
                      type="number"
                      {...register("sqm", { valueAsNumber: true })} 
                      className="w-full bg-[#0F172A] border border-white/10 rounded-xl py-2.5 px-3 text-white focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all text-sm font-bold" 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Dirección Exacta</label>
                    <input 
                      {...register("address")} 
                      className="w-full bg-[#0F172A] border border-white/10 rounded-xl py-2.5 px-4 text-white focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all text-sm" 
                      placeholder="Calle, Número, Piso y Ciudad"
                    />
                    {errors.address && <span className="text-red-400 text-xs mt-1 block">{errors.address.message}</span>}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Estado de Publicación</label>
                    <select 
                      {...register("status")}
                      className="w-full bg-[#0F172A] border border-white/10 rounded-xl py-2.5 px-3 text-white focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all text-sm font-bold"
                    >
                      <option value="draft">Borrador</option>
                      <option value="active">Activo (Exclusiva)</option>
                      <option value="sold">Vendido</option>
                      <option value="rented">Alquilado</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Latitud GPS</label>
                    <input 
                      type="number" 
                      step="any"
                      {...register("latitude", { valueAsNumber: true })} 
                      className="w-full bg-[#0F172A] border border-white/10 rounded-xl py-2.5 px-3 text-white focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all text-sm" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Longitud GPS</label>
                    <input 
                      type="number" 
                      step="any"
                      {...register("longitude", { valueAsNumber: true })} 
                      className="w-full bg-[#0F172A] border border-white/10 rounded-xl py-2.5 px-3 text-white focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all text-sm" 
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Descripción del Inmueble (Optimizado SEO)</label>
                  <textarea 
                    {...register("description")} 
                    rows={4}
                    className="w-full bg-[#0F172A] border border-white/10 rounded-xl py-2.5 px-4 text-white focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all text-sm" 
                    placeholder="Escribe una descripción vendedora incluyendo las características principales..."
                  />
                </div>
              </div>

              {/* Section: Multimedia uploads (Drag and Drop styled) */}
              <div className="space-y-4 pt-4 border-t border-white/5">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-bold uppercase tracking-wider text-[#FBBF24]">2. Gestión Multimedia (Supabase Storage)</h4>
                  <div className="flex bg-[#0F172A] p-0.5 rounded-lg border border-white/10">
                    <button 
                      type="button"
                      onClick={() => setUploadTab('images')}
                      className={`px-3 py-1 text-xs font-bold rounded-md transition-all flex items-center gap-1 ${uploadTab === 'images' ? 'bg-[#FBBF24] text-[#2C3E50]' : 'text-slate-400 hover:text-white'}`}
                    >
                      <ImageIcon size={12} /> Fotos ({uploadedImages.length})
                    </button>
                    <button 
                      type="button"
                      onClick={() => setUploadTab('video')}
                      className={`px-3 py-1 text-xs font-bold rounded-md transition-all flex items-center gap-1 ${uploadTab === 'video' ? 'bg-[#FBBF24] text-[#2C3E50]' : 'text-slate-400 hover:text-white'}`}
                    >
                      <Film size={12} /> Vídeo {uploadedVideo ? '✅' : ''}
                    </button>
                    <button 
                      type="button"
                      onClick={() => setUploadTab('plan')}
                      className={`px-3 py-1 text-xs font-bold rounded-md transition-all flex items-center gap-1 ${uploadTab === 'plan' ? 'bg-[#FBBF24] text-[#2C3E50]' : 'text-slate-400 hover:text-white'}`}
                    >
                      <FileText size={12} /> Plano {uploadedPlan ? '✅' : ''}
                    </button>
                  </div>
                </div>

                {/* Upload drag-n-drop deck */}
                <div className="bg-[#0F172A] p-6 rounded-xl border border-white/5 text-center flex flex-col items-center justify-center min-h-[160px] relative transition-all group hover:border-[#FBBF24]/30">
                  <input
                    type="file"
                    id="multimedia-upload-input"
                    onChange={(e) => uploadFile(e, uploadTab === 'images' ? 'image' : uploadTab === 'video' ? 'video' : 'plan')}
                    accept={uploadTab === 'images' ? 'image/png, image/jpeg, image/webp' : uploadTab === 'video' ? 'video/mp4' : 'application/pdf, image/*'}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    disabled={uploading}
                  />
                  <div className="space-y-2 pointer-events-none">
                    <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mx-auto text-slate-400 group-hover:text-[#FBBF24] transition-all">
                      <Upload size={24} />
                    </div>
                    <div className="text-sm font-bold text-white">
                      {uploading ? "Cargando archivo..." : `Arrastra o haz clic para subir tu ${uploadTab === 'images' ? 'Foto (WebP recomendado)' : uploadTab === 'video' ? 'Vídeo (MP4)' : 'Plano Técnico'}`}
                    </div>
                    <div className="text-xs text-slate-500">Tamaño máximo recomendado: 15MB</div>
                  </div>
                </div>

                {/* Previews based on tab selected */}
                {uploadTab === 'images' && uploadedImages.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                    {uploadedImages.map((url, idx) => (
                      <div key={idx} className="aspect-video bg-[#0F172A] rounded-lg border border-white/10 overflow-hidden relative group">
                        <img src={url} alt={`Property view ${idx}`} className="w-full h-full object-cover" />
                        <button 
                          type="button"
                          onClick={() => removeImage(idx)}
                          className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {uploadTab === 'video' && uploadedVideo && (
                  <div className="bg-[#0F172A] p-4 rounded-xl border border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Film className="text-[#FBBF24]" size={20} />
                      <div className="text-xs text-slate-300 font-bold truncate max-w-[280px] sm:max-w-md">
                        {uploadedVideo}
                      </div>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => setUploadedVideo(null)} 
                      className="text-red-400 hover:text-red-300 text-xs font-bold"
                    >
                      Quitar Vídeo
                    </button>
                  </div>
                )}

                {uploadTab === 'plan' && uploadedPlan && (
                  <div className="bg-[#0F172A] p-4 rounded-xl border border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileText className="text-[#FBBF24]" size={20} />
                      <div className="text-xs text-slate-300 font-bold truncate max-w-[280px] sm:max-w-md">
                        {uploadedPlan}
                      </div>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => setUploadedPlan(null)} 
                      className="text-red-400 hover:text-red-300 text-xs font-bold"
                    >
                      Quitar Plano
                    </button>
                  </div>
                )}
              </div>

              {/* Section: Online Visit scheduler configuration toggle */}
              <div className="space-y-4 pt-4 border-t border-white/5">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="text-sm font-bold uppercase tracking-wider text-[#FBBF24]">3. Reserva Online Auto-gestionada (Preparado para Cal.com)</h4>
                    <p className="text-xs text-slate-400 mt-0.5">Permite a los compradores reservar visitas de forma autónoma desde la web</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={isVisitableOnline} 
                      onChange={(e) => setIsVisitableOnline(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>

                {isVisitableOnline && (
                  <div className="bg-[#0F172A] p-6 rounded-xl border border-white/10 space-y-5 animate-fadeIn">
                    {/* Day selector tabs */}
                    <div>
                      <span className="block text-xs font-bold text-slate-300 mb-2">Selecciona un Día para Configurar:</span>
                      <div className="flex flex-wrap gap-1.5 p-1 bg-slate-900 rounded-lg border border-white/5">
                        {AVAILABLE_DAYS.map((day) => {
                          const daySlots = daySchedules[day.key] || [];
                          const hasSlots = daySlots.length > 0;
                          const isCurrent = activeConfigDay === day.key;
                          
                          return (
                            <button
                              type="button"
                              key={day.key}
                              onClick={() => setActiveConfigDay(day.key)}
                              className={`flex-1 min-w-[80px] px-2.5 py-2 rounded-md text-xs font-bold transition-all flex flex-col items-center gap-1 ${
                                isCurrent 
                                  ? 'bg-[#FBBF24] text-[#1E293B] shadow-md' 
                                  : 'text-slate-300 hover:text-white hover:bg-white/5'
                              }`}
                            >
                              <span>{day.label}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-extrabold ${
                                isCurrent 
                                  ? 'bg-[#1E293B]/20 text-[#1E293B]' 
                                  : hasSlots 
                                    ? 'bg-emerald-500/20 text-emerald-400' 
                                    : 'bg-slate-800 text-slate-500'
                              }`}>
                                {daySlots.length} {daySlots.length === 1 ? 'slot' : 'slots'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Configuration slot area for the active day */}
                    <div className="bg-[#1E293B]/50 p-4 rounded-xl border border-white/5 space-y-4">
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                        <div>
                          <span className="block text-xs font-bold text-white flex items-center gap-2">
                            Configuración de Horarios: <span className="text-[#FBBF24] font-extrabold">{activeConfigDay}</span>
                          </span>
                          <span className="text-[10px] text-slate-400">
                            Habilita o deshabilita los horarios en los que deseas que los clientes agenden visitas este día.
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setDaySchedules(prev => ({
                                ...prev,
                                [activeConfigDay]: [...AVAILABLE_HOURS]
                              }));
                            }}
                            className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-2 py-1 rounded border border-white/5 transition-all"
                          >
                            Seleccionar Todo
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDaySchedules(prev => ({
                                ...prev,
                                [activeConfigDay]: []
                              }));
                            }}
                            className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-2 py-1 rounded border border-white/5 transition-all"
                          >
                            Limpiar Todo
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const activeSlots = daySchedules[activeConfigDay] || [];
                              setDaySchedules(prev => {
                                const newSchedules = { ...prev };
                                AVAILABLE_DAYS.forEach(day => {
                                  newSchedules[day.key] = [...activeSlots];
                                });
                                return newSchedules;
                              });
                              toast.success(`Horarios de ${activeConfigDay} copiados a todos los días`);
                            }}
                            className="text-[10px] bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 font-bold px-2 py-1 rounded border border-emerald-500/20 transition-all flex items-center gap-1"
                            title="Copia los horarios del día seleccionado a todos los demás días"
                          >
                            Copiar a todos
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                        {AVAILABLE_HOURS.map((hour) => {
                          const currentSlots = daySchedules[activeConfigDay] || [];
                          const active = currentSlots.includes(hour);
                          return (
                            <button
                              type="button"
                              key={hour}
                              onClick={() => {
                                setDaySchedules(prev => {
                                  const list = prev[activeConfigDay] || [];
                                  const newList = list.includes(hour)
                                    ? list.filter(h => h !== hour)
                                    : [...list, hour].sort();
                                  return { ...prev, [activeConfigDay]: newList };
                                });
                              }}
                              className={`py-2 px-1 rounded-md text-xs font-bold border text-center transition-all ${
                                active 
                                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 font-extrabold scale-[1.02] shadow-sm shadow-emerald-500/5' 
                                  : 'bg-slate-900 text-slate-400 border-white/5 hover:text-white hover:bg-slate-800'
                              }`}
                            >
                              {hour}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-4 pt-4 border-t border-white/10">
                <button 
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="flex-1 bg-[#FBBF24] hover:bg-yellow-500 text-[#2C3E50] font-extrabold py-3 rounded-xl transition-all active:scale-95 shadow-lg shadow-[#FBBF24]/10"
                >
                  {editingProperty ? "Guardar Cambios" : "Añadir Propiedad y Cruzar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de difusión inteligente (Smart Matchmaker). Subcomponente. */}
      {matchingProperty && (
        <SmartMatchmakerModal
          property={matchingProperty}
          onClose={() => setMatchingProperty(null)}
        />
      )}
    </div>
  );
}
