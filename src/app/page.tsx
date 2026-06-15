import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getPublishedPostsPage } from "@/lib/blogService";
import type { Property, Review } from "@/types";
import HomeBuyerPopup from "@/components/HomeBuyerPopup";

/**
 * Home "Sevilla Luz" (Brief #020 T4).
 *
 * Server component con datos REALES de Supabase (propiedades activas, reseñas
 * publicadas, posts del blog) y fallbacks elegantes. Diseño = mockup v4.
 * force-dynamic para que las queries corran en runtime (mismo patrón que /blog),
 * evitando el cliente placeholder de build-time.
 */
export const dynamic = "force-dynamic";

const SEVILLA_FALLBACK = "/assets/images/que-ver-en-sevilla-optimizada.webp";
const WA_URL = "https://wa.me/34697223944";

// ── Helpers de datos ──────────────────────────────────────────────

/** Deriva zona / m² / hab / baños desde features (espejo de /comprar). */
function propDetails(p: Property) {
  const f = (p.features ?? {}) as {
    zona?: string;
    address?: string;
    banos?: number;
    baths?: number;
    habitaciones?: number;
    rooms?: number;
    metros?: number;
    sqm?: number;
  };
  let zona = "Sevilla";
  if (f.zona) zona = f.zona;
  else if (f.address) zona = f.address;
  else {
    const parts = p.title.split(" en ");
    if (parts.length > 1) zona = parts[parts.length - 1];
  }
  return {
    zona,
    baths: f.banos ?? f.baths ?? 1,
    rooms: f.habitaciones ?? f.rooms ?? 1,
    sqm: f.metros ?? f.sqm ?? 0,
  };
}

async function getFeaturedProperties(): Promise<Property[]> {
  try {
    const { data, error } = await supabase
      .from("properties")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(3);
    if (error || !data) return [];
    return data as Property[];
  } catch {
    return [];
  }
}

async function getPublishedReviews(): Promise<Review[]> {
  try {
    const { data, error } = await supabase
      .from("reviews")
      .select("*")
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .limit(3);
    if (error || !data) return [];
    return data as Review[];
  } catch {
    return [];
  }
}

type Testimonial = { name: string; role?: string; comment: string; rating: number };

const FALLBACK_TESTIMONIALS: Testimonial[] = [
  {
    name: "Carmen y Javier R.",
    role: "Vendedores · Triana",
    rating: 5,
    comment:
      "Vendimos el piso en 3 semanas y ahorramos casi 8.000€ en comisiones. Álvaro estuvo disponible en todo momento y nos explicó cada paso con total claridad.",
  },
  {
    name: "Lucía Martínez",
    role: "Compradora · Los Remedios",
    rating: 5,
    comment:
      "Como compradora, no pagué nada de comisión. Encontramos el piso que buscábamos y Álvaro negoció por nosotros. Un trato que no esperaba de un asesor inmobiliario.",
  },
  {
    name: "Miguel Ángel Torres",
    role: "Vendedor · Nervión",
    rating: 5,
    comment:
      "La valoración online fue exactísima. Pusimos el precio que sugirió y vendimos en dos semanas. Trato directo, sin rodeos y sin sorpresas al final.",
  },
];

function WhatsAppGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

// ── Página ────────────────────────────────────────────────────────

