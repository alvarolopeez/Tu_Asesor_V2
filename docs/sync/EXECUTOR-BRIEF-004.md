# Executor Brief #004 — Paula chatbot: pulido del flujo de agenda + entrevista unificada

**Fecha**: 2026-06-09
**Origen**: prueba E2E real de Álvaro contra Paula (lead `e2172646-cf58-402c-a321-14f0c6db034d`, conversación `6447cd98-b0e7-45dc-b88b-ef638ad32f9e`) tras desplegar el brief #003 (commit `8e1459c`).
**Veredicto brief #003**: ✅ aprobado. Las 5 mejoras funcionan. Este brief #004 ataca **bugs preexistentes ahora visibles** porque Paula llega más lejos en la conversación.

## Contexto crítico para el ejecutor

- Arranca con `git log -3` y `git status` para verificar árbol limpio sobre `master`. Último commit esperado: el de este brief.
- Lee `AGENTS.md`, `docs/sync/SYNC_AI.md` (entradas más recientes), y `docs/sync/EXECUTOR-BRIEF-003.md` para entender qué se acaba de tocar.
- Antes de editar CUALQUIER función o método: `gitnexus_impact({target: "<nombre>", direction: "upstream"})`. Si HIGH/CRITICAL → pausa y avisa.
- Antes de commit: `gitnexus_detect_changes()`.
- Build debe pasar: `npm run build`.
- Commits firmados `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`.

## Decisiones ya tomadas por Álvaro

1. **NO subimos el modelo LLM**. Los 4 bugs son estructurales/lógicos, no de comprensión. Si tras este brief queda fricción en respuestas naturales (no en flujos), entonces sí evaluamos Gemini Pro / Sonnet.
2. **Mantenemos la estructura de las dos entrevistas** (`standalone` onboarding vs `pre_schedule`). El fix no las fusiona — solo importa respuestas entre ellas.
3. **Bonus T3 incluido**: persistencia de `preferred_name` y eliminación de saludo repetido. Pequeños, alta visibilidad.

---

## T1 — Bug A: handler de agenda no sabe que ya recomendó un inmueble

### Reproducción real
```
00:12 user → "Hola, estoy buscando piso en la Macarena"
00:13 bot  → recomienda "Piso a la venta en Avenidas" con link y UUID
00:16 user → "Cuando podria verlo esta semana, solo puedo los martes y los miercoles por la tarde"
00:17 bot  → ⛔ "Para agendar la visita necesito saber qué inmueble te interesa"
00:17 user → "Piso en las avenidas por 190mil€"
00:17 bot  → ⛔ repite la misma pregunta
00:18 user → pega la URL entera + "Quiero ver este piso por la tarde"
00:18 bot  → ✅ por fin lista huecos
```

### Causa raíz
`resolveTargetProperty` (en `src/lib/chatbot/scheduling.ts:399-477`) ya tiene el orden correcto: `context_property_id` → `lead.property_id` → `extracted.property_interest`. El problema es que **cuando el LLM recomienda un inmueble al user en una respuesta de chitchat/sugerencia (no en `tryHandleScheduleVisit`), `context_property_id` NO se persiste**. Solo se persiste en las líneas 444 y 465 — dentro del propio flujo de scheduling.

Por eso al llegar el primer mensaje de agenda (00:16), `metadata.context_property_id` aún está vacío y `resolveTargetProperty` falla. Solo se rellena en 00:18 cuando el user pega la URL y el hint hace match en línea 451-465.

### Fix
En `src/lib/chatbot/engine.ts`, cuando el LLM devuelve `data_extracted.property_interest` (o equivalente) o el motor de recomendación resuelve un inmueble concreto que va a mencionar en la respuesta, **persistir `metadata.context_property_id` con el ID resuelto**, igual que ya hace el flujo de scheduling.

