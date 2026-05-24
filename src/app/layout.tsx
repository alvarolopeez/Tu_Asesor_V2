import type { Metadata } from "next";
import { Lato, Montserrat } from "next/font/google";
import Link from "next/link";
import Header from "@/components/Header";
import FloatingWhatsApp from "@/components/FloatingWhatsApp";
import LayoutWrapper from "@/components/LayoutWrapper";
import ToastProvider from "@/components/ToastProvider";
import AnalyticsTracker from "@/components/AnalyticsTracker";
import "./globals.css";
import "leaflet/dist/leaflet.css";


const lato = Lato({
  variable: "--font-lato",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: "Tu Asesor | Álvaro - Vende tu casa en Sevilla",
  description: "Vende tu inmueble con Tu Asesor Álvaro. 2% comisión para el vendedor, 0€ para el comprador. Gestión inmobiliaria rápida, transparente y eficiente en Sevilla.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="scroll-smooth">
      <body
        className={`${lato.variable} ${montserrat.variable} font-sans antialiased min-h-screen flex flex-col`}
      >
        <ToastProvider />
        <AnalyticsTracker />
        <LayoutWrapper
          footer={
            <footer className="bg-[#2C3E50] text-white">
              <div className="container mx-auto px-4 py-16">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center md:text-left">
                  <div>
                    <h3 className="font-bold text-2xl font-heading text-white">Tu asesor <span className="text-[#FBBF24]">|</span> Álvaro</h3>
                    <p className="mt-4 text-slate-400 leading-relaxed">
                      La forma más inteligente de vender o comprar tu hogar en Sevilla. 
                      Pagando lo justo: 2% vendedor, 0€ comprador.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-bold text-lg mb-4 font-heading text-white">Navegación</h4>
                    <ul className="space-y-2 text-slate-400">
                      <li>
                        <Link href="/comprar" className="hover:text-[#FBBF24] transition-colors duration-200">
                          Comprar Propiedades
                        </Link>
                      </li>
                      <li>
                        <Link href="/#vender" className="hover:text-[#FBBF24] transition-colors duration-200">
                          Vender Propiedad
                        </Link>
                      </li>
                      <li>
                        <Link href="/plusvalia" className="hover:text-[#FBBF24] transition-colors duration-200">
                          Calculadora Plusvalía
                        </Link>
                      </li>
                      <li>
                        <Link href="/#servicios" className="hover:text-[#FBBF24] transition-colors duration-200">
                          Nuestros Servicios
                        </Link>
                      </li>
                      <li>
                        <Link href="/blog" className="hover:text-[#FBBF24] transition-colors duration-200 font-semibold text-[#FBBF24]">
                          Blog
                        </Link>
                      </li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-bold text-lg mb-4 font-heading text-white">Contacto</h4>
                    <ul className="space-y-2 text-slate-400">
                      <li>
                        <Link href="tel:+34697223944" className="hover:text-[#FBBF24] transition-colors duration-200">
                          +34 697 223 944
                        </Link>
                      </li>
                      <li>
                        <Link href="mailto:tuasesoralvaro@gmail.com" className="hover:text-[#FBBF24] transition-colors duration-200">
                          tuasesoralvaro@gmail.com
                        </Link>
                      </li>
                    </ul>
                  </div>
                </div>
                <div className="mt-12 pt-8 border-t border-white/10 text-center text-slate-500 text-sm">
                  <p>© 2026 Tu Asesor | Álvaro. Todos los derechos reservados.</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-4 text-slate-400">
                    <Link href="/politica-privacidad" className="hover:text-[#FBBF24] transition-colors duration-200">Política de Privacidad</Link>
                    <span className="text-slate-600">|</span>
                    <Link href="/aviso-legal" className="hover:text-[#FBBF24] transition-colors duration-200">Aviso Legal</Link>
                    <span className="text-slate-600">|</span>
                    <Link href="/politica-cookies" className="hover:text-[#FBBF24] transition-colors duration-200">Política de Cookies</Link>
                  </div>
                </div>
              </div>
            </footer>
          }
        >
          {children}
        </LayoutWrapper>
      </body>
    </html>
  );
}