export default async function Home() {
  const [featured, dbReviews] = await Promise.all([
    getFeaturedProperties(),
    getPublishedReviews(),
  ]);
  const { posts } = await getPublishedPostsPage(1, 3);

  const testimonials: Testimonial[] =
    dbReviews.length > 0
      ? dbReviews.map((r) => ({ name: r.client_name, comment: r.comment, rating: r.rating }))
      : FALLBACK_TESTIMONIALS;

  const heroImgs = [0, 1, 2].map((i) => {
    const imgs = featured[i]?.images;
    return imgs && imgs.length > 0 ? imgs[0] : SEVILLA_FALLBACK;
  });
  const badgeProp = featured[0];
  const badgeDetails = badgeProp ? propDetails(badgeProp) : null;

  return (
    <div className="bg-warm-white text-ink font-body">
      <HomeBuyerPopup />

      {/* ══ 1 · HERO ══ */}
      <section className="max-w-[1160px] mx-auto px-5 sm:px-10 pt-[120px] md:pt-[136px] pb-16 md:pb-20 grid grid-cols-1 md:grid-cols-[1fr_1.1fr] gap-12 md:gap-14 items-center">
        {/* Texto */}
        <div>
          <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.08em] uppercase bg-gold-pale text-[#92400E] px-3.5 py-1.5 rounded-full mb-6">
            🏠 Asesor independiente · Sevilla
          </span>
          <h1 className="font-display text-[clamp(40px,5.5vw,76px)] font-extrabold leading-[1.08] tracking-[-0.02em] text-navy mb-[22px]">
            Vende tu casa<br />
            en Sevilla por<br />
            <span className="relative inline-block">
              solo un 2%
              <span className="absolute left-0 right-0 -bottom-0.5 h-1 rounded-[2px] bg-gold" />
            </span>
          </h1>
          <p className="text-lg font-light leading-[1.72] text-muted max-w-[420px] mb-10">
            Sin agencias, sin letra pequeña. Asesoramiento personal, honesto y de
            principio a fin. El comprador no paga comisión.
          </p>
          <div className="flex flex-wrap gap-3 mb-12">
            <Link
              href="/valoracion"
              className="inline-flex items-center gap-1.5 text-[15px] font-semibold bg-navy text-white px-7 py-3.5 rounded-full hover:bg-navy-soft hover:-translate-y-px hover:shadow-[0_6px_16px_rgba(15,23,42,0.2)] transition-all"
            >
              Valoración gratuita →
            </Link>
            <Link
              href="/comprar"
              className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-navy border-[1.5px] border-line px-7 py-3.5 rounded-full hover:bg-navy hover:text-white hover:border-navy transition-all"
            >
              Ver inmuebles
            </Link>
          </div>
          {/* Social proof */}
          <div className="flex items-center gap-3.5 pt-8 border-t border-line">
            <div className="flex">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className="w-9 h-9 rounded-full border-[2.5px] border-warm-white -mr-2 bg-gradient-to-br from-gold-pale to-sand-dark"
                />
              ))}
            </div>
            <div>
              <div className="text-sm font-medium text-navy mb-0.5">
                +40 familias asesoradas en Sevilla
              </div>
              <div className="text-gold text-[13px] tracking-[1px]">
                ★★★★★ <span className="text-xs text-muted font-normal">5.0 · Google</span>
              </div>
            </div>
          </div>
        </div>

        {/* Mosaico de fotos */}
        <div className="grid grid-cols-[1.15fr_0.85fr] grid-rows-2 gap-2.5 h-[360px] md:h-[520px]">
          <div className="row-span-2 rounded-2xl overflow-hidden">
            <img src={heroImgs[0]} alt="Inmueble destacado en Sevilla" className="w-full h-full object-cover" />
          </div>
          <div className="rounded-2xl overflow-hidden">
            <img src={heroImgs[1]} alt="Inmueble en Sevilla" className="w-full h-full object-cover" />
          </div>
          <div className="rounded-2xl overflow-hidden relative">
            <img src={heroImgs[2]} alt="Inmueble en Sevilla" className="w-full h-full object-cover" />
            {badgeProp && badgeDetails && (
              <div className="absolute bottom-3.5 left-3.5 right-3.5 bg-warm-white/90 backdrop-blur-sm rounded-[10px] px-3.5 py-3 border border-white/80">
                <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted mb-0.5">
                  En venta · {badgeDetails.zona}
                </div>
                <div className="font-display text-[22px] font-bold text-navy leading-none mb-0.5">
                  {badgeProp.price.toLocaleString("es-ES")} €
                </div>
                <div className="text-[11px] text-muted">
                  {badgeDetails.sqm} m² · {badgeDetails.rooms} hab.
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ══ 2 · STATS BAND ══ */}
      <div className="bg-sand border-y border-sand-dark py-10">
        <div className="max-w-[1160px] mx-auto px-5 sm:px-10 grid grid-cols-2 md:grid-cols-4">
          {[
            { num: <>2<span className="text-gold">%</span></>, label: "de comisión para el vendedor" },
            { num: <>0<span className="text-gold">%</span></>, label: "siempre para el comprador" },
            { num: <>+40</>, label: "familias asesoradas en Sevilla" },
            { num: <>5<span className="text-gold">★</span></>, label: "valoración media en Google" },
          ].map((s, i) => (
            <div
              key={i}
              className="text-center px-5 py-4 md:py-0 border-sand-dark [&:nth-child(odd)]:border-r md:border-r md:[&:last-child]:border-r-0 [&:nth-child(n+3)]:border-t md:[&:nth-child(n+3)]:border-t-0"
            >
              <div className="font-display text-[40px] md:text-[44px] font-extrabold text-navy leading-none mb-1.5">
                {s.num}
              </div>
              <div className="text-[13px] text-muted">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ══ 3 · PROCESS ══ */}
      <div className="max-w-[1160px] mx-auto px-5 sm:px-10 py-20 md:py-[88px]">
        <div className="mb-12 md:mb-14">
          <span className="block text-[11px] font-bold tracking-[0.12em] uppercase text-gold mb-2.5">
            Cómo funciona
          </span>
          <h2 className="font-display text-[clamp(30px,4vw,48px)] font-extrabold text-navy leading-[1.15] tracking-[-0.01em]">
            Cuatro pasos, sin sorpresas
          </h2>
        </div>
        <div className="relative">
          <div className="hidden md:block absolute top-6 left-[12.5%] right-[12.5%] h-px bg-line" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-y-8 gap-x-6 md:gap-0 relative">
            {[
              { n: "01", t: "Valoramos tu casa", d: "Calculamos el precio justo con datos reales del mercado sevillano. Gratis, sin compromiso." },
              { n: "02", t: "Preparamos la venta", d: "Fotografías, reportaje, publicación en portales y estrategia de difusión diseñada para tu piso." },
              { n: "03", t: "Negociamos por ti", d: "Gestionamos visitas y ofertas. Siempre hablas con Álvaro, no con un gestor diferente cada vez." },
              { n: "04", t: "Firma y entrega", d: "Te acompañamos ante notaría, coordinamos toda la documentación y cerramos la operación." },
            ].map((step) => (
              <div key={step.n} className="group md:pr-4">
                <div className="w-12 h-12 rounded-full bg-warm-white border-[1.5px] border-line flex items-center justify-center font-display text-lg font-bold text-navy mb-5 transition-all group-hover:bg-gold group-hover:border-gold">
                  {step.n}
                </div>
                <h3 className="text-base font-semibold text-navy mb-2">{step.t}</h3>
                <p className="text-sm text-muted leading-[1.65]">{step.d}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ══ 4 · 2% STATEMENT ══ */}
      <div id="vender" className="bg-navy py-24 relative overflow-hidden">
        <div className="absolute right-[-160px] top-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full border border-gold/[0.12] pointer-events-none" />
        <div className="absolute right-[-80px] top-1/2 -translate-y-1/2 w-[340px] h-[340px] rounded-full border border-gold/[0.08] pointer-events-none" />
        <div className="max-w-[1160px] mx-auto px-5 sm:px-10 flex flex-wrap items-center gap-10 md:gap-16 relative">
          <div className="font-display text-[clamp(100px,18vw,200px)] font-extrabold text-white leading-none tracking-[-0.04em] shrink-0">
            2<span className="text-gold">%</span>
          </div>
          <div className="flex-1 min-w-[240px]">
            <h2 className="font-display text-[clamp(28px,3.5vw,44px)] font-bold text-white leading-[1.2] mb-[18px]">
              Es todo lo que pedimos<br />por cuidar tu casa.
            </h2>
            <p className="text-[17px] leading-[1.7] text-white/55 max-w-[420px] mb-8">
              Las agencias cobran entre el 3 y el 5%. Nosotros cobramos la mitad —
              y el comprador no paga nada. Sin letra pequeña. Sin sorpresas. Solo
              resultados.
            </p>
            <Link
              href="/valoracion"
              className="inline-flex items-center gap-1.5 bg-gold text-navy text-[15px] font-bold px-7 py-3.5 rounded-full hover:bg-[#F59E0B] hover:-translate-y-px hover:shadow-[0_6px_20px_rgba(251,191,36,0.3)] transition-all"
            >
              Valorar mi casa gratis →
            </Link>
          </div>
        </div>
      </div>

      {/* ══ 5 · INMUEBLES DESTACADOS (reales) ══ */}
      {featured.length > 0 && (
        <div className="max-w-[1160px] mx-auto px-5 sm:px-10 py-20 md:py-[88px]">
          <div className="flex items-end justify-between flex-wrap gap-3 mb-10">
            <div>
              <span className="block text-[11px] font-bold tracking-[0.12em] uppercase text-gold mb-2.5">
                Inmuebles
              </span>
              <h2 className="font-display text-[clamp(30px,4vw,48px)] font-extrabold text-navy leading-[1.15] tracking-[-0.01em]">
                Destacados del mes
              </h2>
            </div>
            <Link
              href="/comprar"
              className="text-sm font-medium text-muted hover:text-navy border-b border-line pb-0.5 transition-colors"
            >
              Ver todos los inmuebles →
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {featured.map((p) => {
              const d = propDetails(p);
              const img = p.images?.length ? p.images[0] : SEVILLA_FALLBACK;
              return (
                <Link
                  key={p.id}
                  href="/comprar"
                  className="group bg-white rounded-2xl overflow-hidden border border-line transition-all hover:-translate-y-1.5 hover:shadow-[0_16px_40px_rgba(44,32,21,0.1)]"
                >
                  <div className="relative overflow-hidden">
                    <img
                      src={img}
                      alt={p.title}
                      loading="lazy"
                      className="w-full aspect-[4/3] object-cover transition-transform duration-[400ms] group-hover:scale-[1.04]"
                    />
                    <span className="absolute top-3 left-3 text-[10px] font-bold uppercase tracking-[0.06em] bg-gold-pale text-[#92400E] px-2.5 py-1 rounded-full">
                      En venta
                    </span>
                  </div>
                  <div className="px-5 pt-5 pb-6">
                    <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted mb-1.5">
                      {d.zona}
                    </div>
                    <h3 className="font-display text-[19px] font-bold text-navy leading-[1.25] mb-3 line-clamp-1">
                      {p.title}
                    </h3>
                    <div className="font-display text-[26px] font-extrabold text-navy leading-none mb-3.5">
                      {p.price.toLocaleString("es-ES")} €
                    </div>
                    <div className="flex gap-2.5 text-xs text-muted">
                      <span>{d.sqm} m²</span>
                      <span className="text-sand-dark">·</span>
                      <span>{d.rooms} hab.</span>
                      <span className="text-sand-dark">·</span>
                      <span>{d.baths} {d.baths === 1 ? "baño" : "baños"}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ══ 6 · VALUATION ══ */}
      <div className="bg-sand border-y border-sand-dark py-20 md:py-[88px]">
        <div className="max-w-[1160px] mx-auto px-5 sm:px-10 grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-[72px] items-center">
          <div>
            <img
              src={SEVILLA_FALLBACK}
              alt="Sevilla — valoración de tu vivienda"
              loading="lazy"
              className="w-full aspect-[4/3] object-cover rounded-2xl"
            />
          </div>
          <div>
            <span className="block text-[11px] font-bold tracking-[0.12em] uppercase text-gold mb-2.5">
              Herramienta gratuita
            </span>
            <h2 className="font-display text-[clamp(32px,4vw,50px)] font-extrabold text-navy leading-[1.12] mb-[18px]">
              ¿Cuánto vale tu casa?
            </h2>
            <p className="text-base leading-[1.72] text-muted mb-8">
              Usa nuestra valoración con inteligencia artificial y obtén en minutos
              una estimación precisa basada en datos reales del mercado en Sevilla.
              Gratis, sin compromisos.
            </p>
            <Link
              href="/valoracion"
              className="inline-flex items-center gap-1.5 w-fit text-[15px] font-semibold bg-navy text-white px-7 py-3.5 rounded-full hover:bg-navy-soft hover:-translate-y-px hover:shadow-[0_6px_16px_rgba(15,23,42,0.2)] transition-all"
            >
              Valorar mi casa →
            </Link>
          </div>
        </div>
      </div>

      {/* ══ 7 · TESTIMONIALS (reales con fallback) ══ */}
      <div className="max-w-[1160px] mx-auto px-5 sm:px-10 py-20 md:py-[88px]">
        <div className="text-center mb-12 md:mb-[52px]">
          <span className="block text-[11px] font-bold tracking-[0.12em] uppercase text-gold mb-2.5">
            Lo que dicen
          </span>
          <h2 className="font-display text-[clamp(30px,4vw,48px)] font-extrabold text-navy">
            Familias que ya confían
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {testimonials.map((t, i) => (
            <div
              key={i}
              className="bg-sand border border-sand-dark rounded-2xl p-7 transition-all hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(44,32,21,0.08)]"
            >
              <div className="text-gold text-[15px] tracking-[1px] mb-3.5">
                {"★".repeat(Math.max(1, Math.min(5, t.rating)))}
              </div>
              <p className="text-[15px] leading-[1.7] text-ink mb-6">“{t.comment}”</p>
              <div className="flex items-center gap-3">
                <span className="w-[42px] h-[42px] rounded-full border-2 border-warm-white bg-gold-pale text-[#92400E] font-display font-bold flex items-center justify-center">
                  {t.name.trim().charAt(0).toUpperCase()}
                </span>
                <div>
                  <div className="text-sm font-semibold text-navy">{t.name}</div>
                  {t.role && <div className="text-xs text-muted">{t.role}</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ══ 8 · BLOG (reales) ══ */}
      {posts.length > 0 && (
        <div className="bg-warm-white border-t border-line py-20 md:py-[88px]">
          <div className="max-w-[1160px] mx-auto px-5 sm:px-10">
            <div className="flex items-end justify-between flex-wrap gap-3 mb-10">
              <div>
                <span className="block text-[11px] font-bold tracking-[0.12em] uppercase text-gold mb-2.5">
                  Blog
                </span>
                <h2 className="font-display text-[clamp(30px,4vw,48px)] font-extrabold text-navy">
                  Todo sobre el mercado sevillano
                </h2>
              </div>
              <Link
                href="/blog"
                className="text-sm font-medium text-muted hover:text-navy border-b border-line pb-0.5 transition-colors"
              >
                Ver todos →
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {posts.map((post) => (
                <Link
                  key={post.id}
                  href={`/blog/${post.slug}`}
                  className="group bg-white rounded-2xl overflow-hidden border border-line transition-all hover:-translate-y-1 hover:shadow-[0_10px_28px_rgba(44,32,21,0.09)]"
                >
                  <div className="overflow-hidden">
                    <img
                      src={post.cover_image || SEVILLA_FALLBACK}
                      alt={post.title}
                      loading="lazy"
                      className="w-full aspect-[16/9] object-cover transition-transform duration-[400ms] group-hover:scale-[1.04]"
                    />
                  </div>
                  <div className="px-5 pt-4 pb-5">
                    <span className="block text-[10px] font-bold uppercase tracking-[0.1em] text-gold mb-2">
                      {new Date(post.created_at).toLocaleDateString("es-ES", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                    <h3 className="font-display text-[18px] font-bold text-navy leading-[1.3] mb-2 line-clamp-2">
                      {post.title}
                    </h3>
                    {post.excerpt && (
                      <p className="text-[13px] text-muted leading-[1.6] line-clamp-2">
                        {post.excerpt}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══ 9 · CTA FINAL ══ */}
      <div className="max-w-[1160px] mx-auto px-5 sm:px-10 pb-20 md:pb-[88px] pt-4">
        <div className="bg-navy rounded-[24px] px-8 py-12 md:px-16 md:py-[60px] flex flex-wrap justify-between items-center gap-9 relative overflow-hidden">
          <div className="absolute right-[-100px] top-1/2 -translate-y-1/2 w-[360px] h-[360px] rounded-full border border-gold/[0.12] pointer-events-none" />
          <div className="absolute right-[-40px] top-1/2 -translate-y-1/2 w-[240px] h-[240px] rounded-full border border-gold/[0.12] pointer-events-none" />
          <div className="relative">
            <h2 className="font-display text-[clamp(28px,3.5vw,42px)] font-extrabold text-white leading-[1.2] mb-3.5">
              ¿Tienes una casa<br />que vender? Hablemos.
            </h2>
            <p className="text-base text-white/50 max-w-[420px] leading-[1.65]">
              Una llamada de 15 minutos es suficiente para contarte cómo funciona y
              qué puedes esperar. Sin presiones.
            </p>
          </div>
          <div className="flex flex-col gap-3 relative z-[1]">
            <Link
              href="/valoracion"
              className="inline-flex items-center gap-1.5 bg-gold text-navy text-[15px] font-bold px-7 py-3.5 rounded-full hover:bg-[#F59E0B] hover:-translate-y-px hover:shadow-[0_6px_20px_rgba(251,191,36,0.3)] transition-all"
            >
              Solicitar valoración gratuita →
            </Link>
            <a
              href={WA_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-[rgba(37,211,102,0.15)] border border-[rgba(37,211,102,0.3)] text-[#4ADE80] text-sm font-semibold px-5 py-3 rounded-full hover:bg-[rgba(37,211,102,0.25)] transition-colors"
            >
              <WhatsAppGlyph size={16} />
              WhatsApp directo
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
