# Executor Brief #005 — WhatsApp UX (read + typing) + Cancelación de visitas con guardarraíles

**Fecha**: 2026-06-09
**Origen**:
- Tras E2E del brief #004 Paula funciona muy bien. Pero detectamos:
  1. La conversación en WhatsApp NUNCA muestra "doble tick azul" — Meta no recibe el read receipt.
  2. NO hay typing indicator ("Paula está escribiendo…") — el cliente ve respuesta seca tras 5-8s de silencio.
  3. Cuando el usuario pidió "cancelar mi cita", Paula escaló a Álvaro porque NO sabe cancelar. Decisión: añadir cancelación con guardarraíles serios.

## Contexto crítico para el ejecutor

- Arranca con `git log -3` y `git status`. Último commit esperado del brief #004 + el commit de este brief.
- Lee `AGENTS.md`, `docs/sync/SYNC_AI.md` recientes, `EXECUTOR-BRIEF-003.md` y `EXECUTOR-BRIEF-004.md` para no repetir trabajo.
- **gitnexus_impact obligatorio** antes de editar cualquier símbolo. HIGH/CRITICAL → pausa y avisa.
- **gitnexus_detect_changes** antes de cada commit.
- Build debe pasar: `npm run build`.
- Tests deben pasar: `npm test`.
- Commits firmados `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`.

## Decisiones ya tomadas por Álvaro

1. **Sí añadir cancelación al bot, con los 5 guardarraíles descritos en T3**. El miedo a "borrar todo el calendario" se descartó porque el filtro por `lead_id` (RLS) impide tocar citas ajenas.
2. **Soft delete** (UPDATE status='cancelled' + cancelled_at + cancelled_by + cancellation_reason). NUNCA DELETE.
3. **Ventana mínima 4h**: si la cita es a <4h vista → bot NO cancela, escala a Álvaro.
4. **Notificación inmediata a Álvaro** tras cada cancelación (igual mecanismo que confirmación de cita: `sendWhatsAppMessage` libre, NO plantilla HSM — los mensajes spontáneos a Álvaro van como texto libre porque la ventana de 24h con Álvaro está abierta).
5. **Flujo proactivo**: el bot debe ofrecer REAGENDAR antes de cancelar.

---

## T1 — Read receipt (doble tick azul)

### Qué
Cuando llega un mensaje del cliente al webhook, marcarlo como leído en Meta para que el cliente vea el doble tick azul.

### Cómo
Crear nueva función en `src/lib/whatsapp.ts`:

```ts
/**
 * Marca un mensaje entrante como leído en Meta Cloud API.
 * Devuelve los dos ticks azules en el WhatsApp del cliente.
 * Fire-and-forget: no bloquea el flujo si Meta falla.
 *
 * @param messageId — wamid del mensaje del cliente (parsed.messageId del webhook)
 * @param withTyping — si true, también envía typing indicator (T2)
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
      console.warn('[WhatsApp markRead] Meta error:', response.status, errorBody);
      return false;
    }
    return true;
  } catch (error) {
    console.warn('[WhatsApp markRead] Error de red:', error);
    return false;
  }
}
```

### Integración
En `src/app/api/webhooks/whatsapp/route.ts`, después de `parseMetaPayload(body)` y antes de cualquier procesamiento pesado:

```ts
if (parsed?.messageId) {
  void markWhatsAppRead(parsed.messageId, true).catch(() => {});
  // ↑ fire-and-forget — no esperamos respuesta para no retrasar el flujo
}
```

Pasar `true` en `withTyping` para integrar T2 en la misma llamada (Meta soporta combinar read + typing en una sola request).

### Criterio de aceptación
- E2E: mando un WhatsApp a Paula. En mi WhatsApp veo los dos ticks azules en cuanto el webhook lo procesa (<1s).
- No bloqueante: si Meta devuelve 4xx/5xx, el flujo del chatbot continúa normal.

---

## T2 — Typing indicator ("Paula está escribiendo…")

### Qué
Tras marcar como leído, mostrar "escribiendo…" mientras el LLM piensa.

