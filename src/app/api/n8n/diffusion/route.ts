import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy server-side para la difusión IA de campañas WhatsApp vía n8n.
 * 
 * SEGURIDAD: La API Key de n8n NUNCA se expone al cliente.
 * El frontend llama a este endpoint; este endpoint reenvía al webhook de n8n
 * con la clave almacenada en process.env.N8N_API_KEY (server-only).
 * 
 * @created 2026-05-22 — Auditoría Supervisor (H1)
 */

const N8N_API_KEY = process.env.N8N_API_KEY || '';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { webhookUrl, payload } = body;

    if (!webhookUrl || !payload) {
      return NextResponse.json(
        { error: 'Missing webhookUrl or payload' },
        { status: 400 }
      );
    }

    // Forward to n8n with server-side API key
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${N8N_API_KEY}`,
      },
      body: JSON.stringify(payload),
    }).catch((err) => {
      console.warn('[N8N Diffusion Proxy] HTTP post failed:', err.message);
      return { ok: false, status: 500, statusText: 'Offline/Simulated' } as Response;
    });

    return NextResponse.json({
      success: response.ok,
      status: response.status,
      statusText: response.statusText || 'OK',
    });
  } catch (error) {
    console.error('[N8N Diffusion Proxy] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
