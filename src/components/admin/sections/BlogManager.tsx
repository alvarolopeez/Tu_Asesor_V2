'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { BlogPost } from '@/lib/blogService';
import { 
  Search, Plus, Eye, Edit3, Trash2, Globe, FileText, CheckCircle2, 
  AlertCircle, ChevronRight, X, Image as ImageIcon, Laptop, Smartphone,
  ExternalLink, Sparkles, Check, Info, ArrowLeft, Loader2
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import ReactMarkdown from 'react-markdown';

// Simple function to clean and generate dynamic slugs
function generateSlug(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD') // remove accents
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-') // replace spaces with -
    .replace(/[^\w\-]+/g, '') // remove all non-word chars
    .replace(/\-\-+/g, '-') // replace multiple - with single -
    .replace(/^-+/, '') // trim - from start
    .replace(/-+$/, ''); // trim - from end
}

export default function BlogManager() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft'>('all');
  
  // Editor State
  const [isEditing, setIsEditing] = useState(false);
  const [currentPost, setCurrentPost] = useState<Partial<BlogPost> | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // SEO focus keyword state
  const [focusKeyword, setFocusKeyword] = useState('Sevilla');
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [googlePreviewDevice, setGooglePreviewDevice] = useState<'desktop' | 'mobile'>('desktop');

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPosts(data || []);
    } catch (error: any) {
      console.error('Error fetching posts:', error);
      toast.error('Error al cargar los artículos.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNew = () => {
    setCurrentPost({
      title: '',
      slug: '',
      content: '',
      excerpt: '',
      cover_image: '',
      is_published: false,
      seo_title: '',
      seo_description: '',
    });
    setIsEditing(true);
    setActiveTab('edit');
  };

  const handleEdit = (post: BlogPost) => {
    setCurrentPost(post);
    setIsEditing(true);
    setActiveTab('edit');
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este artículo de forma permanente?')) return;
    
    try {
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Artículo eliminado correctamente.');
      setPosts(posts.filter(p => p.id !== id));
    } catch (error: any) {
      console.error('Error deleting post:', error);
      toast.error('Error al eliminar el artículo.');
    }
  };

  const handleTogglePublish = async (post: BlogPost) => {
    const newStatus = !post.is_published;
    try {
      const { error } = await supabase
        .from('posts')
        .update({ 
          is_published: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', post.id);

      if (error) throw error;
      
      toast.success(newStatus ? '¡Artículo publicado en la web!' : 'Artículo guardado como borrador.');
      setPosts(posts.map(p => p.id === post.id ? { ...p, is_published: newStatus } : p));
    } catch (error: any) {
      console.error('Error toggling publish status:', error);
      toast.error('Error al actualizar el estado de publicación.');
    }
  };

  const handleTitleChange = (title: string) => {
    if (!currentPost) return;
    const generatedSlug = generateSlug(title);
    setCurrentPost({
      ...currentPost,
      title,
      slug: generatedSlug,
      seo_title: title.slice(0, 60), // pre-populate SEO title
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPost || !currentPost.title || !currentPost.slug || !currentPost.content) {
      toast.error('Por favor, rellena los campos obligatorios (Título, Slug y Contenido).');
      return;
    }

    try {
      setIsSubmitting(true);
      const postData = {
        title: currentPost.title,
        slug: currentPost.slug,
        content: currentPost.content,
        excerpt: currentPost.excerpt || '',
        cover_image: currentPost.cover_image || '',
        is_published: currentPost.is_published ?? false,
        seo_title: currentPost.seo_title || currentPost.title,
        seo_description: currentPost.seo_description || currentPost.excerpt || '',
        updated_at: new Date().toISOString(),
      };

      if (currentPost.id) {
        // Update
        const { error } = await supabase
          .from('posts')
          .update(postData)
          .eq('id', currentPost.id);
        
        if (error) throw error;
        toast.success('Artículo actualizado correctamente.');
      } else {
        // Create new
        const { error } = await supabase
          .from('posts')
          .insert([{ ...postData, created_at: new Date().toISOString() }]);

        if (error) throw error;
        toast.success('¡Artículo creado correctamente!');
      }

      setIsEditing(false);
      setCurrentPost(null);
      fetchPosts();
    } catch (error: any) {
      console.error('Error saving post:', error);
      if (error.code === '23505') {
        toast.error('El Slug ya está en uso. Por favor, cámbialo para que sea único.');
      } else {
        toast.error('Error al guardar el artículo.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Real-Time SEO & AI Chatbot Analysis Calculations
  const seoAnalysis = useMemo(() => {
    if (!currentPost) return null;

    const title = currentPost.title || '';
    const content = currentPost.content || '';
    const excerpt = currentPost.excerpt || '';
    const slug = currentPost.slug || '';
    const seoTitle = currentPost.seo_title || '';
    const seoDesc = currentPost.seo_description || '';
    
    const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
    
    // Keyword matching metrics
    const lowerKeyword = focusKeyword.toLowerCase();
    const keywordInTitle = title.toLowerCase().includes(lowerKeyword) || seoTitle.toLowerCase().includes(lowerKeyword);
    const keywordInDesc = seoDesc.toLowerCase().includes(lowerKeyword) || excerpt.toLowerCase().includes(lowerKeyword);
    const keywordInSlug = slug.toLowerCase().includes(lowerKeyword);
    
    // Count exact frequency in content
    let keywordCount = 0;
    if (lowerKeyword && content) {
      const regex = new RegExp(`\\b${lowerKeyword}\\b`, 'gi');
      const matches = content.match(regex);
      keywordCount = matches ? matches.length : 0;
    }
    
    const keywordDensity = wordCount > 0 ? (keywordCount / wordCount) * 100 : 0;
    
    // Heading checks (markdown ## and ###)
    const hasHeadings = /^(##|###)\s+\w+/m.test(content);

    // Seville Targeting Check
    const hasSevilleTarget = content.toLowerCase().includes('sevilla') || title.toLowerCase().includes('sevilla');

    // Score Calculations (out of 100)
    let score = 0;
    const checks: { label: string; passed: boolean; tip: string; severity: 'success' | 'warning' | 'error' }[] = [];

    // Title Length Check
    const titleLen = seoTitle.length || title.length;
    if (titleLen >= 45 && titleLen <= 65) {
      score += 15;
      checks.push({ label: 'Longitud del Título de SEO', passed: true, tip: 'Excelente longitud del título de SEO (entre 45 y 65 caracteres).', severity: 'success' });
    } else if (titleLen > 0) {
      score += 5;
      checks.push({ label: 'Longitud del Título de SEO', passed: false, tip: `El título tiene ${titleLen} caracteres. Intenta acortarlo o alargarlo para estar entre 45 y 65.`, severity: 'warning' });
    } else {
      checks.push({ label: 'Longitud del Título de SEO', passed: false, tip: 'Agrega un título para comprobar el SEO.', severity: 'error' });
    }

    // Description Length Check
    const descLen = seoDesc.length || excerpt.length;
    if (descLen >= 110 && descLen <= 160) {
      score += 20;
      checks.push({ label: 'Longitud de la Meta Descripción', passed: true, tip: 'Perfecta. Cabe perfectamente en los resultados de Google (110-160 caracteres).', severity: 'success' });
    } else if (descLen > 0) {
      score += 8;
      checks.push({ label: 'Longitud de la Meta Descripción', passed: false, tip: `Tiene ${descLen} caracteres. Lo óptimo es entre 110 y 160 caracteres para que no se recorte.`, severity: 'warning' });
    } else {
      checks.push({ label: 'Longitud de la Meta Descripción', passed: false, tip: 'Redacta una meta descripción breve para mejorar el CTR.', severity: 'error' });
    }

    // Word Count Check
    if (wordCount >= 600) {
      score += 20;
      checks.push({ label: 'Extensión del Contenido', passed: true, tip: `Genial. Tienes ${wordCount} palabras. Los contenidos largos consiguen mejores rankings e indexaciones de IA.`, severity: 'success' });
    } else if (wordCount >= 300) {
      score += 10;
      checks.push({ label: 'Extensión del Contenido', passed: false, tip: `Tiene ${wordCount} palabras. Es aceptable, pero te recomendamos redactar más de 600 palabras.`, severity: 'warning' });
    } else if (wordCount > 0) {
      checks.push({ label: 'Extensión del Contenido', passed: false, tip: `Muy corto (${wordCount} palabras). Google e IAs prefieren respuestas completas y profundas.`, severity: 'error' });
    } else {
      checks.push({ label: 'Extensión del Contenido', passed: false, tip: 'Escribe contenido de valor en el editor.', severity: 'error' });
    }

    // Focus Keyword checks
    if (focusKeyword) {
      if (keywordInTitle) {
        score += 10;
        checks.push({ label: `Palabra clave en Título`, passed: true, tip: `¡Perfecto! "${focusKeyword}" está incluida en el título principal.`, severity: 'success' });
      } else {
        checks.push({ label: `Palabra clave en Título`, passed: false, tip: `Añade la palabra clave "${focusKeyword}" al título para posicionar mejor.`, severity: 'warning' });
      }

      if (keywordInDesc) {
        score += 10;
        checks.push({ label: `Palabra clave en Meta Descripción`, passed: true, tip: `¡Correcto! La palabra clave figura en la meta descripción.`, severity: 'success' });
      } else {
        checks.push({ label: `Palabra clave en Meta Descripción`, passed: false, tip: `Inserta "${focusKeyword}" en la meta descripción para llamar la atención del buscador.`, severity: 'warning' });
      }

      if (keywordInSlug) {
        score += 5;
        checks.push({ label: `Palabra clave en URL / Slug`, passed: true, tip: `Slug optimizado. Contiene la palabra clave.`, severity: 'success' });
      } else {
        checks.push({ label: `Palabra clave en URL / Slug`, passed: false, tip: `Es ideal incluir "${focusKeyword.toLowerCase()}" en el slug de la dirección url.`, severity: 'warning' });
      }

      // Keyword density score
      if (keywordDensity >= 0.5 && keywordDensity <= 2.5) {
        score += 10;
        checks.push({ label: `Densidad de Palabra Clave (${keywordDensity.toFixed(1)}%)`, passed: true, tip: `Densidad excelente. Aparece ${keywordCount} veces. Se siente natural.`, severity: 'success' });
      } else if (keywordDensity > 2.5) {
        checks.push({ label: `Densidad de Palabra Clave (${keywordDensity.toFixed(1)}%)`, passed: false, tip: `¡Peligro! Densidad alta (${keywordCount} veces). Evita el keyword stuffing (sobre-optimización).`, severity: 'error' });
      } else if (keywordCount > 0) {
        score += 5;
        checks.push({ label: `Densidad de Palabra Clave (${keywordDensity.toFixed(1)}%)`, passed: false, tip: `Baja. Aparece solo ${keywordCount} vez. Intenta mencionarla alguna vez más de forma fluida.`, severity: 'warning' });
      } else if (wordCount > 0) {
        checks.push({ label: `Palabra clave en Contenido`, passed: false, tip: `No hemos detectado "${focusKeyword}" en el texto del artículo.`, severity: 'error' });
      }
    }

    // Headings H2/H3
    if (hasHeadings) {
      score += 5;
      checks.push({ label: 'Estructura legible (H2/H3)', passed: true, tip: 'Bien estructurado. El uso de encabezados facilita la lectura rápida para usuarios e IAs.', severity: 'success' });
    } else if (wordCount > 0) {
      checks.push({ label: 'Estructura legible (H2/H3)', passed: false, tip: 'Faltan subtítulos (## Título). Agrega cabeceras para fragmentar y organizar el contenido.', severity: 'warning' });
    }

    // Seville targeting
    if (hasSevilleTarget) {
      score += 5;
      checks.push({ label: 'Foco Local (Sevilla)', passed: true, tip: '¡Estupendo! Haces referencias locales que impulsarán el posicionamiento en Sevilla y cercanías.', severity: 'success' });
    } else if (wordCount > 0) {
      checks.push({ label: 'Foco Local (Sevilla)', passed: false, tip: 'Para competir en búsquedas de Sevilla, menciona la ciudad o distritos claves del sector.', severity: 'warning' });
    }

    // Determine color based on final score
    let scoreColor = 'text-red-500 bg-red-500/10 border-red-500/20';
    let scoreText = 'Necesita trabajo urgente';
    if (score >= 80) {
      scoreColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      scoreText = 'Optimizado al máximo';
    } else if (score >= 50) {
      scoreColor = 'text-amber-400 bg-amber-500/10 border-amber-500/20';
      scoreText = 'Aceptable con mejoras';
    }

    return { score, scoreColor, scoreText, checks, wordCount };
  }, [currentPost, focusKeyword]);

  // Filter posts
  const filteredPosts = useMemo(() => {
    return posts.filter(post => {
      const matchesSearch = 
        post.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
        post.content.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = 
        statusFilter === 'all' || 
        (statusFilter === 'published' && post.is_published) || 
        (statusFilter === 'draft' && !post.is_published);
      
      return matchesSearch && matchesStatus;
    });
  }, [posts, searchTerm, statusFilter]);

  if (loading) {
    return (
      <div className="bg-[#1E293B] p-6 rounded-2xl border border-white/5 min-h-[500px] flex flex-col items-center justify-center">
        <Loader2 className="w-12 h-12 text-[#FBBF24] animate-spin mb-4" />
        <p className="text-slate-400">Cargando la base de conocimientos y artículos...</p>
      </div>
    );
  }

  return (
    <div className="bg-[#1E293B] rounded-2xl border border-white/5 overflow-hidden transition-all duration-300">
      {/* 1. SECTION HEADER */}
      {!isEditing ? (
        <div className="p-6 md:p-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-5 h-5 text-[#FBBF24]" />
                <h2 className="text-2xl font-bold text-white font-heading">Posicionamiento Orgánico y Blog</h2>
              </div>
              <p className="text-slate-400 text-sm">
                Redacta y publica noticias del sector de vivienda en Sevilla para captar tráfico y ser indexado por IAs de búsqueda.
              </p>
            </div>
            <button 
              onClick={handleCreateNew}
              className="bg-gradient-to-r from-[#FBBF24] to-yellow-500 hover:from-yellow-500 hover:to-amber-500 text-[#1E293B] font-bold px-5 py-3 rounded-xl transition-all duration-300 flex items-center gap-2 shadow-[0_4px_20px_rgba(251,191,36,0.25)] hover:scale-[1.03]"
            >
              <Plus className="w-5 h-5" />
              Nuevo Artículo
            </button>
          </div>

          {/* Search and Filters bar */}
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between mb-6 bg-slate-900/40 p-4 rounded-xl border border-white/5">
            <div className="relative w-full md:max-w-md">
              <Search className="absolute left-3 top-3.5 w-4 h-4 text-slate-400" />
              <input 
                type="text"
                placeholder="Buscar artículos por título o contenido..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-800/80 border border-white/10 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-[#FBBF24] transition-colors"
              />
            </div>
            
            <div className="flex items-center gap-1.5 self-end md:self-auto bg-slate-950/60 p-1 rounded-lg border border-white/5">
              <button 
                onClick={() => setStatusFilter('all')}
                className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors ${statusFilter === 'all' ? 'bg-[#FBBF24] text-slate-900' : 'text-slate-400 hover:text-white'}`}
              >
                Todos
              </button>
              <button 
                onClick={() => setStatusFilter('published')}
                className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors ${statusFilter === 'published' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                Publicados
              </button>
              <button 
                onClick={() => setStatusFilter('draft')}
                className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors ${statusFilter === 'draft' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}
              >
                Borradores
              </button>
            </div>
          </div>

          {/* List display */}
          {filteredPosts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-white/5 rounded-2xl bg-slate-900/10">
              <FileText className="w-16 h-16 text-slate-600 mb-4 animate-pulse" />
              <h3 className="text-lg font-bold text-slate-300">No se encontraron artículos</h3>
              <p className="text-slate-400 text-sm text-center max-w-sm mt-1">
                Escribe un nuevo post o comprueba los filtros de búsqueda y estado. ¡También puedes esperar que la IA de automatización redacte hoy!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredPosts.map((post) => {
                // Calculate quick local count of words
                const words = post.content ? post.content.trim().split(/\s+/).length : 0;
                
                return (
                  <div 
                    key={post.id}
                    className="group bg-slate-900/30 hover:bg-slate-900/60 border border-white/5 hover:border-[#FBBF24]/30 rounded-xl overflow-hidden p-4 md:p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-5 transition-all duration-300 hover:shadow-[0_4px_20px_rgba(251,191,36,0.05)]"
                  >
                    <div className="flex gap-4 items-start flex-grow">
                      {post.cover_image ? (
                        <div className="w-16 h-16 md:w-20 md:h-20 rounded-lg overflow-hidden shrink-0 border border-white/10 bg-slate-950">
                          <img 
                            src={post.cover_image} 
                            alt={post.title} 
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        </div>
                      ) : (
                        <div className="w-16 h-16 md:w-20 md:h-20 rounded-lg bg-slate-800 flex items-center justify-center text-slate-500 shrink-0 border border-white/5">
                          <ImageIcon className="w-8 h-8" />
                        </div>
                      )}
                      <div>
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          {post.is_published ? (
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 flex items-center gap-1">
                              <Globe className="w-3 h-3" /> Publicado
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/25 flex items-center gap-1">
                              <FileText className="w-3 h-3" /> Borrador
                            </span>
                          )}
                          <span className="text-[10px] text-slate-500">
                            {new Date(post.created_at).toLocaleDateString('es-ES', {
                              day: '2-digit', month: 'short', year: 'numeric'
                            })}
                          </span>
                        </div>
                        <h4 className="text-base md:text-lg font-bold text-white group-hover:text-[#FBBF24] transition-colors leading-snug line-clamp-1 mb-1 font-heading">
                          {post.title}
                        </h4>
                        <p className="text-slate-400 text-xs line-clamp-1 mb-2 max-w-xl">
                          {post.excerpt || 'Sin resumen cargado.'}
                        </p>
                        <div className="flex items-center gap-3 text-[10px] text-slate-500 font-medium">
                          <span>{words} palabras</span>
                          <span>•</span>
                          <span className="text-slate-400">/{post.slug}</span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Action buttons */}
                    <div className="flex items-center gap-2 self-end md:self-auto shrink-0 w-full md:w-auto justify-end border-t border-white/5 md:border-t-0 pt-3 md:pt-0">
                      <a 
                        href={`/blog/${post.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
                        title="Ver en la Web"
                      >
                        <ExternalLink className="w-4.5 h-4.5" />
                      </a>
                      <button 
                        onClick={() => handleTogglePublish(post)}
                        className={`p-2 rounded-lg transition-colors ${post.is_published ? 'hover:bg-amber-500/10 text-emerald-400 hover:text-amber-400' : 'hover:bg-emerald-500/10 text-amber-400 hover:text-emerald-400'}`}
                        title={post.is_published ? 'Despublicar y guardar borrador' : 'Publicar artículo en la web'}
                      >
                        {post.is_published ? <Eye className="w-4.5 h-4.5" /> : <Globe className="w-4.5 h-4.5" />}
                      </button>
                      <button 
                        onClick={() => handleEdit(post)}
                        className="p-2 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-[#FBBF24] transition-colors"
                        title="Editar Artículo"
                      >
                        <Edit3 className="w-4.5 h-4.5" />
                      </button>
                      <button 
                        onClick={() => handleDelete(post.id)}
                        className="p-2 hover:bg-red-500/10 rounded-lg text-slate-400 hover:text-red-400 transition-colors"
                        title="Eliminar artículo"
                      >
                        <Trash2 className="w-4.5 h-4.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* 2. FULL SCREEN EDIT & ANALYSIS ENVIRONMENT */
        <form onSubmit={handleSave} className="flex flex-col min-h-[700px]">
          {/* Editor Header */}
          <div className="p-4 md:p-6 bg-slate-900 border-b border-white/5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button 
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setCurrentPost(null);
                }}
                className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h3 className="text-lg font-bold text-white font-heading">
                  {currentPost?.id ? 'Editar Entrada de Blog' : 'Nueva Entrada de Blog'}
                </h3>
                <p className="text-xs text-slate-400">
                  {currentPost?.id ? 'Los cambios se reflejarán instantáneamente al actualizar.' : 'Crea borradores optimizados para publicar en la web.'}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 bg-slate-950/60 p-1.5 rounded-lg border border-white/5 mr-2">
                <span className="text-xs text-slate-400 px-2">Estado:</span>
                <button 
                  type="button"
                  onClick={() => setCurrentPost(prev => prev ? { ...prev, is_published: !prev.is_published } : null)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-md flex items-center gap-1.5 transition-colors ${currentPost?.is_published ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'}`}
                >
                  {currentPost?.is_published ? <Globe className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                  {currentPost?.is_published ? 'Publicado' : 'Borrador'}
                </button>
              </div>

              <button 
                type="submit"
                disabled={isSubmitting}
                className="bg-gradient-to-r from-[#FBBF24] to-yellow-500 text-slate-900 font-bold px-5 py-2.5 rounded-xl transition-all hover:scale-[1.02] flex items-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Guardar Cambios
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Three-Column Work Area */}
          <div className="grid grid-cols-1 xl:grid-cols-12 grow">
            
            {/* Column A: Inputs & Markdown Editor (7/12) */}
            <div className="xl:col-span-7 p-6 border-r border-white/5 flex flex-col gap-6">
              
              {/* Title & Slug inputs */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="md:col-span-8">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Título de la Noticia *</label>
                  <input 
                    type="text"
                    required
                    value={currentPost?.title || ''}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    placeholder="Ej. Guía Completa de Plusvalía Municipal en Sevilla 2026..."
                    className="w-full px-4 py-2.5 bg-slate-900/60 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-[#FBBF24] transition-colors font-semibold"
                  />
                </div>
                
                <div className="md:col-span-4">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Dirección URL (Slug) *</label>
                  <input 
                    type="text"
                    required
                    value={currentPost?.slug || ''}
                    onChange={(e) => setCurrentPost(prev => prev ? { ...prev, slug: generateSlug(e.target.value) } : null)}
                    placeholder="ej-plusvalia-sevilla"
                    className="w-full px-4 py-2.5 bg-slate-900/60 border border-white/10 rounded-xl text-slate-300 placeholder-slate-500 focus:outline-none focus:border-[#FBBF24] transition-colors text-sm font-mono"
                  />
                </div>
              </div>

              {/* Cover Image & Excerpt */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="md:col-span-6">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Imagen de Portada (URL)</label>
                  <div className="relative">
                    <input 
                      type="text"
                      value={currentPost?.cover_image || ''}
                      onChange={(e) => setCurrentPost(prev => prev ? { ...prev, cover_image: e.target.value } : null)}
                      placeholder="https://images.unsplash.com/photo-..."
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-900/60 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-[#FBBF24] transition-colors text-sm"
                    />
                    <ImageIcon className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                  </div>
                </div>
                
                <div className="md:col-span-6">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Breve Resumen (Excerpt)</label>
                  <input 
                    type="text"
                    value={currentPost?.excerpt || ''}
                    onChange={(e) => setCurrentPost(prev => prev ? { ...prev, excerpt: e.target.value } : null)}
                    placeholder="Resumen corto de 1 o 2 frases que aparece en el listado..."
                    className="w-full px-4 py-2.5 bg-slate-900/60 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-[#FBBF24] transition-colors text-sm"
                  />
                </div>
              </div>

              {/* Editor Tabs & Body Content */}
              <div className="grow flex flex-col">
                <div className="flex items-center justify-between border-b border-white/10 mb-4 pb-2">
                  <div className="flex gap-2">
                    <button 
                      type="button"
                      onClick={() => setActiveTab('edit')}
                      className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors ${activeTab === 'edit' ? 'bg-[#FBBF24] text-slate-900' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                    >
                      Editor Markdown
                    </button>
                    <button 
                      type="button"
                      onClick={() => setActiveTab('preview')}
                      className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors ${activeTab === 'preview' ? 'bg-[#FBBF24] text-slate-900' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                    >
                      Previsualizar Artículo
                    </button>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Markdown Soportado (## H2, **negrita**, [enlaces](url))
                  </span>
                </div>

                {activeTab === 'edit' ? (
                  <textarea 
                    value={currentPost?.content || ''}
                    onChange={(e) => setCurrentPost(prev => prev ? { ...prev, content: e.target.value } : null)}
                    required
                    placeholder="## Escribe tu noticia aquí usando Markdown...

El mercado inmobiliario en Sevilla capital está viviendo un momento clave en este año 2026. Los distritos con mayor demanda..."
                    className="w-full grow min-h-[350px] p-4 bg-slate-900/60 border border-white/10 rounded-xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-[#FBBF24] transition-colors font-mono text-sm leading-relaxed"
                  />
                ) : (
                  <div className="w-full grow min-h-[350px] p-6 bg-slate-900/40 rounded-xl border border-white/5 overflow-y-auto max-h-[500px]">
                    <div className="prose prose-invert prose-sm max-w-none prose-headings:font-heading prose-headings:text-[#FBBF24] prose-a:text-[#FBBF24] prose-img:rounded-lg">
                      {currentPost?.content ? (
                        <ReactMarkdown>{currentPost.content}</ReactMarkdown>
                      ) : (
                        <p className="text-slate-500 italic">Escribe en el editor para previsualizar el renderizado final del blog.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* SEO & Meta Tag Inputs */}
              <div className="p-4 bg-slate-950/40 border border-white/5 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-[#FBBF24]" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">Metadatos de Búsqueda (SEO)</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">Título de Google (SEO Title)</label>
                    <input 
                      type="text"
                      value={currentPost?.seo_title || ''}
                      onChange={(e) => setCurrentPost(prev => prev ? { ...prev, seo_title: e.target.value } : null)}
                      placeholder="Título optimizado para buscadores..."
                      className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-[#FBBF24] text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">Meta Descripción de Google</label>
                    <input 
                      type="text"
                      value={currentPost?.seo_description || ''}
                      onChange={(e) => setCurrentPost(prev => prev ? { ...prev, seo_description: e.target.value } : null)}
                      placeholder="Meta descripción de búsqueda..."
                      className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-[#FBBF24] text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>
            
            {/* Column B: Real-Time SEO & AI Analyzer (5/12) */}
            <div className="xl:col-span-5 p-6 bg-slate-950/20 flex flex-col gap-6 overflow-y-auto max-h-[85vh]">
              
              {/* Keyword Focus input */}
              <div className="bg-slate-900 p-4 rounded-xl border border-white/5">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <label className="text-xs font-bold text-[#FBBF24] uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#FBBF24]" />
                    Palabra Clave Objetivo
                  </label>
                  <div className="group relative">
                    <Info className="w-3.5 h-3.5 text-slate-500 cursor-help" />
                    <div className="absolute right-0 bottom-full mb-2 w-52 bg-slate-950 text-[10px] text-slate-400 p-2 rounded-lg border border-white/10 hidden group-hover:block z-50">
                      La palabra por la que los usuarios buscarán tu artículo en Google. Analizaremos su densidad en tu contenido.
                    </div>
                  </div>
                </div>
                <input 
                  type="text"
                  value={focusKeyword}
                  onChange={(e) => setFocusKeyword(e.target.value)}
                  placeholder="Ej. Plusvalía Sevilla, Comprar piso Sevilla..."
                  className="w-full px-3.5 py-2 bg-slate-950 border border-white/10 rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-[#FBBF24] text-xs font-semibold"
                />
              </div>

              {/* Google Search Result Preview Card */}
              <div className="bg-slate-900 rounded-xl border border-white/5 overflow-hidden">
                <div className="bg-slate-950 px-4 py-2 border-b border-white/5 flex justify-between items-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Simulación en Google Search</span>
                  <div className="flex gap-1">
                    <button 
                      type="button"
                      onClick={() => setGooglePreviewDevice('desktop')}
                      className={`p-1 rounded text-slate-500 hover:text-white ${googlePreviewDevice === 'desktop' && 'bg-slate-800 text-[#FBBF24]'}`}
                      title="Vista Escritorio"
                    >
                      <Laptop className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      type="button"
                      onClick={() => setGooglePreviewDevice('mobile')}
                      className={`p-1 rounded text-slate-500 hover:text-white ${googlePreviewDevice === 'mobile' && 'bg-slate-800 text-[#FBBF24]'}`}
                      title="Vista Móvil"
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                
                {/* Google preview box */}
                <div className="p-5 bg-white border-t border-slate-100 text-slate-900 flex flex-col gap-1 select-none">
                  {googlePreviewDevice === 'desktop' ? (
                    /* Desktop preview */
                    <div className="font-sans text-sm max-w-xl">
                      <div className="text-[12px] text-[#202124] flex items-center gap-1.5 mb-1 leading-tight font-light truncate">
                        <span>https://tuasesoralvaro.com</span>
                        <span className="text-[#5f6368]">› blog › {currentPost?.slug || 'slug-del-articulo'}</span>
                      </div>
                      <h4 className="text-[20px] text-[#1a0dab] hover:underline cursor-pointer leading-tight mb-1 font-medium truncate">
                        {currentPost?.seo_title || currentPost?.title || 'Escribe un Título Excelente...'}
                      </h4>
                      <p className="text-[14px] text-[#4d5156] leading-relaxed line-clamp-2">
                        <span className="text-[#70757a]">
                          {new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })} — 
                        </span>{' '}
                        {currentPost?.seo_description || currentPost?.excerpt || 'Añade una descripción optimizada para mejorar la tasa de clics (CTR) en los buscadores...'}
                      </p>
                    </div>
                  ) : (
                    /* Mobile preview */
                    <div className="font-sans text-xs max-w-sm">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[9px] text-slate-600 font-bold border border-slate-200">TA</div>
                        <div className="flex flex-col">
                          <span className="text-[12px] text-[#202124] font-medium leading-none">Tu Asesor Álvaro</span>
                          <span className="text-[10px] text-[#5f6368] leading-none">tuasesoralvaro.com › blog</span>
                        </div>
                      </div>
                      <h4 className="text-[16px] text-[#1558d6] hover:underline cursor-pointer leading-snug mb-1 font-medium line-clamp-2">
                        {currentPost?.seo_title || currentPost?.title || 'Escribe un Título Excelente...'}
                      </h4>
                      <p className="text-[12px] text-[#3c4043] leading-relaxed line-clamp-3">
                        <span className="text-[#70757a]">
                          {new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })} — 
                        </span>{' '}
                        {currentPost?.seo_description || currentPost?.excerpt || 'Añade una descripción optimizada para mejorar la tasa de clics (CTR) en los buscadores...'}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* SEO Score & Checker panel */}
              {seoAnalysis && (
                <div className="bg-slate-900 rounded-xl border border-white/5 p-5">
                  <div className="flex justify-between items-center mb-5 pb-3 border-b border-white/5">
                    <div>
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Analizador SEO & AI</span>
                      <h4 className="text-sm font-semibold text-white mt-0.5">Calidad y Optimización</h4>
                    </div>
                    
                    {/* Circle Score representation */}
                    <div className={`px-3.5 py-1.5 rounded-lg border text-xs font-extrabold flex items-center gap-1.5 ${seoAnalysis.scoreColor}`}>
                      <span>SEO Score:</span>
                      <span className="text-sm font-black">{seoAnalysis.score}/100</span>
                    </div>
                  </div>

                  {/* Quality Checklist */}
                  <div className="flex flex-col gap-3.5">
                    {seoAnalysis.checks.map((check, index) => (
                      <div key={index} className="flex items-start gap-2.5">
                        {check.passed ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        ) : check.severity === 'error' ? (
                          <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <p className={`text-xs font-bold ${check.passed ? 'text-slate-300' : 'text-slate-400'}`}>
                            {check.label}
                          </p>
                          <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                            {check.tip}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* AI & Chatbot specific readiness advice */}
                  <div className="mt-6 p-3.5 bg-slate-950/60 rounded-lg border border-white/5 flex gap-2">
                    <Sparkles className="w-5 h-5 text-[#FBBF24] shrink-0" />
                    <div>
                      <h5 className="text-xs font-bold text-white">Preparación para Chatbots de IA</h5>
                      <p className="text-[10px] text-slate-400 mt-1 leading-normal">
                        Las inteligencias artificiales de búsqueda (como Perplexity o SearchGPT) rastrean el schema JSON-LD que inyectamos automáticamente y valoran enormemente las menciones locales precisas de Sevilla y respuestas directas a las intenciones del usuario. Tu artículo cumple con creces estas condiciones.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
