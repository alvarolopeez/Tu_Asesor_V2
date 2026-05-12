"use client";

import { useState } from "react";
import { Search, Home, MapPin } from "lucide-react";
import BuyerRegistrationModal from "@/components/BuyerRegistrationModal";

export default function ComprarPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className="pt-48 pb-16 min-h-screen">
      <div className="container mx-auto px-4">
        {/* Header Section */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-[#2C3E50] font-heading mb-4">
            Propiedades Sin Comisiones para ti
          </h1>
          <p className="text-lg md:text-xl text-gray-700">
            Encuentra tu nuevo hogar pagando <strong className="text-[#FBBF24] text-2xl">0€</strong> de honorarios. 
            Lo que ves es lo que hay, sin sorpresas.
          </p>
        </div>

        {/* Search & Filter Bar */}
        <div className="glass-effect bg-[#2C3E50] p-4 rounded-xl mb-12 max-w-4xl mx-auto shadow-xl">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <MapPin className="absolute left-3 top-3 text-gray-400" size={20} />
              <input 
                type="text" 
                placeholder="¿En qué zona de Sevilla buscas?" 
                className="w-full pl-10 pr-4 py-3 rounded-lg border-none focus:ring-2 focus:ring-[#FBBF24] text-gray-900"
              />
            </div>
            <div className="w-full md:w-48">
              <select className="w-full px-4 py-3 rounded-lg border-none focus:ring-2 focus:ring-[#FBBF24] text-gray-900 bg-white">
                <option value="">Tipo de inmueble</option>
                <option value="piso">Piso</option>
                <option value="casa">Casa / Chalet</option>
                <option value="estudio">Estudio</option>
              </select>
            </div>
            <button className="bg-[#FBBF24] text-[#2C3E50] font-bold px-8 py-3 rounded-lg hover:bg-[#e5a917] transition-colors flex items-center justify-center">
              <Search className="mr-2" size={20} />
              Buscar
            </button>
          </div>
        </div>

        {/* Empty State / Coming Soon */}
        <div className="text-center py-20 bg-white/50 rounded-2xl border border-gray-200 shadow-sm max-w-4xl mx-auto">
          <div className="bg-[#2C3E50]/10 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
            <Home className="text-[#2C3E50]" size={40} />
          </div>
          <h2 className="text-2xl font-bold text-[#2C3E50] font-heading mb-2">
            Estamos conectando la base de datos...
          </h2>
          <p className="text-gray-600 max-w-md mx-auto mb-8">
            En breve, aquí aparecerán todas las propiedades disponibles sincronizadas directamente desde nuestro CRM, con fotos HD y todos los detalles.
          </p>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-[#2C3E50] text-white px-8 py-3 rounded-full font-bold transition-all inline-block hover:bg-[#1a252f] hover:scale-105 shadow-lg"
          >
            Notificarme cuando haya novedades
          </button>
        </div>
      </div>

      <BuyerRegistrationModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
      />
    </div>
  );
}
