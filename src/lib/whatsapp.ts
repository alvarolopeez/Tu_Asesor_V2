/**
 * Cliente unificado para enviar mensajes vía WhatsApp Cloud API (Meta Graph).
 *
 * Reemplaza las 3 copias previas (`sendWhatsAppMessage`) que vivían en
 * `appointmentService.ts`, `/api/webhooks/whatsapp/route.ts` y
 * `/api/admin/chat/send/route.ts`. Cualquier cambio de versión Graph API,
 * retry, logging o error handling se hace en este único módulo.
 *
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/messages
 */

const GRAPH_API_VERSION = 'v21.0';
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || '';
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';

export interface SendWhatsAppOptions {
  /**
   * Si es `true`, normaliza el teléfono: elimina `+` / `-` y antepone `34`
   * a números españoles de 9 dígitos. Usar cuando el caller no garantiza
   * formato E.164 (e.g. inputs de web pública).
   */
  normalize?: boolean;
  /** Prefijo de log para identificar el origen del envío. */
  logTag?: string;
}

/**
 * Normaliza un teléfono al formato esperado por Meta (sin `+`, con prefijo país).
 * Para móviles españoles de 9 dígitos (6/7/9) antepone `34`.
 */
function normalizePhone(raw: string): string {
  const stripped = raw.replace(/[+\-\s]/g, '');
  if (stripped.length === 9 && /^[679]/.test(stripped)) {
    return '34' + stripped;
  }
  return stripped;
}

/**
 * Envía un mensaje de texto plano por WhatsApp Cloud API.
 * Devuelve `true` si Meta responde 2xx, `false` en cualquier otro caso.
 */
export async function sendWhatsAppMessage(
  to: string,
  text: string,
  options: SendWhatsAppOptions = {}
): Promise<boolean> {
  const { normalize = false, logTag = '[WhatsApp Cloud API]' } = options;

  if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) {
    console.warn(`${logTag} ⚠️ Credenciales WhatsApp no configuradas (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID). Mensaje no transmitido.`);
    return false;
  }

  const recipient = normalize ? normalizePhone(to) : to;

  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipient,
          type: 'text',
          text: { body: text },
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`${logTag} Error Meta:`, response.status, errorBody);
      return false;
    }

    console.log(`${logTag} ✅ Mensaje enviado a ${recipient}`);
    return true;
  } catch (error) {
    console.error(`${logTag} Error de red:`, error);
    return false;
  }
}
