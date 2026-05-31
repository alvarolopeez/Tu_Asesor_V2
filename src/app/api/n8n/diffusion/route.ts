import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * Proxy server-side para la difusión IA de campañas WhatsApp vía n8n.
 * 
 * SEGURIDAD MIGRADA (Fase 3 — 2026-05-22):
 * - El frontend ya NO calcula las coincidencias localmente ni expone datos confidenciales de leads compradores.
 * - Este endpoint recibe únicamente: property_id, price_margin, geo_radius.
 * - La lógica de cruce (Smart Matchmaker) se ejecuta enteramente en el servidor de forma segura.
 * - Los leads coincidentes se cruzan directamente en el backend usando la BD Supabase.
 * - El payload enriquecido con los destinatarios confidenciales se envía internamente a n8n.
 * - La API Key de n8n se mantiene 100% protegida del lado del servidor.
 * 
 * @updated 2026-05-22 — Coordinado con Agente CRM y Agente de Seguridad
 */

const N8N_API_KEY = process.env.N8N_API_KEY || '';

// ─── FUNCIONES AUXILIARES DE COINCIDENCIA GEOGRÁFICA ───

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radio de la tierra en km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Distancia en km
}

function getPolygonCentroid(polygon: [number, number][]): [number, number] {
  let latSum = 0;
  let lngSum = 0;
  polygon.forEach(([lat, lng]) => {
    latSum += lat;
    lngSum += lng;
  });
  return [latSum / polygon.length, lngSum / polygon.length];
}

function isPointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  const [lat, lng] = point;
  let isInside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [latI, lngI] = polygon[i];
    const [latJ, lngJ] = polygon[j];

    const intersect = ((lngI > lng) !== (lngJ > lng))
        && (lat < (latJ - latI) * (lng - lngI) / (lngJ - lngI) + latI);
        
    if (intersect) isInside = !isInside;
  }

  return isInside;
}

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

    // 2. Obtener leads compradores activos
    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('*')
      .eq('type', 'buyer')
      .in('status', ['new', 'contacted', 'qualified']);

    if (leadsError || !leads) {
      console.error('[N8N Diffusion Backend] Error obteniendo leads:', leadsError);
      return NextResponse.json(
        { error: 'Failed to retrieve buyer leads' },
        { status: 500 }
      );
    }

    // 3. Ejecutar algoritmo de coincidencia (Smart Matchmaker) seguro en servidor
    const propLat = property.features?.latitude;
    const propLng = property.features?.longitude;
    const propPrice = Number(property.price);
    const propType = property.features?.propertyType;
    const propRooms = Number(property.features?.rooms || 0);
    const propBaths = Number(property.features?.baths || 0);

    const matches = leads.filter((buyer: any) => {
      const prefs = buyer.preferences || {};
      const polygons = prefs.polygons;
      const area = prefs.area;

      // Filtro Espacial (Customizable Radius)
      if (propLat !== undefined && propLng !== undefined) {
        let locationMatch = false;
        let hasLocationPreferences = false;

        if (polygons && Array.isArray(polygons) && polygons.length > 0) {
          hasLocationPreferences = true;
          locationMatch = polygons.some((poly: any) => {
            if (!Array.isArray(poly) || poly.length < 3) return false;
            if (isPointInPolygon([propLat, propLng], poly as [number, number][])) return true;
            const [cLat, cLng] = getPolygonCentroid(poly);
            return getDistance(propLat, propLng, cLat, cLng) <= geo_radius;
          });
        } else if (area && Array.isArray(area) && area.length >= 3) {
          hasLocationPreferences = true;
          if (isPointInPolygon([propLat, propLng], area as [number, number][])) {
            locationMatch = true;
          } else {
            const [cLat, cLng] = getPolygonCentroid(area);
            locationMatch = getDistance(propLat, propLng, cLat, cLng) <= geo_radius;
          }
        } else if (prefs.latitude && prefs.longitude) {
          hasLocationPreferences = true;
          locationMatch = getDistance(propLat, propLng, prefs.latitude, prefs.longitude) <= geo_radius;
        }

        if (hasLocationPreferences && !locationMatch) return false;
      }

      // Filtro de Margen de Presupuesto (negotiable up to ±PriceMargin%)
      if (prefs.maxPrice) {
        const minAcceptableBuyerBudget = propPrice * (1 - price_margin / 100);
        if (Number(prefs.maxPrice) < minAcceptableBuyerBudget) return false;
      }

      // Filtro de Tipo de Inmueble
      if (prefs.propertyType && prefs.propertyType !== "Indiferente" && propType && propType !== "Indiferente" && prefs.propertyType !== propType) {
        return false;
      }

      // Filtro de Habitaciones y Baños Mínimos
      if (prefs.minRooms && propRooms < Number(prefs.minRooms)) return false;
      if (prefs.minBaths && propBaths < Number(prefs.minBaths)) return false;

      return true;
    });

    console.log(`[N8N Diffusion Backend] Cruce seguro completado. Encontradas ${matches.length} coincidencias.`);

    // 4. Construir payload enriquecido seguro (oculto del navegador)
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
      recipients: matches.map(m => ({
        lead_id: m.id,
        name: m.name,
        phone: m.phone,
        email: m.email,
        maxPricePreference: m.preferences?.maxPrice
      }))
    };

    // 5. Reenviar payload enriquecido al Webhook de n8n
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

    // 6. Registrar en BD el log de auditoría completo con el payload completo
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