Pista concreta:
- Si en `engine.ts` hay un punto donde se carga una propiedad para incluir su URL/título en la respuesta del bot (la recomendación de las 00:13 viene de algún sitio), añadir `patchConversationMetadata(input.conversationId, { context_property_id: <id> })` después de resolver.
- Si la recomendación se genera vía prompt al LLM con un listado de propiedades candidatas y el LLM elige una, el patch hay que hacerlo a posteriori parseando el ID que el LLM incluyó en la respuesta (el link tiene `?p=<UUID>`).

### Criterio de aceptación
- Conversación E2E: user pregunta zona → bot recomienda piso → user dice "cuándo puedo verlo" → bot lista huecos directo, SIN pedir título/dirección.
- Verificable en BD: tras el turno de recomendación, `chatbot_conversations.metadata.context_property_id` debe estar poblado.

---

## T2 — Bug B: parser de horas no entiende "seis y media", "menos cuarto", etc.

### Reproducción real
```
00:19 user → "El miercoles a las seis y media"
00:19 bot  → ⛔ ofrece TODOS los huecos del miércoles (detectó día, perdió hora)
00:19 user → "A las seis y media" (intento aislado)
00:19 bot  → ✅ coge 18:30 (esto sí funciona)
```

Nota: el segundo intento parece funcionar SOLO porque otro fallback agarra la hora — el parser de `parseDateTime` realmente nunca entiende "seis y media" en ningún caso. Hay que validar con tests.

### Causa raíz
`parseDateTime` en `src/lib/chatbot/scheduling.ts:287-350` solo reconoce horas con dígitos:
- `\b(\d{1,2})[:\.h](\d{2})\b` → matchea "18:30", "11h00"
- `\b(?:a\s*las|sobre\s*las|hacia\s*las|las)\s*(\d{1,2})\b` → matchea "a las 18" → 18:00

NO matchea: "seis y media", "diez y cuarto", "nueve menos cuarto", "cinco de la tarde", "siete y media de la tarde".

### Fix
Añadir un parser de horas en castellano que cubra al menos:

| Frase | Hora canónica |
|---|---|
| seis y media | 06:30 ó 18:30 (ambigua, ver regla AM/PM abajo) |
| seis y cuarto | 06:15 |
| siete menos cuarto | 06:45 |
| nueve y media de la tarde | 21:30 |
| cinco de la tarde | 17:00 |
| diez de la mañana | 10:00 |
| las ocho | 08:00 ó 20:00 |

Regla AM/PM cuando es ambigua:
- Si el user dice "de la mañana" / "AM" → 00–11.
- Si dice "de la tarde" / "de la noche" / "PM" → +12.
- Si NO dice nada (caso "seis y media") → preferir el hueco disponible más cercano al "ahora" o el más natural según el horario laboral configurado en `visitable_slots`. Si hay AMBOS disponibles, **devolver dos candidatos** y que `handleSchedulingTurn` los pregunte: "¿Las 6:30 de la mañana o las 18:30 de la tarde?".

Implementar como función pura nueva `parseSpanishTime(text: string): string[] | null` (devuelve array de candidates `["HH:MM"]`). Integrarla en `parseDateTime` antes del regex actual de dígitos.

Cobertura de tests obligatoria: crear `src/lib/chatbot/__tests__/parseSpanishTime.test.ts` con todos los casos de la tabla + 5 negativos ("blablabla", "miércoles", "diez tigres", "").

### Criterio de aceptación
- "el miercoles a las seis y media" → bot interpreta miércoles 18:30 (si es horario de visitas vigente) y procede a confirmar la cita SIN listar huecos otra vez.
- Si la hora es ambigua mañana/tarde, el bot pregunta una sola vez: "¿6:30 o 18:30?".

---

## T3 — Bug C: el bot ignora restricciones declaradas por el user

### Reproducción real
```
00:16 user → "solo puedo los martes y los miercoles por la tarde"
00:18 bot  → ofrece miércoles, VIERNES y LUNES sin filtrar
```

### Causa raíz
`freeSlotsForDate` (`scheduling.ts:509-518`) y la función que decide qué días listar al user no consultan ningún campo de restricciones declaradas por el lead en lenguaje natural. La info se pierde en el turno.