### Cómo
**Ya incluido en T1** mediante el flag `withTyping: true` de `markWhatsAppRead`. El payload combinado es:
```json
{
  "messaging_product": "whatsapp",
  "status": "read",
  "message_id": "wamid.xxx",
  "typing_indicator": { "type": "text" }
}
```

Duración automática: hasta 25s o hasta que llegue el mensaje real (lo que ocurra primero). Como Gemini Flash responde en 2-8s, el indicador desaparece cuando Paula manda la respuesta.

### Si Meta devuelve error 400 sobre `typing_indicator`
Significa que tu versión de Cloud API aún no soporta el campo (poco probable en v21.0 pero por si acaso). En ese caso:
1. Mantén el call de read (sin typing).
2. Añade un `await new Promise(r => setTimeout(r, 800))` antes de mandar la respuesta del bot — simula latencia humana mínima.
3. Documenta en SYNC_AI.md que `typing_indicator` falló y por qué.

### Criterio de aceptación
- E2E: mando WhatsApp a Paula. Veo "Paula está escribiendo…" durante el tiempo que tarda en pensar la respuesta.

---

## T3 — Cancelación de visitas con 5 guardarraíles

### Schema BD (migration necesaria)

Crear migration `add_appointment_cancellation_fields`:

```sql
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS cancelled_by text NULL,
  ADD COLUMN IF NOT EXISTS cancellation_reason text NULL;

-- Constraint: cancelled_by solo puede ser uno de estos valores
ALTER TABLE appointments
  ADD CONSTRAINT appointments_cancelled_by_check
  CHECK (cancelled_by IS NULL OR cancelled_by IN ('client_chatbot', 'client_web', 'advisor_manual', 'system'));

-- Índice para el rate limit (consultar cancelaciones recientes por lead)
CREATE INDEX IF NOT EXISTS idx_appointments_cancelled_lead_recent
  ON appointments (lead_id, cancelled_at DESC)
  WHERE status = 'cancelled';

COMMENT ON COLUMN appointments.cancelled_at IS 'T3 Brief #005 — timestamp de cancelación (NULL si activa)';
COMMENT ON COLUMN appointments.cancelled_by IS 'T3 Brief #005 — origen: client_chatbot|client_web|advisor_manual|system';
COMMENT ON COLUMN appointments.cancellation_reason IS 'T3 Brief #005 — motivo opcional dado por el cliente';
```

Aplicar vía `mcp__supabase__apply_migration` o `supabase db push`.

### Intent y handler

#### 1. Detectar el intent
Añadir intent `cancel_visit` al chatbot. En `systemPrompt.md`, sección de INTENTS, añadir:

```
- cancel_visit: el cliente pide cancelar/anular/eliminar una visita YA confirmada.
  Frases típicas: "cancela mi visita", "quiero anular la cita del miércoles",
  "ya no puedo ir", "borra la cita". NO confundir con reagendar.
```

Y en el JSON de respuesta esperada, asegurarse de que `intent` puede tomar este valor.

#### 2. Handler `tryHandleCancelVisit` en `src/lib/chatbot/scheduling.ts`

Crear función nueva con ESTA lógica de flujo (la decisión de Álvaro es estricta):

