"use client";

import { useState } from "react";
import { BUSINESS, ITP_DATA, IRPF_TRAMOS } from "@/lib/constants";
import { submitLeadWithCalculation } from "@/lib/leadService";
import type { RentabilidadResult } from "@/types";
import { 
  Calculator, 
  ArrowRight, 
  CheckCircle2, 
  TrendingUp, 
  DollarSign, 
  Home, 
  Smartphone, 
  User, 
  Lock,
  Percent,
  Wallet
} from "lucide-react";

/**
 * FIX APLICADO (Code Review):
 * - BUG-003: Eliminado <Header /> duplicado (ya lo renderiza LayoutWrapper)
 * - Número WhatsApp centralizado desde BUSINESS constant
 * - ITP_DATA e IRPF_TRAMOS importados de constants.ts
 * - Tipado: RentabilidadResult reemplaza 'any'
 */

// ITP_DATA e IRPF_TRAMOS ahora importados desde @/lib/constants

export default function RentabilidadPage() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    precioCompra: "",
    comunidad: "Andalucía",
    gastosNotaria: "800",
    gastosRegistro: "400",
    gastosGestoria: "300",
    gastosTasacion: "350",
    costeReforma: "0",
    conHipoteca: false,
    porcentajeFinanciado: "80",
    tipoInteres: "3.5",
    plazoAnios: "30",
    alquilerMensual: "",
    gastosComunidad: "50",
    gastosIbi: "30",
    gastosSeguroHogar: "20",
    gastosMantenimiento: "30",
    gastosSeguroImpago: "0",
    salarioBruto: "25000",
    nombre: "",
    telefono: ""
  });

  const [results, setResults] = useState<RentabilidadResult | null>(null);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const calculateIRPF = (base: number) => {
    let tax = 0;
    let remaining = base;
    for (let i = 0; i < IRPF_TRAMOS.length; i++) {
      const prevLimit = i > 0 ? IRPF_TRAMOS[i - 1].limit : 0;
      if (remaining > 0) {
        const taxableInBracket = Math.min(remaining, IRPF_TRAMOS[i].limit - prevLimit);
        tax += taxableInBracket * IRPF_TRAMOS[i].rate;
        remaining -= taxableInBracket;
      }
    }
    return tax;
  };

  const calculateRentabilidad = () => {
    const precioCompra = parseFloat(formData.precioCompra) || 0;
    const itp = precioCompra * (ITP_DATA[formData.comunidad] || 0.07);
    const gastosCompra = itp + parseFloat(formData.gastosNotaria) + parseFloat(formData.gastosRegistro) + parseFloat(formData.gastosGestoria) + (formData.conHipoteca ? parseFloat(formData.gastosTasacion) : 0);
    const costeReforma = parseFloat(formData.costeReforma) || 0;
    const inversionTotal = precioCompra + gastosCompra + costeReforma;

    let pagoAnualHipoteca = 0;
    let aportacionPropia = inversionTotal;
    let cuotaMensualHipoteca = 0;

    if (formData.conHipoteca) {
      const capitalPrestamo = precioCompra * (parseFloat(formData.porcentajeFinanciado) / 100);
      aportacionPropia = inversionTotal - capitalPrestamo;
      const r = (parseFloat(formData.tipoInteres) / 100) / 12;
      const n = parseInt(formData.plazoAnios) * 12;
      if (r > 0) {
        cuotaMensualHipoteca = capitalPrestamo * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
      } else {
        cuotaMensualHipoteca = capitalPrestamo / n;
      }
      pagoAnualHipoteca = cuotaMensualHipoteca * 12;
    }

    const ingresosAnuales = (parseFloat(formData.alquilerMensual) || 0) * 12;
    const gastosFijosAnuales = (parseFloat(formData.gastosComunidad) + parseFloat(formData.gastosIbi) + parseFloat(formData.gastosSeguroHogar) + parseFloat(formData.gastosMantenimiento) + parseFloat(formData.gastosSeguroImpago)) * 12;
    
    const beneficioBruto = ingresosAnuales - gastosFijosAnuales;
    const baseImponibleIRPF = beneficioBruto > 0 ? beneficioBruto * 0.4 : 0; // 60% reduccion alquiler vivienda habitual
    const salario = parseFloat(formData.salarioBruto) || 0;
    const irpf = calculateIRPF(salario + baseImponibleIRPF) - calculateIRPF(salario);

    const beneficioNetoAnual = ingresosAnuales - gastosFijosAnuales - pagoAnualHipoteca - irpf;
    const cashflowMensual = beneficioNetoAnual / 12;
    const rentabilidadNeta = (beneficioNetoAnual / inversionTotal) * 100;
    const roe = (beneficioNetoAnual / aportacionPropia) * 100;

    setResults({
      inversionTotal,
      aportacionPropia,
      ingresosAnuales,
      gastosFijosAnuales,
      pagoAnualHipoteca,
      cuotaMensualHipoteca,
      irpf,
      beneficioNetoAnual,
      cashflowMensual,
      rentabilidadNeta,
      roe
    });

    setStep(2);
  };

  const handleLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!consent) {
      setSubmitError('Debes aceptar el consentimiento para continuar.');
      return;
    }

    setSubmitting(true);

    const result = await submitLeadWithCalculation(
      {
        name: formData.nombre,
        phone: formData.telefono,
        type: 'buyer',
        source: 'rentabilidad'
      },
      {
        tool_type: 'rentabilidad',
        inputs: {
          precioCompra: formData.precioCompra,
          comunidad: formData.comunidad,
          costeReforma: formData.costeReforma,
          conHipoteca: formData.conHipoteca,
          alquilerMensual: formData.alquilerMensual
        },
        results: results as unknown as Record<string, unknown>
      }
    );

    setSubmitting(false);

    if (result.success) {
      setStep(3);
    } else {
      setSubmitError(result.error || 'Hubo un error. Inténtalo de nuevo.');
    }
  };

  return (
    <main className="min-h-screen pt-40 pb-20 bg-slate-50">
      
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-[#2C3E50] mb-4">
            Calculadora de Rentabilidad Inmobiliaria
          </h1>
          <p className="text-xl text-slate-600">
            Analiza tu inversión como un profesional. 
            Cálculo detallado de gastos, impuestos (ITP, IRPF) y Cashflow.
          </p>
        </div>

        <div className="bg-[#2C3E50]/95 backdrop-blur-md p-8 md:p-12 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden">
          
          {step === 1 && (
            <div className="space-y-12 animate-in fade-in duration-500">
              {/* Sección Compra */}
              <div className="space-y-6">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <Home size={24} className="text-[#FBBF24]" /> Datos de Adquisición
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <label className="text-slate-200 text-sm font-medium">Precio de Compra</label>
                    <input 
                      type="number" 
                      value={formData.precioCompra}
                      onChange={(e) => setFormData({...formData, precioCompra: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:bg-white/10 focus:ring-2 focus:ring-[#FBBF24]/50 placeholder:text-slate-400"
                      placeholder="0 €"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-slate-200 text-sm font-medium">Comunidad Autónoma</label>
                    <select 
                      value={formData.comunidad}
                      onChange={(e) => setFormData({...formData, comunidad: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:bg-white/10 focus:ring-2 focus:ring-[#FBBF24]/50"
                    >
                      {Object.keys(ITP_DATA).map(c => <option key={c} value={c} className="bg-[#2C3E50] text-white">{c}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-slate-200 text-sm font-medium">Coste Reforma</label>
                    <input 
                      type="number" 
                      value={formData.costeReforma}
                      onChange={(e) => setFormData({...formData, costeReforma: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:bg-white/10 focus:ring-2 focus:ring-[#FBBF24]/50 placeholder:text-slate-400"
                      placeholder="0 €"
                    />
                  </div>
                </div>
              </div>

              {/* Sección Hipoteca */}
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Wallet size={24} className="text-[#FBBF24]" /> Financiación
                  </h3>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={formData.conHipoteca}
                      onChange={(e) => setFormData({...formData, conHipoteca: e.target.checked})}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#FBBF24]"></div>
                    <span className="ml-3 text-sm font-medium text-white">¿Con Hipoteca?</span>
                  </label>
                </div>
                
                {formData.conHipoteca && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in slide-in-from-top duration-300">
                    <div className="space-y-2">
                      <label className="text-slate-200 text-sm font-medium">% Financiado</label>
                      <input 
                        type="number" 
                        value={formData.porcentajeFinanciado}
                        onChange={(e) => setFormData({...formData, porcentajeFinanciado: e.target.value})}
                        className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:bg-white/10 focus:ring-2 focus:ring-[#FBBF24]/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-slate-200 text-sm font-medium">Tipo Interés (%)</label>
                      <input 
                        type="number" 
                        step="0.1"
                        value={formData.tipoInteres}
                        onChange={(e) => setFormData({...formData, tipoInteres: e.target.value})}
                        className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:bg-white/10 focus:ring-2 focus:ring-[#FBBF24]/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-slate-200 text-sm font-medium">Plazo (Años)</label>
                      <input 
                        type="number" 
                        value={formData.plazoAnios}
                        onChange={(e) => setFormData({...formData, plazoAnios: e.target.value})}
                        className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:bg-white/10 focus:ring-2 focus:ring-[#FBBF24]/50"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Sección Explotación */}
              <div className="space-y-6">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <TrendingUp size={24} className="text-[#FBBF24]" /> Ingresos y Gastos de Alquiler
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="space-y-2">
                    <label className="text-slate-200 text-sm font-medium">Alquiler Mensual</label>
                    <input 
                      type="number" 
                      value={formData.alquilerMensual}
                      onChange={(e) => setFormData({...formData, alquilerMensual: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white font-bold focus:bg-white/10 focus:ring-2 focus:ring-[#FBBF24]/50 placeholder:text-slate-400"
                      placeholder="0 €"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-slate-200 text-sm font-medium">Comunidad (mes)</label>
                    <input 
                      type="number" 
                      value={formData.gastosComunidad}
                      onChange={(e) => setFormData({...formData, gastosComunidad: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:bg-white/10 focus:ring-2 focus:ring-[#FBBF24]/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-slate-200 text-sm font-medium">IBI (mes)</label>
                    <input 
                      type="number" 
                      value={formData.gastosIbi}
                      onChange={(e) => setFormData({...formData, gastosIbi: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:bg-white/10 focus:ring-2 focus:ring-[#FBBF24]/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-slate-200 text-sm font-medium">Seguros (mes)</label>
                    <input 
                      type="number" 
                      value={formData.gastosSeguroHogar}
                      onChange={(e) => setFormData({...formData, gastosSeguroHogar: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:bg-white/10 focus:ring-2 focus:ring-[#FBBF24]/50"
                    />
                  </div>
                </div>
              </div>

              <button 
                onClick={calculateRentabilidad}
                className="w-full bg-[#FBBF24] hover:bg-yellow-500 text-[#2C3E50] font-bold py-5 text-xl rounded-xl flex items-center justify-center gap-3 group transition-all shadow-lg"
              >
                <Calculator size={24} />
                Analizar Inversión
                <ArrowRight className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-8 animate-in slide-in-from-right duration-500 text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-500/20 border border-green-500/30 mb-4">
                <CheckCircle2 className="text-green-400" size={40} />
              </div>
              
              <h2 className="text-3xl font-bold text-white">¡Análisis Completado!</h2>
              <p className="text-slate-300">
                Hemos proyectado los rendimientos netos de tu futura propiedad.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 my-8">
                <div className="p-6 bg-white/5 border border-white/10 rounded-2xl">
                  <p className="text-xs text-slate-300 mb-1">RENTABILIDAD NETA</p>
                  <p className="text-2xl font-bold text-white">{results?.rentabilidadNeta.toFixed(2)}%</p>
                </div>
                <div className="p-6 bg-white/5 border border-white/10 rounded-2xl blur-[3px]">
                  <p className="text-xs text-slate-300 mb-1">CASHFLOW MES</p>
                  <p className="text-2xl font-bold text-white">XXX €</p>
                </div>
                <div className="p-6 bg-[#FBBF24]/20 border border-[#FBBF24]/30 rounded-2xl">
                  <p className="text-xs text-[#FBBF24] mb-1">ROI (ROE)</p>
                  <p className="text-2xl font-bold text-white">{results?.roe.toFixed(2)}%</p>
                </div>
                <div className="p-6 bg-white/5 border border-white/10 rounded-2xl blur-[3px]">
                  <p className="text-xs text-slate-300 mb-1">INVERSIÓN INICIAL</p>
                  <p className="text-2xl font-bold text-white">XX.XXX €</p>
                </div>
              </div>

              <div className="bg-white/5 p-8 rounded-2xl border border-white/10 max-w-2xl mx-auto text-left">
                <h3 className="text-xl font-bold text-white mb-6">Ver Informe de Rentabilidad</h3>
                <p className="text-slate-300 mb-8 text-sm">
                  Introduce tus datos para acceder al desglose de gastos deducibles, amortización y proyecciones a 10 años.
                </p>
                
                <form onSubmit={handleLeadSubmit} className="space-y-4">
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input 
                      type="text" 
                      required
                      minLength={2}
                      maxLength={100}
                      placeholder="Tu Nombre"
                      value={formData.nombre}
                      onChange={(e) => setFormData({...formData, nombre: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-4 pl-12 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-[#FBBF24] placeholder:text-slate-400"
                    />
                  </div>
                  <div className="relative">
                    <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input 
                      type="tel" 
                      required
                      pattern="[0-9]{9,15}"
                      title="Introduce un teléfono válido (9-15 dígitos)"
                      placeholder="Tu Teléfono"
                      value={formData.telefono}
                      onChange={(e) => setFormData({...formData, telefono: e.target.value.replace(/[^0-9]/g, '')})}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-4 pl-12 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-[#FBBF24] placeholder:text-slate-400"
                    />
                  </div>

                  {/* Consentimiento de contacto comercial */}
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => { setConsent(e.target.checked); setSubmitError(null); }}
                      className="mt-1 w-4 h-4 accent-[#FBBF24] rounded"
                    />
                    <span className="text-xs text-slate-300 leading-relaxed group-hover:text-slate-200 transition-colors">
                      Acepto recibir una llamada o mensaje de <strong>Tu Asesor</strong> para informarme sobre los resultados y servicios relacionados con mi consulta. Puedo retirar mi consentimiento en cualquier momento.
                    </span>
                  </label>

                  {submitError && (
                    <p className="text-red-400 text-sm text-center bg-red-500/10 p-3 rounded-xl border border-red-500/20">
                      {submitError}
                    </p>
                  )}

                  <button 
                    type="submit" 
                    disabled={submitting || !consent}
                    className={`w-full py-4 rounded-xl text-lg font-bold transition-all shadow-lg ${
                      consent 
                        ? 'bg-[#FBBF24] hover:bg-yellow-500 text-[#2C3E50] cursor-pointer' 
                        : 'bg-slate-600 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    {submitting ? 'Guardando...' : 'Desbloquear Informe Completo'}
                  </button>
                  <p className="flex items-center justify-center gap-2 text-xs text-slate-300 mt-4">
                    <Lock size={12} /> Sin spam. Solo tu informe profesional.
                  </p>
                </form>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-8 animate-in zoom-in duration-500">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Columna Resumen KPIs */}
                <div className="lg:col-span-1 space-y-6">
                  <div className="p-6 bg-[#FBBF24] rounded-2xl text-[#2C3E50] shadow-md">
                    <p className="text-xs font-bold uppercase mb-1">Cashflow Mensual Neto</p>
                    <p className="text-4xl font-black">{results?.cashflowMensual.toFixed(2)} €</p>
                    <p className="text-sm mt-2 font-medium">Dinero limpio en tu bolsillo cada mes.</p>
                  </div>
                  <div className="p-6 bg-white/5 border border-white/10 rounded-2xl shadow-sm">
                    <p className="text-xs text-slate-300 mb-1">Rentabilidad Neta Anual</p>
                    <p className="text-2xl font-bold text-white">{results?.rentabilidadNeta.toFixed(2)}%</p>
                  </div>
                  <div className="p-6 bg-white/5 border border-white/10 rounded-2xl shadow-sm">
                    <p className="text-xs text-slate-300 mb-1">Inversión Real Necesaria</p>
                    <p className="text-2xl font-bold text-white">{results?.aportacionPropia.toLocaleString()} €</p>
                  </div>
                </div>

                {/* Columna Desglose */}
                <div className="lg:col-span-2 bg-white/5 p-8 rounded-2xl border border-white/10 shadow-sm">
                  <h4 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                    <DollarSign className="text-[#FBBF24]" /> Desglose Económico Anual
                  </h4>
                  
                  <div className="space-y-4">
                    <div className="flex justify-between items-center p-3 hover:bg-white/5 rounded-lg transition-colors">
                      <span className="text-slate-300">Ingresos por Alquiler</span>
                      <span className="text-green-400 font-bold">+{results?.ingresosAnuales.toLocaleString()} €</span>
                    </div>
                    <div className="flex justify-between items-center p-3 hover:bg-white/5 rounded-lg transition-colors">
                      <span className="text-slate-300">Gastos de Explotación</span>
                      <span className="text-red-400 font-bold">-{results?.gastosFijosAnuales.toLocaleString()} €</span>
                    </div>
                    {formData.conHipoteca && (
                      <div className="flex justify-between items-center p-3 hover:bg-white/5 rounded-lg transition-colors">
                        <span className="text-slate-300">Pago Hipoteca (Anual)</span>
                        <span className="text-red-400 font-bold">-{results?.pagoAnualHipoteca.toLocaleString()} €</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center p-3 hover:bg-white/5 rounded-lg transition-colors border-b border-white/10 pb-4">
                      <span className="text-slate-300">Impacto Fiscal (IRPF estimado)</span>
                      <span className="text-red-400 font-bold">-{results?.irpf.toFixed(2)} €</span>
                    </div>
                    <div className="flex justify-between items-center p-4 bg-white/10 rounded-xl mt-4 border border-white/20">
                      <span className="text-lg font-bold text-white">Beneficio Neto (Año 1)</span>
                      <span className="text-2xl font-black text-white">{results?.beneficioNetoAnual.toFixed(2)} €</span>
                    </div>
                  </div>

                  <div className="mt-12 p-6 bg-white/5 rounded-2xl border border-white/10">
                    <p className="text-slate-200 text-sm italic text-center">
                      "Hola {formData.nombre}, los números de esta operación son muy interesantes. 
                      Acabo de enviarte una copia a tu WhatsApp {formData.telefono}. ¿Hablamos para ver si es la mejor opción en Sevilla?"
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col md:flex-row gap-4 justify-center mt-12">
                <button 
                  onClick={() => window.location.href = BUSINESS.whatsappUrl(`Hola Álvaro, he analizado una inversión de ${formData.precioCompra}€ y quiero que me asesores.`)}
                  className="btn bg-[#25D366] hover:bg-[#128C7E] text-white border-none py-4 px-10 flex items-center gap-2 justify-center"
                >
                  Hablar con Álvaro por WhatsApp
                </button>
                <button 
                  onClick={() => setStep(1)}
                  className="btn btn-outline border-white text-white hover:bg-white/10 py-4 px-10"
                >
                  Nuevo Análisis
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
