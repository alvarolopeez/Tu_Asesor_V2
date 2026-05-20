import { NextResponse } from 'next/server';

/**
 * Estado del sistema de WhatsApp y chatbot.
 * Útil para el panel admin y debugging.
 * 
 * GET /api/webhooks/whatsapp/status
 * 
 * @agent IA/Automatización
 * @created 2026-05-14
 * @updated 2026-05-19 — Adaptado a Meta Cloud API
 */

export async function GET() {
  const hasVerifyToken = !!process.env.WHATSAPP_VERIFY_TOKEN;
  const hasAccessToken = !!process.env.WHATSAPP_ACCESS_TOKEN;
  const hasPhoneId = !!process.env.WHATSAPP_PHONE_NUMBER_ID;

  const configured = hasVerifyToken && hasAccessToken && hasPhoneId;

  return NextResponse.json({
    whatsapp: {
      provider: 'meta_cloud_api',
      configured,
      credentials: {
        verify_token: hasVerifyToken ? '✅ configurado' : '❌ falta',
        access_token: hasAccessToken ? '✅ configurado' : '❌ falta',
        phone_number_id: hasPhoneId ? '✅ configurado' : '❌ falta',
      },
    },
    chatbot: {
      provider: process.env.LLM_PROVIDER || 'keywords',
      model: process.env.LLM_MODEL || 'fallback (keywords)',
    },
    n8n: {
      api_key: process.env.N8N_API_KEY ? '✅ configurado' : '❌ falta',
    },
    timestamp: new Date().toISOString(),
  });
}