### Fix
1. **Persistir restricción**: añadir campo en `chatbot_conversations.metadata` → `availability_constraints: { days?: string[]; time_of_day?: 'morning'|'afternoon'|'evening'|'any'; raw?: string }`.
2. **Extracción**: en el prompt del LLM (`systemPrompt.md`) añadir instrucción para devolver `data_extracted.availability_hint` cuando el user declare disponibilidad. El handler lo persiste en metadata.
3. **Aplicación en listado**: en la función que lista huecos al user (probablemente cerca de `freeSlotsForDate` o en `tryHandleScheduleVisit`), filtrar:
   - Si `constraints.days` existe → solo listar esos días.
   - Si `constraints.time_of_day === 'afternoon'` → solo huecos ≥ 14:00.
   - Si NO hay constraints → comportamiento actual.
4. **Tope**: si tras filtrar quedan 0 huecos en los 7 días siguientes, listar los 3 más cercanos AVISANDO ("No tengo huecos los martes/miércoles por la tarde esta semana — los más próximos son…").

### Criterio de aceptación
- E2E: user dice "solo puedo martes y miércoles por la tarde" → bot lista SOLO huecos de martes y miércoles a partir de las 14:00.
- Si no hay → mensaje explícito ofreciendo alternativas.

---

## T4 — Bug D: la pre-confirm interview no hereda respuestas del onboarding

### Reproducción real
Onboarding completo en 00:13–00:14:
```
bot  → "1. presupuesto / 2. vivir o inversión / 3. financiación o fondos propios"
user → "200mil euros · Quiero invertir y necesito hipoteca"
```
Después, al llegar la pre-confirm de cita (00:19):
```
bot  → "Antes de confirmar la cita necesito 3 datos breves. 💰 ¿Qué ahorros aportarías?"
```
↑ ABANDONO. Le está repitiendo entrevista cuando ya tiene perfil capturado.

### Causa raíz
Dos máquinas de estado distintas:
- **Onboarding** (`mode='standalone'`) → arrancada por `profileCheck.ts:186-217` cuando el user dice "sí" al ofrecimiento de perfil. Guarda respuestas en `interview_state.answers` con mode `standalone`.
- **Pre-cita** (`mode='pre_schedule'` por defecto) → arrancada por `scheduling.ts:1184-1199` cuando el user elige hueco. **Se inicializa con `answers: {}` siempre**.

No hay paso intermedio que copie respuestas previas.

Además, si en el onboarding standalone se completó la entrevista, los datos quedaron en `buyers_demands`. Hay un check `hasDemand` en `scheduling.ts:1035` que detecta si hay buyers_demand COMPLETO — pero no se usa para saltar preguntas en la pre-cita.

### Fix
Al inicializar `interview_state` en `scheduling.ts:1184` (la pre-cita), **antes** de asignar `answers: {}`:

```ts
// 1. Leer metadata actual para ver si hay un interview_state previo (standalone) con answers.
const prev = await getConversationMetadata(conversationId);
const prevAnswers = (prev?.interview_state?.answers as InterviewAnswers | undefined) || {};

// 2. Leer buyers_demand del lead — si existe y tiene los campos clave, también heredarlos.
const demand = await loadBuyersDemandForLead(params.leadId); // crear helper si no existe
const inheritedFromDemand = demand ? mapDemandToInterviewAnswers(demand) : {};

// 3. Merge: lo del demand pisa por ser más reciente/canónico; prevAnswers como fallback.
const seededAnswers: InterviewAnswers = { ...prevAnswers, ...inheritedFromDemand };

// 4. Calcular step inicial: primer paso cuya respuesta NO esté en seededAnswers.
const initialStep = computeFirstUnansweredStep(seededAnswers);
```

Y al construir el state:
```ts
const state: InterviewState = {
  step: initialStep,           // <- puede ser ya step 4 si los pasos 1-3 están cubiertos
  answers: seededAnswers,      // <- hereda
  attempts: 0,
  target: { ... },
  startedAt: new Date().toISOString(),
};
```

