/**
 * GET /api/valuation/[id]
 *   Polling del resultado de una valoración por su id.
 *   Devuelve la fila completa de valuation_reports.
 *   El cliente hace polling hasta status='done'|'failed'.
 *
 * @created 2026-06-13 brief #016
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!SERVICE_ROLE_KEY) return NextResponse.json({ error: 'Config' }, { status: 503 });
  const { id: valuationId } = await params;

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data, error } = await db
    .from('valuation_reports')
    .select('*')
    .eq('id', valuationId)
    .single();

  if (error || !data) {
    return NextResponse.json({ status: 'not_found' }, { status: 404 });
  }
  return NextResponse.json(data);
}
