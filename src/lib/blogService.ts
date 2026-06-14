import { supabase } from './supabase';

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt?: string;
  cover_image?: string;
  is_published: boolean;
  seo_title?: string;
  seo_description?: string;
  created_at: string;
  updated_at: string;
}

export async function getPublishedPosts(): Promise<BlogPost[]> {
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('is_published', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching blog posts:', error);
    return [];
  }
  
  return data as BlogPost[];
}

/** Campos mínimos para el listado del blog (sin `content`, que es pesado). */
export interface BlogListItem {
  id: string;
  title: string;
  slug: string;
  excerpt?: string;
  cover_image?: string;
  created_at: string;
}

/**
 * Página de posts publicados (paginación real server-side con .range()).
 * Devuelve solo los campos del listado + el total para calcular las páginas.
 */
export async function getPublishedPostsPage(
  page: number,
  pageSize = 9,
): Promise<{ posts: BlogListItem[]; total: number }> {
  const safePage = Math.max(1, page);
  const from = (safePage - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from('posts')
    .select('id, title, slug, excerpt, cover_image, created_at', { count: 'exact' })
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    console.error('Error fetching blog posts page:', error);
    return { posts: [], total: 0 };
  }

  return { posts: (data as BlogListItem[]) || [], total: count ?? 0 };
}

export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error) {
    console.error(`Error fetching post with slug ${slug}:`, error);
    return null;
  }
  
  return data as BlogPost;
}