Si `initialStep > totalSteps` (todo cubierto) → saltar directo a confirmación de cita sin entrevista. El user solo verá:
> "Perfecto Álvaro, confirmada la visita el miércoles 10/06 a las 18:30 al Piso de Avenidas. Te enviaré recordatorio 24h antes 🤝"

### Criterio de aceptación
- E2E: user completa onboarding al principio. Más tarde elige hueco de cita. Bot NO repite preguntas. Confirma directo.
- Caso parcial: si el user solo respondió 2 de 3 preguntas en onboarding, la pre-cita salta esas 2 y solo pregunta la que falta.

---

## T5 — Bonus pequeños (alta visibilidad, bajo riesgo)

### T5.1 — Persistir `preferred_name` también en `leads.preferences`
Actualmente `engine.ts:333-340` solo persiste en `chatbot_conversations.metadata.preferred_name`. Si la conversación expira o se inicia otra, se pierde.

**Fix**: en el mismo bloque que ya guarda en metadata, también:
```ts
await supabase.from('leads').update({
  preferences: { ...currentPrefs, preferred_name: cleaned }
}).eq('id', input.leadId);
```
(Leer `preferences` actual primero para no pisar otros campos. Tabla `leads`, columna `preferences` es JSONB.)

### T5.2 — Suprimir doble saludo a partir del turno 2
Cada respuesta de Paula abre con "¡Hola, Alvaro! Soy Paula, la asesora virtual de Álvaro." — incluso en el turno 5. Chocante.

**Fix**: en `systemPrompt.md` o en el wrapper de respuesta:
- Si `chatbot_messages.role='assistant'` ya tiene ≥1 mensaje previo en esta conversación → **prohibido** abrir con "Hola" o "Soy Paula".
- Implementación rápida: en el system prompt incluir contador `[turno_asistente: N]`. Si N > 1 → "no te presentes ni saludes". Si N == 1 → presentación normal.

### Criterio de aceptación T5
- T5.1: tras conversación donde user dice "llámame Tito", el campo `leads.preferences.preferred_name` queda con `"Tito"`.
- T5.2: solo el primer mensaje del bot saluda. Los turnos 2+ van directo al contenido.

---

## Orden recomendado de ejecución

1. **T5.1 + T5.2** primero (pequeños, bajos riesgo, victoria rápida → commits separados).
2. **T2** (parser horas castellano + tests).
3. **T3** (restricciones de disponibilidad).
4. **T1** (persistir `context_property_id` desde el LLM).
5. **T4** (herencia entre entrevistas — el más arquitectónico, hacerlo último con todo lo demás verde).

Un commit por T. Mensajes:
- `fix(chatbot): persistir preferred_name en leads.preferences`
- `fix(chatbot): suprimir doble saludo en turnos 2+`
- `feat(scheduling): parser de horas en castellano (seis y media, etc.)`
- `feat(scheduling): respetar restricciones de disponibilidad declaradas por el user`
- `fix(scheduling): persistir context_property_id al recomendar inmueble`
- `feat(scheduling): pre-cita interview hereda respuestas del onboarding`

## Verificación final

Antes de cerrar la sesión:
1. `npm run build` → verde.
2. `npm test` si hay tests (al menos los nuevos de `parseSpanishTime`).
3. `gitnexus_detect_changes()` → reporta símbolos tocados y procesos afectados.
4. Actualizar `docs/sync/SYNC_AI.md` con entrada nueva por cada T completada.
5. `git push origin master`.

## Qué NO hacer

- NO fusionar las dos entrevistas en una sola máquina de estado. Decisión de Álvaro: mantener `standalone` vs `pre_schedule` separadas. Solo heredar respuestas.
- NO cambiar el modelo LLM. Decisión de Álvaro: dejar Gemini Flash.
- NO tocar el LLM-as-parser del brief #003 — está funcionando bien.
- NO cambiar `extractPropertyFromMessage` para hacerla regex-based. La idea es que **lea el contexto ya guardado**, no que parsee mejor.

## Si algo te bloquea

Reporta en `docs/sync/SYNC_AI.md` y para. Mejor parar y preguntar que dejar arreglos a medias.
