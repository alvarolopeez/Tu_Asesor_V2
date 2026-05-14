"use client";

import { MessageCircle } from "lucide-react";
import { BUSINESS } from "@/lib/constants";

/**
 * FloatingWhatsApp — Botón flotante de contacto WhatsApp.
 *
 * FIX APLICADO (Code Review):
 * - Número de teléfono centralizado desde @/lib/constants
 *   (antes hardcodeado directamente en el componente).
 */
export default function FloatingWhatsApp() {
  const whatsappUrl = BUSINESS.whatsappUrl(BUSINESS.defaultWhatsappMessage);

  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-24 right-6 z-[90] bg-[#25D366] text-white p-4 rounded-full shadow-2xl hover:bg-[#20bd5a] hover:scale-110 transition-all duration-300 flex items-center justify-center animate-bounce"
      aria-label="Contactar por WhatsApp"
    >
      <MessageCircle size={32} />
    </a>
  );
}
