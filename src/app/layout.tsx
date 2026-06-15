import type { Metadata } from "next";
import { Lato, Montserrat, Playfair_Display, Jost } from "next/font/google";
import Header from "@/components/Header";
import FloatingWhatsApp from "@/components/FloatingWhatsApp";
import Footer from "@/components/Footer";
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

// ── Rediseño "Sevilla Luz" (Brief #020) ──
// Playfair Display (titulares serif) + Jost (cuerpo sans). Conviven con
// Lato/Montserrat durante la migración por fases; se limpiarán en la fase final.
const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["700", "800"],
  display: "swap",
});

const jost = Jost({
  variable: "--font-jost",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
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
        className={`${lato.variable} ${montserrat.variable} ${playfair.variable} ${jost.variable} font-sans antialiased min-h-screen flex flex-col`}
      >
        <ToastProvider />
        <AnalyticsTracker />
        <LayoutWrapper footer={<Footer />}>
          {children}
        </LayoutWrapper>
      </body>
    </html>
  );
}
