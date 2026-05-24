"use client";

import { useState, useEffect } from "react";
import { MessageCircle, X, Send } from "lucide-react";
import { BUSINESS } from "@/lib/constants";

/**
 * FloatingWhatsApp — Botón flotante de contacto WhatsApp + Asistente Virtual Paula.
 */
export default function FloatingWhatsApp() {
  const [showBubble, setShowBubble] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [userText, setUserText] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      // Solo mostramos el bocadillo si el usuario no lo ha cerrado activamente antes
      setShowBubble(true);
    }, 10000); // 10 segundos

    return () => clearTimeout(timer);
  }, []);

  const whatsappUrl = BUSINESS.whatsappUrl(BUSINESS.defaultWhatsappMessage);

  const handleSend = () => {
    const messageToSend = userText.trim()
      ? userText.trim()
      : "¡Hola Paula! Estoy interesado en comprar o vender una vivienda en Sevilla.";
    window.open(BUSINESS.whatsappUrl(messageToSend), "_blank", "noopener,noreferrer");
  };

  return (
    <>
      {/* Menú Flotante de Paula (Asistente Virtual) */}
      <div
        className={`fixed bottom-6 right-[88px] w-[300px] sm:w-[350px] bg-[#1E293B]/95 text-white border border-white/10 rounded-2xl shadow-2xl p-4 backdrop-blur-xl z-[95] flex flex-col gap-3 transition-all duration-500 ease-out transform ${
          showBubble && !isDismissed
            ? "opacity-100 translate-x-0 scale-100 pointer-events-auto"
            : "opacity-0 translate-x-4 scale-95 pointer-events-none"
        }`}
      >
        {/* Cabecera del chat */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#FBBF24] to-yellow-300 border border-white/15 flex items-center justify-center text-sm font-black text-[#0f172a] shadow-inner relative overflow-hidden animate-pulse">
              P
            </div>
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[#25D366] border-2 border-[#1E293B] animate-ping" />
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[#25D366] border-2 border-[#1E293B]" />
          </div>
          <div>
            <h4 className="font-bold text-sm text-white flex items-center gap-1.5">
              Paula <span className="text-[10px] bg-[#25D366]/20 text-[#25D366] px-2 py-0.5 rounded-full font-medium">En línea</span>
            </h4>
            <p className="text-[10px] text-slate-400 font-medium">Asistente Virtual</p>
          </div>
          <button
            onClick={() => {
              setIsDismissed(true);
              setShowBubble(false);
            }}
            className="ml-auto p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
            aria-label="Cerrar asistente"
          >
            <X size={16} />
          </button>
        </div>

        {/* Mensaje predefinido */}
        <div className="bg-white/5 border border-white/5 rounded-xl p-3 text-xs text-slate-200 leading-relaxed">
          ¡Hola! Soy Paula, asesora virtual de Álvaro. ¿Buscas comprar o vender una vivienda en Sevilla? Escríbeme y te ayudaré de inmediato.
        </div>

        {/* Input/Textarea de texto */}
        <div className="flex flex-col gap-2">
          <textarea
            value={userText}
            onChange={(e) => setUserText(e.target.value)}
            placeholder="Escribe tu mensaje aquí..."
            rows={2}
            className="w-full p-2.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#FBBF24] focus:border-[#FBBF24] resize-none transition-all"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <button
            onClick={handleSend}
            className="w-full bg-[#25D366] hover:bg-[#20bd5a] active:scale-95 text-white py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/10"
          >
            <Send size={12} className="text-white" />
            <span>Enviar por WhatsApp</span>
          </button>
        </div>
      </div>

      {/* Botón Verde Estático de WhatsApp */}
      <button
        onClick={() => {
          // Si el bocadillo de Paula está cerrado o descartado, el botón redirige directamente a WhatsApp
          // Si el bocadillo está oculto pero no descartado, lo mostramos como interacción rápida
          if (!showBubble && !isDismissed) {
            setShowBubble(true);
          } else {
            window.open(whatsappUrl, "_blank", "noopener,noreferrer");
          }
        }}
        className="fixed bottom-6 right-6 z-[90] bg-[#25D366] text-white p-4 rounded-full shadow-2xl hover:bg-[#20bd5a] hover:scale-110 active:scale-95 transition-all duration-300 flex items-center justify-center"
        aria-label="Contactar por WhatsApp"
      >
        <MessageCircle size={32} />
      </button>
    </>
  );
}
