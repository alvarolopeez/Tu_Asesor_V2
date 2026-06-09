# Executor Brief #006 — Cancelación bulletproof + diagnóstico typing/read

**Fecha**: 2026-06-09
**Origen**: E2E real del brief #005. Dos problemas claros:

1. **Cancelación no funciona**. El LLM (Gemini Flash) NO clasifica como `cancel_visit`. Mira los `intent_detected` reales del test del usuario:

   | Hora | Mensaje | intent que devolvió Paula | Debería ser |
   |---|---|---|---|
   | 09:25 | "Quiero cancelar la visita al piso" | `schedule_visit` | `cancel_visit` |
   | 09:26 | "No cancela mejor" | `schedule_visit` | `cancel_visit` |
   | 09:27 | "Quiero cancelar la cita que hemos agendado para el miércoles a las 14" | `schedule_visit` | `cancel_visit` |
   | 08:40 | "Quiero cancelar la cita no voy a poder ir" | `ESCALATE` | `cancel_visit` |

   Resultado: `tryHandleCancelVisit` nunca se invoca. Peor: en 08:40 Paula dijo "He anotado la cancelación" pero la cita siguió `pending` en BD. **Falsa confirmación a un cliente** — riesgo grave.

2. **No aparece doble tick azul ni "Paula está escribiendo…"** en producción tras el brief #005. La función `markWhatsAppRead` existe pero algo falla silenciosamente (catch vacío).

## Contexto crítico para el ejecutor

- Arranca con `git log -3` y `git status`. Último commit esperado: el de este brief.
- Lee `AGENTS.md`, `EXECUTOR-BRIEF-005.md`, `docs/sync/SYNC_AI.md` recientes.
- `gitnexus_impact` obligatorio antes de editar cualquier símbolo.
- `gitnexus_detect_changes()` antes de commit.
- Build verde, tests verdes.
- Commits firmados.

## Decisiones ya tomadas por Álvaro

1. **Capa A + Capa B obligatorias** para clasificación. NO confiar solo en el system prompt — añadir backstop en código.
2. **Para typing**: si tras aislar se confirma que `typing_indicator` es el problema, quitarlo y dejar solo read receipts. NO es bloqueante.
3. Las 2 citas pending del test (`+34697223944`) las limpia Álvaro vía SQL directo en BD ANTES de empujar este brief — no hay que tocarlas desde código.

---

## T1 — Clasificación bulletproof de `cancel_visit` (CRÍTICO)

### Capa A — Refuerzo del system prompt

En `src/lib/chatbot/systemPrompt.md`, sección "INTENTS DETECTADOS", inmediatamente DESPUÉS de la entrada `5. cancel_visit`, añadir el bloque de ejemplos few-shot:

```markdown
## EJEMPLOS DE CLASIFICACIÓN PARA cancel_visit vs schedule_visit

Sigue estos patrones **literalmente**:

- "Quiero cancelar mi visita" → cancel_visit
- "Anula la cita del miércoles" → cancel_visit
- "Cancela mejor" → cancel_visit
- "No voy a poder ir" → cancel_visit
- "Ya no puedo el miércoles" → cancel_visit
- "Borra la cita" → cancel_visit
- "No me viene bien la cita, cancélala" → cancel_visit

EN CAMBIO:
- "Cambia la hora a las 16h" → schedule_visit (es REAGENDAR, no cancelar)
- "Quiero ver el piso otro día" → schedule_visit
- "Pásame la cita al jueves" → schedule_visit

REGLA DE ORO: si el cliente quiere ELIMINAR/ANULAR/NO ACUDIR → cancel_visit.
Si quiere CAMBIAR/MOVER/REAGENDAR → schedule_visit.

Cuando devuelvas `cancel_visit`, en `response` di solo una frase neutra como "Un momento, déjame revisar tu cita." — NUNCA digas "He cancelado" ni "Anotada la cancelación", porque el sistema gestiona los guardarraíles y aún no ha ejecutado nada.
```

### Capa B — Backstop regex en `engine.ts`

En `src/lib/chatbot/engine.ts`, INMEDIATAMENTE después de obtener `result` del LLM y ANTES de la sección `5a. T3 Brief #005 — cancel_visit`:

```ts
// T1 Brief #006 — Backstop: si el cliente dice CLARAMENTE cancelar/anular/no voy a poder,
// forzamos intent='cancel_visit' aunque el LLM lo clasifique como schedule_visit o ESCALATE.
// Esto garantiza que tryHandleCancelVisit se invoca aunque Gemini falle.
const CANCEL_BACKSTOP_REGEX =
  /\b(cancel(ar|a|o)|anul(ar|a|o)|elimin(ar|a|o)|borr(ar|a|o)\s+(la\s+)?(cita|visita)|no\s+voy\s+a\s+(poder\s+)?ir|ya\s+no\s+(puedo|voy)|no\s+puedo\s+ir)/i;

if (CANCEL_BACKSTOP_REGEX.test(input.message) && result.intent !== 'cancel_visit') {
  console.log(
    '[engine] T1#006 backstop: forzando intent=cancel_visit (LLM devolvió:', result.intent, ')',
  );
  result.intent = 'cancel_visit';
}
```

