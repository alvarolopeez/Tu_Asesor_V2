import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Proxy principal de Tu Asesor V2 (antes middleware — renombrado en Next 16).
 *
 * Web pública: todo el tráfico pasa sin restricciones.
 * Los webhooks en /api/webhooks/* se protegen con API keys en cada route handler
 * (no aquí), permitiendo que Meta / N8N / Chatwoot envíen peticiones sin auth global.
 */

export function proxy(req: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.png|assets/).*)',
  ],
};
