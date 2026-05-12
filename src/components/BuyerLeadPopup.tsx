'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { X, CheckCircle2 } from 'lucide-react'

export default function BuyerLeadPopup() {
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: ''
  })

  useEffect(() => {
    // Check if the user has already seen the popup
    const hasSeenPopup = localStorage.getItem('buyerPopupShown')
    
    if (!hasSeenPopup) {
      // Show popup after 3 seconds of entering the page
      const timer = setTimeout(() => {
        setIsOpen(true)
      }, 3000)
      
      return () => clearTimeout(timer)
    }
  }, [])

  const handleClose = () => {
    setIsOpen(false)
    localStorage.setItem('buyerPopupShown', 'true')
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      // 1. Check if the phone already exists in the database
      const { data: existingLead, error: searchError } = await supabase
        .from('leads')
        .select('id')
        .eq('phone', formData.phone)
        .maybeSingle()

      if (searchError) {
        console.error("Error checking existing lead:", searchError)
      }

      // 2. If it doesn't exist, insert it
      if (!existingLead) {
        const { error: insertError } = await supabase
          .from('leads')
          .insert([{
            name: formData.name,
            phone: formData.phone,
            email: formData.email,
            type: 'buyer',
            source: 'popup_home'
          }])
          
        if (insertError) {
          console.error("Error inserting lead:", insertError)
        }
      }

      setIsSuccess(true)
      setTimeout(() => {
        handleClose()
      }, 3000)
    } catch (error) {
      console.error("Unexpected error:", error)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#2C3E50] rounded-2xl shadow-2xl w-full max-w-md relative overflow-hidden border border-white/10">
        
        {/* Header Decorator */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#FBBF24] to-yellow-200"></div>
        
        {/* Close Button */}
        <button 
          onClick={handleClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
        >
          <X size={24} />
        </button>

        <div className="p-8">
          {!isSuccess ? (
            <>
              <h2 className="text-2xl font-bold text-white mb-2 font-heading text-center">
                ¿Buscas tu nuevo hogar?
              </h2>
              <p className="text-slate-300 text-center text-sm mb-6">
                Déjanos tus datos y nuestro <strong className="text-[#FBBF24]">algoritmo de Inteligencia Artificial</strong> te enviará las mejores propiedades de Sevilla y provincia antes de que salgan al mercado. <strong>0€ de comisiones para compradores.</strong>
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-bold mb-1 text-slate-300">Nombre</label>
                  <input 
                    type="text" 
                    id="name" 
                    name="name" 
                    value={formData.name}
                    onChange={handleChange}
                    className="w-full bg-white/10 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#FBBF24] border border-white/10 placeholder-slate-500" 
                    placeholder="Tu nombre" 
                    required 
                  />
                </div>

                <div>
                  <label htmlFor="phone" className="block text-sm font-bold mb-1 text-slate-300">Nº de teléfono</label>
                  <input 
                    type="tel" 
                    id="phone" 
                    name="phone" 
                    value={formData.phone}
                    onChange={handleChange}
                    className="w-full bg-white/10 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#FBBF24] border border-white/10 placeholder-slate-500" 
                    placeholder="600 000 000" 
                    required 
                  />
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-bold mb-1 text-slate-300">Correo electrónico</label>
                  <input 
                    type="email" 
                    id="email" 
                    name="email" 
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full bg-white/10 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#FBBF24] border border-white/10 placeholder-slate-500" 
                    placeholder="correo@ejemplo.com" 
                    required 
                  />
                </div>

                <button 
                  type="submit" 
                  disabled={isSubmitting || !formData.name || !formData.phone || !formData.email}
                  className="w-full bg-[#FBBF24] hover:bg-yellow-500 text-[#2C3E50] font-bold py-3 px-4 rounded-lg transition-colors mt-2 disabled:opacity-50"
                >
                  {isSubmitting ? 'Procesando...' : '¡Quiero enterarme!'}
                </button>
              </form>
            </>
          ) : (
            <div className="text-center py-8 animate-fade-in">
              <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-green-500/30">
                <CheckCircle2 className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">¡Datos registrados!</h3>
              <p className="text-slate-300 text-sm">
                Nuestra IA ya está analizando el mercado para ti. Te avisaremos en cuanto haya una propiedad perfecta.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