```ts
/**
 * Maneja la intención de cancelar una visita. Implementa los 5 guardarraíles
 * del Brief #005:
 *  G1. Filtro por phone/lead_id (no toca citas ajenas).
 *  G2. Soft delete + auditoría completa.
 *  G3. Ventana mínima 4h — si la visita es a <4h, escala a Álvaro.
 *  G4. Confirmación explícita en dos turnos (ofrecer reagendar primero).
 *  G5. Notificación inmediata a Álvaro tras ejecutar cancel.
 *  Extra: rate limit de 3 cancelaciones/24h por lead → escala.
 */
export async function tryHandleCancelVisit(input: SchedulingHookInput): Promise<SchedulingHookResult | null> {
  // Solo entra si el intent extraído es cancel_visit
  if (input.intent !== 'cancel_visit') return null;

  const leadId = await getLeadIdFromConversation(input.conversationId);
  if (!leadId) return null;

  // Rate limit: ¿más de 3 cancelaciones en las últimas 24h?
  const recentCancels = await countRecentCancellations(leadId, 24);
  if (recentCancels >= 3) {
    await notifyAdvisor(
      `🚨 Lead ${leadId} ha intentado cancelar ${recentCancels} veces en 24h. Posible abuso. Conversación ${input.conversationId}.`
    );
    return {
      response: 'He notificado a Álvaro de tu solicitud. Te contacta él directamente.',
      shouldEscalate: true,
      intent: 'cancel_visit_rate_limited',
    };
  }

  // Buscar próxima cita futura del lead.
  const { data: future } = await supabaseAdmin
    .from('appointments')
    .select('id, scheduled_at, property_id, title, status')
    .eq('lead_id', leadId)
    .eq('status', 'pending') // o lo que sea "activa" — verificar valores reales
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(1);

  if (!future || future.length === 0) {
    return {
      response: 'No encuentro ninguna visita futura tuya. Si crees que es un error, escríbeme y te conecto con Álvaro.',
      shouldEscalate: false,
      intent: 'cancel_visit_none',
    };
  }

  const apt = future[0];
  const scheduledAt = new Date(apt.scheduled_at);
  const hoursToVisit = (scheduledAt.getTime() - Date.now()) / 3_600_000;

  // G3: ventana mínima 4h
  if (hoursToVisit < 4) {
    await notifyAdvisor(
      `🚨 Lead ${leadId} pide cancelar visita programada en <4h (${apt.scheduled_at}). Le he derivado a ti.`
    );
    return {
      response:
        `Tu visita es en menos de 4 horas. Para cancelar con tan poco margen necesito que Álvaro lo gestione directamente — ya le he avisado y te escribirá en breve. Disculpa las molestias.`,
      shouldEscalate: true,
      intent: 'cancel_visit_too_close',
    };
  }

  // Comprobar estado del flujo conversacional — ¿ya estamos en una confirmación de cancelación?
  const meta = await getConversationMetadata(input.conversationId);
  const cancelFlow = meta?.cancel_flow as { step: 'offered_reschedule' | 'awaiting_confirm'; appointmentId: string } | null;

  // FASE A — primera vez: ofrecer reagendar
  if (!cancelFlow) {
    await setConversationMetadata(input.conversationId, {
      cancel_flow: { step: 'offered_reschedule', appointmentId: apt.id },
    });
    return {
      response:
        `Tienes una visita el ${formatDateHuman(scheduledAt)} a las ${formatTime(scheduledAt)} para ${apt.title || 'el inmueble'}. ¿Prefieres reagendar a otro día o cancelarla del todo?`,
      shouldEscalate: false,
      intent: 'cancel_visit_offered_reschedule',
    };
  }

  // FASE B — el cliente eligió. Detectar respuesta.
  const userLower = input.userMessage.toLowerCase();
  const wantsReschedule = /(reagend|cambiar|mover|otro\s*d[ií]a|otro\s*horario)/i.test(userLower);
  const wantsCancel = /(cancel|anular|no\s*ir|ya no|elimin|borrar)/i.test(userLower);

  if (wantsReschedule && !wantsCancel) {
    // Limpiar flag y delegar al flujo normal de scheduling.
    await patchConversationMetadata(input.conversationId, { cancel_flow: null });
    // Devolver null para que tryHandleScheduleVisit lo coja en el mismo turno.
    return null;
  }

  // FASE C — confirmar cancelación si aún no confirmado.
  if (cancelFlow.step === 'offered_reschedule') {
    if (!wantsCancel) {
      return {
        response: '¿Confirmas que quieres cancelarla? Responde "sí" para anularla o cuéntame cómo prefieres seguir.',
        shouldEscalate: false,
        intent: 'cancel_visit_awaiting_confirm',
      };
    }
    await setConversationMetadata(input.conversationId, {
      cancel_flow: { step: 'awaiting_confirm', appointmentId: apt.id },
    });
    return {
      response: `Vale. ¿Me cuentas brevemente el motivo? (opcional, una frase me vale). O responde solo "sí" para cancelarla sin más detalle.`,
      shouldEscalate: false,
      intent: 'cancel_visit_awaiting_confirm',
    };
  }

  // FASE D — ejecutar cancel.
  const reason = input.userMessage.trim().slice(0, 280);
  const { error: updErr } = await supabaseAdmin
    .from('appointments')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by: 'client_chatbot',
      cancellation_reason: reason || null,
    })
    .eq('id', cancelFlow.appointmentId)
    .eq('lead_id', leadId);  // G1: doble filtro de seguridad

  if (updErr) {
    console.error('[cancel] update failed:', updErr);
    return {
      response: 'Ha habido un problema cancelando la cita. Aviso a Álvaro para que lo gestione.',
      shouldEscalate: true,
      intent: 'cancel_visit_error',
    };
  }

  // Limpiar flag.
  await patchConversationMetadata(input.conversationId, { cancel_flow: null });

  // G5: notificar a Álvaro.
  await notifyAdvisorOfCancellation({
    appointmentId: cancelFlow.appointmentId,
    leadId,
    scheduledAt: apt.scheduled_at,
    title: apt.title || '',
    reason: reason || '(sin motivo)',
  });

  return {
    response: `Hecho. He cancelado tu visita del ${formatDateHuman(scheduledAt)}. Si cambias de idea o quieres ver el inmueble más adelante, dímelo y lo agendamos de nuevo.`,
    shouldEscalate: false,
    intent: 'cancel_visit_done',
  };
}
```

