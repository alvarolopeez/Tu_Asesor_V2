import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware principal de Tu Asesor V2.
 * 
 * HISTORIAL:
 * - [2026-05-11] Basic Auth activado con contraseña "Asesor135" para fase de desarrollo.
 * - [2026-05-14] Basic Auth DESACTIVADO — Web pública.
 * - [2026-05-14] Añadido bypass para /api/* (webhooks N8N, WhatsApp, Chatwoot).
 * 
 * SEGURIDAD API:
 * Los webhooks en /api/webhooks/* se protegen con API keys dentro de cada route handler,
 * NO con este middleware. Esto permite que servicios externos (N8N, Meta, Chatwoot)
 * envíen peticiones sin Basic Auth.
 */

export function middleware(req: NextRequest) {
  // Web pública — todo el tráfico pasa sin restricciones
  return NextResponse.next();
}

export const config = {
  // Solo interceptar rutas que podrían necesitar protección futura
  // (admin, API). Las rutas estáticas (_next, assets) nunca se interceptan.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.png|assets/).*)',
  ],
};
