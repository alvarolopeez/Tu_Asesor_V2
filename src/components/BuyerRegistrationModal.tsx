"use client";

import { useState } from "react";
import { X, ChevronRight, ChevronLeft, Check, Home, MapPin, Calculator, CreditCard } from "lucide-react";
import { supabase } from "@/lib/supabase";
import dynamic from "next/dynamic";
import { VALIDATION } from "@/lib/constants";

const BuyerMap = dynamic(() => import("./BuyerMap"), { ssr: false });

const SEVILLA_ZONAS_CAPITAL = [
  'Centro', 'Triana', 'Los Remedios', 'Nervión', 'Macarena', 'Sevilla Este', 
  'Bellavista - La Palmera', 'Bermejales', 'Viapol - Buhaira', 'San Pablo', 
  'Alcosa - Torreblanca', 'Pino Montano', 'San Jerónimo', 'El Cerro - Amate', 
  'Heliópolis - Reina Mercedes'
];

const SEVILLA_ZONAS_PUEBLOS = [
  'Mairena del Aljarafe', 'Tomares', 'Bormujos', 'Gines', 'Camas', 
  'Dos Hermanas (Centro)', 'Dos Hermanas (Montequinto)', 'Alcalá de Guadaíra', 
  'San Juan de Aznalfarache', 'Espartinas', 'Utrera', 'Carmona', 
  'Mairena del Alcor', 'Coria del Río', 'Gelves'
];

const ZONAS_CENTROIDES = [
  { name: 'Centro', lat: 37.3896, lng: -5.9953 },
  { name: 'Triana', lat: 37.3840, lng: -6.0028 },
  { name: 'Los Remedios', lat: 37.3752, lng: -6.0016 },
  { name: 'Nervión', lat: 37.3835, lng: -5.9750 },
  { name: 'Macarena', lat: 37.4042, lng: -5.9863 },
  { name: 'Sevilla Este', lat: 37.3980, lng: -5.9228 },
  { name: 'Bellavista - La Palmera', lat: 37.3392, lng: -5.9760 },
  { name: 'Bermejales', lat: 37.3482, lng: -5.9830 },
  { name: 'Viapol - Buhaira', lat: 37.3801, lng: -5.9800 },
  { name: 'San Pablo', lat: 37.3970, lng: -5.9680 },
  { name: 'Alcosa - Torreblanca', lat: 37.4080, lng: -5.9180 },
  { name: 'Pino Montano', lat: 37.4200, lng: -5.9690 },
  { name: 'San Jerónimo', lat: 37.4170, lng: -5.9830 },
  { name: 'El Cerro - Amate', lat: 37.3770, lng: -5.9520 },
  { name: 'Heliópolis - Reina Mercedes', lat: 37.3570, lng: -5.9870 },
  { name: 'Mairena del Aljarafe', lat: 37.3422, lng: -6.0628 },
  { name: 'Tomares', lat: 37.3742, lng: -6.0460 },
  { name: 'Bormujos', lat: 37.3720, lng: -6.0710 },
  { name: 'Gines', lat: 37.3870, lng: -6.0780 },
  { name: 'Camas', lat: 37.4020, lng: -6.0330 },
  { name: 'Dos Hermanas (Centro)', lat: 37.2829, lng: -5.9251 },
  { name: 'Dos Hermanas (Montequinto)', lat: 37.3390, lng: -5.9380 },
  { name: 'Alcalá de Guadaíra', lat: 37.3340, lng: -5.8490 },
  { name: 'San Juan de Aznalfarache', lat: 37.3620, lng: -6.0270 },
  { name: 'Espartinas', lat: 37.3810, lng: -6.1260 },
  { name: 'Utrera', lat: 37.1812, lng: -5.7824 },
  { name: 'Carmona', lat: 37.4714, lng: -5.6420 },
  { name: 'Mairena del Alcor', lat: 37.3740, lng: -5.7480 },
  { name: 'Coria del Río', lat: 37.2870, lng: -6.0520 },
  { name: 'Gelves', lat: 37.3400, lng: -6.0260 }
];

function isPointInPolygon(lat: number, lng: number, polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const latI = polygon[i][0];
    const lngI = polygon[i][1];
    const latJ = polygon[j][0];
    const lngJ = polygon[j][1];
    
    const intersect = ((latI > lat) !== (latJ > lat))
        && (lng < (lngJ - lngI) * (lat - latI) / (latJ - latI) + lngI);
    if (intersect) inside = !inside;
  }
  return inside;
}