#### 3. Integración en el engine
En `src/lib/chatbot/engine.ts`, donde se invoca `tryHandleScheduleVisit`, añadir antes (porque cancel tiene precedencia sobre nueva cita):

```ts
const cancelResult = await tryHandleCancelVisit({ ...input, intent: result.intent });
if (cancelResult) return cancelResult;
```

### Helpers necesarios

- `getLeadIdFromConversation(conversationId)` — usar el helper existente `getConversationLeadInfo`.
- `countRecentCancellations(leadId, hours)` — query `appointments WHERE lead_id=? AND status='cancelled' AND cancelled_at > NOW() - INTERVAL 'X hours'`.
- `notifyAdvisorOfCancellation({...})` — ver T4.

### Tests obligatorios

Crear `src/lib/chatbot/__tests__/tryHandleCancelVisit.test.ts` con al menos:
1. Lead sin citas futuras → respuesta amistosa.
2. Visita a >4h → ofrece reagendar.
3. Visita a <4h → escala con `shouldEscalate: true`.
4. Usuario eligió "reagendar" → devuelve `null` (delega).
5. Usuario eligió "cancelar" → cancel_flow avanza.
6. Usuario confirma con motivo → UPDATE ejecutado.
7. Rate limit (3+ cancels en 24h) → escala.
8. G1: intentar cancelar cita de OTRO lead — la query no la encuentra.

Mock Supabase con stubs aquí.

### Criterio de aceptación
- E2E: "cancela mi cita" → bot pregunta reagendar/cancelar → "cancelar" → bot pide motivo → "no puedo, trabajo" → bot confirma cancelación y notifica a Álvaro.
- BD: `appointments.status='cancelled'`, `cancelled_at` poblado, `cancelled_by='client_chatbot'`, `cancellation_reason='no puedo, trabajo'`.
- Visita a <4h: bot escala SIN cancelar.
- Visita inexistente: respuesta amable sin error.

---

## T4 — Notificación a Álvaro tras cancelación

### Qué
Cada cancelación dispara un WhatsApp a Álvaro (`ADVISOR_WHATSAPP_PHONE = 34697223944`).

### Cómo
Crear helper `notifyAdvisorOfCancellation` en `src/lib/chatbot/scheduling.ts` (o `src/lib/notifications.ts` si prefieres separar):

