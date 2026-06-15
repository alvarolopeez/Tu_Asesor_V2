"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X, ChevronDown } from "lucide-react";

/**
 * Header "Sevilla Luz" (Brief #020 T2).
 *
 * Estilo del mockup v4 (claro, warm-white translúcido) PERO conservando la
 * funcionalidad real: rutas existentes, dropdown de Servicios (plusvalía +
 * rentabilidad) y menú móvil.
 *
 * Se mantiene `fixed` (overlay) — y NO sticky — para no romper las páginas
 * legacy aún oscuras, que ya añaden su propio padding superior (pt-24/pt-32)
 * para compensar el header fijo. Header claro sobre páginas oscuras durante la
 * migración: aceptable y temporal (ver brief).
 */
export default function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const closeMenu = () => setIsMobileMenuOpen(false);

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-warm-white/90 backdrop-blur-md border-b border-line">
        <div className="max-w-[1160px] mx-auto px-5 sm:px-10 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-baseline gap-[5px] font-display text-xl font-bold text-navy"
          >
            Tu Asesor
            <span className="text-gold text-2xl leading-none">·</span>
            Álvaro
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8">
            <Link href="/comprar" className="text-sm text-muted hover:text-navy transition-colors">
              Comprar
            </Link>
            <Link href="/valoracion" className="text-sm text-muted hover:text-navy transition-colors">
              Vender
            </Link>

            {/* Dropdown Servicios */}
            <div className="relative group">
              <button className="flex items-center gap-1 text-sm text-muted group-hover:text-navy transition-colors">
                Servicios
                <ChevronDown size={15} className="transition-transform group-hover:rotate-180" />
              </button>
              <div className="absolute top-full left-1/2 -translate-x-1/2 pt-3 w-60 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                <div className="bg-warm-white border border-line rounded-xl shadow-[0_12px_32px_rgba(44,32,21,0.1)] overflow-hidden">
                  <Link
                    href="/plusvalia"
                    className="block px-5 py-3.5 text-sm text-muted hover:text-navy hover:bg-sand transition-colors border-b border-line"
                  >
                    Calculadora de Plusvalía
                  </Link>
                  <Link
                    href="/rentabilidad"
                    className="block px-5 py-3.5 text-sm text-muted hover:text-navy hover:bg-sand transition-colors"
                  >
                    Calculadora de Rentabilidad
                  </Link>
                </div>
              </div>
            </div>

            <Link href="/blog" className="text-sm text-muted hover:text-navy transition-colors">
              Blog
            </Link>
            <Link href="/contacto" className="text-sm text-muted hover:text-navy transition-colors">
              Contacto
            </Link>
          </nav>

          {/* CTA desktop */}
          <Link
            href="/valoracion"
            className="hidden md:inline-flex items-center text-[13px] font-semibold bg-navy text-white px-[22px] py-2.5 rounded-full hover:bg-navy-soft hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(15,23,42,0.2)] transition-all"
          >
            Valora tu casa gratis
          </Link>

          {/* Botón móvil */}
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="md:hidden text-navy hover:text-gold transition-colors"
            aria-label="Abrir menú"
          >
            <Menu size={28} />
          </button>
        </div>
      </header>

      {/* Overlay menú móvil */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[60] bg-warm-white flex flex-col pt-24 px-8 overflow-y-auto pb-10 md:hidden">
          <button
            onClick={closeMenu}
            className="absolute top-6 right-6 text-navy hover:text-gold transition-colors"
            aria-label="Cerrar menú"
          >
            <X size={32} />
          </button>

          <div className="flex flex-col gap-6 w-full max-w-sm mx-auto font-body">
            <Link href="/comprar" onClick={closeMenu} className="text-2xl font-medium text-navy hover:text-gold transition-colors border-b border-line pb-4">
              Comprar
            </Link>
            <Link href="/valoracion" onClick={closeMenu} className="text-2xl font-medium text-navy hover:text-gold transition-colors border-b border-line pb-4">
              Vender
            </Link>
            <div className="border-b border-line pb-4">
              <span className="block text-xs font-semibold uppercase tracking-[0.1em] text-muted mb-3">Servicios</span>
              <div className="flex flex-col gap-3 pl-4 border-l-2 border-gold/50">
                <Link href="/plusvalia" onClick={closeMenu} className="text-lg text-ink hover:text-gold transition-colors">
                  Calculadora de Plusvalía
                </Link>
                <Link href="/rentabilidad" onClick={closeMenu} className="text-lg text-ink hover:text-gold transition-colors">
                  Calculadora de Rentabilidad
                </Link>
              </div>
            </div>
            <Link href="/blog" onClick={closeMenu} className="text-2xl font-medium text-navy hover:text-gold transition-colors border-b border-line pb-4">
              Blog
            </Link>
            <Link href="/contacto" onClick={closeMenu} className="text-2xl font-medium text-navy hover:text-gold transition-colors border-b border-line pb-4">
              Contacto
            </Link>
            <Link
              href="/valoracion"
              onClick={closeMenu}
              className="mt-4 bg-navy text-white text-center text-lg font-semibold px-8 py-4 rounded-full hover:bg-navy-soft transition-colors shadow-lg"
            >
              Valora tu casa gratis
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