function getZonesFromPolygons(polygons: [number, number][][]): string[] {
  if (polygons.length === 0) return [];
  
  const preferredZones: string[] = [];
  
  for (const zona of ZONAS_CENTROIDES) {
    let isInside = false;
    for (const poly of polygons) {
      if (isPointInPolygon(zona.lat, zona.lng, poly)) {
        isInside = true;
        break;
      }
    }
    if (isInside) {
      preferredZones.push(zona.name);
    }
  }
  
  if (preferredZones.length === 0) {
    let closestZona: string | null = null;
    let minDistance = Infinity;
    
    for (const zona of ZONAS_CENTROIDES) {
      for (const poly of polygons) {
        for (const point of poly) {
          const dist = Math.sqrt((zona.lat - point[0]) ** 2 + (zona.lng - point[1]) ** 2);
          if (dist < minDistance) {
            minDistance = dist;
            closestZona = zona.name;
          }
        }
      }
    }
    
    if (closestZona && minDistance <= 0.05) {
      preferredZones.push(closestZona);
    }
  }
  
  return preferredZones;
}

function normalizeText(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getZonesFromText(text: string): string[] {
  if (!text) return [];
  const normalizedText = normalizeText(text);
  const detected: string[] = [];
  
  for (const zona of ZONAS_CENTROIDES) {
    const nameNormalized = normalizeText(zona.name);
    
    if (normalizedText.includes(nameNormalized)) {
      detected.push(zona.name);
      continue;
    }
    
    if (zona.name.includes(' - ')) {
      const parts = zona.name.split(' - ').map(p => normalizeText(p));
      if (parts.some(part => normalizedText.includes(part))) {
        detected.push(zona.name);
        continue;
      }
    }
    
    if (zona.name === 'Dos Hermanas (Centro)') {
      if (normalizedText.includes('dos hermanas') && !normalizedText.includes('montequinto')) {
        detected.push(zona.name);
        continue;
      }
    }
    if (zona.name === 'Dos Hermanas (Montequinto)') {
      if (normalizedText.includes('montequinto')) {
        detected.push(zona.name);
        continue;
      }
    }
  }
  
  return detected;
}

type BuyerRegistrationModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export default function BuyerRegistrationModal({ isOpen, onClose }: BuyerRegistrationModalProps) {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [polygons, setPolygons] = useState<[number, number][][]>([]);
  const [inputMode, setInputMode] = useState<'draw' | 'type'>('draw');
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [rgpdAccepted, setRgpdAccepted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    location: "",
    propertyType: "Piso",
    maxPrice: "",
    minRooms: "1",
    minBaths: "1",
    parking: "Indiferente",
    maxFloorWithoutElevator: "Indiferente",
    paymentMethod: "Hipoteca",
    mortgageStatus: "Necesito estudio",
    savingsContribution: "", // Aportación de ahorros
    additionalNotes: "",
  });

  if (!isOpen) return null;

  const validateField = (name: string, value: string): string => {
    let errorMsg = "";
    if (name === "firstName") {
      const val = value.trim();
      if (!val) {
        errorMsg = "El nombre es obligatorio";
      } else if (val.length < 2) {
        errorMsg = "El nombre debe tener al menos 2 caracteres";
      }
    } else if (name === "phone") {
      const cleanPhone = value.trim().replace(/\s+/g, '');
      if (!cleanPhone) {
        errorMsg = "El teléfono es obligatorio";
      } else if (!VALIDATION.phone.regex.test(cleanPhone)) {
        errorMsg = VALIDATION.phone.message;
      }
    } else if (name === "email") {
      const val = value.trim();
      if (val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        errorMsg = "Introduce un correo electrónico válido";
      }
    } else if (name === "location") {
      if (inputMode === "type" && !value.trim()) {
        errorMsg = "La ubicación es obligatoria";
      }
    } else if (name === "maxPrice") {
      const num = Number(value);
      if (!value) {
        errorMsg = "El precio es obligatorio";
      } else if (isNaN(num) || num <= 0) {
        errorMsg = "El precio debe ser un número positivo mayor que 0";
      }
    }
    return errorMsg;
  };

  const validateStep = (currentStep: number): boolean => {
    const newErrors: Record<string, string> = { ...errors };
    const newTouched = { ...touched };

    if (currentStep === 1) {
      const nameErr = validateField("firstName", formData.firstName);
      if (nameErr) newErrors.firstName = nameErr; else delete newErrors.firstName;
      
      const phoneErr = validateField("phone", formData.phone);
      if (phoneErr) newErrors.phone = phoneErr; else delete newErrors.phone;
      
      const emailErr = validateField("email", formData.email);
      if (emailErr) newErrors.email = emailErr; else delete newErrors.email;

      if (!rgpdAccepted) {
        newErrors.rgpd = "Debes aceptar el consentimiento de RGPD para continuar";
      } else {
        delete newErrors.rgpd;
      }

      newTouched.firstName = true;
      newTouched.phone = true;
      newTouched.email = true;
      newTouched.rgpd = true;
    } else if (currentStep === 2) {
      if (inputMode === "type") {
        const locErr = validateField("location", formData.location);
        if (locErr) newErrors.location = locErr; else delete newErrors.location;
        delete newErrors.map;
      } else {
        if (polygons.length === 0) {
          newErrors.map = "Debes delimitar al menos una zona en el mapa para continuar";
        } else {
          delete newErrors.map;
        }
        delete newErrors.location;
      }
      newTouched.location = true;
      newTouched.map = true;
    } else if (currentStep === 3) {
      const priceErr = validateField("maxPrice", formData.maxPrice);
      if (priceErr) newErrors.maxPrice = priceErr; else delete newErrors.maxPrice;

      newTouched.maxPrice = true;
    }

    setErrors(newErrors);
    setTouched(newTouched);

    if (currentStep === 1) {
      return !newErrors.firstName && !newErrors.phone && !newErrors.email && !newErrors.rgpd;
    } else if (currentStep === 2) {
      return inputMode === "type" ? !newErrors.location : !newErrors.map;
    } else if (currentStep === 3) {
      return !newErrors.maxPrice;
    }

    return true;
  };

  const handleNext = () => {
    if (validateStep(step)) {
      if (step < 4) setStep(step + 1);
    }
  };

  const handlePrev = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    
    if (touched[name]) {
      const err = validateField(name, value);
      setErrors((prev) => ({ ...prev, [name]: err }));
    }
  };

  const handleSubmit = async () => {
    // Validate all steps before submitting
    if (!validateStep(1) || !validateStep(2) || !validateStep(3)) {
      setError("Por favor, corrige los errores en los pasos anteriores antes de enviar.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const cleanPhone = formData.phone.trim().replace(/\s+/g, '');
      const cleanName = `${formData.firstName} ${formData.lastName}`.trim();
      const cleanEmail = formData.email?.trim().toLowerCase() || null;

      // Calcular preferredZones según el modo de entrada
      const preferredZones = inputMode === "draw" 
        ? getZonesFromPolygons(polygons)
        : getZonesFromText(formData.location);

      const preferences = {
        area: polygons.length > 0 ? polygons[0] : [],
        polygons: polygons,
        location: inputMode === "draw" && polygons.length > 0 ? `Delimitado en mapa (${polygons.length} zonas)` : formData.location,
        propertyType: formData.propertyType,
        maxPrice: formData.maxPrice,
        minRooms: formData.minRooms,
        minBaths: formData.minBaths,
        parking: formData.parking,
        maxFloorWithoutElevator: formData.propertyType === "Piso" ? formData.maxFloorWithoutElevator : null,
        paymentMethod: formData.paymentMethod,
        mortgageStatus: formData.paymentMethod === "Hipoteca" ? formData.mortgageStatus : null,
        savingsContribution: formData.paymentMethod === "Hipoteca" ? Number(formData.savingsContribution) || 0 : Number(formData.maxPrice),
        rgpd_accepted: rgpdAccepted,
        rgpd_accepted_at: new Date().toISOString(),
        additionalNotes: formData.additionalNotes || null,
        preferredZones,
      };

      // 1. Sincronización con leads
      const { data: existingLeads } = await supabase
        .from("leads")
        .select("id")
        .eq("phone", cleanPhone)
        .limit(1);

      if (existingLeads && existingLeads.length > 0) {
        // Lead already exists — update preferences instead of creating duplicate
        const { error: updateError } = await supabase
          .from("leads")
          .update({
            name: cleanName,
            email: cleanEmail,
            preferences,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingLeads[0].id);

        if (updateError) throw updateError;
      } else {
        // Create new lead — let Supabase generate the UUID
        const { error: insertError } = await supabase.from("leads").insert([
          {
            name: cleanName,
            phone: cleanPhone,
            email: cleanEmail,
            type: "buyer",
            status: "new",
            source: "buyer_registration",
            preferences,
          },
        ]);

        if (insertError) throw insertError;
      }

      // 2. Sincronización con buyers_demands en paralelo
      const { data: existingBuyers, error: buyerCheckError } = await supabase
        .from("buyers_demands")
        .select("id")
        .eq("phone", cleanPhone)
        .limit(1);

      if (buyerCheckError) throw buyerCheckError;

      if (existingBuyers && existingBuyers.length > 0) {
        // Si el comprador con ese teléfono ya existe en buyers_demands, actualiza su registro
        const { error: updateBuyerError } = await supabase
          .from("buyers_demands")
          .update({
            name: cleanName,
            email: cleanEmail,
            max_budget: Number(formData.maxPrice),
            rooms: Number(formData.minRooms),
            bathrooms: Number(formData.minBaths),
            property_type: formData.propertyType,
            preferred_zones: preferredZones,
            funding_type: formData.paymentMethod,
            savings_contribution: formData.paymentMethod === "Hipoteca" ? Number(formData.savingsContribution) || 0 : Number(formData.maxPrice),
            status: "Búsqueda activa",
            updated_at: new Date().toISOString(),
            last_activity_at: new Date().toISOString()
          })
          .eq("id", existingBuyers[0].id);

        if (updateBuyerError) throw updateBuyerError;

        // Inyecta un hito de actualización en la tabla buyer_activity_logs para dejar constancia de los comentarios
        const { error: logUpdateError } = await supabase
          .from("buyer_activity_logs")
          .insert([
            {
              buyer_id: existingBuyers[0].id,
              event_type: 'IA WhatsApp',
              title: 'Actualización de perfil online',
              notes: 'El comprador ha actualizado sus preferencias desde la web pública.\nPreferencia en zonas: ' + preferredZones.join(', ') + (formData.additionalNotes ? '\n\nComentario del comprador:\n' + formData.additionalNotes : ''),
              event_date: new Date().toISOString()
            }
          ]);
        if (logUpdateError) {
          console.error("Error creating buyer activity update log:", logUpdateError);
        }
      } else {
        // Si no existe, insértalo con los mismos campos y añade min_budget = 0, min_sqm = 0, created_at = new Date().toISOString()
        const { data: newBuyer, error: insertBuyerError } = await supabase
          .from("buyers_demands")
          .insert([
            {
              name: cleanName,
              phone: cleanPhone,
              email: cleanEmail,
              max_budget: Number(formData.maxPrice),
              min_budget: 0,
              min_sqm: 0,
              rooms: Number(formData.minRooms),
              bathrooms: Number(formData.minBaths),
              property_type: formData.propertyType,
              preferred_zones: preferredZones,
              funding_type: formData.paymentMethod,
              savings_contribution: formData.paymentMethod === "Hipoteca" ? Number(formData.savingsContribution) || 0 : Number(formData.maxPrice),
              status: "Búsqueda activa",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              last_activity_at: new Date().toISOString()
            }
          ])
          .select("id")
          .single();

        if (insertBuyerError) throw insertBuyerError;

        // Adicionalmente, si es nuevo, inyecta un hito inicial en la tabla buyer_activity_logs:
        if (newBuyer && newBuyer.id) {
          const { error: logError } = await supabase
            .from("buyer_activity_logs")
            .insert([
              {
                buyer_id: newBuyer.id,
                event_type: 'IA WhatsApp',
                title: 'Registro público online',
                notes: 'Se ha registrado de forma autónoma desde la web pública con preferencia en zonas: ' + preferredZones.join(', ') + (formData.additionalNotes ? '\n\nComentario del comprador:\n' + formData.additionalNotes : ''),
                event_date: new Date().toISOString()
              }
            ]);

          if (logError) {
            console.error("Error creating buyer activity log:", logError);
          }
        }
      }

      setSuccess(true);
    } catch (err: any) {
      console.error("Error submitting buyer registration:", err);
      setError("Hubo un problema al enviar tus datos. Por favor, inténtalo de nuevo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm" 
        onClick={() => !isSubmitting && !success && onClose()}
      />
      
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-[#2C3E50] p-6 text-white flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-2xl font-bold font-heading">Encuentra tu hogar ideal</h2>
            <p className="text-slate-300 text-sm mt-1">Dinos qué buscas y te avisaremos antes que a nadie.</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
            disabled={isSubmitting}
          >
            <X size={24} />
          </button>
        </div>

        {/* Progress Bar */}
        {!success && (
          <div className="flex h-2 bg-slate-100 shrink-0">
            <div 
              className="bg-[#FBBF24] transition-all duration-300 ease-in-out"
              style={{ width: `${(step / 4) * 100}%` }}
            />
          </div>
        )}

        {/* Content */}
        <div className="p-6 sm:p-8 overflow-y-auto flex-1 custom-scrollbar">
          {success ? (
            <div className="text-center py-12">
              <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <Check size={40} />
              </div>
              <h3 className="text-2xl font-bold text-[#2C3E50] mb-4">¡Registro Completado!</h3>
              <p className="text-slate-600 text-lg mb-8 max-w-md mx-auto">
                Hemos guardado tus preferencias. Te avisaremos por WhatsApp o correo en cuanto tengamos una propiedad que encaje contigo.
              </p>
              <button 
                onClick={onClose}
                className="bg-[#0f172a] text-white px-8 py-3 rounded-xl font-bold hover:bg-slate-900 transition-colors"
              >
                Cerrar
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {error && (
                <div className="bg-red-50 text-red-600 p-4 rounded-lg text-sm border border-red-100">
                  {error}
                </div>
              )}

              {/* Step 1: Datos Personales */}
              <div className={`${step === 1 ? 'block' : 'hidden'} animate-fadeIn`}>
                <div className="flex items-center gap-3 mb-6">
                  <div className="bg-[#FBBF24]/20 p-3 rounded-lg text-[#FBBF24]">
                    <Home size={24} />
                  </div>
                  <h3 className="text-xl font-bold text-[#2C3E50]">1. Tus Datos</h3>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Nombre *</label>
                    <input 
                      type="text" 
                      name="firstName"
                      value={formData.firstName}
                      onChange={handleChange}
                      onBlur={() => setTouched((prev) => ({ ...prev, firstName: true }))}
                      className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#FBBF24] focus:border-[#FBBF24] outline-none transition-all text-slate-800 bg-white"
                      placeholder="Tu nombre"
                    />
                    {touched.firstName && errors.firstName && (
                      <p className="text-xs text-red-500 font-semibold">{errors.firstName}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Apellidos</label>
                    <input 
                      type="text" 
                      name="lastName"
                      value={formData.lastName}
                      onChange={handleChange}
                      className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#FBBF24] focus:border-[#FBBF24] outline-none transition-all text-slate-800 bg-white"
                      placeholder="Tus apellidos"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Teléfono *</label>
                    <input 
                      type="tel" 
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      onBlur={() => setTouched((prev) => ({ ...prev, phone: true }))}
                      className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#FBBF24] focus:border-[#FBBF24] outline-none transition-all text-slate-800 bg-white"
                      placeholder="Tu móvil (para WhatsApp)"
                    />
                    {touched.phone && errors.phone && (
                      <p className="text-xs text-red-500 font-semibold">{errors.phone}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Email</label>
                    <input 
                      type="email" 
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
                      className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#FBBF24] focus:border-[#FBBF24] outline-none transition-all text-slate-800 bg-white"
                      placeholder="tucorreo@ejemplo.com"
                    />
                    {touched.email && errors.email && (
                      <p className="text-xs text-red-500 font-semibold">{errors.email}</p>
                    )}
                  </div>

                  {/* RGPD Consent Checkbox */}
                  <div className="space-y-2 sm:col-span-2 mt-4">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={rgpdAccepted}
                        onChange={(e) => {
                          setRgpdAccepted(e.target.checked);
                          if (touched.rgpd) {
                            setErrors((prev) => ({ ...prev, rgpd: e.target.checked ? "" : "Debes aceptar el consentimiento de RGPD para continuar" }));
                          }
                        }}
                        onBlur={() => setTouched((prev) => ({ ...prev, rgpd: true }))}
                        className="mt-1 text-[#FBBF24] focus:ring-[#FBBF24] rounded border-slate-300 w-4 h-4 cursor-pointer"
                      />
                      <span className="text-xs text-slate-600 leading-tight">
                        Acepto la <a href="/politica-privacidad" target="_blank" className="text-[#0f172a] hover:underline font-semibold">Política de Privacidad</a> y consiento que me contacten por WhatsApp o correo electrónico para enviarme alertas de viviendas que coincidan con mis preferencias. *
                      </span>
                    </label>
                    {touched.rgpd && errors.rgpd && (
                      <p className="text-xs text-red-500 font-semibold mt-1">{errors.rgpd}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Step 2: Ubicación y Tipo */}
              <div className={`${step === 2 ? 'block' : 'hidden'} animate-fadeIn`}>
                <div className="flex items-center gap-3 mb-5">
                  <div className="bg-[#FBBF24]/20 p-3 rounded-lg text-[#FBBF24]">
                    <MapPin size={24} />
                  </div>
                  <h3 className="text-xl font-bold text-[#2C3E50]">2. ¿En qué zonas deseas comprar?</h3>
                </div>

                <div className="space-y-5">
                  {/* Option Cards Choice */}
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => setInputMode('draw')}
                      className={`p-4 border-2 rounded-xl text-left transition-all active:scale-95 duration-200 ${
                        inputMode === 'draw'
                          ? 'border-[#FBBF24] bg-[#FBBF24]/5 shadow-md shadow-[#FBBF24]/5'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-lg bg-[#FBBF24]/10 text-[#FBBF24] flex items-center justify-center mb-3">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </div>
                      <p className="font-bold text-sm text-slate-800">Dibujar zona</p>
                      <p className="text-[10px] text-slate-500 mt-1 leading-normal">Selecciona con precisión libre dibujando con tu dedo o ratón.</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setInputMode('type')}
                      className={`p-4 border-2 rounded-xl text-left transition-all active:scale-95 duration-200 ${
                        inputMode === 'type'
                          ? 'border-[#FBBF24] bg-[#FBBF24]/5 shadow-md shadow-[#FBBF24]/5'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center mb-3">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                      <p className="font-bold text-sm text-slate-800">Escribe la ubicación</p>
                      <p className="text-[10px] text-slate-500 mt-1 leading-normal">Introduce nombres de calles o barrios de forma clásica.</p>
                    </button>
                  </div>

                  {/* Mode Renderers */}
                  {inputMode === 'draw' ? (
                    <div className="bg-slate-50 border border-slate-200/80 p-5 rounded-2xl text-center space-y-4 shadow-sm animate-fadeIn">
                      <div className="max-w-md mx-auto space-y-1.5">
                         <p className="font-bold text-[#2C3E50] text-sm">Dibuja tus zonas sobre el mapa</p>
                         <p className="text-xs text-slate-500 leading-normal">
                           Abre el mapa interactivo y delimita con total precisión las zonas de Sevilla en las que quieres buscar tu vivienda.
                         </p>
                      </div>

                      {polygons.length > 0 ? (
                        <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/25 px-4 py-2 rounded-full text-xs font-bold text-green-700">
                          <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                          <span>¡Listo! Has delimitado {polygons.length} {polygons.length === 1 ? "zona" : "zonas"} en Sevilla</span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 bg-yellow-500/10 border border-yellow-500/20 px-4 py-2 rounded-full text-xs font-semibold text-[#B28711]">
                          <span>Falta por definir tu zona de búsqueda</span>
                        </div>
                      )}

                      {touched.map && errors.map && (
                        <p className="text-xs text-red-500 font-semibold">{errors.map}</p>
                      )}

                      <div>
                        <button
                          type="button"
                          onClick={() => setIsMapOpen(true)}
                          className="bg-[#0f172a] hover:bg-slate-900 text-white px-6 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center gap-2 mx-auto shadow-md"
                        >
                          <svg className="w-4 h-4 text-[#FBBF24]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                          </svg>
                          {polygons.length > 0 ? "Modificar zonas en mapa" : "Abrir mapa y dibujar"}
                        </button>
                      </div>

                      {/* Fullscreen Map Portal */}
                      <BuyerMap 
                        polygons={polygons} 
                        onChange={(newPolygons) => {
                          setPolygons(newPolygons);
                          if (newPolygons.length > 0) {
                            setErrors((prev) => ({ ...prev, map: "" }));
                          }
                        }} 
                        isOpen={isMapOpen} 
                        onClose={() => setIsMapOpen(false)} 
                      />
                    </div>
                  ) : (
                    <div className="space-y-2 animate-fadeIn">
                      <label className="text-sm font-semibold text-slate-700">Introduce la calle, zona o barrio *</label>
                      <textarea 
                        name="location"
                        value={formData.location}
                        onChange={handleChange}
                        onBlur={() => setTouched((prev) => ({ ...prev, location: true }))}
                        rows={3}
                        className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#FBBF24] focus:border-[#FBBF24] outline-none transition-all resize-none text-sm placeholder:text-slate-400 text-slate-800 bg-white"
                        placeholder="Ej: Triana, Los Remedios, Nervión..."
                      />
                      {touched.location && errors.location && (
                        <p className="text-xs text-red-500 font-semibold">{errors.location}</p>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Tipo de Inmueble</label>
                    <select 
                      name="propertyType"
                      value={formData.propertyType}
                      onChange={handleChange}
                      className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#FBBF24] focus:border-[#FBBF24] outline-none transition-all text-slate-800 bg-white"
                    >
                      <option value="Piso">Piso / Apartamento</option>
                      <option value="Casa">Casa / Chalet</option>
                      <option value="Parcela">Parcela / Terreno</option>
                      <option value="Indiferente">Indiferente</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Step 3: Características */}
              <div className={`${step === 3 ? 'block' : 'hidden'} animate-fadeIn`}>
                <div className="flex items-center gap-3 mb-6">
                  <div className="bg-[#FBBF24]/20 p-3 rounded-lg text-[#FBBF24]">
                    <Calculator size={24} />
                  </div>
                  <h3 className="text-xl font-bold text-[#2C3E50]">3. Características</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Precio Máximo (€) *</label>
                    <input 
                      type="number" 
                      name="maxPrice"
                      value={formData.maxPrice}
                      onChange={handleChange}
                      onBlur={() => setTouched((prev) => ({ ...prev, maxPrice: true }))}
                      className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#FBBF24] focus:border-[#FBBF24] outline-none transition-all text-slate-800 bg-white"
                      placeholder="Ej: 150000"
                    />
                    {touched.maxPrice && errors.maxPrice && (
                      <p className="text-xs text-red-500 font-semibold">{errors.maxPrice}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Parking</label>
                    <select 
                      name="parking"
                      value={formData.parking}
                      onChange={handleChange}
                      className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#FBBF24] focus:border-[#FBBF24] outline-none transition-all text-slate-800 bg-white"
                    >
                      <option value="Indiferente">Indiferente</option>
                      <option value="Imprescindible">Imprescindible</option>
                      <option value="No necesito">No necesito</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Habitaciones Mínimas</label>
                    <select 
                      name="minRooms"
                      value={formData.minRooms}
                      onChange={handleChange}
                      className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#FBBF24] focus:border-[#FBBF24] outline-none transition-all text-slate-800 bg-white"
                    >
                      <option value="1">1 o más</option>
                      <option value="2">2 o más</option>
                      <option value="3">3 o más</option>
                      <option value="4">4 o más</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Baños Mínimos</label>
                    <select 
                      name="minBaths"
                      value={formData.minBaths}
                      onChange={handleChange}
                      className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#FBBF24] focus:border-[#FBBF24] outline-none transition-all text-slate-800 bg-white"
                    >
                      <option value="1">1 o más</option>
                      <option value="2">2 o más</option>
                      <option value="3">3 o más</option>
                    </select>
                  </div>
                  
                  {formData.propertyType === "Piso" && (
                    <div className="space-y-2 sm:col-span-2">
                      <label className="text-sm font-semibold text-slate-700">Planta máxima si NO tiene ascensor</label>
                      <select 
                        name="maxFloorWithoutElevator"
                        value={formData.maxFloorWithoutElevator}
                        onChange={handleChange}
                        className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#FBBF24] focus:border-[#FBBF24] outline-none transition-all text-slate-800 bg-white"
                      >
                        <option value="Indiferente">Me da igual (Busco con ascensor seguro)</option>
                        <option value="Bajo">Solo Bajos</option>
                        <option value="1º">Máximo 1º Planta</option>
                        <option value="2º">Máximo 2º Planta</option>
                        <option value="3º">Máximo 3º Planta</option>
                        <option value="4º o más">4º Planta o superior</option>
                      </select>
                    </div>
                  )}

                  <div className="space-y-2 sm:col-span-2">
                    <label className="text-sm font-semibold text-slate-700">Notas adicionales / Requisitos específicos</label>
                    <textarea 
                      name="additionalNotes"
                      value={formData.additionalNotes}
                      onChange={handleChange}
                      rows={3}
                      className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#FBBF24] focus:border-[#FBBF24] outline-none transition-all text-slate-800 bg-white resize-none text-sm placeholder:text-slate-400"
                      placeholder="Ej: Cerca de colegios, con terraza, orientación sur, buena luz natural, garaje, etc."
                    />
                  </div>
                </div>
              </div>

              {/* Step 4: Financiación */}
              <div className={`${step === 4 ? 'block' : 'hidden'} animate-fadeIn`}>
                <div className="flex items-center gap-3 mb-6">
                  <div className="bg-[#FBBF24]/20 p-3 rounded-lg text-[#FBBF24]">
                    <CreditCard size={24} />
                  </div>
                  <h3 className="text-xl font-bold text-[#2C3E50]">4. Financiación</h3>
                </div>

                <div className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">¿Cómo vas a pagar?</label>
                    <select 
                      name="paymentMethod"
                      value={formData.paymentMethod}
                      onChange={handleChange}
                      className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#FBBF24] focus:border-[#FBBF24] outline-none transition-all text-slate-800 bg-white"
                    >
                      <option value="Hipoteca">Con Hipoteca</option>
                      <option value="Al contado">Al contado</option>
                    </select>
                  </div>

                  {formData.paymentMethod === "Hipoteca" && (
                    <div className="space-y-5 animate-fadeIn">
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700">Aportación de ahorros propia (€)</label>
                        <input
                          type="number"
                          name="savingsContribution"
                          placeholder="Ej: 35000"
                          value={formData.savingsContribution}
                          onChange={handleChange}
                          className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#FBBF24] focus:border-[#FBBF24] outline-none transition-all text-slate-800 bg-white"
                        />
                        <p className="text-[11px] text-slate-500 italic">Indica con qué importe de fondos propios cuentas (para la entrada inicial y gastos aproximados del 10%-12%).</p>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700">Estado de tu hipoteca</label>
                        <div className="flex flex-col gap-3">
                          <label className="flex items-center p-4 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors text-slate-800 bg-white">
                            <input 
                              type="radio" 
                              name="mortgageStatus"
                              value="Preconcedida"
                              checked={formData.mortgageStatus === "Preconcedida"}
                              onChange={handleChange}
                              className="text-[#FBBF24] focus:ring-[#FBBF24] w-5 h-5"
                            />
                            <span className="ml-3 font-medium">La tengo preconcedida</span>
                          </label>
                          <label className="flex items-center p-4 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors text-slate-800 bg-white">
                            <input 
                              type="radio" 
                              name="mortgageStatus"
                              value="Necesito estudio"
                              checked={formData.mortgageStatus === "Necesito estudio"}
                              onChange={handleChange}
                              className="text-[#FBBF24] focus:ring-[#FBBF24] w-5 h-5"
                            />
                            <span className="ml-3 font-medium">Necesito que me hagan un estudio / buscar hipoteca</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        {!success && (
          <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-between shrink-0">
            <button
              onClick={handlePrev}
              disabled={step === 1 || isSubmitting}
              className={`flex items-center px-6 py-2 rounded-lg font-semibold transition-all ${
                step === 1 
                  ? 'opacity-0 cursor-default' 
                  : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              <ChevronLeft size={20} className="mr-1" />
              Atrás
            </button>

            {step < 4 ? (
              <button
                onClick={handleNext}
                className="flex items-center bg-[#0f172a] text-white px-8 py-2 rounded-lg font-bold hover:bg-slate-900 transition-all"
              >
                Siguiente
                <ChevronRight size={20} className="ml-1" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex items-center bg-[#FBBF24] text-[#2C3E50] px-8 py-2 rounded-lg font-bold hover:bg-[#e5a917] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
              >
                {isSubmitting ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-[#2C3E50]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Enviando...
                  </span>
                ) : (
                  <>
                    <Check size={20} className="mr-2" />
                    Enviar Datos
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
