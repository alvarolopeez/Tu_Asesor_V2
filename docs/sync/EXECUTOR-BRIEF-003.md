# BRIEF #003 — Chatbot Paula: contexto, dedup, nombre, entrevista reactiva, LLM-as-parser

> Tras `HANDOFF-PROMPT.md` pega este brief. Causas raíz YA investigadas con
> grep sobre `src/lib/chatbot/*` — NO re-diagnostiques, ataca directo.

---

```
Después del arranque, 5 tareas. Las cinco resuelven una queja del usuario
real verificada en producción ("el chatbot es deficiente, pierde contexto,
duplica clientes, no usa el nombre, no entiende las respuestas").

═══════════════════════════════════════════════════════════════════════════
CAUSAS RAÍZ YA INVESTIGADAS (NO especules, NO reinvestigues)
═══════════════════════════════════════════════════════════════════════════

(A) Ventana de contexto deficiente:
    src/lib/chatbot/engine.ts:114 → getConversationHistory(input.conversationId, 10)
    Solo trae los últimos 10 mensajes. En WhatsApp es demasiado poco — los
    cortos ("ok", "vale", "perfecto") consumen turnos sin aportar contexto.

(B) Duplicación de leads por teléfono:
    src/app/api/webhooks/whatsapp/route.ts:320 findOrCreateLead(phone, name)
    busca por phone, PERO no normaliza el phone antes del .eq().
    - El formulario web normaliza con normalizeEsPhone() → guarda "+34697223944".
    - Meta envía el phone como "34697223944" (sin "+").
    - Resultado: lookup falla, inserta duplicado con el mismo número.
    No hay UNIQUE INDEX en leads.phone como red de seguridad.

(C) Bot no usa el nombre del cliente:
    src/lib/chatbot/systemPrompt.md:88 espera "name si lo menciona".
    El lead YA tiene name en BD (formulario o Meta), pero el system prompt
    nunca lo recibe pre-cargado. Por eso el bot parece no conocer al cliente.
    Tampoco existe campo preferred_name si el cliente pide otro trato.

(D) No hay entrevista reactiva post-reserva:
    Hay máquina de estados interview_state (src/lib/chatbot/scheduling.ts)
    pero solo se dispara cuando intent === 'schedule_visit'. Si un lead
    aterriza por reserva web sin perfil completo y luego escribe "Perfecto",
    el bot no detecta que falta perfil — sigue una conversación normal.

(E) ⚠️ Parseo de la entrevista por regex rígido — causa de "no entiende"
    src/lib/chatbot/scheduling.ts:696-727:
      - parseSavings → exige número plano (30000). Falla con "30 mil",
        "30k", "treinta mil", "tengo unos 30.000€".
      - parseFunding → keywords literales ("sin estudiar" / "estudio hecho" /
        "hipoteca preconcedida" / "al contado"). Falla con "tengo preaprobada",
        "voy con efectivo", "estoy mirando bancos".
      - parseTipoCompra → "vivir" / "inversión". Falla con "para mí",
        "para alquilar", "vamos a vivir nosotros".
    Cuando falla, el bot responde "No he sabido leer la cifra" / "No lo he
    pillado". El cliente entra en bucle = mala UX confirmada.
    Mismo síntoma en engine.ts:614 ("Lo siento, ha ocurrido un error.
    ¿Puedes repetir tu mensaje?") cuando el JSON del LLM viene roto.

═══════════════════════════════════════════════════════════════════════════
DECISIONES DE ÁLVARO YA TOMADAS — NO le preguntes
═══════════════════════════════════════════════════════════════════════════

1. Ventana de contexto: 30 mensajes (opción A).
2. Colisión phone+nombre distinto: opción C — al detectar phone existente
   con nombre diferente, el bot PREGUNTA al cliente "Veo que ya te conocemos
   como X. ¿Prefieres que te llamemos así o como Y?". Persistir respuesta
   en preferred_name.
3. Entrevista reactiva: opción C — combinada. Activar en (a) primer mensaje
   del cliente tras una reserva web SI buyers_demands incompleto; (b) como
   reintento cuando el cliente responde algo neutro tipo "perfecto", "vale",
   "ok", "gracias" Y buyers_demands sigue incompleto. Tono educado, opcional,
   nunca insistente.
4. Parseo de respuestas naturales: opción A — LLM-as-parser. Cada step de la
   entrevista pasa la pregunta original + respuesta del cliente al LLM con
   JSON schema y extrae el valor estructurado. Misma técnica para el fallback
   general en engine.ts:614 (en vez de "Lo siento, ¿puedes repetir?", el
   LLM hace un retry con prompt simplificado).

═══════════════════════════════════════════════════════════════════════════
TAREAS — en este orden
═══════════════════════════════════════════════════════════════════════════

────────────────────────────────────────────────────────────────
T1 — Ampliar ventana de contexto (XS)
────────────────────────────────────────────────────────────────
En src/lib/chatbot/engine.ts:114 cambiar:
  const history = await getConversationHistory(input.conversationId, 10);
→
  const history = await getConversationHistory(input.conversationId, 30);

Verificar que el system prompt + 30 mensajes + lead context no sobrepasa
el límite del proveedor LLM activo. Gemini 1.5 Flash soporta 1M tokens —
30 mensajes cortos no es problema. Si Gemini cambia a otro modelo en el
futuro, dejar la constante como `const HISTORY_WINDOW = 30;` arriba del
módulo para visibilidad.

Criterio: en una conversación de 15+ turnos sobre un mismo inmueble, el
bot puede responder a "y cuánto cuesta el del principio" correctamente.

────────────────────────────────────────────────────────────────
T2 — Dedup robusto de leads por teléfono (S)
────────────────────────────────────────────────────────────────
2.1. En src/app/api/webhooks/whatsapp/route.ts:320 (findOrCreateLead),
     normalizar el phone con normalizeEsPhone() ANTES del .eq().
     Aplicar lo mismo a TODOS los sitios que insertan o buscan leads por
     phone (BuyerRegistrationModal, appointmentService — ya lo hacen pero
     verificar consistencia).

2.2. Migración Supabase: añadir UNIQUE INDEX en leads.phone (después de
     normalizar todos los existentes — pero la BD está VACÍA ahora, ideal
     momento). Mantener NULL phone permitido.
       CREATE UNIQUE INDEX leads_phone_unique
         ON leads(phone) WHERE phone IS NOT NULL;

2.3. Flujo de colisión nombre:
     En findOrCreateLead, si encuentra lead existente con nombre distinto
     al parsed.contactName, NO sobrescribir todavía. Guardar el nombre
     pendiente en chatbot_conversations.metadata.pending_name_resolution
     y devolver una respuesta tipo:
       "Hola! Veo que ya te tengo guardado como [nombre_existente].
        ¿Prefieres que te llame así o como [nombre_nuevo]?"
     Al siguiente mensaje del cliente, el LLM extrae cuál prefiere
     → guardar en leads.name (si elige cambiar) o solo en
     chatbot_conversations.metadata.preferred_name (si el nombre nuevo
     es un apodo). Limpiar pending_name_resolution.

Criterio:
- Cliente con phone normalizado en formato distinto (con/sin "+34"): NO
  se duplica el lead.
- Cliente ya conocido escribe desde otra app con otro nombre: bot pregunta
  cómo prefiere ser llamado y respeta la elección.

────────────────────────────────────────────────────────────────
T3 — Nombre del lead + preferred_name (S)
────────────────────────────────────────────────────────────────
3.1. En engine.ts/buildSystemPrompt, pasar lead_name y preferred_name al
     system prompt. Si preferred_name existe, usarlo. Si no, usar
     leads.name. Construir el bloque:
       Cliente actual: {{preferred_name or lead_name}}
       (si el cliente te pide ser llamado de otra forma, extrae el nuevo
       nombre en data_extracted.preferred_name)

3.2. En systemPrompt.md añadir regla explícita:
     "Siempre te diriges al cliente por su nombre conocido. Solo cambias
     el nombre si te lo pide explícitamente. Cuando detectes una petición
     de cambio de nombre, marca data_extracted.preferred_name con el
     valor nuevo."

3.3. En engine.ts, tras procesar respuesta del LLM, si parsed.data_extracted
     .preferred_name existe → persistirlo en chatbot_conversations.metadata.

Criterio:
- Lead "Pedro Pérez" del formulario → primer mensaje bot: "Hola Pedro".
- Pedro responde "llámame Pepe" → bot guarda preferred_name="Pepe" → todos
  los siguientes mensajes saludan "Pepe".

────────────────────────────────────────────────────────────────
T4 — Entrevista reactiva (M)
────────────────────────────────────────────────────────────────
Nuevo módulo src/lib/chatbot/profileCheck.ts:

  /**
   * Detecta si el lead necesita una entrevista de perfil:
   * - buyers_demands inexistente para su phone, O
   * - existe pero faltan ALMOST_ALL los campos clave
   *   (savings_contribution, funding_type, propósito).
   */
  export async function needsProfile(leadId, phone): Promise<boolean>

  /**
   * Ofrece educadamente la entrevista. NO arranca automáticamente — pide
   * permiso. Si el cliente acepta, el siguiente mensaje del bot pasa a
   * scheduling.ts (extender máquina para no requerir cita pre-existente).
   */
  export async function offerInterviewIfNeeded(conversationId, leadId, phone, userMessage)

Triggers en engine.ts (orden):
  - Al inicio de processMessage, ANTES del LLM:
    a) Si es el PRIMER mensaje del cliente en esta conversación
       (chatbot_messages.count === 0 antes de insertar el actual)
       Y needsProfile → llamar offerInterviewIfNeeded en lugar del LLM.
    b) Si el mensaje del cliente es neutro tipo "perfecto", "vale", "ok",
       "gracias", "👍" (regex pequeña ANTES del LLM) Y needsProfile Y no se
       ha ofrecido entrevista en esta conversación
       (chatbot_conversations.metadata.profile_offered IS NOT TRUE) →
       offerInterviewIfNeeded.

Extender scheduling.ts:
  - InterviewState añade campo opcional `mode: 'pre_schedule' | 'standalone'`.
  - Si mode === 'standalone', finalizeScheduling NO crea cita; solo upsert
    en buyers_demands.

Texto recomendado de oferta (no hardcoded, en constante):
  "Por cierto {{nombre}}, ¿te puedo hacer 3 preguntas rápidas para entender
  mejor qué buscas y avisarte si entra algo bueno? Tarda 30 segundos.
  (Si prefieres ahora no, sin problema 🙂)"

Si responde sí → arranca scheduling.handleInterviewStep con mode 'standalone'.
Si responde no → marcar profile_offered=true en metadata para no re-ofrecer
en la misma conversación. Reintentar en futuras conversaciones (separadas
por > 7 días) — TODO opcional, low prio.

Criterio:
- Lead nuevo aterriza por reserva web → primer mensaje del bot: confirmación
  + oferta de entrevista.
- Lead activo responde "perfecto" sin perfil → bot ofrece entrevista UNA
  vez por conversación.
- Lead rechaza la entrevista → bot no insiste en la misma conversación.

────────────────────────────────────────────────────────────────
T5 — LLM-as-parser (M, la más impactante)
────────────────────────────────────────────────────────────────
Nuevo módulo src/lib/chatbot/llmParser.ts:

  /**
   * Pasa la pregunta + respuesta del cliente al LLM y obtiene un JSON
   * estructurado del valor extraído. Usa el mismo proveedor LLM activo
   * (LLM_PROVIDER), modelo barato (gemini-flash si gemini).
   * Devuelve null si el LLM tampoco lo entiende (raro).
   */
  export async function parseWithLLM<T>(
    question: string,
    userMessage: string,
    schema: { type: 'number' | 'enum' | 'string', enumValues?: string[] }
  ): Promise<T | null>

Reemplazar en scheduling.ts:
  - parseSavings(msg) → parseWithLLM("¿Qué ahorros aportarías?", msg,
                                      { type: 'number' })
  - parseFunding(msg) → parseWithLLM("¿Cómo vas con la financiación?", msg,
                                      { type: 'enum', enumValues: [
                                        'sin_estudiar','estudio_hecho',
                                        'preconcedida','contado'] })
  - parseTipoCompra(msg) → parseWithLLM(..., { type: 'enum',
                                                enumValues: ['vivir','inversion'] })

Mantener los parsers regex como FALLBACK rápido (se intenta regex primero,
si null se pasa al LLM). Esto da el mejor balance: barato cuando el cliente
responde literal, robusto cuando responde natural.

En engine.ts:614 — el fallback "Lo siento, ¿puedes repetir?" cambiarlo
por: si JSON.parse falla, llamar al LLM con prompt "Recupera de este texto
una respuesta natural en español al cliente: {{rawLLMOutput}}". Si la
recuperación falla 2 veces, ESCALAR.

Criterio:
- "tengo unos 30 mil ahorrados" → parser devuelve 30000.
- "voy con efectivo" → parser devuelve "contado".
- "para vivir nosotros" → parser devuelve "vivir".
- "preaprobada por el santander" → parser devuelve "preconcedida".

═══════════════════════════════════════════════════════════════════════════
VERIFICACIÓN — al terminar las 5 tareas
═══════════════════════════════════════════════════════════════════════════

(a) Conversación larga (15+ turnos sobre un inmueble) → bot mantiene
    contexto del inmueble inicial.
(b) Cliente con phone normalizado en distinto formato escribe — NO se
    duplica el lead, mismo lead_id.
(c) Cliente ya conocido (Pedro) escribe desde otra app con otro nombre
    (Pere) — bot pregunta cómo prefiere ser llamado.
(d) Lead Pedro recibe primer mensaje → bot saluda "Hola Pedro".
(e) Pedro pide "llámame Pepe" → siguientes mensajes saludan "Pepe".
(f) Lead nuevo aterriza por reserva web sin buyers_demands → primer
    mensaje del bot ofrece entrevista educadamente.
(g) Mismo lead responde "perfecto" → bot no insiste (profile_offered ya
    está a true).
(h) Cliente responde la primera pregunta de entrevista con "unos 30 mil"
    → bot lo interpreta como 30000 y pasa a la siguiente pregunta SIN
    decir "no he sabido leer la cifra".
(i) Cliente responde "voy con efectivo" → bot lo mapea a "contado".
(j) Cliente responde "para vivir nosotros mismos" → bot lo mapea a "vivir".

Si alguna verificación falla, reportar OK/FALLO con la causa observada.
NO marques nada como hecho que no hayas verificado.

═══════════════════════════════════════════════════════════════════════════
RECORDATORIOS
═══════════════════════════════════════════════════════════════════════════
- gitnexus_impact ANTES de editar cada símbolo (sobre todo T2, T4, T5).
- npm run build VERDE antes de cada commit.
- Migración Supabase en T2 con apply_migration.
- SYNC_AI.md actualizado al final con las decisiones tomadas.
- Commits firmados Co-Authored-By: Claude Opus 4.8.
- Push con PAT de .mcp.json.
- Honestidad: T1 a T3 son testeables en local. T4 y T5 con teléfono real
  para ver el flujo. Si Gemini está caído, T4/T5 caen al fallback regex
  y la verificación (h)(i)(j) no es testeable hasta restaurar Gemini.

Reporte final:
T1 [OK/FALLO]: ...
T2 [OK/FALLO]: ...
...
Verificación: a-OK, b-FALLO porque..., c-OK, d-OK, ...
```
