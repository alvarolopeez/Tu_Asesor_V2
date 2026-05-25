import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPostBySlug } from '@/lib/blogService';
import ReactMarkdown from 'react-markdown';
import Link from 'next/link';
import { Calendar, ArrowLeft } from 'lucide-react';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const resolvedParams = await params;
  const post = await getPostBySlug(resolvedParams.slug);

  if (!post) {
    return { title: 'Post no encontrado' };
  }

  const seoTitle = post.seo_title || `${post.title} | Tu Asesor Álvaro`;
  const seoDesc = post.seo_description || post.excerpt || 'Noticias y consejos del sector inmobiliario en Sevilla.';
  const canonicalUrl = `https://tuasesoralvaro.es/blog/${post.slug}`;

  // Extract keywords based on title or content for SEO targeting
  const defaultKeywords = ['inmobiliaria sevilla', 'tu asesor alvaro', 'vender piso sevilla', 'comprar casa sevilla', 'noticias inmobiliarias sevilla'];
  if (post.title.toLowerCase().includes('sevilla')) defaultKeywords.push('vivienda sevilla', 'precio piso sevilla');

  return {
    title: seoTitle,
    description: seoDesc,
    keywords: defaultKeywords.join(', '),
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: seoTitle,
      description: seoDesc,
      url: canonicalUrl,
      siteName: 'Tu Asesor Álvaro',
      type: 'article',
      publishedTime: post.created_at,
      modifiedTime: post.updated_at || post.created_at,
      authors: ['Álvaro Tu Asesor'],
      images: post.cover_image ? [{
        url: post.cover_image,
        width: 1200,
        height: 630,
        alt: post.title,
      }] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title: seoTitle,
      description: seoDesc,
      images: post.cover_image ? [post.cover_image] : [],
    },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params;
  const post = await getPostBySlug(resolvedParams.slug);

  if (!post) {
    notFound();
  }

  // Create JSON-LD schema payload to tell search engines and AI chatbots exactly what the post is about
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": `https://tuasesoralvaro.es/blog/${post.slug}`
    },
    "headline": post.title,
    "description": post.seo_description || post.excerpt || post.title,
    "image": post.cover_image ? [post.cover_image] : ["https://tuasesoralvaro.es/assets/images/logo.png"],
    "datePublished": post.created_at,
    "dateModified": post.updated_at || post.created_at,
    "author": {
      "@type": "Person",
      "name": "Álvaro López",
      "jobTitle": "Asesor Inmobiliario",
      "url": "https://tuasesoralvaro.es"
    },
    "publisher": {
      "@type": "Organization",
      "name": "Tu Asesor Álvaro",
      "logo": {
        "@type": "ImageObject",
        "url": "https://tuasesoralvaro.es/assets/images/logo.png"
      }
    },
    "articleBody": post.content
  };

  return (
    <div className="min-h-screen bg-[#0f172a] pt-32 pb-24 text-white relative overflow-hidden">
      {/* Dynamic JSON-LD Structured Data Injection */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Decorative Background */}
      <div className="absolute inset-0 bg-[url('/assets/images/pattern.svg')] opacity-5 z-0 pointer-events-none"></div>
      <div className="absolute top-1/4 right-1/4 w-[500px] h-[500px] bg-[#FBBF24]/5 rounded-full mix-blend-screen filter blur-[100px] opacity-50 z-0"></div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto">
          <Link href="/blog" className="inline-flex items-center text-slate-400 hover:text-[#FBBF24] transition-colors mb-8 font-semibold">
            <ArrowLeft size={20} className="mr-2" />
            Volver al blog
          </Link>

          <article className="glass-effect bg-[#1E293B]/70 border border-white/5 backdrop-blur-xl rounded-3xl overflow-hidden shadow-2xl">
            {post.cover_image && (
              <div className="w-full h-64 md:h-96 relative">
                <img 
                  src={post.cover_image} 
                  alt={post.title} 
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a]/95 to-transparent"></div>
              </div>
            )}
            
            <div className="p-8 md:p-12">
              <div className="flex items-center text-[#FBBF24] text-sm md:text-base mb-6 font-semibold">
                <Calendar size={18} className="mr-2" />
                <time dateTime={post.created_at}>
                  {new Date(post.created_at).toLocaleDateString('es-ES', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </time>
              </div>

              <h1 className="text-3xl md:text-5xl font-bold font-heading mb-8 leading-tight">
                {post.title}
              </h1>

              <div className="prose prose-invert prose-lg max-w-none prose-headings:font-heading prose-headings:text-[#FBBF24] prose-a:text-[#FBBF24] prose-a:no-underline hover:prose-a:underline prose-img:rounded-xl">
                <ReactMarkdown>{post.content}</ReactMarkdown>
              </div>
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}