Pista importante: este backstop NO debe interferir con frases ambiguas como "Quiero ver el piso otro día" — la regex está pensada para NO matchear esas. Si en testing detectas falsos positivos, refina aplicando el principio de menor sorpresa.

### Tests obligatorios

Crear/ampliar `src/lib/chatbot/__tests__/cancelBackstop.test.ts` con:

1. "Quiero cancelar la visita al piso" + LLM devuelve `schedule_visit` → tras backstop, intent es `cancel_visit`.
2. "No voy a poder ir" + LLM devuelve `ESCALATE` → tras backstop, intent es `cancel_visit`.
3. "Cambia la hora a las 16h" + LLM devuelve `schedule_visit` → backstop NO toca, sigue `schedule_visit`.
4. "Quiero ver el piso el viernes" + LLM devuelve `schedule_visit` → backstop NO toca.
5. "Anula la cita del miércoles" + LLM devuelve `general_inquiry` → tras backstop, `cancel_visit`.

Mockea el LLM para devolver el intent indicado. Verifica que post-backstop `result.intent` es lo esperado.

### Criterio de aceptación

- E2E: "Quiero cancelar mi cita" → Paula entra en flujo de cancelación (pregunta reagendar/cancelar) — NO ofrece huecos como si quisieras reagendar.
- En BD: `chatbot_messages.intent_detected` para mensajes del bot tras "cancelar" muestra `cancel_visit_*` (one of `cancel_visit_offered_reschedule`, `cancel_visit_awaiting_confirm`, `cancel_visit_done`, etc.) en lugar de `schedule_visit`.
- Log: en Netlify logs aparece `[engine] T1#006 backstop: forzando intent=cancel_visit` cuando el LLM clasifica mal.

---

## T2 — Diagnosticar y arreglar typing/read receipts

Tras el deploy del brief #005, el cliente NO ve doble tick azul ni "Paula está escribiendo…". Hipótesis principal: Meta rechaza el payload combinado `status + typing_indicator` en v21.0.

### T2.1 — Mejorar el logging primero (1 commit pequeño)

En `src/lib/whatsapp.ts`, función `markWhatsAppRead`:
- Sustituir el `console.warn` actual cuando `!response.ok` por un log MÁS detallado que incluya el status, el body de Meta, **y el `body` que enviamos** (sin el token, obviamente):

```ts
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
```

En el webhook, cambiar:
```ts
void markWhatsAppRead(parsed.messageId, true).catch(() => {});
```
por:
```ts
void markWhatsAppRead(parsed.messageId, true).catch((e) =>
  console.warn('[webhook] markWhatsAppRead threw:', e),
);
```

Commit: `chore(whatsapp): mejorar logs de markWhatsAppRead para diagnosticar typing`.

### T2.2 — Aislar typing del read (1 commit)

Después del commit anterior, deplegar a Netlify y revisar logs. Si los logs muestran error 400 sobre `typing_indicator`:

Cambiar la llamada del webhook a SOLO read (sin typing):
```ts
void markWhatsAppRead(parsed.messageId, false).catch((e) =>
  console.warn('[webhook] markWhatsAppRead threw:', e),
);
```

Y en `whatsapp.ts`, eliminar el parámetro `withTyping` para simplificar (o dejarlo como dead code documentado). Confirmar tras nuevo deploy que el doble tick azul SÍ aparece.

Si los logs muestran que el problema es OTRA cosa (e.g. `messageId` undefined, token sin permisos), documentar el hallazgo en SYNC_AI.md y proponer fix concreto antes de ejecutarlo.

Commit: `fix(whatsapp): typing indicator no soportado — dejamos solo read receipts` o el que aplique tras el diagnóstico.

### Criterio de aceptación

- E2E: cliente manda WhatsApp a Paula → ve doble tick azul en <1s. Confirmado.
- Typing indicator: si funciona → bonus. Si no → aceptado y documentado, no bloquea.

---

## Orden de ejecución recomendado

1. **T1.A** — refuerzo system prompt → commit `feat(prompt): few-shot examples para cancel_visit` (1 archivo).
2. **T1.B** — backstop regex + tests → commit `feat(chatbot): backstop regex para cancel_visit` (engine.ts + nuevo test).
3. **T2.1** — mejorar logs → commit `chore(whatsapp): logs detallados de markWhatsAppRead`.
4. **Deploy a Netlify** + revisar logs reales.
5. **T2.2** — aislar typing según diagnóstico → commit acorde.

## Verificación final

1. `npm run build` verde.
2. `npm test` verde (incluye los 5 nuevos tests de backstop).
3. `gitnexus_detect_changes()`.
4. Actualizar `docs/sync/SYNC_AI.md` por cada T.
5. `git push origin master`.

## Qué NO hacer

- NO debilitar el regex backstop a algo que matche "Quiero ver el piso otro día" o similar — eso sería falso positivo. Si dudas, añade más casos negativos a los tests.
- NO eliminar la entrada `cancel_visit` del system prompt — Capa A sigue siendo necesaria como primera línea.
- NO subir el modelo a Pro/Sonnet para "arreglar" la clasificación. El backstop es más barato y más fiable.
- NO tocar el handler `tryHandleCancelVisit` — funciona bien cuando se invoca.
