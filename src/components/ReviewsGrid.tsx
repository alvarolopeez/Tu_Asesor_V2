'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Star, Quote } from 'lucide-react'

interface Review {
  id: string
  client_name: string
  rating: number
  comment: string
  status: string
}

export default function ReviewsGrid() {
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)

  const fallbackReviews: Review[] = [
    { id: '1', client_name: "María R.", rating: 5, comment: "Vender con Álvaro fue la mejor decisión. Vendió mi piso en La Macarena en 20 días y me ahorré muchísimo dinero en comisiones frente a otras agencias de la zona.", status: 'published' },
    { id: '2', client_name: "José Manuel D.", rating: 5, comment: "Increíble trato y transparencia desde el primer minuto. Todo el proceso de tasación fue muy claro y me sentí acompañado en cada firma.", status: 'published' },
    { id: '3', client_name: "Laura G.", rating: 5, comment: "Buscaba comprar en Sevilla sin pagar honorarios abusivos, y con él fue posible. Recomendable 100% por su cercanía y profesionalidad.", status: 'published' }
  ]

  useEffect(() => {
    async function fetchReviews() {
      try {
        const { data, error } = await supabase
          .from('reviews')
          .select('*')
          .eq('status', 'published')
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
            status: r.status
          })))
        } else {
          setReviews(fallbackReviews)
        }
      } catch (err: any) {
        console.warn("Unexpected error fetching reviews:", err?.message || err)
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
          <div key={i} className="animate-pulse bg-slate-100 h-64 rounded-2xl border border-slate-200"></div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto mb-12">
      {reviews.map((review) => (
        <div key={review.id} className="glass-effect bg-[#2C3E50]/80 p-8 rounded-2xl text-left shadow-lg relative border border-white/10 flex flex-col h-full">
          <Quote size={40} className="text-white/10 absolute top-4 right-4" />
          <div className="flex items-center mb-4">
            {[...Array(review.rating)].map((_, i) => (
              <Star key={i} size={20} className="text-[#FBBF24] fill-[#FBBF24]" />
            ))}
          </div>
          <p className="text-slate-200 italic mb-6 flex-grow leading-relaxed">"{review.comment}"</p>
          <p className="font-bold text-white mt-auto">- {review.client_name}</p>
        </div>
      ))}
    </div>
  )
}
