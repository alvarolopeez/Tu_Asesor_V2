import { CheckCircle, Clock, XCircle } from "lucide-react";
import { Review } from "@/types";
import { supabase } from "@/lib/supabase";
import toast from "react-hot-toast";

interface ReviewsManagerProps {
  reviews: Review[];
  onRefresh: () => void;
}

export default function ReviewsManager({ reviews, onRefresh }: ReviewsManagerProps) {
  const toggleReviewStatus = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('reviews')
        .update({ is_published: !currentStatus })
        .eq('id', id);
      
      if (error) throw error;
      toast.success(currentStatus ? "Reseña ocultada de la web" : "Reseña publicada en la web");
      onRefresh();
    } catch (error) {
      toast.error("Error al actualizar la reseña");
    }
  };

  const deleteReview = async (id: string) => {
    if (!confirm("¿Seguro que quieres borrar esta reseña?")) return;
    try {
      const { error } = await supabase.from('reviews').delete().eq('id', id);
      if (error) throw error;
      toast.success("Reseña borrada correctamente");
      onRefresh();
    } catch (error) {
      toast.error("Error al borrar la reseña");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-white">Gestión de Reseñas</h2>
      </div>
      {reviews.map((review) => (
        <div key={review.id} className="bg-[#1E293B] p-6 rounded-2xl border border-white/5 flex flex-col sm:flex-row gap-6">
          <div className="flex-grow">
            <div className="flex items-center gap-4 mb-2">
              <h3 className="font-bold text-white">{review.client_name}</h3>
              <div className="flex gap-1">
                {Array.from({ length: review.rating }).map((_, i) => (
                  <div key={i} className="text-[#FBBF24] text-xs">★</div>
                ))}
              </div>
            </div>
            <p className="text-slate-400 italic">"{review.comment}"</p>
            <p className="text-[10px] text-slate-600 mt-4">{new Date(review.created_at).toLocaleString()}</p>
          </div>
          <div className="flex flex-col gap-2 justify-center shrink-0">
            <button 
              onClick={() => toggleReviewStatus(review.id, review.is_published)}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${review.is_published ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-[#FBBF24]/10 text-[#FBBF24] border border-[#FBBF24]/20'}`}
            >
              {review.is_published ? <CheckCircle size={14} /> : <Clock size={14} />}
              {review.is_published ? 'Ocultar Reseña' : 'Publicar en Web'}
            </button>
            <button 
              onClick={() => deleteReview(review.id)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all flex items-center justify-center gap-2"
            >
              <XCircle size={14} /> Eliminar
            </button>
          </div>
        </div>
      ))}
      {reviews.length === 0 && (
        <div className="bg-[#1E293B] p-8 text-center rounded-2xl border border-white/5 text-slate-400">
          No hay reseñas todavía.
        </div>
      )}
    </div>
  );
}
