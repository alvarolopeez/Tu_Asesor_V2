import Image from "next/image";
import Link from "next/link";
import { CheckCircle2, TrendingUp, Handshake, BadgeEuro, Search, Calculator, Smartphone, Star, Quote } from "lucide-react";
import BuyerLeadPopup from "@/components/BuyerLeadPopup";
import ReviewsGrid from "@/components/ReviewsGrid";
import SubscribeSection from "@/components/SubscribeSection";
import SuccessStoriesCarousel from "@/components/SuccessStoriesCarousel";

export default function Home() {
  return (
    <>
      <BuyerLeadPopup />
      {/* Hero Section */}
      <section className="relative min-h-[100svh] w-full flex items-center justify-center overflow-hidden bg-[url('/assets/images/que-ver-en-sevilla-optimizada.webp')] bg-cover bg-center pt-24 pb-12 md:pt-32 md:pb-16">
        {/* Decorative Background Elements */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#2C3E50]/90 via-[#2C3E50]/70 to-[#1a252f] z-10"></div>
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#FBBF24]/20 rounded-full mix-blend-screen filter blur-3xl opacity-50 animate-blob"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full mix-blend-screen filter blur-3xl opacity-50 animate-blob animation-delay-2000"></div>

        <div className="relative z-20 text-center p-2 sm:p-6 md:p-12 mx-2 sm:mx-4 max-w-5xl mt-4 md:mt-8 w-full">
          <div className="inline-block bg-[#FBBF24]/10 border border-[#FBBF24]/30 text-[#FBBF24] font-bold px-3 sm:px-6 py-2 rounded-full mb-4 sm:mb-8 backdrop-blur-sm shadow-[0_0_15px_rgba(251,191,36,0.3)] text-xs sm:text-base">
            ✨ Revolucionamos el sector inmobiliario en Sevilla
          </div>
          
          <h1 className="text-3xl sm:text-6xl md:text-7xl font-bold font-heading text-white leading-tight mb-4 sm:mb-6 drop-shadow-lg">
            Vende tu casa por solo un <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FBBF24] to-yellow-200">2%</span>
            <br />
            Compradores pagan <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FBBF24] to-yellow-200">0€</span>
          </h1>
          
          <p className="mt-2 sm:mt-6 text-base sm:text-2xl max-w-3xl mx-auto text-slate-300 font-light tracking-wide mb-6 sm:mb-12">
            Sin comisiones ocultas, sin exclusivas abusivas. 
            Te acompaño en cada paso para vender rápido o encontrar tu hogar ideal.
          </p>
          
          <div className="flex flex-col sm:flex-row justify-center items-center gap-3 sm:gap-6 w-full px-4 sm:px-0">
            <Link href="/valoracion" className="group relative w-full sm:w-auto overflow-hidden rounded-xl bg-[#FBBF24] px-6 py-3 sm:px-8 sm:py-4 font-bold text-[#2C3E50] transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(251,191,36,0.4)]">
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-in-out"></div>
              <span className="relative text-base sm:text-lg">Valora tu piso GRATIS</span>
            </Link>
            
            <Link href="/comprar" className="w-full sm:w-auto px-6 py-3 sm:px-8 sm:py-4 rounded-xl text-base sm:text-lg font-bold border-2 border-white/20 text-white hover:bg-white hover:text-[#2C3E50] transition-all hover:scale-105 shadow-lg backdrop-blur-sm">
              Ver Propiedades (0€)
            </Link>
          </div>
        </div>
      </section>

      {/* About the Model */}
      <section className="py-16 sm:py-24">
        <div className="container mx-auto px-4">
          <div className="glass-effect p-8 md:p-12 max-w-5xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
              <div className="flex justify-center">
                <div className="relative w-64 h-64 sm:w-80 sm:h-80">
                  <Image
                    src="/assets/images/foto-Alvaro-Asesor-Inmobiliario-Sevilla.webp"
                    alt="Álvaro, tu asesor inmobiliario"
                    fill
                    className="rounded-full object-cover border-4 border-[#FBBF24] shadow-[0_0_30px_rgba(251,191,36,0.3)]"
                  />
                </div>
              </div>
              <div className="text-white">
                <h2 className="text-3xl sm:text-4xl font-bold mb-6 font-heading">
                  ¿Por qué pagar más por lo mismo?
                </h2>
                <p className="text-lg mb-6 leading-relaxed opacity-90">
                  Mi nombre es Álvaro, asesor independiente en Sevilla. He diseñado un modelo inmobiliario de vanguardia donde <strong>eliminamos todos los costes innecesarios de las agencias tradicionales</strong> para darte el mayor beneficio como cliente, logrando las mejores tarifas y sin perder calidad en los servicios.
                </p>
                <ul className="space-y-4 text-lg mb-8">
                  <li className="flex items-start">
                    <CheckCircle2 className="text-[#FBBF24] mr-3 mt-1 flex-shrink-0" />
                    <span><strong>Vendedor:</strong> Solo pagas un 2% de honorarios al vender tu casa.</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle2 className="text-[#FBBF24] mr-3 mt-1 flex-shrink-0" />
                    <span><strong>Comprador:</strong> 0€ de honorarios. Sin letra pequeña.</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle2 className="text-[#FBBF24] mr-3 mt-1 flex-shrink-0" />
                    <span><strong>Automatizado:</strong> Respuestas 24/7 y agendamiento de visitas sin fricciones.</span>
                  </li>
                </ul>
                <a href="#servicios" className="btn btn-outline border-[#FBBF24] text-[#FBBF24] hover:bg-[#FBBF24] hover:text-[#2C3E50] px-8 py-3 rounded-full font-bold transition-all inline-block">
                  Saber más
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section id="servicios" className="py-16 sm:py-24 bg-white/50">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-[#2C3E50] font-heading">
            Un Servicio Integral, Optimizado
          </h2>
          <p className="max-w-2xl mx-auto text-lg mb-12 text-gray-700">
            A pesar de cobrar menos, el servicio es Premium. Uso tecnología para hacer lo que otros hacen lento y caro.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {[
              { icon: TrendingUp, title: "Valoración Data-Driven", desc: "Análisis de mercado con datos reales para salir al precio óptimo de venta." },
              { icon: Search, title: "Marketing de Alto Impacto", desc: "Fotografía profesional y posicionamiento destacado en todos los portales." },
              { icon: BadgeEuro, title: "Financiación Rápida", desc: "Ayudamos al comprador a encontrar la mejor hipoteca, agilizando tu venta." },
              { icon: Handshake, title: "Asesoramiento Legal", desc: "Gestión de contratos, herencias y firmas con total transparencia y seguridad." },
              { icon: Calculator, title: "Estudios de Rentabilidad", desc: "Para inversores: te entregamos números claros antes de que tomes decisiones." },
              { icon: Smartphone, title: "Base de Datos Automática", desc: "Más de 3000 compradores cualificados recibirán un aviso por WhatsApp de tu piso." },
            ].map((service, idx) => (
              <div key={idx} className="glass-effect p-8 service-card bg-[#2C3E50] text-white text-left">
                <div className="bg-white/10 w-16 h-16 rounded-lg flex items-center justify-center mb-6">
                  <service.icon size={32} className="text-[#FBBF24]" />
                </div>
                <h3 className="text-xl font-bold mb-3 font-heading">{service.title}</h3>
                <p className="opacity-90">{service.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Propiedades Vendidas (Casos de Éxito) */}
      <section className="py-16 sm:py-24 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-[#2C3E50] font-heading">
              Casos de Éxito: Propiedades Vendidas
            </h2>
            <p className="max-w-2xl mx-auto text-lg text-slate-600">
              Estos son algunos de los hogares que he tenido el placer de vender en una media menor a 30 días. Cada uno, una historia de éxito y satisfacción.
            </p>
          </div>
          
          <SuccessStoriesCarousel />
        </div>
      </section>

      {/* Subscribe Section for Buyers */}
      <SubscribeSection />

      {/* Valoraciones (Reviews) */}
      <section className="py-16 sm:py-24 bg-white border-t border-slate-100">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-[#2C3E50] font-heading">
            Lo que dicen nuestros clientes
          </h2>
          <p className="max-w-2xl mx-auto text-lg mb-12 text-slate-600">
            La confianza y la satisfacción de nuestros clientes es nuestra mayor recompensa.
          </p>
          
          <ReviewsGrid />
          
          <Link href="/dejar-resena" className="btn btn-outline border-[#2C3E50] text-[#2C3E50] hover:bg-[#2C3E50] hover:text-white px-8 py-3 rounded-full font-bold transition-all inline-block mt-8">
            Escribe tu propia reseña
          </Link>
        </div>
      </section>

      {/* Valuation / Lead Capture Section */}
      <section id="vender" className="py-24 sm:py-32 relative overflow-hidden bg-[#1a252f]">
        <div className="absolute top-0 left-0 w-full h-full bg-[url('/assets/images/pattern.svg')] opacity-5"></div>
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-4xl sm:text-5xl font-bold text-white font-heading mb-6">
              ¿Listo para vender con un <span className="text-[#FBBF24]">2% de comisión?</span>
            </h2>
            <p className="mt-4 text-xl max-w-3xl mx-auto text-slate-300 mb-12">
              Descubre cuánto vale tu casa en el mercado actual. Solicita una valoración <strong>100% GRATUITA</strong> y sin compromiso.
            </p>
            
            <div className="glass-effect bg-white/5 border border-white/10 p-10 rounded-3xl shadow-2xl backdrop-blur-xl">
              <div className="flex flex-col items-center">
                <div className="w-24 h-24 bg-[#FBBF24]/20 rounded-full flex items-center justify-center mb-8">
                  <Calculator size={48} className="text-[#FBBF24]" />
                </div>
                <h3 className="text-2xl text-white font-bold mb-4">Análisis exhaustivo de mercado</h3>
                <p className="text-slate-300 mb-10 max-w-lg">
                  Cruzamos los datos de tu inmueble con las últimas ventas de la zona para darte un precio real con el que venderás rápido y ganando más.
                </p>
                <Link href="/valoracion" className="group relative overflow-hidden rounded-xl bg-[#FBBF24] px-10 py-5 font-bold text-[#2C3E50] transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(251,191,36,0.4)] text-xl w-full sm:w-auto text-center">
                  <span className="relative z-10">Empezar Valoración Gratuita</span>
                  <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-in-out"></div>
                </Link>
                <p className="text-sm text-slate-400 mt-6">
                  Tus datos están seguros. Respuesta en menos de 24h.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
