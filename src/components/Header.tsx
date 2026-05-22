"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

export default function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50">
        <div className="m-4 md:m-6">
          <nav className="glass-effect px-4 sm:px-6 py-4 flex justify-between items-center">
            <div className="font-bold text-xl sm:text-2xl text-white flex items-center gap-3">
              <Link href="/" className="flex items-center gap-2">
                <img src="/logo.png" alt="Logo Tu Asesor Álvaro" className="h-12 w-auto object-contain" />
                <span className="hidden">Tu asesor | Álvaro</span>
              </Link>
            </div>
            
            {/* Desktop Menu */}
            <div className="hidden md:flex items-center space-x-6 text-white font-semibold text-lg">
              <Link href="/comprar" className="nav-link">
                Comprar (0€)
              </Link>
              <Link href="/#vender" className="nav-link">
                Vender (2%)
              </Link>
              
              {/* Dropdown de Servicios */}
              <div className="relative group">
                <button className="flex items-center gap-1 px-4 py-2 border border-white/30 rounded-lg hover:bg-white/10 transition-all">
                  Servicios
                  <svg className="w-4 h-4 transition-transform group-hover:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                <div className="absolute top-full left-0 mt-2 w-64 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 transform translate-y-2 group-hover:translate-y-0 z-50">
                  <div className="bg-[#0f172a]/95 backdrop-blur-md border border-white/5 rounded-xl shadow-2xl overflow-hidden">
                    <Link href="/#servicios" className="block px-6 py-4 hover:bg-white/5 hover:text-[#FBBF24] transition-colors border-b border-white/5">
                      Nuestros Servicios
                    </Link>
                    <Link href="/plusvalia" className="block px-6 py-4 hover:bg-white/5 hover:text-[#FBBF24] transition-colors border-b border-white/5">
                      Calculadora de Plusvalía
                    </Link>
                    <Link href="/rentabilidad" className="block px-6 py-4 hover:bg-white/5 hover:text-[#FBBF24] transition-colors">
                      Calculadora de Rentabilidad
                    </Link>
                  </div>
                </div>
              </div>

              <Link href="/contacto" className="nav-link">
                Contacto
              </Link>
            </div>
            
            <div className="hidden md:block">
              <Link href="/valoracion" className="btn btn-primary">
                Valora tu piso GRATIS
              </Link>
            </div>

            {/* Mobile Menu Button */}
            <div className="md:hidden">
              <button 
                onClick={() => setIsMobileMenuOpen(true)}
                className="text-white hover:text-[#FBBF24] transition-colors"
              >
                <Menu size={32} />
              </button>
            </div>
          </nav>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[60] bg-[#0f172a]/95 backdrop-blur-md flex flex-col pt-24 px-6 overflow-y-auto pb-10">
          <button 
            onClick={() => setIsMobileMenuOpen(false)}
            className="absolute top-6 right-6 text-white hover:text-[#FBBF24] transition-colors"
          >
            <X size={40} />
          </button>
          
          <div className="flex flex-col space-y-6 text-white font-semibold text-2xl w-full max-w-sm mx-auto">
            <Link href="/comprar" onClick={() => setIsMobileMenuOpen(false)} className="hover:text-[#FBBF24] transition-colors border-b border-white/10 pb-4">
              Comprar (0€)
            </Link>
            <Link href="/#vender" onClick={() => setIsMobileMenuOpen(false)} className="hover:text-[#FBBF24] transition-colors border-b border-white/10 pb-4">
              Vender (2%)
            </Link>
            <div className="flex flex-col space-y-3 border-b border-white/10 pb-4">
              <Link href="/#servicios" onClick={() => setIsMobileMenuOpen(false)} className="hover:text-[#FBBF24] transition-colors">
                Nuestros Servicios
              </Link>
              <div className="flex flex-col space-y-3 pl-4 border-l-2 border-[#FBBF24]/50 mt-2">
                <Link href="/plusvalia" onClick={() => setIsMobileMenuOpen(false)} className="text-lg text-slate-300 hover:text-[#FBBF24] transition-colors">
                  ↳ Calculadora de Impuestos
                </Link>
                <Link href="/rentabilidad" onClick={() => setIsMobileMenuOpen(false)} className="text-lg text-slate-300 hover:text-[#FBBF24] transition-colors">
                  ↳ Calculadora de Rentabilidad
                </Link>
              </div>
            </div>
            <Link href="/contacto" onClick={() => setIsMobileMenuOpen(false)} className="hover:text-[#FBBF24] transition-colors border-b border-white/10 pb-4">
              Contacto
            </Link>
            <Link href="/valoracion" onClick={() => setIsMobileMenuOpen(false)} className="btn bg-[#FBBF24] hover:bg-yellow-500 text-[#0f172a] mt-4 text-xl px-8 py-4 rounded-xl text-center w-full shadow-lg">
              Valora tu piso GRATIS
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
