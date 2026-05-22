"use client";

import Image from "next/image";
import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const properties = [
  { img: "https://i.ibb.co/Fb4S5gzd/b0a6beac-6477-4376-b7d4-f2952ce9f2e3.jpg", title: "Estudio en Granate", desc: "1 hab | 1 baño | 50m2", badge: "ALQUILADO (600€)" },
  { img: "https://i.ibb.co/hxgDqxCb/7b2f9997-181f-4b40-9d8b-92cedcdacc02.jpg", title: "Piso en la Palmilla", desc: "2 hab | 1 baño | 60m2", badge: "VENDIDO (120.000€)" },
  { img: "https://i.ibb.co/fY3Dvjz6/Captura-de-pantalla-2025-09-15-234243.png", title: "Piso en calle Aguamarina", desc: "2 hab | 1 baño | 69m2", badge: "VENDIDO (140.000€)" },
  { img: "https://i.ibb.co/2Y86bGb3/IMG-1110.jpg", title: "Piso en calle Coral", desc: "4 hab | 1 baño | 90m2", badge: "VENDIDO (185.000€)" },
  { img: "https://i.ibb.co/4kL7XGq/IMG-0865.jpg", title: "Piso en la Macarena", desc: "3 hab | 1 baño | 96m2", badge: "VENDIDO (190.000€)" },
  { img: "https://i.ibb.co/4wCKmWK3/IMG-0869.jpg", title: "3º Planta en Cuarzo", desc: "3 hab | 1 baño | 69m2", badge: "VENDIDO (115.000€)" }
];

export default function SuccessStoriesCarousel() {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (scrollContainerRef.current) {
      // Calculamos cuánto scrollear (aprox el ancho visible del contenedor)
      const scrollAmount = scrollContainerRef.current.clientWidth;
      scrollContainerRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth"
      });
    }
  };

  return (
    <div className="relative max-w-[1200px] mx-auto">
      {/* Botón Izquierda (solo visible en pantallas md en adelante) */}
      <button 
        onClick={() => scroll("left")}
        className="hidden md:flex absolute -left-4 top-1/2 -translate-y-1/2 z-10 bg-[#0f172a]/80 text-[#FBBF24] border border-white/10 p-3 rounded-full shadow-lg hover:bg-[#FBBF24] hover:text-[#0f172a] transition-all duration-300 backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FBBF24] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f172a]"
        aria-label="Ver testimonios anteriores"
      >
        <ChevronLeft size={24} />
      </button>

      {/* Contenedor de Scroll Horizontal */}
      <div 
        ref={scrollContainerRef}
        className="flex overflow-x-auto snap-x snap-mandatory gap-6 pb-8 hide-scrollbar px-4 md:px-8" 
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {properties.map((prop, idx) => (
          <div 
            key={idx} 
            className="snap-center shrink-0 w-80 sm:w-96 glass-effect bg-[#1E293B]/70 backdrop-blur-md p-4 rounded-2xl shadow-lg border border-white/5 hover:border-[#FBBF24]/30 hover:scale-[1.02] transition-all duration-300"
          >
            <div className="relative h-56 w-full rounded-xl overflow-hidden mb-4">
              <Image src={prop.img} alt={prop.title} fill className="object-cover" unoptimized />
              <div className="absolute top-4 left-4 bg-[#FBBF24] text-[#0f172a] text-xs font-extrabold px-3 py-1 rounded shadow-md shadow-black/30">
                {prop.badge}
              </div>
            </div>
            <h3 className="text-xl font-bold text-white">{prop.title}</h3>
            <p className="text-slate-300 mt-1 font-semibold">{prop.desc}</p>
          </div>
        ))}
      </div>

      {/* Botón Derecha (solo visible en pantallas md en adelante) */}
      <button 
        onClick={() => scroll("right")}
        className="hidden md:flex absolute -right-4 top-1/2 -translate-y-1/2 z-10 bg-[#0f172a]/80 text-[#FBBF24] border border-white/10 p-3 rounded-full shadow-lg hover:bg-[#FBBF24] hover:text-[#0f172a] transition-all duration-300 backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FBBF24] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f172a]"
        aria-label="Ver siguientes testimonios"
      >
        <ChevronRight size={24} />
      </button>
    </div>
  );
}
