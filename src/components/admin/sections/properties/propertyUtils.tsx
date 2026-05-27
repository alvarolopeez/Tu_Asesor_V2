import type { JSX } from "react";

/**
 * Formatea un número como precio EUR sin decimales (formato español).
 * @example formatPrice(285000) → "285.000 €"
 */
export function formatPrice(price: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0
  }).format(price);
}

/**
 * Renderiza un badge de estado para la propiedad.
 * Estados conocidos: active | sold | rented | draft (fallback).
 */
export function getStatusBadge(status: string): JSX.Element {
  switch (status) {
    case 'active':
      return <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-xs font-bold uppercase">Activo</span>;
    case 'sold':
      return <span className="px-2.5 py-1 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-full text-xs font-bold uppercase">Vendido</span>;
    case 'rented':
      return <span className="px-2.5 py-1 bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded-full text-xs font-bold uppercase">Alquilado</span>;
    case 'draft':
    default:
      return <span className="px-2.5 py-1 bg-slate-500/10 text-slate-400 border border-slate-500/20 rounded-full text-xs font-bold uppercase">Borrador</span>;
  }
}
