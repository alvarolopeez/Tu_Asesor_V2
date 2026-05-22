"use client";

import { useState } from "react";
import Header from "@/components/Header";
import { Star, Send, CheckCircle2, User, MessageSquare } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function DejarResenaPage() {
  const [rating, setRating] = useState(5);
  const [hover, setHover] = useState(0);
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from('reviews')
        .insert([{
          client_name: name,
          rating,
          comment,
          is_published: false // Moderación por defecto
        }]);

      if (error) throw error;
      setSubmitted(true);
    } catch (error) {
      console.error("Error submitting review:", error);
      alert("No se pudo enviar la reseña. Por favor, inténtalo de nuevo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <main className="min-h-screen pt-32 pb-20 bg-[#0f172a] flex flex-col items-center justify-center px-4">
        <Header />
        <div className="glass-effect bg-[#1E293B]/70 border border-white/5 backdrop-blur-md p-12 rounded-3xl text-center max-w-md animate-in zoom-in duration-500 shadow-2xl">
          <CheckCircle2 className="text-green-400 w-20 h-20 mx-auto mb-6" />
          <h1 className="text-3xl font-bold text-white mb-4">¡Gracias por tu reseña!</h1>
          <p className="text-slate-300 mb-8">
            Tu opinión es muy importante para mí. La reseña será revisada y publicada en la web próximamente.
          </p>
          <button 
            onClick={() => window.location.href = "/"}
            className="btn btn-primary w-full py-4"
          >
            Volver al inicio
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pt-32 pb-20 bg-[#0f172a]">
      <Header />
      <div className="container mx-auto px-4 max-w-2xl">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4 font-heading">Tu Opinión Cuenta</h1>
          <p className="text-xl text-slate-300">
            ¿Cómo ha sido tu experiencia con mi servicio? Ayúdame a mejorar y ayuda a otros clientes a decidirse.
          </p>
        </div>

        <div className="glass-effect bg-[#1E293B]/70 border border-white/5 backdrop-blur-md p-8 md:p-12 rounded-3xl shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Rating Stars */}
            <div className="flex flex-col items-center gap-4">
              <label className="text-slate-300 font-semibold text-lg">Calificación</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHover(star)}
                    onMouseLeave={() => setHover(0)}
                    className="focus:outline-none transition-transform hover:scale-110"
                  >
                    <Star 
                      size={48} 
                      className={`${
                        star <= (hover || rating) 
                          ? "fill-[#FBBF24] text-[#FBBF24]" 
                          : "text-white/20"
                      } transition-colors`}
                    />
                  </button>
                ))}
              </div>
              <p className="text-[#FBBF24] font-medium">
                {rating === 5 ? "¡Excelente!" : rating === 4 ? "Muy bueno" : rating === 3 ? "Bueno" : rating === 2 ? "Regular" : "Mejorable"}
              </p>
            </div>

            <div className="space-y-6">
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" size={20} />
                <input 
                  type="text" 
                  required
                  placeholder="Tu Nombre completo"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-4 pl-12 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all"
                />
              </div>

              <div className="relative">
                <MessageSquare className="absolute left-4 top-4 text-white/40" size={20} />
                <textarea 
                  required
                  rows={5}
                  placeholder="Escribe aquí tu experiencia..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-4 pl-12 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all"
                />
              </div>
            </div>

            <button 
              type="submit" 
              disabled={isSubmitting}
              className="w-full btn btn-primary py-5 text-xl flex items-center justify-center gap-3 group"
            >
              {isSubmitting ? "Enviando..." : (
                <>
                  Enviar Reseña
                  <Send size={24} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
