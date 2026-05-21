"use client";

import { useState, useEffect, useMemo } from "react";
import { 
  Search, Home, MapPin, Calendar, X, ChevronLeft, ChevronRight, 
  BedDouble, Bath, Ruler, DollarSign, CheckCircle2, Clock, 
  Phone, Mail, User, Sparkles, AlertCircle
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Property } from "@/types";
import { bookPublicAppointment } from "@/lib/appointmentService";
import { BUSINESS, VALIDATION } from "@/lib/constants";
import BuyerRegistrationModal from "@/components/BuyerRegistrationModal";

interface PropertyFeatures {
  zona?: string
  address?: string
  banos?: number
  baths?: number
  habitaciones?: number
  rooms?: number
  metros?: number
  sqm?: number
  propertyType?: string
  is_visitable_online?: boolean
  visitable_slots?: {
    active?: boolean
    schedule?: Record<string, string[]>
    days?: string[]
    slots?: string[]
  }
}

interface CalendarDay {
  date: Date
  formattedDate: string
  dayName: string
  isoString: string
  isAvailable: boolean
  slots: string[]
}

const getPropertyDetails = (property: Property) => {
  const f = (property.features || {}) as PropertyFeatures;
  const titleLower = property.title.toLowerCase();
  
  let zona = 'Sevilla';
  if (f.zona) {
    zona = f.zona;
  } else if (f.address) {
    zona = f.address;
  } else {
    const parts = property.title.split(' en ');
    if (parts.length > 1) {
      zona = parts[parts.length - 1];
    }
  }

  const baths = f.banos ?? f.baths ?? 1;
  const rooms = f.habitaciones ?? f.rooms ?? 1;
  const sqm = f.metros ?? f.sqm ?? 0;

  let propertyType = 'piso';
  if (f.propertyType) {
    propertyType = f.propertyType;
  } else if (titleLower.includes('chalet') || titleLower.includes('casa') || titleLower.includes('villa')) {
    propertyType = 'casa';
  } else if (titleLower.includes('estudio') || titleLower.includes('loft')) {
    propertyType = 'estudio';
  }

  return {
    zona,
    baths,
    rooms,
    sqm,
    propertyType: propertyType.toLowerCase()
  };
};

const getNext14Days = (features: any): CalendarDay[] => {
  const days: CalendarDay[] = [];
  const DAYS_OF_WEEK_SPANISH = [
    'Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'
  ];
  const MONTHS_SPANISH = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const sanitizeDayName = (name: string) => {
    return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  };

  const visitableSlots = features?.visitable_slots || {};
  const schedule = visitableSlots.schedule || {};
  const staticDays = visitableSlots.days || [];
  const staticSlots = visitableSlots.slots || [];

  for (let i = 1; i <= 14; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);

    const dayName = DAYS_OF_WEEK_SPANISH[d.getDay()];
    const formattedDate = `${d.getDate()} de ${MONTHS_SPANISH[d.getMonth()]}`;
    const isoString = d.toISOString().split('T')[0];

    let daySlots: string[] = [];
    const normTarget = sanitizeDayName(dayName);

    for (const key of Object.keys(schedule)) {
      if (sanitizeDayName(key) === normTarget) {
        daySlots = schedule[key] || [];
        break;
      }
    }

    if (daySlots.length === 0 && Array.isArray(staticDays) && Array.isArray(staticSlots)) {
      const matchesStatic = staticDays.some(
        (sd: string) => sanitizeDayName(sd) === normTarget
      );
      if (matchesStatic) {
        daySlots = staticSlots;
      }
    }

    days.push({
      date: d,
      formattedDate,
      dayName,
      isoString,
      isAvailable: daySlots.length > 0,
      slots: daySlots
    });
  }

  return days;
};

