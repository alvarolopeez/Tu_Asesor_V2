"use client";

import { useState, useEffect } from "react";
import { X, ShieldAlert, Check } from "lucide-react";

export default function CookieConsent() {
  const [isRendered, setIsRendered] = useState(false);
  const [transitionClass, setTransitionClass] = useState("opacity-0 translate-y-4 pointer-events-none");

  useEffect(() => {
    const accepted = localStorage.getItem("cookie-consent-accepted");
    if (!accepted) {
      setIsRendered(true);
      const timer = setTimeout(() => {
        setTransitionClass("opacity-100 translate-y-0");
      }, 500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem("cookie-consent-accepted", "true");
    setTransitionClass("opacity-0 translate-y-4 pointer-events-none");
    setTimeout(() => {
      setIsRendered(false);
    }, 300);
  };

  const handleDecline = () => {
    localStorage.setItem("cookie-consent-accepted", "false");
    setTransitionClass("opacity-0 translate-y-4 pointer-events-none");
    setTimeout(() => {
      setIsRendered(false);
    }, 300);
  };

  if (!isRendered) return null;

  return (
    <div className={`fixed bottom-6 left-6 z-[9999] max-w-sm w-[calc(100%-3rem)] transition-all duration-500 ease-out transform ${transitionClass}`}>
      <div className="bg-[#0f172a]/95 backdrop-blur-md border border-white/10 p-5 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] flex flex-col gap-4 text-white">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="bg-[#FBBF24]/20 p-2 rounded-lg text-[#FBBF24]">
              <ShieldAlert size={18} className="animate-pulse" />
            </div>
            <h4 className="font-bold text-sm font-heading tracking-wide">Control de Cookies</h4>
          </div>
          <button 
            onClick={() => {
              setTransitionClass("opacity-0 translate-y-4 pointer-events-none");
              setTimeout(() => setIsRendered(false), 300);
            }}
            className="text-slate-400 hover:text-white transition-colors"
            title="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <p className="text-xs text-slate-300 leading-relaxed">
          Utilizamos cookies propias y de terceros para optimizar tu experiencia y analizar el tráfico de navegación. Al aceptar, consientes su uso. Consulta nuestra <a href="/politica-cookies" className="text-[#FBBF24] hover:underline font-semibold">Política de Cookies</a>.
        </p>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5">
          <button
            onClick={handleDecline}
            className="px-3.5 py-1.5 bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300 rounded-lg text-xs font-semibold transition-all active:scale-95"
          >
            Rechazar
          </button>
          <button
            onClick={handleAccept}
            className="px-4 py-1.5 bg-[#FBBF24] hover:bg-[#e5a917] text-[#0f172a] rounded-lg text-xs font-bold transition-all active:scale-95 flex items-center gap-1 shadow-md shadow-yellow-500/10"
          >
            <Check size={12} className="stroke-[3]" /> Aceptar
          </button>
        </div>
      </div>
    </div>
  );
}
