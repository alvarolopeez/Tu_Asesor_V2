'use client'

import { useState, useEffect } from 'react'
import BuyerRegistrationModal from '@/components/BuyerRegistrationModal'

/**
 * Wrapper que auto-abre el BuyerRegistrationModal tras 3s en la home page.
 * Usa localStorage para no repetir el popup si ya fue cerrado.
 * Sustituye al antiguo BuyerLeadPopup (componente eliminado por duplicidad).
 */
export default function HomeBuyerPopup() {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const hasSeenPopup = localStorage.getItem('buyerPopupShown')
    if (hasSeenPopup) return

    const timer = setTimeout(() => setIsOpen(true), 3000)
    return () => clearTimeout(timer)
  }, [])

  const handleClose = () => {
    setIsOpen(false)
    localStorage.setItem('buyerPopupShown', 'true')
  }

  return <BuyerRegistrationModal isOpen={isOpen} onClose={handleClose} />
}
