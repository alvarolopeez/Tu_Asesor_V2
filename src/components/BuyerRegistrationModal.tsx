"use client";

import { useState } from "react";
import { X, ChevronRight, ChevronLeft, Check, Home, MapPin, Calculator, CreditCard } from "lucide-react";
import { supabase } from "@/lib/supabase";
import dynamic from "next/dynamic";

const BuyerMap = dynamic(() => import("./BuyerMap"), { ssr: false });

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
  });

  if (!isOpen) return null;

  const handleNext = () => {
    if (step < 4) setStep(step + 1);
  };

  const handlePrev = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
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
      };

      const { error: insertError } = await supabase.from("leads").insert([
        {
          id: crypto.randomUUID(),
          name: `${formData.firstName} ${formData.lastName}`.trim(),
          phone: formData.phone,
          email: formData.email,
          type: "buyer",
          status: "new",
          source: "buyer_registration",
          preferences,
        },
      ]);

      if (insertError) throw insertError;

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
        className="absolute inset-0 bg-[#2C3E50]/80 backdrop-blur-sm" 
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
                className="bg-[#2C3E50] text-white px-8 py-3 rounded-xl font-bold hover:bg-[#1a252f] transition-colors"
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
                      className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#FBBF24] focus:border-[#FBBF24] outline-none transition-all"
                      placeholder="Tu nombre"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Apellidos</label>
                    <input 
                      type="text" 
                      name="lastName"
                      value={formData.lastName}
                      onChange={handleChange}
                      className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#FBBF24] focus:border-[#FBBF24] outline-none transition-all"
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
                      className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#FBBF24] focus:border-[#FBBF24] outline-none transition-all"
                      placeholder="Tu móvil (para WhatsApp)"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Email</label>
                    <input 
                      type="email" 
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#FBBF24] focus:border-[#FBBF24] outline-none transition-all"
                      placeholder="tucorreo@ejemplo.com"
                    />
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

                      <div>
                        <button
                          type="button"
                          onClick={() => setIsMapOpen(true)}
                          className="bg-[#2C3E50] hover:bg-[#1a252f] text-white px-6 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center gap-2 mx-auto shadow-md"
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
                        onChange={setPolygons} 
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
                        rows={3}
                        className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#FBBF24] focus:border-[#FBBF24] outline-none transition-all resize-none text-sm placeholder:text-slate-400"
                        placeholder="Ej: Triana, Los Remedios, Nervión..."
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Tipo de Inmueble</label>
                    <select 
                      name="propertyType"
                      value={formData.propertyType}
                      onChange={handleChange}
                      className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#FBBF24] focus:border-[#FBBF24] outline-none transition-all bg-white"
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
                      className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#FBBF24] focus:border-[#FBBF24] outline-none transition-all"
                      placeholder="Ej: 150000"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Parking</label>
                    <select 
                      name="parking"
                      value={formData.parking}
                      onChange={handleChange}
                      className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#FBBF24] focus:border-[#FBBF24] outline-none transition-all bg-white"
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
                      className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#FBBF24] focus:border-[#FBBF24] outline-none transition-all bg-white"
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
                      className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#FBBF24] focus:border-[#FBBF24] outline-none transition-all bg-white"
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
                        className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#FBBF24] focus:border-[#FBBF24] outline-none transition-all bg-white"
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
                      className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#FBBF24] focus:border-[#FBBF24] outline-none transition-all bg-white"
                    >
                      <option value="Hipoteca">Con Hipoteca</option>
                      <option value="Al contado">Al contado</option>
                    </select>
                  </div>

                  {formData.paymentMethod === "Hipoteca" && (
                    <div className="space-y-2 animate-fadeIn">
                      <label className="text-sm font-semibold text-slate-700">Estado de tu hipoteca</label>
                      <div className="flex flex-col gap-3">
                        <label className="flex items-center p-4 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                          <input 
                            type="radio" 
                            name="mortgageStatus"
                            value="Preconcedida"
                            checked={formData.mortgageStatus === "Preconcedida"}
                            onChange={handleChange}
                            className="text-[#FBBF24] focus:ring-[#FBBF24] w-5 h-5"
                          />
                          <span className="ml-3 text-slate-700 font-medium">La tengo preconcedida</span>
                        </label>
                        <label className="flex items-center p-4 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                          <input 
                            type="radio" 
                            name="mortgageStatus"
                            value="Necesito estudio"
                            checked={formData.mortgageStatus === "Necesito estudio"}
                            onChange={handleChange}
                            className="text-[#FBBF24] focus:ring-[#FBBF24] w-5 h-5"
                          />
                          <span className="ml-3 text-slate-700 font-medium">Necesito que me hagan un estudio / buscar hipoteca</span>
                        </label>
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
                disabled={
                  (step === 1 && (!formData.firstName || !formData.phone)) ||
                  (step === 2 && (inputMode === 'draw' ? polygons.length === 0 : !formData.location.trim())) ||
                  (step === 3 && !formData.maxPrice)
                }
                className="flex items-center bg-[#2C3E50] text-white px-8 py-2 rounded-lg font-bold hover:bg-[#1a252f] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
