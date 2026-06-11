"use client";

import { useState, useEffect, useMemo } from "react";
import { 
  Search, Home, MapPin, Calendar, X, ChevronLeft, ChevronRight, 
  BedDouble, Bath, Ruler, DollarSign, CheckCircle2, Clock, 
  Phone, Mail, User, Sparkles, AlertCircle, Maximize, FileText, Download
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Property, Appointment } from "@/types";
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
  video_url?: string
  plan_url?: string
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

const getNext14Days = (features: PropertyFeatures | null | undefined, existingAppointments: Partial<Appointment>[] = []): CalendarDay[] => {
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

    // Filtrar slots colisionados con citas de Álvaro en hora local
    const filteredDaySlots = daySlots.filter((slotStr) => {
      const [slotHour, slotMinute] = slotStr.split(':').map(Number);
      
      const isBlocked = existingAppointments.some((appt) => {
        if (!appt.scheduled_at) return false;
        const apptDate = new Date(appt.scheduled_at);
        
        // Comparar año, mes y día en hora local
        const matchesDate = 
          apptDate.getFullYear() === d.getFullYear() &&
          apptDate.getMonth() === d.getMonth() &&
          apptDate.getDate() === d.getDate();
          
        if (!matchesDate) return false;
        
        // Comparar horas y minutos
        return apptDate.getHours() === slotHour && apptDate.getMinutes() === slotMinute;
      });
      
      return !isBlocked;
    });

    days.push({
      date: d,
      formattedDate,
      dayName,
      isoString,
      isAvailable: filteredDaySlots.length > 0,
      slots: filteredDaySlots
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
  const [isFullscreenImages, setIsFullscreenImages] = useState(false);

  // Multimedia & Planos
  const [activeMediaTab, setActiveMediaTab] = useState<'video' | 'plan'>('video');
  const [isFullscreenPlan, setIsFullscreenPlan] = useState(false);

  // Keyboard navigation for fullscreen images and plan
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isFullscreenImages && selectedProperty?.images) {
        if (e.key === "ArrowLeft") {
          setActiveImageIdx((prev) => (prev === 0 ? selectedProperty.images.length - 1 : prev - 1));
        } else if (e.key === "ArrowRight") {
          setActiveImageIdx((prev) => (prev === selectedProperty.images.length - 1 ? 0 : prev + 1));
        } else if (e.key === "Escape") {
          setIsFullscreenImages(false);
        }
      }
      if (isFullscreenPlan) {
        if (e.key === "Escape") {
          setIsFullscreenPlan(false);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreenImages, isFullscreenPlan, selectedProperty]);

  // Agendamiento Cita
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [appointments, setAppointments] = useState<Partial<Appointment>[]>([]);
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
      } catch (err: unknown) {
        console.error("Error al cargar propiedades de Supabase:", err instanceof Error ? err.message : String(err));
        setError("No se pudieron cargar las propiedades en este momento.");
      } finally {
        setLoading(false);
      }
    }

    loadProperties();
  }, []);

  useEffect(() => {
    async function loadAppointmentsAndSetCalendar() {
      if (!selectedProperty) return;
      
      try {
        const now = new Date();
        const future = new Date();
        future.setDate(now.getDate() + 14);

        const { data, error } = await supabase
          .from("appointments")
          .select("scheduled_at, status")
          .gte("scheduled_at", now.toISOString())
          .lte("scheduled_at", future.toISOString())
          .neq("status", "cancelled");

        if (error) {
          console.warn("Could not fetch appointments, calendar might show all slots:", error.message);
          const days = getNext14Days(selectedProperty.features, []);
          setCalendarDays(days);
          setAppointments([]);
        } else {
          const apps = data || [];
          setAppointments(apps);
          const days = getNext14Days(selectedProperty.features, apps);
          setCalendarDays(days);
        }
      } catch (err: unknown) {
        console.warn("Unexpected error fetching appointments:", err instanceof Error ? err.message : String(err));
        const days = getNext14Days(selectedProperty.features, []);
        setCalendarDays(days);
        setAppointments([]);
      }
      
      setSelectedDay(null);
      setSelectedSlot(null);
      setBookingName("");
      setBookingPhone("");
      setBookingEmail("");
      setBookingNotes("");
      setBookingSuccess(false);
      setBookingError(null);
      setActiveImageIdx(0);
      setIsFullscreenImages(false);

      const f = (selectedProperty.features || {}) as PropertyFeatures;
      if (f.video_url) {
        setActiveMediaTab('video');
      } else if (f.plan_url) {
        setActiveMediaTab('plan');
      }
      setIsFullscreenPlan(false);
    }

    loadAppointmentsAndSetCalendar();
  }, [selectedProperty]);

  // D10/R18 (Brief #011 F1.4): el detalle del inmueble es un MODAL y no cambia
  // la URL, así que AnalyticsTracker (usePathname) nunca registraba estas
  // vistas y los contadores de "visitas del inmueble" salían a 0. Track
  // explícito con page_path virtual que contiene el id (Publicación web y
  // Operaciones cuentan filas cuyo page_path incluye el property_id). Mismo
  // shape y session_id de localStorage que AnalyticsTracker — el endpoint
  // devuelve 400 silencioso si falta session_id.
  const selectedPropertyId = selectedProperty?.id;
  useEffect(() => {
    if (!selectedPropertyId) return;
    try {
      let sessionId = localStorage.getItem("analytics_session_id");
      if (!sessionId) {
        sessionId = typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        localStorage.setItem("analytics_session_id", sessionId);
      }
      void fetch("/api/analytics/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          page_path: `/comprar/p/${selectedPropertyId}`,
          referrer: document.referrer || null,
          user_agent: navigator.userAgent || null,
          full_url: window.location.href,
        }),
      }).catch((err) => console.error("Failed to track property view:", err));
    } catch (err) {
      console.error("Failed to track property view:", err);
    }
  }, [selectedPropertyId]);

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
    } catch (err: unknown) {
      console.error("Unexpected error in booking:", err instanceof Error ? err.message : String(err));
      setBookingError("Ocurrió un error inesperado al procesar tu reserva.");
    } finally {
      setBookingLoading(false);
    }
  };

  const fallbackImage = "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=800&q=80";

  return (
    <div className="min-h-screen bg-[#0f172a] pt-32 pb-24 text-white relative overflow-hidden">
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
        <div className="glass-effect bg-[#1E293B]/70 border border-white/5 backdrop-blur-md p-6 rounded-2xl mb-12 shadow-2xl max-w-6xl mx-auto">
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
                className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-[#0f172a]/80 text-white focus:outline-none focus:ring-2 focus:ring-[#FBBF24] text-sm cursor-pointer"
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
                className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-[#0f172a]/80 text-white focus:outline-none focus:ring-2 focus:ring-[#FBBF24] text-sm cursor-pointer"
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
                className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-[#0f172a]/80 text-white focus:outline-none focus:ring-2 focus:ring-[#FBBF24] text-sm cursor-pointer"
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
              <div key={n} className="animate-pulse bg-[#1E293B]/40 rounded-2xl h-[450px] border border-white/5"></div>
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
                  onClick={() => setSelectedProperty(p)}
                  className="glass-effect bg-[#1E293B]/70 border border-white/5 backdrop-blur-md rounded-2xl overflow-hidden shadow-xl transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(251,191,36,0.15)] flex flex-col group cursor-pointer hover:border-[#FBBF24]/30"
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
                      <div 
                        className="w-full bg-white/5 border border-white/20 text-white font-bold py-3 rounded-xl transition-all duration-300 group-hover:bg-[#FBBF24] group-hover:text-[#2C3E50] group-hover:border-[#FBBF24] text-center block text-sm"
                      >
                        Ver Detalle Completo
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* Fullscreen Premium Detail View */}
      {selectedProperty && (
        <div className="fixed inset-0 z-50 bg-[#0f172a] overflow-y-auto flex flex-col animate-fadeIn">
          {/* Navigation Bar */}
          <div className="sticky top-0 z-50 bg-[#0f172a]/90 backdrop-blur-md border-b border-white/5 px-6 py-4 flex items-center justify-between">
            <button 
              onClick={() => setSelectedProperty(null)}
              className="flex items-center gap-2 text-slate-300 hover:text-[#FBBF24] font-semibold transition-colors text-sm group"
            >
              <ChevronLeft size={20} className="transition-transform group-hover:-translate-x-1" />
              Volver al catálogo
            </button>
            <div className="hidden sm:block text-slate-400 text-xs font-medium">
              Inmueble Ref: {selectedProperty.id.substring(0, 8).toUpperCase()}
            </div>
          </div>

          <div className="flex-grow container mx-auto px-4 py-8 max-w-7xl">
            <div className="flex flex-col lg:flex-row gap-8">
              
              {/* Columna Izquierda: Galería e Información (65%) */}
              <div className="w-full lg:w-[65%] space-y-6">
                
                {/* Carrusel de Imágenes Premium */}
                <div className="relative aspect-[21/9] rounded-2xl overflow-hidden bg-slate-800 shadow-2xl group border border-white/5">
                  <img 
                    src={selectedProperty.images && selectedProperty.images.length > 0 ? selectedProperty.images[activeImageIdx] : fallbackImage} 
                    alt={selectedProperty.title} 
                    className="w-full h-full object-cover transition-transform duration-750 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
                  
                  {/* Botón elegante de maximizar ('Expandir') */}
                  {selectedProperty.images && selectedProperty.images.length > 0 && (
                    <button
                      onClick={() => setIsFullscreenImages(true)}
                      className="absolute top-4 right-4 bg-black/60 hover:bg-[#FBBF24] hover:text-[#0f172a] px-3.5 py-1.5 rounded-lg text-white font-bold transition-all shadow-lg active:scale-95 border border-white/10 z-10 text-xs flex items-center gap-1.5 backdrop-blur-sm"
                      aria-label="Ver a pantalla completa"
                    >
                      <Maximize size={14} />
                      <span>Expandir</span>
                    </button>
                  )}
                  
                  {/* Controles de Navegación si hay más de 1 imagen */}
                  {selectedProperty.images && selectedProperty.images.length > 1 && (
                    <>
                      <button 
                        onClick={() => setActiveImageIdx(prev => prev === 0 ? selectedProperty.images.length - 1 : prev - 1)}
                        aria-label="Imagen anterior"
                        className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-[#FBBF24] hover:text-[#0f172a] p-2.5 rounded-full text-white transition-all shadow-lg active:scale-95 border border-white/10"
                      >
                        <ChevronLeft size={22} />
                      </button>
                      <button 
                        onClick={() => setActiveImageIdx(prev => prev === selectedProperty.images.length - 1 ? 0 : prev + 1)}
                        aria-label="Siguiente imagen"
                        className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-[#FBBF24] hover:text-[#0f172a] p-2.5 rounded-full text-white transition-all shadow-lg active:scale-95 border border-white/10"
                      >
                        <ChevronRight size={22} />
                      </button>
                      
                      {/* Indicador de posición premium */}
                      <div className="absolute bottom-4 left-6 bg-black/60 border border-white/10 px-4 py-1.5 rounded-full text-xs font-semibold tracking-wider text-slate-200 backdrop-blur-sm">
                        {activeImageIdx + 1} / {selectedProperty.images.length} fotos
                      </div>
                    </>
                  )}
                </div>

                {/* Título, Zona y Precio */}
                <div className="bg-[#1E293B]/40 border border-white/5 rounded-2xl p-6 backdrop-blur-sm">
                  <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                    <div className="space-y-1.5">
                      <div className="flex items-center text-slate-400 text-sm gap-1.5">
                        <MapPin size={16} className="text-[#FBBF24]" />
                        <span>{selectedDetails?.zona}</span>
                      </div>
                      <h2 className="text-3xl font-extrabold tracking-tight text-white font-heading">
                        {selectedProperty.title}
                      </h2>
                    </div>
                    <div className="text-4xl font-black text-[#FBBF24] drop-shadow-md">
                      {selectedProperty.price.toLocaleString('es-ES')} €
                    </div>
                  </div>

                  {/* Ficha de specs en tarjetas de cristal */}
                  <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/5">
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center backdrop-blur-md hover:bg-white/10 transition-colors">
                      <div className="text-slate-400 text-xs mb-1">Dormitorios</div>
                      <div className="text-lg font-black flex items-center justify-center gap-1.5 text-white">
                        <BedDouble size={20} className="text-[#FBBF24]" />
                        {selectedDetails?.rooms}
                      </div>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center backdrop-blur-md hover:bg-white/10 transition-colors">
                      <div className="text-slate-400 text-xs mb-1">Baños</div>
                      <div className="text-lg font-black flex items-center justify-center gap-1.5 text-white">
                        <Bath size={20} className="text-[#FBBF24]" />
                        {selectedDetails?.baths}
                      </div>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center backdrop-blur-md hover:bg-white/10 transition-colors">
                      <div className="text-slate-400 text-xs mb-1">Superficie</div>
                      <div className="text-lg font-black flex items-center justify-center gap-1.5 text-white">
                        <Ruler size={20} className="text-[#FBBF24]" />
                        {selectedDetails?.sqm} m²
                      </div>
                    </div>
                  </div>
                </div>

                {/* Descripción limpia */}
                <div className="bg-[#1E293B]/40 border border-white/5 rounded-2xl p-6 backdrop-blur-sm space-y-4">
                  <h3 className="text-lg font-bold text-[#FBBF24] border-b border-white/5 pb-2">Descripción del inmueble</h3>
                  <p className="text-slate-300 text-base leading-relaxed whitespace-pre-line">
                    {selectedProperty.description || "Precioso inmueble cuidadosamente seleccionado. Cuenta con excelentes características y ubicación. Contáctanos directamente para recibir la ficha completa del inmueble."}
                  </p>
                </div>

                {/* Sección Multimedia & Distribución */}
                {(() => {
                  const f = (selectedProperty.features || {}) as PropertyFeatures;
                  const videoUrl = f.video_url;
                  const planUrl = f.plan_url;

                  if (!videoUrl && !planUrl) return null;

                  const isYoutube = videoUrl?.includes("youtube.com") || videoUrl?.includes("youtu.be");
                  const isVimeo = videoUrl?.includes("vimeo.com");

                  const getYoutubeEmbedUrl = (url: string) => {
                    let videoId = "";
                    if (url.includes("youtube.com/watch")) {
                      const urlParams = new URLSearchParams(url.split("?")[1]);
                      videoId = urlParams.get("v") || "";
                    } else if (url.includes("youtu.be/")) {
                      videoId = url.split("youtu.be/")[1]?.split("?")[0] || "";
                    } else if (url.includes("youtube.com/embed/")) {
                      videoId = url.split("youtube.com/embed/")[1]?.split("?")[0] || "";
                    }
                    return videoId ? `https://www.youtube.com/embed/${videoId}` : url;
                  };

                  const getVimeoEmbedUrl = (url: string) => {
                    let videoId = "";
                    const regExp = /vimeo\.com\/(?:video\/)?([0-9]+)/;
                    const match = url.match(regExp);
                    if (match) {
                      videoId = match[1];
                    }
                    return videoId ? `https://player.vimeo.com/video/${videoId}` : url;
                  };

                  const isPdfPlan = planUrl?.toLowerCase().endsWith(".pdf");

                  return (
                    <div className="bg-[#1E293B]/40 border border-white/5 rounded-2xl p-6 backdrop-blur-sm space-y-6">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
                        <h3 className="text-lg font-bold text-[#FBBF24]">Multimedia y Distribución</h3>
                        
                        {/* Pestañas de navegación si existen ambos */}
                        {videoUrl && planUrl && (
                          <div className="bg-white/5 border border-white/10 rounded-xl p-1 flex gap-1 self-start sm:self-auto">
                            <button
                              type="button"
                              onClick={() => setActiveMediaTab('video')}
                              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                activeMediaTab === 'video'
                                  ? "bg-[#FBBF24] text-[#0f172a] shadow-md shadow-yellow-500/10"
                                  : "text-slate-400 hover:text-white hover:bg-white/5"
                              }`}
                            >
                              🎥 Recorrido en Vídeo
                            </button>
                            <button
                              type="button"
                              onClick={() => setActiveMediaTab('plan')}
                              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                activeMediaTab === 'plan'
                                  ? "bg-[#FBBF24] text-[#0f172a] shadow-md shadow-yellow-500/10"
                                  : "text-slate-400 hover:text-white hover:bg-white/5"
                              }`}
                            >
                              🗺️ Plano de la Casa
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Contenido según pestaña activa o recurso disponible */}
                      {((videoUrl && planUrl && activeMediaTab === 'video') || (videoUrl && !planUrl)) && (
                        <div className="space-y-3 animate-fadeIn">
                          <p className="text-xs text-slate-400">Visualiza un recorrido completo y realista de la vivienda sin salir de casa.</p>
                          <div className="relative aspect-video rounded-xl overflow-hidden border border-white/10 bg-black/40 shadow-inner group">
                            {isYoutube ? (
                              <iframe
                                src={getYoutubeEmbedUrl(videoUrl!)}
                                title="Recorrido virtual Youtube"
                                className="w-full h-full border-none rounded-xl"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                              ></iframe>
                            ) : isVimeo ? (
                              <iframe
                                src={getVimeoEmbedUrl(videoUrl!)}
                                title="Recorrido virtual Vimeo"
                                className="w-full h-full border-none rounded-xl"
                                allow="autoplay; fullscreen; picture-in-picture"
                                allowFullScreen
                              ></iframe>
                            ) : (
                              <video
                                src={videoUrl}
                                controls
                                preload="metadata"
                                playsInline
                                className="w-full h-full rounded-xl object-cover"
                              />
                            )}
                          </div>
                        </div>
                      )}

                      {((videoUrl && planUrl && activeMediaTab === 'plan') || (!videoUrl && planUrl)) && (
                        <div className="space-y-3 animate-fadeIn">
                          <p className="text-xs text-slate-400">Analiza con detalle las dimensiones, distribución y cotas técnicas del inmueble.</p>
                          
                          {isPdfPlan ? (
                            <div className="bg-white/5 border border-white/10 rounded-xl p-6 text-center flex flex-col items-center justify-center gap-4">
                              <div className="w-16 h-16 rounded-full bg-[#FBBF24]/10 border border-[#FBBF24]/20 flex items-center justify-center">
                                <FileText className="w-8 h-8 text-[#FBBF24]" />
                              </div>
                              <div>
                                <h4 className="text-sm font-bold text-white mb-1">Plano Técnico de Distribución</h4>
                                <p className="text-xs text-slate-400">Este plano está en formato PDF de alta resolución, ideal para impresión o revisión detallada.</p>
                              </div>
                              <a
                                href={planUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="bg-[#FBBF24] hover:bg-yellow-400 text-[#0f172a] font-bold px-6 py-3 rounded-xl transition-all shadow-lg text-xs flex items-center gap-2 hover:scale-[1.02] active:scale-95"
                              >
                                <Download className="w-4 h-4" />
                                <span>Descargar Plano PDF</span>
                              </a>
                            </div>
                          ) : (
                            <div 
                              onClick={() => setIsFullscreenPlan(true)}
                              className="relative rounded-xl overflow-hidden border border-white/10 bg-black/20 cursor-pointer group shadow-lg"
                            >
                              <img
                                src={planUrl}
                                alt="Plano de distribución de la vivienda"
                                className="w-full max-h-80 object-contain mx-auto transition-transform duration-500 group-hover:scale-105"
                              />
                              
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center backdrop-blur-[2px]">
                                <span className="bg-black/60 text-white border border-white/15 px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-lg">
                                  <Maximize size={14} />
                                  <span>Ampliar Plano</span>
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* WhatsApp Directo con Álvaro */}
                <div className="bg-[#1E293B]/40 border border-white/5 rounded-2xl p-6 backdrop-blur-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="text-center sm:text-left">
                    <h4 className="text-white font-bold text-sm">¿Deseas recibir más información técnica?</h4>
                    <p className="text-xs text-slate-400">Te enviaremos planos detallados, fotos adicionales y resolvemos tus dudas al instante.</p>
                  </div>
                  <a 
                    href={BUSINESS.whatsappUrl(`Hola Álvaro, estoy interesado en el inmueble "${selectedProperty.title}" (${selectedProperty.price.toLocaleString('es-ES')}€).`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full sm:w-auto bg-[#25D366] hover:bg-[#128C7E] text-white font-bold px-8 py-4 rounded-xl transition-all duration-300 text-center flex items-center justify-center gap-3 shadow-[0_4px_20px_rgba(37,211,102,0.3)] hover:scale-[1.03]"
                  >
                    <Phone size={18} />
                    <span>WhatsApp Directo con Álvaro</span>
                  </a>
                </div>

              </div>

              {/* Columna Derecha: Panel Glassmorphic Agendamiento (35%) */}
              <div className="w-full lg:w-[35%] bg-[#1E293B]/60 border border-white/10 rounded-2xl p-6 backdrop-blur-xl shadow-2xl flex flex-col justify-between self-start sticky top-24">
                
                {/* Cabecera Agendador */}
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2 font-heading">
                    <Calendar className="text-[#FBBF24]" size={22} /> Reserva de Visita Online
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Agenda una visita en tiempo real de forma 100% online y gratuita. Tu asesor se pondrá en contacto para confirmar los detalles.
                  </p>
                </div>

                {/* Proceso de Reserva */}
                {!((selectedProperty.features as PropertyFeatures)?.is_visitable_online === true || (selectedProperty.features as PropertyFeatures)?.visitable_slots?.active === true) ? (
                  /* Caso No Visitable Online */
                  <div className="py-8 text-center bg-white/5 border border-white/5 rounded-2xl px-4 flex flex-col items-center justify-center h-full">
                    <AlertCircle size={40} className="text-[#FBBF24] mb-3 animate-pulse" />
                    <h4 className="text-sm font-semibold text-white mb-2">Agenda por WhatsApp</h4>
                    <p className="text-xs text-slate-300 mb-6 leading-relaxed max-w-xs">
                      Este inmueble tiene un calendario especial. Agenda directamente por mensaje y nos adaptaremos totalmente a tu horario.
                    </p>
                    <a 
                      href={BUSINESS.whatsappUrl(`Hola Álvaro, quiero concertar una visita para el inmueble: "${selectedProperty.title}".`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full bg-[#FBBF24] text-[#2C3E50] font-bold px-6 py-3.5 rounded-xl text-xs hover:scale-[1.02] transition-all flex items-center justify-center gap-2 shadow-lg"
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
                  <form onSubmit={handleBookAppointment} className="flex-grow flex flex-col justify-between space-y-5">
                    <div>
                      {/* 1. Selección de Día */}
                      <div className="mb-4">
                        <label className="block text-xs font-semibold uppercase text-slate-400 mb-2">1. Selecciona el día</label>
                        <div className="hidden" aria-hidden="true">{appointments.length}</div>
                        <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
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
                      <div className="mb-4">
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
                            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-white/10 bg-white/5 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FBBF24] text-xs"
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
                            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-white/10 bg-white/5 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FBBF24] text-xs"
                          />
                        </div>

                        <div className="relative">
                          <Mail className="absolute left-3 top-3 text-slate-400" size={14} />
                          <input 
                            type="email" 
                            placeholder="Email (opcional)"
                            value={bookingEmail}
                            onChange={(e) => setBookingEmail(e.target.value)}
                            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-white/10 bg-white/5 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FBBF24] text-xs"
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
                    <div className="mt-4">
                      {bookingError && (
                        <div className="mb-3 text-xs text-rose-400 bg-rose-400/5 border border-rose-400/10 p-2.5 rounded-xl text-center font-medium">
                          {bookingError}
                        </div>
                      )}
                      
                      <button
                        type="submit"
                        disabled={!selectedDay || !selectedSlot || bookingLoading}
                        className="w-full bg-[#FBBF24] disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-[#2C3E50] font-black py-4 rounded-xl transition-all hover:scale-[1.02] active:scale-95 text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-yellow-500/10"
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

          {/* Overlay de Pantalla Completa para Imágenes */}
          {isFullscreenImages && selectedProperty.images && selectedProperty.images.length > 0 && (
            <div className="fixed inset-0 bg-black/95 z-[100] flex flex-col justify-center items-center animate-fadeIn select-none">
              {/* Botón de cerrar [X] */}
              <button
                onClick={() => setIsFullscreenImages(false)}
                className="absolute top-6 right-6 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 p-3 rounded-full transition-all duration-200 z-[110]"
                aria-label="Cerrar pantalla completa"
              >
                <X size={24} />
              </button>

              {/* Imagen principal */}
              <div className="relative max-w-[90%] max-h-[80vh] flex items-center justify-center">
                <img
                  src={selectedProperty.images[activeImageIdx]}
                  alt={`${selectedProperty.title} - Ampliada`}
                  className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
                />
              </div>

              {/* Controles de navegación en pantalla completa */}
              {selectedProperty.images.length > 1 && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveImageIdx((prev) => (prev === 0 ? selectedProperty.images.length - 1 : prev - 1));
                    }}
                    className="absolute left-6 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-[#FBBF24] hover:text-[#0f172a] p-4 rounded-full text-white transition-all shadow-lg active:scale-95 border border-white/10 z-[110]"
                    aria-label="Imagen anterior"
                  >
                    <ChevronLeft size={28} />
                  </button>
                  
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveImageIdx((prev) => (prev === selectedProperty.images.length - 1 ? 0 : prev + 1));
                    }}
                    className="absolute right-6 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-[#FBBF24] hover:text-[#0f172a] p-4 rounded-full text-white transition-all shadow-lg active:scale-95 border border-white/10 z-[110]"
                    aria-label="Siguiente imagen"
                  >
                    <ChevronRight size={28} />
                  </button>
                </>
              )}

              {/* Indicador de posición inferior */}
              <div className="absolute bottom-6 text-slate-400 text-sm font-semibold tracking-wider bg-black/40 border border-white/10 px-5 py-2 rounded-full backdrop-blur-md">
                {activeImageIdx + 1} / {selectedProperty.images.length}
              </div>
            </div>
          )}

          {/* Overlay de Pantalla Completa para Plano */}
          {isFullscreenPlan && (selectedProperty.features as PropertyFeatures)?.plan_url && (
            <div className="fixed inset-0 bg-black/95 z-[100] flex flex-col justify-center items-center animate-fadeIn select-none">
              {/* Botón de cerrar [X] */}
              <button
                onClick={() => setIsFullscreenPlan(false)}
                className="absolute top-6 right-6 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 p-3 rounded-full transition-all duration-200 z-[110]"
                aria-label="Cerrar plano ampliado"
              >
                <X size={24} />
              </button>

              {/* Imagen del plano */}
              <div className="relative max-w-[90%] max-h-[85vh] flex items-center justify-center">
                <img
                  src={(selectedProperty.features as PropertyFeatures).plan_url}
                  alt="Plano ampliado"
                  className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
                />
              </div>

              {/* Título de ayuda */}
              <div className="absolute bottom-6 text-slate-400 text-sm font-semibold tracking-wider bg-black/40 border border-white/10 px-5 py-2 rounded-full backdrop-blur-md">
                Plano de Distribución
              </div>
            </div>
          )}
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
