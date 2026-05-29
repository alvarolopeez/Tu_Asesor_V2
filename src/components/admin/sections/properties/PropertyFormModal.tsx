import { useState, useEffect } from "react";
import { X, Upload, Image as ImageIcon, Film, FileText, DollarSign } from "lucide-react";
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
} from "./types";

interface PropertyFormModalProps {
  /** Propiedad en edición. `null` = modo creación. */
  editingProperty: Property | null;
  /** Cierra el modal sin guardar. */
  onClose: () => void;
  /** Se invoca tras guardar (insert o update) con la propiedad resultante. */
  onSaved: (savedProperty: Property) => void;
}

const DEFAULT_DAY_SCHEDULES: Record<string, string[]> = {
  "Lunes": ["10:00", "11:00", "12:00", "16:00", "17:00", "18:00"],
  "Martes": ["10:00", "11:00", "12:00", "16:00", "17:00", "18:00"],
  "Miércoles": ["10:00", "11:00", "12:00", "16:00", "17:00", "18:00"],
  "Jueves": ["10:00", "11:00", "12:00", "16:00", "17:00", "18:00"],
  "Viernes": ["10:00", "11:00", "12:00", "16:00", "17:00", "18:00"],
  "Sábado": []
};

const FORM_DEFAULTS: PropertyFormValues = {
  title: "",
  description: "",
  status: 'draft',
  price: 0,
  propertyType: 'Piso',
  rooms: 2,
  baths: 1,
  sqm: 80,
  floor: "",
  elevator: false,
  address: "",
  latitude: 37.3891,
  longitude: -5.9845,
  is_visitable_online: false,
};

/**
 * Modal CRUD para alta y edición de propiedades.
 *
 * Encapsula todo el estado del formulario y los uploads multimedia.
 * El padre solo decide cuándo se monta (pasando `editingProperty`)
 * y reacciona al `onSaved` para refrescar listas o abrir el matchmaker.
 */
export default function PropertyFormModal({ editingProperty, onClose, onSaved }: PropertyFormModalProps) {
  // Media uploads
  const [uploadTab, setUploadTab] = useState<'images' | 'video' | 'plan'>('images');
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [uploadedVideo, setUploadedVideo] = useState<string | null>(null);
  const [uploadedPlan, setUploadedPlan] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Online booking scheduling
  const [isVisitableOnline, setIsVisitableOnline] = useState(false);
  const [activeConfigDay, setActiveConfigDay] = useState<string>("Lunes");
  const [daySchedules, setDaySchedules] = useState<Record<string, string[]>>({ ...DEFAULT_DAY_SCHEDULES });

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<PropertyFormValues>({
    resolver: zodResolver(propertySchema) as Resolver<PropertyFormValues, any>,
    defaultValues: FORM_DEFAULTS,
  });

  // Cada vez que cambia la propiedad en edición, rellenar / resetear el formulario.
  useEffect(() => {
    if (editingProperty) {
      setValue("title", editingProperty.title);
      setValue("description", editingProperty.description || "");
      setValue("price", Number(editingProperty.price));
      setValue("status", editingProperty.status as any);
      setValue("propertyType", (editingProperty.features?.propertyType || 'Piso') as any);
      setValue("rooms", Number(editingProperty.features?.rooms ?? 1));
      setValue("baths", Number(editingProperty.features?.baths ?? 1));
      setValue("sqm", Number(editingProperty.features?.sqm ?? 80));
      setValue("floor", editingProperty.features?.floor || "");
      setValue("elevator", !!editingProperty.features?.elevator);
      setValue("address", editingProperty.features?.address || "");
      setValue("latitude", Number(editingProperty.features?.latitude ?? 37.3891));
      setValue("longitude", Number(editingProperty.features?.longitude ?? -5.9845));
      setValue("is_visitable_online", !!editingProperty.features?.is_visitable_online);

      setUploadedImages(editingProperty.images || []);
      setUploadedVideo(editingProperty.features?.video_url || null);
      setUploadedPlan(editingProperty.features?.plan_url || null);
      setIsVisitableOnline(!!editingProperty.features?.is_visitable_online);

      if (editingProperty.features?.visitable_slots) {
        const vSlots = editingProperty.features.visitable_slots as any;
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
      } else {
        setDaySchedules({ ...DEFAULT_DAY_SCHEDULES });
        setActiveConfigDay("Lunes");
      }
    } else {
      // Modo creación: reset completo
      reset(FORM_DEFAULTS);
      setUploadedImages([]);
      setUploadedVideo(null);
      setUploadedPlan(null);
      setIsVisitableOnline(false);
      setDaySchedules({ ...DEFAULT_DAY_SCHEDULES });
      setActiveConfigDay("Lunes");
    }
  }, [editingProperty, reset, setValue]);

  // Upload a Supabase Storage con fallback gracioso a Object URL local si Storage falla
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

      const { error } = await supabase.storage
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
      e.target.value = "";
    }
  };

  const removeImage = (indexToRemove: number) => {
    setUploadedImages(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

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
          floor: featData.floor,
          elevator: featData.elevator,
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
        const { data: insertedData, error } = await supabase
          .from('properties')
          .insert([dbPayload])
          .select()
          .single();

        if (error) throw error;
        result = insertedData;
        toast.success("Inmueble añadido correctamente");
      }

      if (result) {
        onSaved(result as Property);
      }
    } catch (error) {
      console.error(error);
      toast.error("Error al guardar el inmueble");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-50 p-4 md:p-6 overflow-y-auto">
      <div className="bg-[#1E293B] p-6 md:p-8 rounded-2xl border border-white/10 w-full max-w-4xl shadow-2xl my-auto">
        <div className="flex justify-between items-center pb-4 border-b border-white/10 mb-6">
          <div>
            <h3 className="text-2xl font-bold text-white font-heading">
              {editingProperty ? "Editar Ficha de Inmueble" : "Subir Nuevo Inmueble"}
            </h3>
            <p className="text-xs text-slate-400 mt-1">Completa los campos técnicos y sube el contenido multimedia a Supabase</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 hover:bg-white/10 rounded-full transition-all">
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

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Planta</label>
                <input
                  {...register("floor")}
                  className="w-full bg-[#0F172A] border border-white/10 rounded-xl py-2.5 px-3 text-white focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all text-sm"
                  placeholder="Ej: 3º, Bajo, Ático"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Ascensor</label>
                <label className="flex items-center gap-3 bg-[#0F172A] border border-white/10 rounded-xl py-2.5 px-3 cursor-pointer h-[42px]">
                  <span className="relative inline-flex items-center">
                    <input type="checkbox" {...register("elevator")} className="sr-only peer" />
                    <span className="w-10 h-5 bg-slate-700 rounded-full peer peer-checked:bg-emerald-500 transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5"></span>
                  </span>
                  <span className="text-sm text-slate-300 font-semibold">Sí, dispone de ascensor</span>
                </label>
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

          {/* Section: Multimedia uploads */}
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

          {/* Section: Online Visit scheduler */}
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
              onClick={onClose}
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
  );
}
