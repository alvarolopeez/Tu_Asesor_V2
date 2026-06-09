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

/**
 * Envía un mensaje de PLANTILLA HSM aprobada por WhatsApp Cloud API.
 *
 * Necesario para contactar a destinatarios FUERA de la ventana de 24 h de
 * Meta (p.ej. confirmaciones de reserva online o avisos al asesor): Meta
 * rechaza el texto libre con código 131047, pero acepta plantillas aprobadas.
 *
 * @param templateName  nombre EXACTO de la plantilla aprobada en Meta.
 * @param bodyParams    valores en orden para las variables {{1}}, {{2}}, ...
 * @param languageCode  código de idioma de la plantilla (por defecto "es").
 *
 * Devuelve `true` si Meta responde 2xx. Si la plantilla aún no está aprobada,
 * Meta devuelve error y se registra (no rompe el flujo del caller).
 */
export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  bodyParams: string[] = [],
  options: SendWhatsAppOptions & { languageCode?: string } = {}
): Promise<boolean> {
  const { normalize = false, logTag = '[WhatsApp HSM]', languageCode = 'es' } = options;

  if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) {
    console.warn(`${logTag} ⚠️ Credenciales WhatsApp no configuradas. Plantilla no enviada.`);
    return false;
  }

  const recipient = normalize ? normalizePhone(to) : to;
  const components = bodyParams.length > 0
    ? [{ type: 'body', parameters: bodyParams.map((text) => ({ type: 'text', text: String(text) })) }]
    : [];

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
          type: 'template',
          template: {
            name: templateName,
            language: { code: languageCode },
            ...(components.length > 0 ? { components } : {}),
          },
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`${logTag} Error Meta (plantilla ${templateName}):`, response.status, errorBody);
      return false;
    }

    console.log(`${logTag} ✅ Plantilla ${templateName} enviada a ${recipient}`);
    return true;
  } catch (error) {
    console.error(`${logTag} Error de red:`, error);
    return false;
  }
}

/**
 * T1+T2 Brief #005 — Marca un mensaje entrante como leído en Meta Cloud API
 * (doble tick azul) y, opcionalmente, activa el typing indicator ("Paula está
 * escribiendo…") en la misma request.
 *
 * Fire-and-forget: no bloquea el flujo si Meta falla.
 *
 * @param messageId — wamid del mensaje del cliente (parsed.messageId del webhook)
 * @param withTyping — si true, incluye typing_indicator en el mismo payload (T2)
 */
export async function markWhatsAppRead(
  messageId: string,
  withTyping: boolean = false,
): Promise<boolean> {
  if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) {
    console.warn('[WhatsApp markRead] ⚠️ Credenciales no configuradas');
    return false;
  }
  try {
    const body: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    };
    if (withTyping) {
      body.typing_indicator = { type: 'text' };
    }
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
        },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) {
      const errorBody = await response.text();
      console.warn(
        '[WhatsApp markRead] Meta error',
        response.status,
        '— payload enviado:', JSON.stringify(body),
        '— respuesta Meta:', errorBody,
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn('[WhatsApp markRead] Error de red:', error);
    return false;
  }
}