export default function ComprarPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [searchQuery, setSearchQuery] = useState("");
  const [propertyType, setPropertyType] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [minRooms, setMinRooms] = useState("");
  const [minBaths, setMinBaths] = useState("");

  // Modal de Detalle
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [activeImageIdx, setActiveImageIdx] = useState(0);

  // Agendamiento Cita
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [bookingName, setBookingName] = useState("");
  const [bookingPhone, setBookingPhone] = useState("");
  const [bookingEmail, setBookingEmail] = useState("");
  const [bookingNotes, setBookingNotes] = useState("");
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  // Modal de Captación / Registro
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);

  // Memoized property details for the selected property modal (avoids redundant recalculations)
  const selectedDetails = useMemo(
    () => (selectedProperty ? getPropertyDetails(selectedProperty) : null),
    [selectedProperty]
  );

  useEffect(() => {
    async function loadProperties() {
      try {
        setLoading(true);
        const { data, error: fetchError } = await supabase
          .from("properties")
          .select("*")
          .eq("status", "active")
          .order("created_at", { ascending: false });

        if (fetchError) throw fetchError;
        setProperties(data || []);
      } catch (err: any) {
        console.error("Error al cargar propiedades de Supabase:", err);
        setError("No se pudieron cargar las propiedades en este momento.");
      } finally {
        setLoading(false);
      }
    }

    loadProperties();
  }, []);

  useEffect(() => {
    if (selectedProperty) {
      const days = getNext14Days(selectedProperty.features);
      setCalendarDays(days);
      setSelectedDay(null);
      setSelectedSlot(null);
      setBookingName("");
      setBookingPhone("");
      setBookingEmail("");
      setBookingNotes("");
      setBookingSuccess(false);
      setBookingError(null);
      setActiveImageIdx(0);
    }
  }, [selectedProperty]);

  const filteredProperties = properties.filter((p) => {
    const details = getPropertyDetails(p);

    // Búsqueda por texto (título o zona)
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesTitle = p.title.toLowerCase().includes(query);
      const matchesZona = details.zona.toLowerCase().includes(query);
      if (!matchesTitle && !matchesZona) return false;
    }

    // Tipo de propiedad
    if (propertyType && details.propertyType !== propertyType) {
      return false;
    }

    // Rango de precio
    if (minPrice && p.price < Number(minPrice)) return false;
    if (maxPrice && p.price > Number(maxPrice)) return false;

    // Dormitorios y baños
    if (minRooms && details.rooms < Number(minRooms)) return false;
    if (minBaths && details.baths < Number(minBaths)) return false;

    return true;
  });

  const handleBookAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProperty || !selectedDay || !selectedSlot) return;

    try {
      setBookingLoading(true);
      setBookingError(null);

      // Validate phone format before sending
      const cleanPhone = bookingPhone.trim().replace(/\s+/g, '');
      if (!VALIDATION.phone.regex.test(cleanPhone)) {
        setBookingError(VALIDATION.phone.message);
        setBookingLoading(false);
        return;
      }

      // Combinar fecha y hora seleccionada para el scheduled_at
      const timeParts = selectedSlot.split(":");
      const appointmentDate = new Date(selectedDay.date);
      appointmentDate.setHours(Number(timeParts[0]), Number(timeParts[1]), 0, 0);

      const result = await bookPublicAppointment({
        leadName: bookingName,
        leadPhone: bookingPhone,
        leadEmail: bookingEmail,
        propertyId: selectedProperty.id,
        propertyTitle: selectedProperty.title,
        scheduledAt: appointmentDate.toISOString(),
        notes: bookingNotes
      });

      if (result.success) {
        setBookingSuccess(true);
      } else {
        setBookingError(result.error || "No se pudo reservar la cita.");
      }
    } catch (err: any) {
      setBookingError("Ocurrió un error inesperado al procesar tu reserva.");
    } finally {
      setBookingLoading(false);
    }
  };

  const fallbackImage = "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=800&q=80";

  return (
    <div className="min-h-screen bg-[#1a252f] pt-32 pb-24 text-white relative overflow-hidden">
      {/* Elementos decorativos */}
      <div className="absolute inset-0 bg-[url('/assets/images/pattern.svg')] opacity-5 z-0 pointer-events-none"></div>
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#FBBF24]/10 rounded-full mix-blend-screen filter blur-3xl opacity-30 z-0"></div>
      <div className="absolute bottom-10 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full mix-blend-screen filter blur-3xl opacity-20 z-0"></div>

      <div className="container mx-auto px-4 relative z-10">
        
        {/* Cabecera */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-block bg-[#FBBF24]/10 border border-[#FBBF24]/30 text-[#FBBF24] font-bold px-4 py-2 rounded-full mb-6 backdrop-blur-sm shadow-[0_0_15px_rgba(251,191,36,0.3)] text-sm">
            ✨ Propiedades Exclusivas en Sevilla
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold font-heading mb-6 drop-shadow-md">
            Pisos y Casas <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FBBF24] to-yellow-200">Sin Comisiones</span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-300 font-light max-w-2xl mx-auto">
            Comprar con Álvaro significa pagar <strong className="text-[#FBBF24] font-semibold">0€ de honorarios</strong>. 
            Te asesoramos, te acompañamos y gestionamos todo de manera premium y honesta.
          </p>
        </div>

        {/* Barra de Filtros Glassmorphic */}
        <div className="glass-effect bg-[#2C3E50]/75 p-6 rounded-2xl mb-12 shadow-2xl border border-white/10 max-w-6xl mx-auto">
          <h2 className="text-lg font-semibold text-[#FBBF24] mb-4 flex items-center gap-2">
            <Search size={18} /> Filtrar Propiedades
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            
            {/* Ubicación */}
            <div className="relative">
              <MapPin className="absolute left-3 top-3 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="Zona (ej: Sevilla, Triana)" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-white/10 bg-white/5 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FBBF24] text-sm"
              />
            </div>

            {/* Tipo */}
            <div>
              <select 
                value={propertyType}
                onChange={(e) => setPropertyType(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-[#2C3E50] text-white focus:outline-none focus:ring-2 focus:ring-[#FBBF24] text-sm cursor-pointer"
              >
                <option value="">Cualquier tipo</option>
                <option value="piso">Piso</option>
                <option value="casa">Casa / Chalet</option>
                <option value="estudio">Estudio / Loft</option>
              </select>
            </div>

            {/* Precio Mínimo */}
            <div>
              <input 
                type="number" 
                placeholder="Precio mín (€)" 
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FBBF24] text-sm"
              />
            </div>

            {/* Precio Máximo */}
            <div>
              <input 
                type="number" 
                placeholder="Precio máx (€)" 
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FBBF24] text-sm"
              />
            </div>

            {/* Habitación Mínima */}
            <div>
              <select 
                value={minRooms}
                onChange={(e) => setMinRooms(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-[#2C3E50] text-white focus:outline-none focus:ring-2 focus:ring-[#FBBF24] text-sm cursor-pointer"
              >
                <option value="">Habitaciones</option>
                <option value="1">1+ hab</option>
                <option value="2">2+ hab</option>
                <option value="3">3+ hab</option>
                <option value="4">4+ hab</option>
              </select>
            </div>

            {/* Baño Mínimo */}
            <div>
              <select 
                value={minBaths}
                onChange={(e) => setMinBaths(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-[#2C3E50] text-white focus:outline-none focus:ring-2 focus:ring-[#FBBF24] text-sm cursor-pointer"
              >
                <option value="">Baños</option>
                <option value="1">1+ baños</option>
                <option value="2">2+ baños</option>
                <option value="3">3+ baños</option>
              </select>
            </div>

          </div>
        </div>

        {/* Resultados del Listado */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {[1, 2, 3].map((n) => (
              <div key={n} className="animate-pulse bg-[#2C3E50]/40 rounded-2xl h-[450px] border border-white/5"></div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-20 bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold text-[#FBBF24] mb-4">Error de conexión</h2>
            <p className="text-slate-300 mb-6">{error}</p>
            <button 
              onClick={() => window.location.reload()}
              className="bg-[#FBBF24] text-[#2C3E50] px-6 py-2.5 rounded-xl font-bold transition-all hover:scale-105"
            >
              Reintentar
            </button>
          </div>
        ) : filteredProperties.length === 0 ? (
          <div className="text-center py-20 bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold text-slate-300 mb-2">No se encontraron propiedades</h2>
            <p className="text-slate-400 mb-8 max-w-md mx-auto">
              No hay inmuebles que coincidan exactamente con tus filtros. Crea una alerta y te avisaremos por WhatsApp en cuanto entre uno nuevo.
            </p>
            <button 
              onClick={() => setIsRegisterModalOpen(true)}
              className="bg-[#FBBF24] text-[#2C3E50] px-8 py-3 rounded-full font-bold transition-all inline-block hover:scale-105 shadow-lg"
            >
              Notificarme Nuevos Inmuebles
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {filteredProperties.map((p) => {
              const details = getPropertyDetails(p);
              const f = (p.features || {}) as PropertyFeatures;
              const hasVisitable = f.is_visitable_online === true || f.visitable_slots?.active === true;
              const mainImg = p.images && p.images.length > 0 ? p.images[0] : fallbackImage;

              return (
                <div 
                  key={p.id}
                  className="glass-effect bg-[#2C3E50]/70 border border-white/10 rounded-2xl overflow-hidden shadow-xl transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(251,191,36,0.15)] flex flex-col group"
                >
                  {/* Foto con Hover */}
                  <div className="relative h-60 w-full overflow-hidden bg-slate-800">
                    <img 
                      src={mainImg} 
                      alt={p.title} 
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#2C3E50] via-transparent to-transparent"></div>
                    
                    {/* Badge de Precio */}
                    <div className="absolute top-4 left-4 bg-[#FBBF24] text-[#2C3E50] px-3.5 py-1.5 rounded-lg font-bold shadow-lg text-sm">
                      {p.price.toLocaleString('es-ES')} €
                    </div>

                    {/* Badge de Reserva Online */}
                    {hasVisitable && (
                      <div className="absolute top-4 right-4 bg-emerald-500/90 text-white border border-emerald-400/30 px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 backdrop-blur-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-ping"></span>
                        Reserva Online
                      </div>
                    )}
                  </div>

                  {/* Contenido Ficha */}
                  <div className="p-6 flex flex-col flex-grow">
                    <div className="flex items-center text-slate-400 text-xs gap-1.5 mb-2">
                      <MapPin size={14} className="text-[#FBBF24]" />
                      <span>{details.zona}</span>
                    </div>

                    <h3 className="text-xl font-bold mb-4 text-white group-hover:text-[#FBBF24] transition-colors line-clamp-1">
                      {p.title}
                    </h3>

                    {/* Características */}
                    <div className="grid grid-cols-3 gap-2 py-3 border-y border-white/5 text-slate-300 mb-6 text-sm">
                      <div className="flex items-center gap-1.5 justify-center">
                        <BedDouble size={16} className="text-[#FBBF24]" />
                        <span>{details.rooms} {details.rooms === 1 ? 'Hab' : 'Habs'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 justify-center">
                        <Bath size={16} className="text-[#FBBF24]" />
                        <span>{details.baths} {details.baths === 1 ? 'Baño' : 'Baños'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 justify-center">
                        <Ruler size={16} className="text-[#FBBF24]" />
                        <span>{details.sqm} m²</span>
                      </div>
                    </div>

                    {/* CTA */}
                    <div className="mt-auto">
                      <button 
                        onClick={() => setSelectedProperty(p)}
                        className="w-full bg-white/5 border border-white/20 text-white font-bold py-3 rounded-xl transition-all duration-300 group-hover:bg-[#FBBF24] group-hover:text-[#2C3E50] group-hover:border-[#FBBF24] text-center block"
                      >
                        Ver Ficha Completa
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* Modal Premium de Detalle */}
      {selectedProperty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
          <div className="relative w-full max-w-5xl my-8 bg-[#2C3E50] border border-white/10 rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            
            {/* Botón Cerrar */}
            <button 
              onClick={() => setSelectedProperty(null)}
              className="absolute top-4 right-4 z-10 bg-black/40 hover:bg-black/60 text-white p-2 rounded-full transition-colors border border-white/10"
            >
              <X size={20} />
            </button>

            <div className="grid grid-cols-1 lg:grid-cols-2">
              
              {/* Columna Izquierda: Galería e Información */}
              <div className="p-6 md:p-8 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-white/10">
                <div>
                  {/* Carrusel de Imágenes */}
                  <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-800 mb-6 shadow-inner group">
                    <img 
                      src={selectedProperty.images && selectedProperty.images.length > 0 ? selectedProperty.images[activeImageIdx] : fallbackImage} 
                      alt={selectedProperty.title} 
                      className="w-full h-full object-cover"
                    />
                    
                    {/* Controles de Navegación si hay más de 1 imagen */}
                    {selectedProperty.images && selectedProperty.images.length > 1 && (
                      <>
                        <button 
                          onClick={() => setActiveImageIdx(prev => prev === 0 ? selectedProperty.images.length - 1 : prev - 1)}
                          className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/75 p-1.5 rounded-full text-white transition-colors"
                        >
                          <ChevronLeft size={20} />
                        </button>
                        <button 
                          onClick={() => setActiveImageIdx(prev => prev === selectedProperty.images.length - 1 ? 0 : prev + 1)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/75 p-1.5 rounded-full text-white transition-colors"
                        >
                          <ChevronRight size={20} />
                        </button>
                        
                        {/* Indicador de posición */}
                        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/50 px-2.5 py-1 rounded-full text-xs font-semibold">
                          {activeImageIdx + 1} / {selectedProperty.images.length}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Título, Zona y Precio */}
                  <div className="mb-6">
                    <div className="flex items-center text-slate-400 text-sm gap-1 mb-2">
                      <MapPin size={16} className="text-[#FBBF24]" />
                      <span>{selectedDetails?.zona}</span>
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2 font-heading">
                      {selectedProperty.title}
                    </h2>
                    <div className="text-3xl font-extrabold text-[#FBBF24]">
                      {selectedProperty.price.toLocaleString('es-ES')} €
                    </div>
                  </div>

                  {/* Ficha de Specs */}
                  <div className="grid grid-cols-3 gap-4 p-4 rounded-xl bg-white/5 border border-white/5 text-center mb-6 text-sm">
                    <div>
                      <div className="text-slate-400 text-xs mb-1">Dormitorios</div>
                      <div className="font-bold flex items-center justify-center gap-1">
                        <BedDouble size={16} className="text-[#FBBF24]" />
                        {selectedDetails?.rooms}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-xs mb-1">Baños</div>
                      <div className="font-bold flex items-center justify-center gap-1">
                        <Bath size={16} className="text-[#FBBF24]" />
                        {selectedDetails?.baths}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-xs mb-1">Superficie</div>
                      <div className="font-bold flex items-center justify-center gap-1">
                        <Ruler size={16} className="text-[#FBBF24]" />
                        {selectedDetails?.sqm} m²
                      </div>
                    </div>
                  </div>

                  {/* Descripción */}
                  <div>
                    <h4 className="text-sm font-semibold text-[#FBBF24] mb-2 uppercase tracking-wider">Descripción</h4>
                    <p className="text-slate-300 text-sm leading-relaxed max-h-48 overflow-y-auto pr-2">
                      {selectedProperty.description || "Precioso inmueble cuidadosamente seleccionado. Cuenta con excelentes características y ubicación. Contáctanos directamente para recibir la ficha completa del inmueble."}
                    </p>
                  </div>
                </div>

                {/* WhatsApp Direct */}
                <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between">
                  <div className="text-xs text-slate-400">
                    ¿Quieres recibir más fotos o plano técnico?
                  </div>
                  <a 
                    href={BUSINESS.whatsappUrl(`Hola Álvaro, estoy interesado en el inmueble "${selectedProperty.title}" (${selectedProperty.price.toLocaleString('es-ES')}€).`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-4 py-2 rounded-xl transition-all flex items-center gap-2 text-xs"
                  >
                    <Phone size={14} /> WhatsApp Directo
                  </a>
                </div>
              </div>

              {/* Columna Derecha: Sistema de Agendamiento Online */}
              <div className="p-6 md:p-8 bg-black/25 flex flex-col justify-between">
                
                {/* Cabecera Agendador */}
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2 font-heading">
                    <Calendar className="text-[#FBBF24]" size={22} /> Reserva de Visita Online
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Agenda una visita en tiempo real de forma 100% online y gratuita. Tu asesor se pondrá en contacto para confirmar los detalles.
                  </p>
                </div>

                {/* Proceso de Reserva */}
                {!((selectedProperty.features as PropertyFeatures)?.is_visitable_online === true || (selectedProperty.features as PropertyFeatures)?.visitable_slots?.active === true) ? (
                  /* Caso No Visitable Online */
                  <div className="py-8 text-center bg-white/5 border border-white/5 rounded-2xl px-4 flex flex-col items-center justify-center h-full">
                    <AlertCircle size={40} className="text-[#FBBF24] mb-3" />
                    <h4 className="text-sm font-semibold text-white mb-2">Agenda por WhatsApp</h4>
                    <p className="text-xs text-slate-300 mb-6 leading-relaxed max-w-xs">
                      Este inmueble tiene un calendario especial. Agenda directamente por mensaje y nos adaptaremos totalmente a tu horario.
                    </p>
                    <a 
                      href={BUSINESS.whatsappUrl(`Hola Álvaro, quiero concertar una visita para el inmueble: "${selectedProperty.title}".`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-[#FBBF24] text-[#2C3E50] font-bold px-6 py-2.5 rounded-xl text-xs hover:scale-105 transition-all flex items-center gap-2"
                    >
                      <Phone size={14} /> Concertar Visita por WhatsApp
                    </a>
                  </div>
                ) : bookingSuccess ? (
                  /* Caso Éxito Reserva */
                  <div className="py-8 text-center bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-4 flex flex-col items-center justify-center h-full animate-in fade-in duration-300">
                    <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mb-4">
                      <CheckCircle2 size={36} className="text-emerald-400" />
                    </div>
                    <h4 className="text-lg font-bold text-emerald-400 mb-2">¡Reserva Solicitada!</h4>
                    <p className="text-xs text-slate-300 mb-6 leading-relaxed max-w-xs">
                      Hemos recibido tu solicitud de visita para el <strong>{selectedDay?.formattedDate}</strong> a las <strong>{selectedSlot}</strong>. 
                      Álvaro te enviará un WhatsApp en las próximas horas para confirmar la cita de forma definitiva.
                    </p>
                    <button 
                      onClick={() => setSelectedProperty(null)}
                      className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-6 py-2.5 rounded-xl text-xs transition-colors"
                    >
                      Entendido, Cerrar Ficha
                    </button>
                  </div>
                ) : (
                  /* Agendamiento Paso a Paso */
                  <form onSubmit={handleBookAppointment} className="flex-grow flex flex-col justify-between">
                    <div>
                      {/* 1. Selección de Día */}
                      <div className="mb-6">
                        <label className="block text-xs font-semibold uppercase text-slate-400 mb-2">1. Selecciona el día</label>
                        <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto pr-1">
                          {calendarDays.map((d) => (
                            <button
                              key={d.isoString}
                              type="button"
                              disabled={!d.isAvailable}
                              onClick={() => {
                                setSelectedDay(d);
                                setSelectedSlot(null);
                              }}
                              className={`p-2 rounded-xl text-center border text-xs transition-all flex flex-col justify-center items-center ${
                                !d.isAvailable 
                                  ? "border-white/5 text-slate-500 cursor-not-allowed bg-transparent"
                                  : selectedDay?.isoString === d.isoString
                                    ? "border-[#FBBF24] bg-[#FBBF24]/10 text-white font-bold"
                                    : "border-white/10 hover:border-white/30 text-slate-300 bg-white/5"
                              }`}
                            >
                              <span className="text-[10px] text-slate-400 font-semibold">{d.dayName}</span>
                              <span className="text-sm font-semibold">{d.date.getDate()}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 2. Selección de Hora */}
                      <div className="mb-6">
                        <label className="block text-xs font-semibold uppercase text-slate-400 mb-2">2. Selecciona la hora</label>
                        {!selectedDay ? (
                          <div className="text-xs text-slate-500 bg-white/5 border border-white/5 p-3 rounded-xl text-center">
                            Elige primero el día de tu visita
                          </div>
                        ) : selectedDay.slots.length === 0 ? (
                          <div className="text-xs text-amber-400 bg-amber-400/5 border border-amber-400/10 p-3 rounded-xl text-center">
                            Sin horas configuradas para este día
                          </div>
                        ) : (
                          <div className="grid grid-cols-4 gap-2">
                            {selectedDay.slots.map((s) => (
                              <button
                                key={s}
                                type="button"
                                onClick={() => setSelectedSlot(s)}
                                className={`py-2 px-1 rounded-xl text-center border text-xs transition-all font-semibold flex items-center justify-center gap-1 ${
                                  selectedSlot === s
                                    ? "border-[#FBBF24] bg-[#FBBF24]/10 text-white font-bold"
                                    : "border-white/10 hover:border-white/30 text-slate-300 bg-white/5"
                                }`}
                              >
                                <Clock size={12} className="text-[#FBBF24]" /> {s}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* 3. Datos del Lead */}
                      <div className="space-y-3">
                        <label className="block text-xs font-semibold uppercase text-slate-400">3. Datos de contacto</label>
                        
                        <div className="relative">
                          <User className="absolute left-3 top-3 text-slate-400" size={14} />
                          <input 
                            type="text" 
                            required
                            placeholder="Nombre completo"
                            value={bookingName}
                            onChange={(e) => setBookingName(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 rounded-xl border border-white/10 bg-white/5 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FBBF24] text-xs"
                          />
                        </div>

                        <div className="relative">
                          <Phone className="absolute left-3 top-3 text-slate-400" size={14} />
                          <input 
                            type="tel" 
                            required
                            placeholder="Teléfono móvil"
                            value={bookingPhone}
                            onChange={(e) => setBookingPhone(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 rounded-xl border border-white/10 bg-white/5 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FBBF24] text-xs"
                          />
                        </div>

                        <div className="relative">
                          <Mail className="absolute left-3 top-3 text-slate-400" size={14} />
                          <input 
                            type="email" 
                            placeholder="Email (opcional)"
                            value={bookingEmail}
                            onChange={(e) => setBookingEmail(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 rounded-xl border border-white/10 bg-white/5 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FBBF24] text-xs"
                          />
                        </div>

                        <div>
                          <textarea 
                            placeholder="¿Tienes alguna preferencia o comentario? (opcional)"
                            value={bookingNotes}
                            onChange={(e) => setBookingNotes(e.target.value)}
                            rows={2}
                            className="w-full px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FBBF24] text-xs resize-none"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Botón y Errores */}
                    <div className="mt-6">
                      {bookingError && (
                        <div className="mb-3 text-xs text-rose-400 bg-rose-400/5 border border-rose-400/10 p-2.5 rounded-xl text-center">
                          {bookingError}
                        </div>
                      )}
                      
                      <button
                        type="submit"
                        disabled={!selectedDay || !selectedSlot || bookingLoading}
                        className="w-full bg-[#FBBF24] disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-[#2C3E50] font-bold py-3.5 rounded-xl transition-all hover:scale-105 active:scale-95 text-xs uppercase tracking-wider flex items-center justify-center gap-2"
                      >
                        {bookingLoading ? (
                          <>
                            <span className="w-4 h-4 border-2 border-[#2C3E50] border-t-transparent rounded-full animate-spin"></span>
                            Procesando...
                          </>
                        ) : (
                          <>
                            <Sparkles size={14} /> Confirmar Reserva de Visita
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                )}

              </div>

            </div>

          </div>
        </div>
      )}

      {/* Modal Alerta Inmuebles */}
      <BuyerRegistrationModal 
        isOpen={isRegisterModalOpen} 
        onClose={() => setIsRegisterModalOpen(false)} 
      />
    </div>
  );
}