```ts
async function notifyAdvisorOfCancellation(params: {
  appointmentId: string;
  leadId: string;
  scheduledAt: string;
  title: string;
  reason: string;
}): Promise<void> {
  const advisorPhone = process.env.ADVISOR_WHATSAPP_PHONE;
  if (!advisorPhone) {
    console.warn('[notify] ADVISOR_WHATSAPP_PHONE no configurado');
    return;
  }

  // Resolver nombre del lead para el mensaje.
  const { data: lead } = await supabaseAdmin
    .from('leads')
    .select('name, phone')
    .eq('id', params.leadId)
    .single();

  const summary =
    `🟠 *Cancelación de visita*\n\n` +
    `Cliente: ${lead?.name || 'sin nombre'} (${lead?.phone || '?'})\n` +
    `Visita: ${params.title}\n` +
    `Fecha: ${formatDateHuman(new Date(params.scheduledAt))} a las ${formatTime(new Date(params.scheduledAt))}\n` +
    `Motivo: ${params.reason}\n\n` +
    `Cancelado por el cliente vía Paula. ID: ${params.appointmentId}`;

  await sendWhatsAppMessage(advisorPhone, summary, { logTag: '[notify cancel]' });
}
```

**¿HSM template o mensaje libre?**
- Si la conversación con Álvaro está activa (ventana 24h abierta → habitualmente sí, ya tienes chats activos con tu propio número) → mensaje libre con `sendWhatsAppMessage` directo. Esto es lo que ya hace el código existente para escalaciones.
- Si NO: necesitarías plantilla HSM. Pero para Álvaro la ventana suele estar abierta porque tu chat con la cuenta business es continuo. Empezamos con libre — si Meta lo rechaza con error de "outside 24h window", añadimos fallback a plantilla HSM `aviso_alvaro` con los mismos 2 params del existente.

### Criterio de aceptación
- Tras cancelación E2E: WhatsApp recibido en `34697223944` con el formato del summary.
- Si la ventana 24h está cerrada: el ejecutor documenta en SYNC_AI.md y propone fix (plantilla HSM dedicada).

---

## Orden recomendado de ejecución

1. **Migration BD** primero (`add_appointment_cancellation_fields`). Verificar en Supabase MCP.
2. **T1 + T2** — read + typing (función + integración en webhook). Un solo commit `feat(whatsapp): read receipts y typing indicator`. Esto desbloquea testing UX inmediato.
3. **T4** — helper `notifyAdvisorOfCancellation` aislado. Commit `feat(notifications): helper de notificación de cancelación al asesor`.
4. **T3** — handler `tryHandleCancelVisit` + integración en engine + tests + intent en systemPrompt. Commit `feat(chatbot): cancelación de visitas con guardarraíles`.

Un commit por bloque. Mensajes descriptivos (NO "arreglos varios", como pasó en el brief #004).

## Verificación final

1. `npm run build` → verde.
2. `npm test` → verde (incluir nuevos tests de cancelación).
3. `gitnexus_detect_changes()` → confirma símbolos tocados.
4. Actualizar `docs/sync/SYNC_AI.md` con entradas por T completada.
5. `git push origin master`.

## Qué NO hacer

- NO hacer `DELETE` real sobre `appointments`. Solo UPDATE a `status='cancelled'`.
- NO permitir cancelar citas de otro lead (doble filtro `eq('id', appointmentId).eq('lead_id', leadId)` SIEMPRE).
- NO eliminar la ventana de 4h (decisión de Álvaro, no negociable).
- NO saltarse el flujo de "ofrecer reagendar primero" — Álvaro quiere salvar visitas, no perderlas.
- NO mandar la notificación a Álvaro vía plantilla HSM si la ventana 24h está abierta — es spam innecesario y consume cuota de plantillas.
- NO añadir el typing indicator como llamada SEPARADA (combinar con read en una sola request a Meta).

## Si algo te bloquea

Reporta en `docs/sync/SYNC_AI.md` y para. Mejor parar y preguntar que dejar arreglos a medias.

## Decisiones diferidas para futuros briefs

- Cancelación desde el dashboard CRM (cuando Álvaro cancela manualmente) — fuera de scope de este brief. Si se implementa, el `cancelled_by='advisor_manual'`.
- UI en el dashboard para ver cancelaciones por motivo / por lead — fuera de scope.
- Recordatorio 24h antes de la visita (para reducir no-shows) — futuro brief.
