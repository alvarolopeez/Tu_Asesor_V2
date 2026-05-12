'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { Check, ChevronLeft, ChevronRight, X, Building2, Home, Building, ArrowRight } from 'lucide-react'

export default function ValoracionPage() {
  const [step, setStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  const [formData, setFormData] = useState({
    propertyType: '',
    street: '',
    number: '',
    zipcode: '',
    city: 'Sevilla',
    floor: '',
    sqm: '',
    rooms: 2,
    baths: 1,
    hasElevator: false,
    hasTerrace: false,
    hasGarage: false,
    condition: 'bueno',
    name: '',
    surname: '',
    email: '',
    phone: '',
    privacyCheck: false
  })

  useEffect(() => {
    if (formData.zipcode.length === 5 && formData.zipcode.startsWith('41')) {
      const cpMap: Record<string, string> = {
        '41710': 'Utrera',
        '41500': 'Alcalá de Guadaíra',
        '41700': 'Dos Hermanas',
        '41701': 'Dos Hermanas',
        '41702': 'Dos Hermanas',
        '41703': 'Dos Hermanas',
        '41704': 'Dos Hermanas',
        '41927': 'Mairena del Aljarafe',
        '41400': 'Écija',
        '41300': 'La Rinconada',
        '41720': 'Los Palacios y Villafranca',
        '41100': 'Coria del Río',
        '41410': 'Carmona',
        '41740': 'Lebrija',
        '41900': 'Camas',
        '41510': 'Mairena del Alcor',
        '41940': 'Tomares',
        '41920': 'San Juan de Aznalfarache',
        '41930': 'Bormujos',
      };
      
      const cp = parseInt(formData.zipcode, 10);
      if (cp >= 41001 && cp <= 41020) {
        setFormData(prev => ({ ...prev, city: 'Sevilla' }));
      } else if (cpMap[formData.zipcode]) {
        setFormData(prev => ({ ...prev, city: cpMap[formData.zipcode] }));
      }
    }
  }, [formData.zipcode]);

  const totalSteps = 6

  const nextStep = () => {
    if (step < totalSteps) setStep(step + 1)
  }

  const prevStep = () => {
    if (step > 1) setStep(step - 1)
  }

  const handleSelectType = (type: string) => {
    setFormData({ ...formData, propertyType: type })
    nextStep()
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked
      setFormData({ ...formData, [name]: checked })
    } else {
      setFormData({ ...formData, [name]: value })
    }
  }

  const adjustValue = (field: 'rooms' | 'baths', amount: number) => {
    const newValue = formData[field] + amount
    if (newValue >= 0) {
      setFormData({ ...formData, [field]: newValue })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.privacyCheck) {
      alert('Debes aceptar la política de privacidad para continuar.')
      return
    }

    setIsSubmitting(true)

    try {
      const addressFull = `${formData.street} ${formData.number}, Piso ${formData.floor}, ${formData.zipcode} ${formData.city}`
      const descFull = `Tipo: ${formData.propertyType}. ${formData.sqm}m2, ${formData.rooms} hab, ${formData.baths} baños. Ascensor: ${formData.hasElevator ? 'Sí' : 'No'}. Terraza: ${formData.hasTerrace ? 'Sí' : 'No'}. Garaje: ${formData.hasGarage ? 'Sí' : 'No'}. Estado: ${formData.condition}.`
      const propertyId = crypto.randomUUID()

      const { error: propertyError } = await supabase
        .from('properties')
        .insert([{
          id: propertyId,
          title: addressFull,
          description: descFull,
          price: 0,
          status: 'draft',
          features: {
            city: formData.city,
            zipcode: formData.zipcode,
            sqm: formData.sqm,
            rooms: formData.rooms,
            baths: formData.baths
          }
        }])

      if (propertyError) throw propertyError

      const { error: leadError } = await supabase
        .from('leads')
        .insert([{
          name: `${formData.name} ${formData.surname}`.trim(),
          phone: formData.phone,
          email: formData.email,
          type: 'seller',
          source: 'valoracion',
          property_id: propertyId
        }])

      if (leadError) throw leadError

      nextStep()
    } catch (error) {
      console.error("Error submitting valuation:", error)
      alert("Hubo un error al procesar tu solicitud. Por favor, inténtalo de nuevo o contáctanos por teléfono.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const progressPercentage = ((step - 1) / (totalSteps - 1)) * 100

  return (
    <main className="min-h-screen flex flex-col items-center justify-center pt-48 pb-24 px-4 bg-slate-50 relative overflow-x-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-0 w-full h-full bg-[url('/assets/images/pattern.svg')] opacity-5"></div>
      </div>

      <div className="w-full max-w-3xl relative z-10 glass-effect min-h-[550px] flex flex-col shadow-2xl rounded-2xl overflow-hidden border border-[#2C3E50]/20">
        
        {/* Progress Bar */}
        <div className="w-full bg-slate-800 h-2 absolute top-0 left-0 z-10">
          <div className="h-full bg-blue-500 transition-all duration-500 ease-out" style={{ width: `${progressPercentage}%` }}></div>
        </div>

        <Link href="/" className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors z-20">
          <X className="w-8 h-8" />
        </Link>

        <div className="p-8 md:p-12 flex-grow flex flex-col justify-center relative z-10">
          {step === 1 && (
            <div className="text-center animate-fade-in">
              <h1 className="text-3xl md:text-4xl font-bold mb-2 text-white font-heading">Tasar Vivienda en Sevilla</h1>
              <p className="text-lg text-slate-300 mb-10">Seleccione el tipo de inmueble para iniciar la valoración gratuita en La Macarena y alrededores.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <button onClick={() => handleSelectType('Piso')} className="flex flex-col items-center justify-center bg-[#1a252f]/50 border border-white/10 p-8 rounded-xl cursor-pointer hover:bg-white/10 hover:border-white/30 transition-all group">
                  <Building2 className="w-16 h-16 text-[#FBBF24] mb-4 group-hover:scale-110 transition-transform" />
                  <h3 className="text-xl font-bold text-white">Piso / Ático</h3>
                </button>
                <button onClick={() => handleSelectType('Casa')} className="flex flex-col items-center justify-center bg-[#1a252f]/50 border border-white/10 p-8 rounded-xl cursor-pointer hover:bg-white/10 hover:border-white/30 transition-all group">
                  <Home className="w-16 h-16 text-[#FBBF24] mb-4 group-hover:scale-110 transition-transform" />
                  <h3 className="text-xl font-bold text-white">Casa / Chalet</h3>
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="text-center animate-fade-in">
              <h2 className="text-3xl font-bold mb-4 text-white font-heading">Ubicación del Inmueble</h2>
              <p className="text-slate-300 mb-8">Indique la calle y el número exacto para que nuestra <strong className="text-[#FBBF24]">IA de mercado</strong> valore la zona correctamente. <strong>Vende por un 2%</strong>, ahorra miles de euros.</p>
              
              <div className="max-w-md mx-auto space-y-4 text-left">
                <div className="flex gap-4">
                  <div className="w-3/4">
                    <label className="block text-sm font-bold mb-2 text-slate-300">Calle / Avenida</label>
                    <input type="text" name="street" value={formData.street} onChange={handleChange} className="w-full bg-white text-slate-800 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#FBBF24]" placeholder="Ej: Calle Aguamarina" />
                  </div>
                  <div className="w-1/4">
                    <label className="block text-sm font-bold mb-2 text-slate-300">Nº</label>
                    <input type="text" name="number" value={formData.number} onChange={handleChange} className="w-full bg-white text-slate-800 text-center font-bold rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#FBBF24]" placeholder="12" />
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-1/3">
                    <label className="block text-sm font-bold mb-2 text-slate-300">C.P.</label>
                    <input type="text" name="zipcode" value={formData.zipcode} onChange={handleChange} className="w-full bg-white text-slate-800 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#FBBF24]" placeholder="41009" />
                  </div>
                  <div className="w-2/3">
                    <label className="block text-sm font-bold mb-2 text-slate-300">Ciudad</label>
                    <input type="text" name="city" value={formData.city} onChange={handleChange} className="w-full bg-white text-slate-800 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#FBBF24]" placeholder="Ej: Sevilla" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold mb-2 text-slate-300">¿En qué planta se encuentra?</label>
                  <div className="flex items-center gap-3">
                    <input type="number" name="floor" value={formData.floor} onChange={handleChange} className="w-24 bg-white text-slate-800 text-center text-lg font-bold rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#FBBF24]" placeholder="Ej: 2" min="0" />
                    <span className="text-xs text-slate-400 leading-tight">
                      *Ponga "0" si es un Bajo.<br />El ascensor se indica en el siguiente paso.
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-10 flex justify-center gap-4">
                <button onClick={prevStep} className="btn btn-outline text-white border-white hover:bg-white hover:text-[#2C3E50] px-6 py-2 rounded-lg font-bold transition-all">Atrás</button>
                <button onClick={nextStep} disabled={!formData.street || !formData.number} className="btn bg-[#FBBF24] hover:bg-yellow-500 text-[#2C3E50] px-8 py-2 rounded-lg font-bold transition-all disabled:opacity-50">Siguiente</button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="text-center animate-fade-in">
              <h2 className="text-3xl font-bold mb-8 text-white font-heading">Datos Básicos</h2>
              
              <div className="max-w-sm mx-auto mb-8 text-left">
                <label className="block text-sm font-bold mb-2 text-slate-300 text-center">Superficie Construida (m²)</label>
                <input type="number" name="sqm" value={formData.sqm} onChange={handleChange} className="w-full bg-white text-center text-2xl font-bold text-[#2C3E50] rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#FBBF24]" placeholder="0" />
              </div>

              <div className="grid grid-cols-2 gap-8 max-w-sm mx-auto mb-8">
                <div>
                  <label className="block text-sm font-bold mb-2 text-slate-300">Habitaciones</label>
                  <div className="flex items-center justify-between bg-white/10 rounded-lg p-2 border border-white/20">
                    <button onClick={() => adjustValue('rooms', -1)} className="w-8 h-8 flex items-center justify-center text-white hover:bg-white/20 rounded-md font-bold text-xl">-</button>
                    <span className="text-xl font-bold text-white">{formData.rooms}</span>
                    <button onClick={() => adjustValue('rooms', 1)} className="w-8 h-8 flex items-center justify-center text-white hover:bg-white/20 rounded-md font-bold text-xl">+</button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold mb-2 text-slate-300">Baños</label>
                  <div className="flex items-center justify-between bg-white/10 rounded-lg p-2 border border-white/20">
                    <button onClick={() => adjustValue('baths', -1)} className="w-8 h-8 flex items-center justify-center text-white hover:bg-white/20 rounded-md font-bold text-xl">-</button>
                    <span className="text-xl font-bold text-white">{formData.baths}</span>
                    <button onClick={() => adjustValue('baths', 1)} className="w-8 h-8 flex items-center justify-center text-white hover:bg-white/20 rounded-md font-bold text-xl">+</button>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-center gap-4">
                <button onClick={prevStep} className="btn btn-outline text-white border-white hover:bg-white hover:text-[#2C3E50] px-6 py-2 rounded-lg font-bold transition-all">Atrás</button>
                <button onClick={nextStep} disabled={!formData.sqm} className="btn bg-[#FBBF24] hover:bg-yellow-500 text-[#2C3E50] px-8 py-2 rounded-lg font-bold transition-all disabled:opacity-50">Siguiente</button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="text-center animate-fade-in">
              <h2 className="text-3xl font-bold mb-6 text-white font-heading">Características y Estado</h2>
              
              <div className="max-w-md mx-auto space-y-4 text-left mb-8">
                <label className="flex items-center p-4 bg-white/10 hover:bg-white/20 rounded-lg cursor-pointer transition-colors border border-white/10 hover:border-white/30">
                  <input type="checkbox" name="hasElevator" checked={formData.hasElevator} onChange={handleChange} className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  <span className="ml-3 text-lg text-white">Tiene Ascensor</span>
                </label>

                <label className="flex items-center p-4 bg-white/10 hover:bg-white/20 rounded-lg cursor-pointer transition-colors border border-white/10 hover:border-white/30">
                  <input type="checkbox" name="hasTerrace" checked={formData.hasTerrace} onChange={handleChange} className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  <span className="ml-3 text-lg text-white">Terraza / Balcón</span>
                </label>

                <label className="flex items-center p-4 bg-white/10 hover:bg-white/20 rounded-lg cursor-pointer transition-colors border border-white/10 hover:border-white/30">
                  <input type="checkbox" name="hasGarage" checked={formData.hasGarage} onChange={handleChange} className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  <span className="ml-3 text-lg text-white">Plaza de Garaje</span>
                </label>
              </div>

              <div className="max-w-md mx-auto text-left mb-8">
                <label className="block text-sm font-bold mb-2 text-slate-300">Estado de conservación</label>
                <select name="condition" value={formData.condition} onChange={handleChange} className="w-full bg-white text-slate-800 rounded-lg px-4 py-3 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#FBBF24]">
                  <option value="reformar">A reformar (Origen)</option>
                  <option value="bueno">Buen estado (Habitable)</option>
                  <option value="reformado">Reformado recientemente</option>
                </select>
              </div>

              <div className="mt-8 flex justify-center gap-4">
                <button onClick={prevStep} className="btn btn-outline text-white border-white hover:bg-white hover:text-[#2C3E50] px-6 py-2 rounded-lg font-bold transition-all">Atrás</button>
                <button onClick={nextStep} className="btn bg-[#FBBF24] hover:bg-yellow-500 text-[#2C3E50] px-8 py-2 rounded-lg font-bold transition-all">Siguiente</button>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="text-center animate-fade-in">
              <h2 className="text-3xl font-bold mb-2 text-white font-heading">Último paso</h2>
              <p className="text-slate-300 mb-6 text-sm">Déjenos sus datos de contacto para recibir el informe de valoración al instante.</p>

              <form onSubmit={handleSubmit} className="max-w-md mx-auto space-y-4 text-left">
                <div className="grid grid-cols-2 gap-4">
                  <input type="text" name="name" value={formData.name} onChange={handleChange} className="w-full bg-white text-slate-800 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#FBBF24]" placeholder="Nombre" required />
                  <input type="text" name="surname" value={formData.surname} onChange={handleChange} className="w-full bg-white text-slate-800 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#FBBF24]" placeholder="Apellidos" />
                </div>
                <input type="email" name="email" value={formData.email} onChange={handleChange} className="w-full bg-white text-slate-800 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#FBBF24]" placeholder="Correo electrónico" required />
                
                <div className="flex">
                  <span className="inline-flex items-center px-4 bg-slate-200 border border-r-0 border-slate-300 rounded-l-lg font-bold text-slate-600">
                    🇪🇸 +34
                  </span>
                  <input type="tel" name="phone" value={formData.phone} onChange={handleChange} className="w-full bg-white text-slate-800 rounded-r-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#FBBF24]" placeholder="600 000 000" required />
                </div>

                <div className="space-y-2 mt-4 pt-4 border-t border-white/10">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" name="privacyCheck" checked={formData.privacyCheck} onChange={handleChange} className="mt-1 w-4 h-4 rounded border-gray-300 text-blue-600" />
                    <span className="text-xs text-slate-300 leading-tight">
                      He leído y acepto la <Link href="/politica-privacidad" className="underline hover:text-white">Política de Privacidad</Link>.
                    </span>
                  </label>
                </div>

                <div className="mt-8 flex flex-col gap-4">
                  <button type="submit" disabled={isSubmitting} className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold py-4 rounded-xl transition-colors shadow-lg flex items-center justify-center">
                    {isSubmitting ? 'Procesando...' : 'Obtener Valoración Gratuita'}
                  </button>
                  <button type="button" onClick={prevStep} className="btn btn-outline text-white border-none hover:bg-white/10 px-6 py-2 rounded-lg font-bold transition-all text-sm">
                    Atrás
                  </button>
                </div>
              </form>
            </div>
          )}

          {step === 6 && (
            <div className="text-center animate-fade-in">
              <h3 className="text-3xl font-bold text-white mb-4 font-heading">Estudio Personalizado Requerido</h3>
              <p className="text-lg text-slate-300 mb-8 max-w-lg mx-auto">
                Su propiedad tiene características únicas. Para garantizar el precio máximo, realizaré el cálculo manualmente con datos de mercado exclusivos.
              </p>
              <div className="p-4 bg-green-500/20 border border-green-500/50 text-green-100 rounded-lg mb-8 flex items-center justify-center gap-3 max-w-sm mx-auto shadow-lg shadow-green-500/10">
                <Check className="w-6 h-6 text-green-400" />
                <span className="font-medium">Solicitud recibida correctamente</span>
              </div>
              <p className="text-slate-400 mb-10">Le contactaré en breve con la valoración detallada a su correo o teléfono.</p>
              
              <Link href="/" className="inline-flex items-center gap-2 btn btn-outline text-white border-white hover:bg-white hover:text-[#2C3E50] px-8 py-3 rounded-full font-bold transition-all">
                Volver al inicio <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}

        </div>
      </div>

      {/* FAQ Section */}
      <div className="w-full max-w-4xl relative z-10 mt-16 text-slate-300 glass-effect bg-[#2C3E50] border border-[#2C3E50]/20 rounded-2xl p-8 md:p-12 shadow-2xl">
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-8 text-center font-heading">
          Preguntas Frecuentes sobre la Valoración Inteligente
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <h3 className="text-lg font-bold text-white mb-2">¿Cómo calculamos el precio de tu inmueble?</h3>
            <p className="text-sm leading-relaxed">
              Utilizamos un motor de <strong className="text-[#FBBF24]">Inteligencia Artificial de última generación</strong> que procesa en tiempo real Big Data del Catastro, registros de la propiedad y precios de cierre reales (no de portales). Esto nos permite darte el valor más competitivo del mercado.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-bold text-white mb-2">¿Cuánto cuesta tasar mi vivienda?</h3>
            <p className="text-sm leading-relaxed">
              En Tu Asesor Álvaro operamos con un <strong className="text-[#FBBF24]">modelo Lean (eficiente)</strong>. La valoración es <strong>100% gratuita</strong>. Nuestro beneficio viene de ayudarte a vender con la tarifa más baja del sector: solo un 2%.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-bold text-white mb-2">¿Por qué es mejor que una agencia tradicional?</h3>
            <p className="text-sm leading-relaxed">
              Las agencias tradicionales cobran hasta un 5% y cargan al comprador. Nosotros eliminamos oficinas físicas y costes innecesarios: <strong className="text-[#FBBF24]">0€ al comprador y 2% al vendedor</strong>. Más dinero para ti, más facilidades para el que compra.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-bold text-white mb-2">Zonas de especialización</h3>
            <p className="text-sm leading-relaxed">
              Nuestra base de datos inteligente está optimizada para <strong>Sevilla capital y todos los pueblos de la provincia</strong>. Conocemos cada barrio, desde La Macarena hasta el Aljarafe, con precisión quirúrgica.
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}

