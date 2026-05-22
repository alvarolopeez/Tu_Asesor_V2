import Link from 'next/link'
import { MessageCircle, Phone, Mail, ArrowRight } from 'lucide-react'
import { BUSINESS } from '@/lib/constants'

/**
 * FIX APLICADO (Code Review):
 * - Teléfono y email centralizados desde BUSINESS constant
 */

export default function ContactoPage() {
  return (
    <main className="min-h-screen flex flex-col items-center pt-32 pb-24 px-4 bg-[#0f172a] text-white relative overflow-x-hidden">
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-0 w-full h-full bg-[url('/assets/images/pattern.svg')] opacity-5"></div>
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#FBBF24]/10 rounded-full mix-blend-screen filter blur-3xl opacity-30 z-0"></div>
        <div className="absolute bottom-10 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full mix-blend-screen filter blur-3xl opacity-20 z-0"></div>
      </div>

      <div className="w-full max-w-4xl relative z-10 text-center mb-16 animate-fade-in">
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 font-heading">
          Contacto
        </h1>
        <p className="text-lg text-slate-300 max-w-2xl mx-auto">
          ¿Tienes alguna duda o quieres empezar a vender/comprar tu propiedad? Contáctanos a través de cualquiera de nuestros canales.
        </p>
      </div>

      <div className="w-full max-w-5xl relative z-10 grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* WhatsApp Card */}
        <div className="glass-effect bg-[#1E293B]/70 border border-white/5 backdrop-blur-md shadow-xl rounded-2xl p-8 flex flex-col items-center text-center hover:-translate-y-2 transition-transform duration-300">
          <div className="w-16 h-16 bg-[#25D366]/10 rounded-full flex items-center justify-center mb-6">
            <MessageCircle className="w-8 h-8 text-[#25D366]" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2 font-heading">WhatsApp 24/7</h2>
          <p className="text-slate-300 mb-6 flex-grow">
            Escríbenos en cualquier momento. Nuestro asistente inteligente te responderá de forma instantánea.
          </p>
          <a 
            href={BUSINESS.whatsappUrl('Hola Álvaro, me gustaría recibir más información.')} 
            target="_blank" 
            rel="noopener noreferrer"
            className="w-full bg-[#25D366] hover:bg-[#20bd5a] text-white font-extrabold py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg active:scale-95 duration-200"
          >
            Chat en WhatsApp <ArrowRight className="w-4 h-4" />
          </a>
        </div>

        {/* Phone Card */}
        <div className="glass-effect bg-[#1E293B]/70 border border-white/5 backdrop-blur-md shadow-xl rounded-2xl p-8 flex flex-col items-center text-center hover:-translate-y-2 transition-transform duration-300">
          <div className="w-16 h-16 bg-[#FBBF24]/10 rounded-full flex items-center justify-center mb-6">
            <Phone className="w-8 h-8 text-[#FBBF24]" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2 font-heading">Llamada Telefónica</h2>
          <p className="text-slate-300 mb-6 flex-grow">
            ¿Prefieres hablar directamente? Te atenderé yo personalmente para resolver todas tus dudas.
          </p>
          <a 
            href={`tel:+${BUSINESS.phoneIntl}`} 
            className="w-full bg-[#FBBF24] hover:bg-yellow-500 text-[#0f172a] font-extrabold py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg active:scale-95 duration-200"
          >
            Llamar al {BUSINESS.phone.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')} <ArrowRight className="w-4 h-4" />
          </a>
        </div>

        {/* Email Card */}
        <div className="glass-effect bg-[#1E293B]/70 border border-white/5 backdrop-blur-md shadow-xl rounded-2xl p-8 flex flex-col items-center text-center hover:-translate-y-2 transition-transform duration-300 text-white">
          <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mb-6">
            <Mail className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2 font-heading">Correo Electrónico</h2>
          <p className="text-slate-300 mb-6 flex-grow">
            Envíanos un mensaje detallado a través de nuestro formulario y te responderemos en 24 horas.
          </p>
          <a 
            href={`mailto:${BUSINESS.email}`} 
            className="w-full bg-[#FBBF24] hover:bg-yellow-500 text-[#0f172a] font-extrabold py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg active:scale-95 duration-200"
          >
            Enviar Email <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    </main>
  )
}
