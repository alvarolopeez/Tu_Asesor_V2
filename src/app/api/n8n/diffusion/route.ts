import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { matchDemand } from '@/lib/diffusionMatch';

/**
 * Proxy server-side para la difusión IA de campañas WhatsApp vía n8n.
 *
 * SEGURIDAD MIGRADA (Fase 3 — 2026-05-22):
 * - El frontend ya NO calcula las coincidencias localmente ni expone datos confidenciales de leads compradores.
 * - Este endpoint recibe únicamente: property_id, price_margin, geo_radius.
 * - La lógica de cruce (Smart Matchmaker) se ejecuta enteramente en el servidor de forma segura.
 * - El payload enriquecido con los destinatarios confidenciales se envía internamente a n8n.
 * - La API Key de n8n se mantiene 100% protegida del lado del servidor.
 *
 * MATCHING SOBRE buyers_demands (Brief #007 T4 — 2026-06-10):
 * - La fuente canónica del perfil comprador es `buyers_demands` (JOIN con
 *   `leads` vía lead_id para funnel y datos geo). `leads.preferences` queda
 *   como metadata de origen, NO para matching (salvo polygons/geo).
 * - Funnel: se descartan solo leads `closed`/`lost` (visit_scheduled ENTRA).
 * - Presupuesto real: `max_budget` de la demand (antes se leía
 *   `preferences.maxPrice`, que la entrevista de Paula nunca escribía).
 * - El contrato del payload hacia n8n NO cambia (`Separar Destinatarios`
 *   espera los mismos campos).
 *
 * @updated 2026-06-10 — Brief #007 T4
 */

const N8N_API_KEY = process.env.N8N_API_KEY || '';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { webhookUrl, payload: clientPayload } = body;

    if (!webhookUrl || !clientPayload) {
      return NextResponse.json(
        { error: 'Missing webhookUrl or payload' },
        { status: 400 }
      );
    }

    const { property_id, price_margin = 10, geo_radius = 5 } = clientPayload;

    if (!property_id) {
      return NextResponse.json(
        { error: 'Missing property_id inside payload' },
        { status: 400 }
      );
    }

    console.log(`[N8N Diffusion Backend] Iniciando cruce seguro para propiedad ${property_id}`);

    // 1. Obtener datos del inmueble desde Supabase
    const { data: property, error: propError } = await supabase
      .from('properties')
      .select('*')
      .eq('id', property_id)
      .single();

    if (propError || !property) {
      console.error('[N8N Diffusion Backend] Error obteniendo propiedad:', propError);
      return NextResponse.json(
        { error: 'Property not found' },
        { status: 404 }
      );
    }

    // 2. Obtener TODAS las demands de compradores (fuente canónica del perfil).
    const { data: demands, error: demandsError } = await supabase
      .from('buyers_demands')
      .select('id, lead_id, name, phone, email, max_budget, property_type, rooms, bathrooms');

    if (demandsError || !demands) {
      console.error('[N8N Diffusion Backend] Error obteniendo buyers_demands:', demandsError);
      return NextResponse.json(
        { error: 'Failed to retrieve buyer demands' },
        { status: 500 }
      );
    }

    // 3. JOIN con leads por lead_id: funnel (status) + datos geo (preferences).
    const leadIds = demands
      .map((d: any) => d.lead_id)
      .filter((id: string | null): id is string => !!id);
    const leadsById = new Map<string, any>();
    if (leadIds.length > 0) {
      const { data: linkedLeads, error: leadsError } = await supabase
        .from('leads')
        .select('id, name, phone, email, status, preferences')
        .in('id', leadIds);
      if (leadsError) {
        console.error('[N8N Diffusion Backend] Error obteniendo leads vinculados:', leadsError);
        return NextResponse.json(
          { error: 'Failed to retrieve linked leads' },
          { status: 500 }
        );
      }
      (linkedLeads || []).forEach((l: any) => leadsById.set(l.id, l));
    }

    // 4. Ejecutar el matching puro (ver src/lib/diffusionMatch.ts).
    // Las coordenadas viven en el jsonb `features` y pueden venir como string;
    // las forzamos a número para que la geometría (Haversine / point-in-polygon)
    // no opere sobre strings. (#5: endurecido 2026-06-04.)
    const propLatNum = Number(property.features?.latitude);
    const propLngNum = Number(property.features?.longitude);
    const propertyParams = {
      price: Number(property.price),
      propertyType: property.features?.propertyType,
      rooms: Number(property.features?.rooms || 0),
      baths: Number(property.features?.baths || 0),
      lat: Number.isFinite(propLatNum) ? propLatNum : undefined,
      lng: Number.isFinite(propLngNum) ? propLngNum : undefined,
    };

    const matches = demands.filter((demand: any) => {
      const lead = demand.lead_id ? leadsById.get(demand.lead_id) || null : null;
      const result = matchDemand({
        demand,
        lead,
        property: propertyParams,
        priceMargin: price_margin,
        geoRadius: geo_radius,
      });
      if (!result.match) return false;
      if (result.warnings.includes('no_lead')) {
        console.warn(`[diffusion] demand ${demand.id} sin lead_id, incluida sin filtro de funnel/geo`);
      }
      if (result.warnings.includes('no_budget')) {
        console.warn(`[diffusion] demand ${demand.id} sin presupuesto, incluida`);
      }
      return true;
    });

    console.log(`[N8N Diffusion Backend] Cruce seguro completado. Encontradas ${matches.length} coincidencias.`);

    // 5. Construir payload enriquecido seguro (oculto del navegador).
    //    Mismo contrato que antes: el workflow n8n no se toca.
    const richPayload = {
      event: "real_estate_ai_diffusion",
      property: {
        id: property.id,
        title: property.title,
        price: property.price,
        address: property.features?.address,
        rooms: property.features?.rooms,
        baths: property.features?.baths,
        sqm: property.features?.sqm,
        // Añadidos 2026-05-31 para alimentar la variable {{5}} (planta+ascensor)
        // de la plantilla HSM `nueva_propiedad_match`.
        floor: property.features?.floor,
        elevator: property.features?.elevator,
      },
      filters: {
        priceMargin: price_margin,
        geoRadius: geo_radius
      },
      recipients: matches.map((m: any) => {
        const lead = m.lead_id ? leadsById.get(m.lead_id) || null : null;
        return {
          lead_id: m.lead_id || null,
          name: lead?.name || m.name,
          phone: lead?.phone || m.phone,
          email: lead?.email || m.email,
          maxPricePreference: m.max_budget
        };
      })
    };

    // 6. Reenviar payload enriquecido al Webhook de n8n
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${N8N_API_KEY}`,
      },
      body: JSON.stringify(richPayload),
    }).catch((err) => {
      console.warn('[N8N Diffusion Proxy] HTTP post failed:', err.message);
      return { ok: false, status: 500, statusText: 'Offline/Simulated' } as Response;
    });

    // 7. Registrar en BD el log de auditoría completo con el payload completo
    await supabase.from('n8n_webhook_logs').insert({
      webhook_name: "smart_ai_diffusion",
      source: "server_proxy",
      payload: richPayload,
      response_status: response.status || 200,
      error_message: response.ok ? null : `Error al invocar webhook externo de n8n: ${response.statusText}`
    });

    return NextResponse.json({
      success: response.ok,
      status: response.status,
      statusText: response.statusText || 'OK',
      match_count: matches.length
    });
  } catch (error) {
    console.error('[N8N Diffusion Proxy] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
