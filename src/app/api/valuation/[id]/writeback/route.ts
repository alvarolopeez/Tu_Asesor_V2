/**
 * POST /api/valuation/[id]/writeback
 *
 * Escribe el resultado de una valoración de vuelta al CRM:
 *   1. properties.features.precio_valoracion = rangos.mercado.precio
 *   2. leads.preferences.ia_valuation = {precio_mercado, fecha, valuation_id} (merge seguro)
 *      (NO toca agent_valuation — esa es autoridad humana que el asesor fija a mano).
 *
 * Requiere que la valoración tenga property_id.
 *
 * @created 2026-06-13 brief #016
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { ValuationResult } from '@/lib/valuation';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!SERVICE_ROLE_KEY) return NextResponse.json({ error: 'Config' }, { status: 503 });
  const { id: valuationId } = await params;

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: report } = await db
    .from('valuation_reports')
    .select('result,property_id,status')
    .eq('id', valuationId)
    .single();

  if (!report) return NextResponse.json({ error: 'Valoración no encontrada' }, { status: 404 });
  if (report.status !== 'done') return NextResponse.json({ error: 'La valoración aún no está lista' }, { status: 409 });
  if (!report.property_id) return NextResponse.json({ error: 'La valoración no está vinculada a un inmueble del CRM' }, { status: 400 });

  const result = report.result as ValuationResult | null;
  const propertyId = report.property_id as string;
  const precioMercado = result?.rangos?.mercado?.precio ?? 0;

  if (!precioMercado) return NextResponse.json({ error: 'No hay precio de mercado en el resultado' }, { status: 400 });

  // 1. Actualiza properties.features.precio_valoracion (merge JSONB)
  const { data: prop } = await db
    .from('properties')
    .select('features')
    .eq('id', propertyId)
    .single();

  const currentFeatures = (prop?.features as Record<string, unknown>) || {};
  await db
    .from('properties')
    .update({ features: { ...currentFeatures, precio_valoracion: precioMercado } })
    .eq('id', propertyId);

  // 2. Busca el lead vendedor con este property_id y actualiza preferences.ia_valuation
  const { data: sellerLead } = await db
    .from('leads')
    .select('id,preferences')
    .eq('type', 'seller')
    .eq('property_id', propertyId)
    .limit(1)
    .maybeSingle();

  if (sellerLead) {
    const currentPrefs = (sellerLead.preferences as Record<string, unknown>) || {};
    await db
      .from('leads')
      .update({
        preferences: {
          ...currentPrefs,
          ia_valuation: {
            precio_mercado: precioMercado,
            fecha: new Date().toISOString().split('T')[0],
            valuation_id: valuationId,
          },
        },
      })
      .eq('id', sellerLead.id);
  }

  return NextResponse.json({
    ok: true,
    property_id: propertyId,
    precio_mercado: precioMercado,
    seller_lead_updated: !!sellerLead,
  });
}
