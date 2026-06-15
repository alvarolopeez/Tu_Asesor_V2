import Link from "next/link";

/**
 * Footer "Sevilla Luz" (Brief #020 T3).
 *
 * Extraído del footer inline que vivía en layout.tsx. Diseño = mockup v4
 * (navy, 3 columnas + barra inferior legal). Datos REALES de contacto y rutas.
 */

function WhatsAppGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

export default function Footer() {
  return (
    <footer className="bg-navy pt-[68px] pb-9">
      <div className="max-w-[1160px] mx-auto px-5 sm:px-10">
        <div className="grid grid-cols-1 md:grid-cols-[1.6fr_1fr_1fr] gap-12 mb-12 pb-10 border-b border-white/[0.07]">
          {/* Marca */}
          <div>
            <Link href="/" className="inline-flex items-baseline gap-[5px] font-display text-xl font-bold text-white mb-4">
              Tu Asesor
              <span className="text-gold text-2xl leading-none">·</span>
              Álvaro
            </Link>
            <p className="text-sm text-white/35 leading-relaxed max-w-[280px] mb-6">
              Asesor inmobiliario independiente en Sevilla. Vende por solo un 2%.
              Sin agencias, sin intermediarios, con el mismo nivel de servicio y
              más honestidad.
            </p>
            <a
              href="https://wa.me/34697223944"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-xs font-semibold bg-[rgba(37,211,102,0.12)] border border-[rgba(37,211,102,0.22)] text-[#4ADE80] px-4 py-2.5 rounded-full hover:bg-[rgba(37,211,102,0.2)] transition-colors"
            >
              <WhatsAppGlyph size={14} />
              +34 697 223 944
            </a>
          </div>

          {/* Navega */}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/25 mb-[18px]">
              Navega
            </div>
            <div className="flex flex-col gap-2.5">
              <Link href="/comprar" className="text-sm text-white/40 hover:text-white transition-colors">Comprar</Link>
              <Link href="/valoracion" className="text-sm text-white/40 hover:text-white transition-colors">Vender</Link>
              <Link href="/valoracion" className="text-sm text-white/40 hover:text-white transition-colors">Valoración gratuita</Link>
              <Link href="/blog" className="text-sm text-white/40 hover:text-white transition-colors">Blog</Link>
              <Link href="/contacto" className="text-sm text-white/40 hover:text-white transition-colors">Contacto</Link>
            </div>
          </div>

          {/* Contacto */}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/25 mb-[18px]">
              Contacto
            </div>
            <div className="flex flex-col gap-2.5">
              <span className="text-sm text-white/40">📍 Sevilla, España</span>
              <a href="tel:+34697223944" className="text-sm text-white/40 hover:text-white transition-colors">📞 +34 697 223 944</a>
              <a href="mailto:tuasesoralvaro@gmail.com" className="text-sm text-white/40 hover:text-white transition-colors">✉️ tuasesoralvaro@gmail.com</a>
              <a href="https://tuasesoralvaro.com" target="_blank" rel="noopener noreferrer" className="text-sm text-white/40 hover:text-white transition-colors">🌐 tuasesoralvaro.com</a>
            </div>
          </div>
        </div>

        {/* Barra inferior */}
        <div className="flex flex-wrap justify-between items-center gap-3">
          <p className="text-xs text-white/20">© 2026 Tu Asesor Álvaro · Todos los derechos reservados</p>
          <div className="flex gap-5">
            <Link href="/aviso-legal" className="text-xs text-white/20 hover:text-white/40 transition-colors">Aviso legal</Link>
            <Link href="/politica-privacidad" className="text-xs text-white/20 hover:text-white/40 transition-colors">Privacidad</Link>
            <Link href="/politica-cookies" className="text-xs text-white/20 hover:text-white/40 transition-colors">Cookies</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
