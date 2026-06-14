import Link from "next/link";
import { getPublishedPostsPage } from "@/lib/blogService";
import { Calendar } from "lucide-react";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 9;

export const metadata = {
  title: "Blog de Noticias Inmobiliarias | Tu Asesor Álvaro",
  description: "Últimas noticias, consejos y tendencias del mercado inmobiliario en Sevilla y Andalucía.",
};

export default async function BlogIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam || "1", 10) || 1);
  const { posts, total } = await getPublishedPostsPage(page, PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="min-h-screen bg-[#0f172a] pt-32 pb-24 text-white relative overflow-hidden">
      {/* Decorative Background */}
      <div className="absolute inset-0 bg-[url('/assets/images/pattern.svg')] opacity-5 z-0 pointer-events-none"></div>
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#FBBF24]/10 rounded-full mix-blend-screen filter blur-3xl opacity-30 z-0"></div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="text-center mb-16">
          <div className="inline-block bg-[#FBBF24]/10 border border-[#FBBF24]/30 text-[#FBBF24] font-bold px-4 py-2 rounded-full mb-6 backdrop-blur-sm shadow-[0_0_15px_rgba(251,191,36,0.3)] text-sm">
            Actualidad Inmobiliaria
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold font-heading mb-6 drop-shadow-md">
            Nuestro <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FBBF24] to-yellow-200">Blog</span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto font-light">
            Análisis de mercado, consejos para vender más rápido y noticias de interés en el sector inmobiliario sevillano.
          </p>
        </div>

        {posts.length === 0 ? (
          <div className="text-center py-20 bg-white/5 backdrop-blur-md rounded-3xl border border-white/10 max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold text-slate-300 mb-4">Pronto publicaremos novedades</h2>
            <p className="text-slate-400">Estamos preparando los mejores artículos para ti.</p>
          </div>
        ) : (
          <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {posts.map((post) => (
              <Link key={post.id} href={`/blog/${post.slug}`} className="group block">
                <article className="h-full glass-effect bg-white/5 border border-white/10 rounded-2xl overflow-hidden shadow-xl transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(251,191,36,0.15)] flex flex-col">
                  {post.cover_image && (
                    <div className="relative h-48 w-full overflow-hidden">
                      <img
                        src={post.cover_image}
                        alt={post.title}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a] to-transparent"></div>
                    </div>
                  )}
                  <div className="p-6 flex flex-col flex-grow">
                    <div className="flex items-center text-slate-400 text-sm mb-4">
                      <Calendar size={14} className="mr-2 text-[#FBBF24]" />
                      <time dateTime={post.created_at}>
                        {new Date(post.created_at).toLocaleDateString('es-ES', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </time>
                    </div>
                    <h2 className="text-2xl font-bold font-heading mb-3 text-white group-hover:text-[#FBBF24] transition-colors line-clamp-2">
                      {post.title}
                    </h2>
                    {post.excerpt && (
                      <p className="text-slate-300 line-clamp-3 mb-6 font-light">
                        {post.excerpt}
                      </p>
                    )}
                    <div className="mt-auto">
                      <span className="text-[#FBBF24] font-semibold text-sm uppercase tracking-wider flex items-center group-hover:translate-x-2 transition-transform">
                        Leer artículo <span className="ml-2">→</span>
                      </span>
                    </div>
                  </div>
                </article>
              </Link>
            ))}
          </div>

          {totalPages > 1 && (
            <nav className="flex flex-wrap justify-center items-center gap-2 mt-16" aria-label="Paginación del blog">
              {page > 1 && (
                <Link
                  href={`/blog?page=${page - 1}`}
                  className="px-4 py-2 rounded-lg text-sm font-bold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-all"
                >
                  ← Anterior
                </Link>
              )}
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <Link
                  key={n}
                  href={`/blog?page=${n}`}
                  aria-current={n === page ? "page" : undefined}
                  className={`px-4 py-2 rounded-lg text-sm font-bold border transition-all ${
                    n === page
                      ? "bg-[#FBBF24] border-[#FBBF24] text-[#2C3E50]"
                      : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {n}
                </Link>
              ))}
              {page < totalPages && (
                <Link
                  href={`/blog?page=${page + 1}`}
                  className="px-4 py-2 rounded-lg text-sm font-bold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-all"
                >
                  Siguiente →
                </Link>
              )}
            </nav>
          )}
          </>
        )}
      </div>
    </div>
  );
}
