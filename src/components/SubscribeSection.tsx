"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import BuyerRegistrationModal from "@/components/BuyerRegistrationModal";

export default function SubscribeSection() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <section className="py-20 sm:py-28 bg-[#FBBF24] relative overflow-hidden">
      {/* Decorative patterns */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-white/20 rounded-full mix-blend-overlay filter blur-3xl opacity-60 translate-x-1/2 -translate-y-1/2"></div>
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/20 rounded-full mix-blend-overlay filter blur-3xl opacity-60 -translate-x-1/2 translate-y-1/2"></div>
      
      <div className="container mx-auto px-4 relative z-10 text-center">
        <div className="max-w-3xl mx-auto">
          <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner backdrop-blur-sm">
            <Bell size={40} className="text-[#2C3E50] animate-bounce" />
          </div>
          
          <h2 className="text-3xl sm:text-5xl font-bold text-[#2C3E50] font-heading mb-6 leading-tight">
            ¿Buscas comprar y no encuentras nada que te guste?
          </h2>
          
          <p className="text-lg sm:text-xl text-[#2C3E50]/80 mb-10 max-w-2xl mx-auto font-medium">
            Suscríbete a nuestra lista de compradores premium. Te avisaremos de las propiedades que encajen con lo que buscas <strong>antes de que se publiquen</strong> en los portales inmobiliarios.
          </p>
          
          <button 
            onClick={() => setIsModalOpen(true)}
            className="group relative overflow-hidden rounded-xl bg-[#2C3E50] px-10 py-5 font-bold text-white transition-all hover:scale-105 shadow-[0_0_20px_rgba(44,62,80,0.2)] hover:shadow-[0_0_30px_rgba(44,62,80,0.4)] text-xl w-full sm:w-auto"
          >
            <span className="relative z-10 flex items-center justify-center">
              Registrarme como Comprador
            </span>
            <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-in-out"></div>
          </button>
          
          <p className="text-sm text-[#2C3E50]/70 mt-6 font-medium">
            Sin spam. Solo te enviaremos propiedades que coincidan exactamente con tus criterios.
          </p>
        </div>
      </div>

      <BuyerRegistrationModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
      />
    </section>
  );
}
