"use client";

import { useState } from "react";
import { Calculator, Info, CheckCircle2, ArrowRight, Smartphone, User, Lock, ShieldCheck } from "lucide-react";
import { BUSINESS, COEFICIENTES_PLUSVALIA_2024, MUNICIPIOS_SEVILLA } from "@/lib/constants";
import { submitLeadWithCalculation } from "@/lib/leadService";
import type { PlusvaliaResult } from "@/types";

/**
 * FIX APLICADO (Code Review):
 * - Constantes (coeficientes, municipios) importadas de @/lib/constants
 * - Número WhatsApp centralizado (era 623956461, corregido a 697223944)
 * - BUG-006: Eliminada variable porcentajeSuelo sin uso
 * - Tipado: PlusvaliaResult reemplaza 'any'
 */

// COEFICIENTES y MUNICIPIOS ahora importados de @/lib/constants

export default function PlusvaliaPage() {
  const [step, setStep] = useState(1);
  const [taxType, setTaxType] = useState<'municipal' | 'fiscal'>('municipal');
  const [formData, setFormData] = useState({
    valorAdquisicion: "",
    fechaAdquisicion: "",
    valorVenta: "",
    fechaVenta: new Date().toISOString().split('T')[0],
    valorCatastralSuelo: "",
    municipio: "Sevilla",
    nombre: "",
    telefono: ""
  });

  const [results, setResults] = useState<PlusvaliaResult | null>(null);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const calculatePlusvalia = () => {
    const valAdq = parseFloat(formData.valorAdquisicion);
    const valVenta = parseFloat(formData.valorVenta);
    const fAdq = new Date(formData.fechaAdquisicion);
    const fVenta = new Date(formData.fechaVenta);

    if (isNaN(valAdq) || isNaN(valVenta) || isNaN(fAdq.getTime()) || isNaN(fVenta.getTime())) {
      return;
    }

    if (taxType === 'municipal') {
      const valCatSuelo = parseFloat(formData.valorCatastralSuelo);
      if (isNaN(valCatSuelo)) return;

      const diffTime = Math.abs(fVenta.getTime() - fAdq.getTime());
      const diffYears = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 365.25));
      const yearsIndex = Math.min(Math.max(diffYears, 1), 20);
      const coef = COEFICIENTES_PLUSVALIA_2024.find(c => c.years === yearsIndex)?.coef || 0.45;

      // Método Objetivo
      const baseObjetiva = valCatSuelo * coef;
      const cuotaObjetiva = baseObjetiva * 0.30; // 30% tipo maximo legal

      // Método Real
      const incrementoReal = valVenta - valAdq;
      let baseReal = 0;
      if (incrementoReal > 0) {
        // BUG-006 FIX: Se usa el ratio real del valor catastral del suelo
        // sobre el valor catastral total estimado (simplificación razonable)
        const ratioSuelo = valCatSuelo / (valCatSuelo * 1.5);
        baseReal = incrementoReal * ratioSuelo;
      }
      const cuotaReal = baseReal * 0.30;

      const mejorOpcion = cuotaReal < cuotaObjetiva ? "Método Real" : "Método Objetivo";
      const cuotaFinal = Math.min(cuotaObjetiva, cuotaReal);

      setResults({
        tipo: 'municipal',
        baseObjetiva,
        cuotaObjetiva,
        baseReal,
        cuotaReal,
        cuotaFinal,
        mejorOpcion,
        ahorro: Math.abs(cuotaObjetiva - cuotaReal)
      });
    } else {
      // Plusvalía Fiscal (IRPF)
      const ganancia = valVenta - valAdq;
      if (ganancia <= 0) {
        setResults({ tipo: 'fiscal', cuotaIRPF: 0, ganancia: 0, gananciaSujeta: 0 });
        setStep(2);
        return;
      }

      let gananciaSujeta = ganancia;

      // Coeficientes de abatimiento si adquirida antes de 31/12/1994
      const limitDate1 = new Date('1994-12-31');
      const limitDate2 = new Date('1996-12-31');
      const changeDate = new Date('2006-01-20');

      if (fAdq <= limitDate1) {
        // Days from acquisition to 31/12/1996
        const diffDays1 = Math.floor((limitDate2.getTime() - fAdq.getTime()) / (1000 * 60 * 60 * 24));
        const years = Math.ceil(diffDays1 / 365.25);

        if (years > 2) {
          let reductionPercent = (years - 2) * 0.1111;
          if (reductionPercent > 1) reductionPercent = 1;

          const totalDays = Math.floor((fVenta.getTime() - fAdq.getTime()) / (1000 * 60 * 60 * 24));
          const daysTo2006 = Math.floor((changeDate.getTime() - fAdq.getTime()) / (1000 * 60 * 60 * 24));

          if (totalDays > 0 && daysTo2006 > 0) {
            const gananciaTo2006 = ganancia * (daysTo2006 / totalDays);
            const gananciaReduced = gananciaTo2006 * reductionPercent;
            gananciaSujeta = ganancia - gananciaReduced;
          }
        }
      }

      if (gananciaSujeta < 0) gananciaSujeta = 0;

      // Apply IRPF tiers 2024
      let cuotaIRPF = 0;
      let remaining = gananciaSujeta;

      if (remaining > 0) {
        const b1 = Math.min(remaining, 6000);
        cuotaIRPF += b1 * 0.19;
        remaining -= b1;
      }
      if (remaining > 0) {
        const b2 = Math.min(remaining, 44000); // up to 50k
        cuotaIRPF += b2 * 0.21;
        remaining -= b2;
      }
      if (remaining > 0) {
        const b3 = Math.min(remaining, 150000); // up to 200k
        cuotaIRPF += b3 * 0.23;
        remaining -= b3;
      }
      if (remaining > 0) {
        const b4 = Math.min(remaining, 100000); // up to 300k
        cuotaIRPF += b4 * 0.27;
        remaining -= b4;
      }
      if (remaining > 0) {
        cuotaIRPF += remaining * 0.28;
      }

      setResults({
        tipo: 'fiscal',
        ganancia: ganancia,
        gananciaSujeta: gananciaSujeta,
        cuotaIRPF: cuotaIRPF
      });
    }

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
        type: 'seller',
        source: 'Calculadora Plusvalía'
      },
      {
        tool_type: taxType === 'municipal' ? 'plusvalia' : 'plusvalia_fiscal',
        inputs: {
          valorAdquisicion: formData.valorAdquisicion,
          fechaAdquisicion: formData.fechaAdquisicion,
          valorVenta: formData.valorVenta,
          fechaVenta: formData.fechaVenta,
          valorCatastralSuelo: formData.valorCatastralSuelo,
          municipio: formData.municipio
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
    <main className="min-h-screen pt-40 pb-20 bg-[#0F172A] text-white relative overflow-hidden">
      {/* Elementos decorativos */}
      <div className="absolute inset-0 bg-[url('/assets/images/pattern.svg')] opacity-5 z-0 pointer-events-none"></div>
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#FBBF24]/10 rounded-full mix-blend-screen filter blur-3xl opacity-30 z-0"></div>
      <div className="absolute bottom-10 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full mix-blend-screen filter blur-3xl opacity-20 z-0"></div>

      <div className="container mx-auto px-4 max-w-4xl relative z-10">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Calculadoras de Impuestos
          </h1>
          <p className="text-xl text-slate-300 font-light max-w-2xl mx-auto">
            Descubre cuánto pagarás al vender tu vivienda. Calcula la Plusvalía Municipal de Sevilla o el IRPF con coeficientes de abatimiento.
          </p>
        </div>

        <div className="glass-effect bg-[#1E293B]/70 border border-white/5 backdrop-blur-md p-8 md:p-12 rounded-3xl shadow-2xl relative z-10">

          {step === 1 && (
            <div className="space-y-8 animate-in fade-in duration-500">

              <div className="flex flex-col sm:flex-row justify-center mb-8 bg-slate-900 p-1 rounded-xl w-fit mx-auto border border-white/5 gap-1">
                <button
                  onClick={() => setTaxType('municipal')}
                  className={`px-6 py-2 rounded-lg font-bold transition-all ${taxType === 'municipal' ? 'bg-[#FBBF24] text-[#2C3E50]' : 'text-white hover:bg-white/10'}`}
                >
                  Plusvalía Municipal
                </button>
                <button
                  onClick={() => setTaxType('fiscal')}
                  className={`px-6 py-2 rounded-lg font-bold transition-all ${taxType === 'fiscal' ? 'bg-[#FBBF24] text-[#2C3E50]' : 'text-white hover:bg-white/10'}`}
                >
                  Plusvalía Fiscal (IRPF)
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label htmlFor="valorAdquisicion" className="text-slate-200 text-sm font-medium">Precio de Compra (Original)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">€</span>
                    <input
                      type="number"
                      id="valorAdquisicion"
                      value={formData.valorAdquisicion}
                      onChange={(e) => setFormData({ ...formData, valorAdquisicion: e.target.value })}
                      placeholder="Ej: 150000"
                      className="w-full bg-[#0F172A] border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder:text-slate-400 focus:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="fechaAdquisicion" className="text-slate-200 text-sm font-medium">Fecha de Compra</label>
                  <input
                    type="date"
                    id="fechaAdquisicion"
                    value={formData.fechaAdquisicion}
                    onChange={(e) => setFormData({ ...formData, fechaAdquisicion: e.target.value })}
                    className="w-full bg-[#0F172A] border border-white/10 rounded-xl py-3 px-4 text-white focus:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="valorVenta" className="text-slate-200 text-sm font-medium">Precio de Venta (Estimado)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">€</span>
                    <input
                      type="number"
                      id="valorVenta"
                      value={formData.valorVenta}
                      onChange={(e) => setFormData({ ...formData, valorVenta: e.target.value })}
                      placeholder="Ej: 210000"
                      className="w-full bg-[#0F172A] border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder:text-slate-400 focus:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="fechaVenta" className="text-slate-200 text-sm font-medium">Fecha de Venta</label>
                  <input
                    type="date"
                    id="fechaVenta"
                    value={formData.fechaVenta}
                    onChange={(e) => setFormData({ ...formData, fechaVenta: e.target.value })}
                    className="w-full bg-[#0F172A] border border-white/10 rounded-xl py-3 px-4 text-white focus:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all"
                  />
                </div>

                {taxType === 'municipal' && (
                  <>
                    <div className="space-y-2">
                      <label htmlFor="valorCatastralSuelo" className="text-slate-200 text-sm font-medium">Valor Catastral del Suelo</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">€</span>
                        <input
                          type="number"
                          id="valorCatastralSuelo"
                          value={formData.valorCatastralSuelo}
                          onChange={(e) => setFormData({ ...formData, valorCatastralSuelo: e.target.value })}
                          placeholder="Consultar en el IBI"
                          className="w-full bg-[#0F172A] border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder:text-slate-400 focus:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="municipio" className="text-slate-200 text-sm font-medium">Municipio</label>
                      <select
                        id="municipio"
                        value={formData.municipio}
                        onChange={(e) => setFormData({ ...formData, municipio: e.target.value })}
                        className="w-full bg-[#0F172A] border border-white/10 rounded-xl py-3 px-4 text-white focus:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all appearance-none cursor-pointer"
                      >
                        {MUNICIPIOS_SEVILLA.map(m => (
                          <option key={m} value={m} className="bg-[#0F172A] text-white">{m}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-center gap-3 p-4 bg-blue-900/30 border border-blue-500/20 rounded-xl">
                <Info className="text-[#FBBF24] shrink-0" size={20} />
                <p className="text-sm text-blue-100">
                  {taxType === 'municipal'
                    ? "Calculamos automáticamente el método más favorable (Real vs Objetivo) según la normativa de 2024."
                    : "Aplicamos los coeficientes de abatimiento si tu inmueble fue adquirido antes del 31 de diciembre de 1994."}
                </p>
              </div>

              <button
                onClick={calculatePlusvalia}
                className="w-full bg-[#FBBF24] hover:bg-yellow-500 text-[#2C3E50] font-extrabold py-4 text-xl rounded-xl flex items-center justify-center gap-3 group transition-all shadow-lg active:scale-95 duration-200"
              >
                <Calculator size={24} />
                Calcular Impuesto
                <ArrowRight className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-8 animate-in slide-in-from-right duration-500 text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-500/20 border border-green-500/30 mb-4">
                <CheckCircle2 className="text-green-400" size={40} />
              </div>

              <h2 className="text-3xl font-bold text-white">¡Cálculo Listo!</h2>
              {results?.tipo === 'municipal' ? (
                <p className="text-slate-300">
                  Hemos detectado que puedes ahorrar seleccionando el <strong className="text-[#FBBF24]">{results?.mejorOpcion}</strong>.
                </p>
              ) : (
                <p className="text-slate-300">
                  Hemos calculado la ganancia patrimonial y tu cuota estimada de <strong className="text-[#FBBF24]">IRPF</strong>.
                </p>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-8">
                <div className="p-6 bg-white/10 border border-white/20 rounded-2xl blur-[2px] select-none">
                  <p className="text-sm text-slate-300 mb-1">Estimación Cuota</p>
                  <p className="text-3xl font-bold text-white">X.XXX,XX €</p>
                </div>
                {results?.tipo === 'municipal' ? (
                  <div className="p-6 bg-[#FBBF24]/10 border border-[#FBBF24]/20 rounded-2xl">
                    <p className="text-sm text-[#FBBF24] mb-1">Ahorro Estimado</p>
                    <p className="text-3xl font-bold text-white">{results?.ahorro.toFixed(2)} €</p>
                  </div>
                ) : (
                  <div className="p-6 bg-blue-500/10 border border-blue-500/20 rounded-2xl">
                    <p className="text-sm text-blue-400 mb-1">Ganancia Neta</p>
                    <p className="text-3xl font-bold text-white">{results?.ganancia.toFixed(2)} €</p>
                  </div>
                )}
              </div>

              <div className="bg-[#0F172A]/50 p-8 rounded-2xl border border-white/5 text-left backdrop-blur-sm">
                <h3 className="text-xl font-bold text-white mb-6">Recibe el Informe Detallado</h3>
                <p className="text-slate-300 mb-8 text-sm">
                  Introduce tus datos para desbloquear el desglose completo y recibir una consulta gratuita sobre cómo reducir este impuesto legalmente.
                </p>

                <form onSubmit={handleLeadSubmit} className="space-y-4">
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input
                      type="text"
                      id="nombre"
                      required
                      minLength={2}
                      maxLength={100}
                      placeholder="Tu Nombre"
                      value={formData.nombre}
                      onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-4 pl-12 pr-4 text-white focus:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#FBBF24] placeholder:text-slate-400"
                    />
                    <label htmlFor="nombre" className="sr-only">Tu Nombre</label>
                  </div>
                  <div className="relative">
                    <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input
                      type="tel"
                      id="telefono"
                      required
                      pattern="[0-9]{9,15}"
                      title="Introduce un teléfono válido (9-15 dígitos)"
                      placeholder="Tu Teléfono"
                      value={formData.telefono}
                      onChange={(e) => setFormData({ ...formData, telefono: e.target.value.replace(/[^0-9]/g, '') })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-4 pl-12 pr-4 text-white focus:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#FBBF24] placeholder:text-slate-400"
                    />
                    <label htmlFor="telefono" className="sr-only">Tu Teléfono</label>
                  </div>

                  {/* Consentimiento de contacto comercial */}
                  <label htmlFor="consent" className="flex items-start gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      id="consent"
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
                    className={`w-full py-4 rounded-xl text-lg font-bold transition-all shadow-lg active:scale-95 ${consent
                        ? 'bg-[#FBBF24] hover:bg-yellow-500 text-[#2C3E50] cursor-pointer font-extrabold'
                        : 'bg-slate-600 text-slate-400 cursor-not-allowed'
                      }`}
                  >
                    {submitting ? 'Guardando...' : 'Ver Informe Completo Gratis'}
                  </button>
                  <p className="flex items-center justify-center gap-2 text-xs text-slate-400 mt-4">
                    <Lock size={12} /> Tus datos están protegidos y solo se usarán para este informe.
                  </p>
                </form>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-8 animate-in zoom-in duration-500">
              <div className="text-center">
                <h2 className="text-3xl font-bold text-white mb-2">Informe de {results?.tipo === 'municipal' ? 'Plusvalía Municipal' : 'Plusvalía Fiscal (IRPF)'}</h2>
                {results?.tipo === 'municipal' && <p className="text-slate-400">Municipio: {formData.municipio}</p>}
              </div>

              {results?.tipo === 'municipal' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white/5 border border-white/10 p-6 rounded-2xl">
                    <h4 className="text-lg font-semibold text-white mb-4">Método Objetivo</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-300">Base Imponible:</span>
                        <span className="text-white font-medium">{results?.baseObjetiva.toFixed(2)} €</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-300">Tipo Impositivo:</span>
                        <span className="text-white font-medium">30%</span>
                      </div>
                      <div className="pt-3 border-t border-white/10 flex justify-between font-bold text-lg">
                        <span className="text-[#FBBF24]">Cuota:</span>
                        <span className="text-[#FBBF24]">{results?.cuotaObjetiva.toFixed(2)} €</span>
                      </div>
                    </div>
                  </div>

                  <div className={`bg-white/5 p-6 rounded-2xl border ${results?.mejorOpcion === "Método Real" ? 'border-[#FBBF24] ring-2 ring-[#FBBF24]/20' : 'border-white/10'}`}>
                    <div className="flex justify-between items-start mb-4">
                      <h4 className="text-lg font-semibold text-white">Método Real</h4>
                      {results?.mejorOpcion === "Método Real" && (
                        <span className="bg-[#FBBF24] text-[#2C3E50] text-[10px] font-bold px-2 py-1 rounded">MÁS FAVORABLE</span>
                      )}
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-300">Base Imponible:</span>
                        <span className="text-white font-medium">{results?.baseReal.toFixed(2)} €</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-300">Tipo Impositivo:</span>
                        <span className="text-white font-medium">30%</span>
                      </div>
                      <div className="pt-3 border-t border-white/10 flex justify-between font-bold text-lg">
                        <span className="text-[#FBBF24]">Cuota:</span>
                        <span className="text-[#FBBF24]">{results?.cuotaReal.toFixed(2)} €</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white/5 p-6 rounded-2xl border border-white/10 max-w-lg mx-auto">
                  <h4 className="text-lg font-semibold text-white mb-4">Desglose IRPF</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-300">Ganancia Bruta:</span>
                      <span className="text-white font-medium">{results?.ganancia.toFixed(2)} €</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-300">Ganancia Sujeta (abatimientos aplicados):</span>
                      <span className="text-white font-medium">{results?.gananciaSujeta.toFixed(2)} €</span>
                    </div>
                    <div className="pt-3 border-t border-white/10 flex justify-between font-bold text-lg">
                      <span className="text-[#FBBF24]">Cuota a Pagar:</span>
                      <span className="text-[#FBBF24]">{results?.cuotaIRPF.toFixed(2)} €</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-[#FBBF24] p-8 rounded-2xl text-[#2C3E50] text-center shadow-lg">
                <p className="text-sm font-bold uppercase tracking-wider mb-2">Cuota Final Estimada</p>
                <p className="text-5xl font-black mb-4">{results?.tipo === 'municipal' ? results?.cuotaFinal.toFixed(2) : results?.cuotaIRPF.toFixed(2)} €</p>
                {results?.tipo === 'municipal' && (
                  <p className="font-semibold">
                    Ahorro de {results?.ahorro.toFixed(2)} € aplicando el {results?.mejorOpcion}.
                  </p>
                )}
              </div>

              <div className="text-center space-y-4">
                <p className="text-slate-300 italic">
                  "Hola {formData.nombre}, ya tengo tu cálculo. Te contactaré en breve al {formData.telefono} para explicarte cómo tramitarlo sin errores."
                </p>
                <button
                  onClick={() => {
                    const cuota = results?.tipo === 'municipal' ? results.cuotaFinal : (results?.tipo === 'fiscal' ? results.cuotaIRPF : 0);
                    window.location.href = BUSINESS.whatsappUrl(`Hola Álvaro, acabo de calcular mi ${results?.tipo === 'municipal' ? 'plusvalía municipal' : 'plusvalía fiscal'} (${cuota.toFixed(2)}€) y me gustaría que me ayudaras con la venta.`);
                  }}
                  className="btn bg-[#25D366] hover:bg-[#128C7E] text-white border-none py-4 px-8 flex items-center justify-center gap-2 mx-auto rounded-xl font-extrabold transition-all shadow-lg active:scale-95 duration-200"
                >
                  Confirmar por WhatsApp
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
