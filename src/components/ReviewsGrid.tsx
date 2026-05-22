'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Star, Quote } from 'lucide-react'
import type { Review } from '@/types'

/**
 * ReviewsGrid — Muestra las reseñas publicadas desde Supabase.
 * 
 * FIX APLICADO (Code Review):
 * - BUG-001: Se corrigió .eq('status','published') → .eq('is_published', true)
 *   La tabla reviews usa "is_published" (boolean), no "status" (text).
 * - BUG-002: Se eliminó el campo "status" de la interfaz local.
 *   Ahora usa la interfaz centralizada Review de @/types.
 */

// Fallback reviews for when DB has no published reviews yet
const fallbackReviews: Review[] = [
  { id: '1', client_name: "María R.", rating: 5, comment: "Vender con Álvaro fue la mejor decisión. Vendió mi piso en La Macarena en 20 días y me ahorré muchísimo dinero en comisiones frente a otras agencias de la zona.", is_published: true, created_at: '', updated_at: '' },
  { id: '2', client_name: "José Manuel D.", rating: 5, comment: "Increíble trato y transparencia desde el primer minuto. Todo el proceso de tasación fue muy claro y me sentí acompañado en cada firma.", is_published: true, created_at: '', updated_at: '' },
  { id: '3', client_name: "Laura G.", rating: 5, comment: "Buscaba comprar en Sevilla sin pagar honorarios abusivos, y con él fue posible. Recomendable 100% por su cercanía y profesionalidad.", is_published: true, created_at: '', updated_at: '' }
]

export default function ReviewsGrid() {
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchReviews() {
      try {
        const { data, error } = await supabase
          .from('reviews')
          .select('*')
          .eq('is_published', true)  // FIX: era .eq('status', 'published')
          .order('created_at', { ascending: false })
          .limit(3)

        if (error) {
          console.warn("Could not fetch reviews, using fallbacks. Error details:", error.message || error)
          setReviews(fallbackReviews)
        } else if (data && data.length > 0) {
          setReviews(data.map(r => ({
            id: r.id,
            client_name: r.client_name,
            rating: r.rating,
            comment: r.comment,
            is_published: r.is_published,  // FIX: era r.status
            created_at: r.created_at,
            updated_at: r.updated_at,
          })))
        } else {
          setReviews(fallbackReviews)
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        console.warn("Unexpected error fetching reviews:", message)
        setReviews(fallbackReviews)
      } finally {
        setLoading(false)
      }
    }

    fetchReviews()
  }, [])

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto mb-12">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse bg-[#1E293B]/50 h-64 rounded-2xl border border-white/5"></div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto mb-12">
      {reviews.map((review) => (
        <div key={review.id} className="glass-effect bg-[#1E293B]/70 p-8 rounded-2xl text-left shadow-lg relative border border-white/5 backdrop-blur-md flex flex-col h-full hover:border-[#FBBF24]/30 hover:scale-[1.02] transition-all duration-300">
          <Quote size={40} className="text-white/10 absolute top-4 right-4" />
          <div className="flex items-center mb-4">
            {[...Array(review.rating)].map((_, i) => (
              <Star key={i} size={20} className="text-[#FBBF24] fill-[#FBBF24]" />
            ))}
          </div>
          <p className="text-slate-200 italic mb-6 flex-grow leading-relaxed">&ldquo;{review.comment}&rdquo;</p>
          <p className="font-bold text-white mt-auto">- {review.client_name}</p>
        </div>
      ))}
    </div>
  )
}
