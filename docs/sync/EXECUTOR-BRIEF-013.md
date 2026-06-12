# Executor Brief #013 — 3 fixes del CRM: aviso de escalado, doble presentación de Paula, copiloto de zonas con LLM real

**Fecha**: 2026-06-12
**Origen**: Álvaro, probando el CRM a fondo. Tres bugs independientes. El diagnóstico (causa raíz +
ubicación exacta) **ya está hecho y verificado** — tu trabajo es implementar + testear.

**Ejecución**: agente principal **Sonnet 4.6**, que **delega en subagentes** (ver §4 "Plan de
delegación"). Reglas de oro en §5.

---

## T1 — El aviso de escalado a Álvaro no llega (debe usar la plantilla `aviso_alvaro`)

### Causa raíz (confirmada)
`src/app/api/webhooks/whatsapp/route.ts` notifica a Álvaro con **`sendWhatsAppMessage(ADVISOR_PHONE, …)`**
= **texto libre**, en dos sitios:
- Escalación nueva: líneas ~259-271 (`🚨 Escalación de Chat`).
- Mensaje en chat ya escalado: `notifyAdvisorOfEscalatedMessage()` línea ~646.

Meta **rechaza el texto libre fuera de la ventana de 24 h** (error `131047`). Álvaro nunca le escribe a
su propio número de negocio, así que esa ventana está SIEMPRE cerrada para él → el mensaje se descarta y
**no llega nada**. (Mismo bug que ya se arregló para la bienvenida con plantillas HSM.)

`src/lib/whatsapp.ts` **ya tiene** la función correcta: **`sendWhatsAppTemplate(to, templateName, bodyParams, opts)`**
(creada precisamente para "avisos al asesor fuera de 24 h").

### Fix
- Sustituye los dos envíos a `ADVISOR_PHONE` por
  `sendWhatsAppTemplate(ADVISOR_PHONE, 'aviso_alvaro', [param1, param2], { logTag })`.
- La plantilla **`aviso_alvaro`** (idioma `es`) tiene **2 variables de body** `{{1}}` y `{{2}}` — ya se
  usa así en el workflow n8n "Blog Diario Noticias" (nodo "Aviso WhatsApp Alvaro"). **Verifícalo en Meta
  Business Manager antes** (nº de variables y que esté aprobada).
- Mapea la info a 2 params **de una sola línea** (los params de plantilla no admiten saltos de línea ni
  son muy largos):
  - Escalación: `param1 = "Escalación: " + contactName + " (" + phoneNumber + ")"`,
    `param2 = "Pide hablar contigo. Último msg: \"" + messageText.slice(0,120) + "\". Responde al " + phoneNumber`.
  - Mensaje en chat escalado: `param1 = "Mensaje de " + contactName + " (" + phoneNumber + ")"`,
    `param2 = "\"" + messageText.slice(0,120) + "\". Estás en Modo Humano; el cliente puede escribir 'bot'."`.
- **NO toques** los `sendWhatsAppMessage` que responden AL CLIENTE (líneas 147, 185, 277…): esos SÍ están
  dentro de la ventana de 24 h (el cliente acaba de escribir) y el texto libre es válido y deseable.
- Mantén el throttle anti-spam (`last_escalation_notify_at`) y el resto de la lógica intacta.

### Criterio de aceptación
- Un cliente pide hablar con Álvaro → Álvaro recibe en su WhatsApp la plantilla `aviso_alvaro` con los
  datos del lead. Un nuevo mensaje en un chat escalado → Álvaro recibe la plantilla (respetando throttle).
- Revisa los `n8n_webhook_logs` / logs de Meta: ya no debe aparecer el `131047` para `ADVISOR_PHONE`.

---

## T2 — Paula se vuelve a presentar tras la bienvenida

### Causa raíz (confirmada)
- `systemPrompt.md` (líneas 3-4): Paula se presenta solo en el **primer turno**, detectado por el
  contador `[turno_asistente: N]`. Si `N ≥ 1` → no se presenta.
- El engine calcula ese contador en `engine.ts:298`:
  `assistantTurnCount = history.filter(m => m.role === 'assistant').length` — cuenta los mensajes
  `role='assistant'` **de esa conversación en `chatbot_messages`**.
- La bienvenida (`bienvenida_nuevo_lead`) se envía como **plantilla HSM vía n8n**, y **NO se registra en
  `chatbot_messages`**. Así que cuando el lead recién registrado escribe por primera vez a Paula, la
  conversación tiene **0 mensajes de asistente** → `[turno_asistente: 0]` → Paula **se presenta otra vez**
  (después de que la bienvenida ya la "presentó"). Doble presentación.

### Fix (recomendado: marcar al lead como "ya saludado")
1. **Registrar la bienvenida**: allí donde se despacha `bienvenida_nuevo_lead`, marca el lead.
   Puntos de despacho (confírmalos con `investigator-haiku`): `src/app/api/n8n/new-lead/route.ts`,
   `src/lib/appointmentService.ts`, `src/components/BuyerRegistrationModal.tsx`. Escribe
   `leads.metadata.welcomed_at = now` (jsonb; no hace falta migración de columnas).
2. **Propagar la señal al engine**: en el webhook (`route.ts`), pasa `was_welcomed: boolean` dentro de
   `leadContext` de `processMessage(...)` (léelo de `leads.metadata.welcomed_at`).
3. **Aplicar en el engine** (`engine.ts`, donde se calcula `assistantTurnCount`):
   `const effectiveTurns = Math.max(assistantTurnCount, wasWelcomed ? 1 : 0);` y usa `effectiveTurns`
   para `assistant_turn_count`. Así, un lead ya saludado entra como `[turno_asistente: 1]` → sin
   re-presentación, aunque la conversación esté vacía.

**Alternativa pragmática** (sin tocar metadata, si prefieres): en el webhook, usa
`leadInfo.existing === true` como proxy de "ya conocido/saludado" y pásalo como `was_welcomed`. Los leads
nuevos de WhatsApp (`existing === false`, creados en este mismo mensaje) seguirían recibiendo la
presentación. Es más simple pero menos preciso (un lead creado a mano por el admin contaría como
"saludado"). Decide y documenta cuál usas.

### Criterio de aceptación
- Lead se registra (recibe `bienvenida_nuevo_lead`) → escribe a Paula de seguido → Paula responde **sin**
  abrir con "Hola, soy Paula…". 
- Lead **nuevo de WhatsApp** que nunca se registró → Paula **sí** se presenta en su primer turno.
- Conversaciones en curso (turnos 2+) siguen sin presentación, como hasta ahora. No rompas los tests
  existentes del chatbot (`src/lib/chatbot/__tests__/`). Añade un test: `was_welcomed=true` + historial
  vacío → el contexto sale con `[turno_asistente: 1]` (sin presentación).

---

## T3 — El copiloto de zonas necesita un LLM real con cruce de POIs

### Causa raíz (confirmada)
- `src/app/api/ai/zones/route.ts` **ya llama a Gemini** con la taxonomía oficial completa, pero:
  - usa **`LLM_MODEL` (default `gemini-1.5-flash`)** — sin grounding de búsqueda;
  - su `SYSTEM_INSTRUCTION` solo mapea **calles/monumentos → zona**, NO resuelve consultas por
    **proximidad a POIs** ("zonas cerca de hospitales").
- El copiloto (`ZoneSelectorPremium.tsx:889`) ya hace `POST /api/ai/zones` con `{ text }` + Bearer y pinta
  `result.detected_zones`. **La UI no se toca**; solo el endpoint.

### Fix
1. **Modelo dedicado con grounding**: usa `process.env.ZONES_LLM_MODEL || 'gemini-2.5-flash'` (separado
   del chatbot `LLM_MODEL`). Añade la tool de búsqueda: `tools: [{ google_search: {} }]` (mismo patrón
   que `src/lib/blog/generateNewsPost.ts`).
2. **⚠️ Incompatibilidad clave**: el grounding **NO** es compatible con
   `generationConfig.responseMimeType: 'application/json'`. **Quítalo** y parsea el JSON de forma
   defensiva desde el texto (reutiliza el parser en cascada de `generateNewsPost.ts` `parseDraftJson`:
   strip de fences ```json``` → `JSON.parse` → rescate del primer `{` al último `}`). Si no hay JSON
   válido → cae al `localKeywordDetector` existente.
3. **Ampliar el `SYSTEM_INSTRUCTION`**: añade una capacidad de **proximidad a POIs**. Cuando el usuario
   pida zonas cerca de un tipo de servicio (hospital, colegio, universidad, metro, estación, parque,
   centro comercial, polígono…), el modelo debe **buscar POIs reales en Sevilla capital y área
   metropolitana** y devolver en `detected_zones` **solo zonas EXACTAS de la taxonomía** que estén cerca,
   con un `reasoning` que explique qué POIs ha cruzado (ej.: "Hospital Virgen Macarena → Macarena - …;
   Hospital Virgen del Rocío → Sur / Palmera-Bellavista …"). Mantén intacto el mapeo calle/monumento→zona
   y la restricción de devolver **solo nombres de la lista oficial**.
4. Conserva el **fallback local por keywords** para cuando Gemini falle o no haya `GEMINI_API_KEY`.
5. **Env nueva**: `ZONES_LLM_MODEL=gemini-2.5-flash` → sincronizar en **Netlify + `.env.local`**
   (opcional porque hay default, pero recomendado dejarla explícita; `GEMINI_API_KEY` ya existe).

> Nota de alcance: el "cruce de datos" es **LLM + Google Search**, no un JOIN geoespacial (no existe
> tabla de hospitales/POIs en la BD). Es la solución efectiva y barata. Si en el futuro Álvaro quiere un
> cruce literal contra coordenadas, requeriría un dataset de POIs — fuera de este brief.

### Criterio de aceptación
- En Pedidos → comprador → Copilot de zonas, escribir **"zonas cerca de hospitales en Sevilla"** devuelve
  una lista de zonas reales de la taxonomía próximas a hospitales, seleccionables, con explicación.
- Las consultas antiguas por calle/monumento ("calle Betis", "Metromar") **siguen funcionando**.
- Si Gemini falla → no rompe: cae al detector local.

---

## 4. Plan de delegación en subagentes (Álvaro lo pide explícitamente)
- **Principal: Sonnet 4.6** — implementa, decide, commitea.
- **`investigator-haiku` (Haiku 4.5)** — exploración read-only barata: confirmar los puntos de despacho de
  `bienvenida_nuevo_lead` (T2), leer `systemPrompt.md` entero, localizar los tests del chatbot, revisar el
  patrón de grounding en `generateNewsPost.ts`. Devuelve solo conclusiones.
- **`reviewer-sonnet` (Sonnet)** — revisión editorial/calidad de: (a) el nuevo `SYSTEM_INSTRUCTION` del
  copiloto de zonas (que no rompa el mapeo existente y maneje bien los POIs) y (b) el texto de los 2 params
  de la plantilla `aviso_alvaro` (que quepan, sin saltos de línea, claros).
- **`architect-opus` (Opus)** — **NO necesario** salvo que aparezca una decisión de arquitectura no
  contemplada (p.ej. si el flag `welcomed_at` choca con algo). Úsalo con criterio, es caro.
- **`summarizer-haiku`** — opcional, para condensar logs de Meta/n8n si hay que depurar el 131047.

## 5. Reglas de oro (obligatorio)
- `gitnexus_impact` antes de editar cada símbolo: `processMessage`/`callGemini` (engine, T2), el `POST` del
  webhook de WhatsApp (T1) y el `POST` de `/api/ai/zones` (T3). Pasa `repo:"C:\\dev\\tu-asesor\\next-app"`.
- `npm run build` verde **y** `npm test` verde antes de commit. Añade los tests de §T2 y un test de parseo
  defensivo para §T3.
- `gitnexus_detect_changes` antes del commit; el scope debe ser solo los ficheros tocados.
- **NO** toques workflows n8n de producción, RLS, secrets ni el contrato de payloads.
- Sincroniza las envs nuevas en Netlify + `.env.local` (`ZONES_LLM_MODEL`). NO commitees secretos.
- Commit(s) en `master` (Netlify despliega solo). Mensajes `fix(...)` claros, Co-Authored-By correspondiente.
- Actualiza `docs/sync/SYNC_AI.md` con una entrada fechada (los 3 fixes + env nueva).

## 6. Qué NO hacer
- No mandar texto libre a `ADVISOR_PHONE` (siempre plantilla fuera de 24 h). No tocar las respuestas al
  cliente (sí están en ventana).
- No quitar el fallback local del copiloto de zonas ni romper el mapeo calle→zona existente.
- No usar `responseMimeType: application/json` junto con `google_search` (incompatibles).
- No re-presentar a Paula con leads ya saludados; no suprimir la presentación a leads realmente nuevos.
