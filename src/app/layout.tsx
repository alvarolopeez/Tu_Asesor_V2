import type { Metadata } from "next";
import { Lato, Montserrat } from "next/font/google";
import Header from "@/components/Header";
import FloatingWhatsApp from "@/components/FloatingWhatsApp";
import LayoutWrapper from "@/components/LayoutWrapper";
import ToastProvider from "@/components/ToastProvider";
import "./globals.css";

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
        <LayoutWrapper
          footer={
            <footer className="bg-[#2C3E50] text-white">
              <div className="container mx-auto px-4 py-16">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center md:text-left">
                  <div>
                    <h3 className="font-bold text-2xl font-heading">Tu asesor | Álvaro</h3>
                    <p className="mt-4 text-gray-400">
                      La forma más inteligente de vender o comprar tu hogar en Sevilla. 
                      Pagando lo justo: 2% vendedor, 0€ comprador.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-bold text-lg mb-4 font-heading">Navegación</h4>
                    <ul className="space-y-2 text-gray-400">
                      <li>
                        <a href="/comprar" className="hover:text-white">
                          Comprar Propiedades
                        </a>
                      </li>
                      <li>
                        <a href="/#vender" className="hover:text-white">
                          Vender Propiedad
                        </a>
                      </li>
                      <li>
                        <a href="/plusvalia" className="hover:text-white">
                          Calculadora Plusvalía
                        </a>
                      </li>
                      <li>
                        <a href="/#servicios" className="hover:text-white">
                          Nuestros Servicios
                        </a>
                      </li>
                      <li>
                        <a href="/blog" className="hover:text-[#FBBF24] transition-colors font-semibold">
                          Blog
                        </a>
                      </li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-bold text-lg mb-4 font-heading">Contacto</h4>
                    <ul className="space-y-2 text-gray-400">
                      <li>
                        <a href="tel:+34697223944" className="hover:text-white">
                          +34 697 223 944
                        </a>
                      </li>
                      <li>
                        <a href="mailto:tuasesoralvaro@gmail.com" className="hover:text-white">
                          tuasesoralvaro@gmail.com
                        </a>
                      </li>
                    </ul>
                  </div>
                </div>
                <div className="mt-12 pt-8 border-t border-gray-700 text-center text-gray-500 text-sm">
                  <p>© 2026 Tu Asesor | Álvaro. Todos los derechos reservados.</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-4">
                    <a href="/politica-privacidad" className="hover:text-white transition-colors">Política de Privacidad</a>
                    <span>|</span>
                    <a href="/aviso-legal" className="hover:text-white transition-colors">Aviso Legal</a>
                    <span>|</span>
                    <a href="/politica-cookies" className="hover:text-white transition-colors">Política de Cookies</a>
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
