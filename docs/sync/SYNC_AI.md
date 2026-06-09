# 🤖 Buzón del Agente IA & Automatización
*Bandeja de entrada para el Agente encargado de N8N, Chatbots y Webhooks.*

Si el CRM o la Web cambian su estructura de base de datos de manera que afecte a la automatización de WhatsApp o N8N, deben reportarlo aquí para que el Agente IA ajuste los flujos.

---

### 2026-06-09 — Sprint chatbot WhatsApp UX + cancelación de visitas #005

**Commits**:
- Migración Supabase: `feat(db): add cancellation fields to appointments`
- T1+T2: `feat(whatsapp): read receipts y typing indicator` (648c045)
- T4: `feat(notifications): helper de notificación de cancelación al asesor` (5c5ac33)
- T3: `feat(chatbot): cancelación de visitas con guardarraíles` (9602801)

**Migración Supabase** (`appointments`)
- Añadidas columnas: `cancelled_at TIMESTAMPTZ`, `cancelled_by TEXT DEFAULT 'bot'`, `cancellation_reason TEXT`.
- Patrón soft-delete: UPDATE `status='cancelled'` + `cancelled_at` + `cancelled_by` + `cancellation_reason`. Nunca DELETE.

**T1+T2 — Read receipts y typing indicator** (`src/lib/whatsapp.ts` + `src/app/api/webhooks/whatsapp/route.ts`)
- Nueva función `markWhatsAppRead(messageId, withTyping=false)`: llama `POST /v21.0/{PHONE_NUMBER_ID}/messages` con `status:'read'` + opcionalmente `typing_indicator:{type:'text'}`. Fire-and-forget, never throws.
- Webhook `route.ts`: tras extraer `parsed.messageId`, dispara `void markWhatsAppRead(parsed.messageId, true)` antes del procesamiento pesado. Entrega al cliente visualmente: ✅✅ azules + "Escribiendo…" inmediato.
- ⚠️ `typing_indicator` dura hasta que el bot envíe respuesta o ~25s, lo que ocurra antes. Requiere `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` en `.env.local`.

**T4 — Notificación al asesor en cancelaciones** (`src/lib/chatbot/scheduling.ts`)
- `notifyAdvisorOfCancellation({appointmentId, leadId, scheduledAt, title, reason})`: resuelve `leads.name`+`phone` vía Supabase y envía WhatsApp free-text al `ADVISOR_WHATSAPP_PHONE`.
- `countRecentCancellations(leadId, hours)`: cuenta cancelaciones en ventana deslizante para rate-limit.
- Depend: `sendWhatsAppMessage` importado desde `@/lib/whatsapp` (mensajes libres, no plantilla HSM).

**T3 — Cancelación de visitas con guardarraíles** (`src/lib/chatbot/scheduling.ts` + `engine.ts` + `systemPrompt.md` + `src/types/index.ts`)
- Nuevo export `tryHandleCancelVisit(input: CancelHookInput): Promise<SchedulingHookResult | null>`.
- Flujo de dos pasos: Fase A → ofrece reagendar/cancelar (guarda `cancel_flow:{step:'offered_reschedule'}` en metadata) → Fase B → si elige cancelar, pide motivo (step `awaiting_confirm`) → Fase C → ejecuta soft-delete + notifica.
- **5 guardarraíles**:
  1. G1: doble filtro `.eq('id', aptId).eq('lead_id', leadId)` — nunca cancela cita de otro lead.
  2. G2: rate-limit ≥3 cancels/24h → `shouldEscalate=true, intent='cancel_visit_rate_limited'`.
  3. G3: ventana <4h → `shouldEscalate=true, intent='cancel_visit_too_close'` (no negociable).
  4. G4: sin citas futuras → `intent='cancel_visit_none'`, respuesta amistosa.
  5. G5: siempre notifica al asesor vía WhatsApp tras cada cancelación exitosa.
- **Intents de sub-estado** (en `SchedulingHookResult.intent`): `cancel_visit_none`, `cancel_visit_offered_reschedule`, `cancel_visit_too_close`, `cancel_visit_rate_limited`, `cancel_visit_awaiting_confirm`, `cancel_visit_done`.
- `AIIntent` en `src/types/index.ts` ampliado con `cancel_visit`.
- `engine.ts`: invoca `tryHandleCancelVisit` en bloque 5a, con prioridad sobre `tryHandleScheduleVisit`. `cancel_visit` añadido a `VALID_INTENTS`.
- `systemPrompt.md`: nueva sección intent `cancel_visit` — "el cliente pide cancelar/anular/eliminar una visita YA confirmada. NO confundir con reagendar."

**Tests nuevos**: `src/lib/chatbot/__tests__/tryHandleCancelVisit.test.ts` — 8 tests (todos los escenarios del brief). 29/29 total verdes.

**Verificación**:
- ✅ `npm run build` verde (sin errores TS).
- ✅ `npm test` — 29/29 tests verdes (parseSpanishTime 21 + tryHandleCancelVisit 8).
- ✅ `gitnexus_detect_changes` — riesgo MEDIUM, sin HIGH ni CRITICAL.

**Gotchas para futuros agentes**:
- La cancelación es SIEMPRE soft-delete (`status='cancelled'`). NUNCA `DELETE FROM appointments`.
- El `cancel_flow` se persiste en `chatbot_conversations.metadata`. En el turno de continuación, el intent del LLM será `general_inquiry` (el usuario dice "sí"/"cancelarla") — el handler re-entra por el guard `!cancelFlow === false`, no por `intent`.
- `jest.setup.js` define `ADVISOR_WHATSAPP_PHONE`, `WHATSAPP_PHONE_NUMBER_ID` y `WHATSAPP_ACCESS_TOKEN` como constantes de módulo antes del primer import — imprescindible para que `scheduling.ts` las capture en su inicialización.

---

### 2026-06-09 — Sprint chatbot scheduling #004 (6 fixes: preferred_name durable, anti-saludo, tiempo español, restricciones, property_id, herencia interview)

**Commits**: T5.1 (`feat(engine): persist preferred_name to leads.preferences`) · T5.2 (`feat(engine): suppress Paula greeting after turn 1`) · T2 (`feat(scheduling): parseSpanishTime + jest infrastructure`) · T3 (`feat(scheduling): respetar restricciones de disponibilidad` — 63c2487) · T1 (`fix(scheduling): persistir context_property_id al recomendar inmueble` — 0ec81a0) · T4 (`feat(scheduling): pre-cita interview hereda respuestas del onboarding` — c457805)

**T5.1 — preferred_name durable** (`engine.ts`)
- `preferred_name` se persiste ahora en DOS sitios: `chatbot_conversations.metadata.preferred_name` (ya existía) **y** en `leads.preferences JSONB` (nuevo). Esto garantiza que si la conversación expira o se crea una nueva, el nombre preferido del cliente sobrevive.

**T5.2 — anti-saludo** (`engine.ts` + `systemPrompt.md`)
- Contador de turnos del asistente derivado del historial: `assistantTurnCount = history.filter(m => m.role === 'assistant').length`.
- Se inyecta `[turno_asistente: N]` en el bloque `<contexto_cliente>` cuando N ≥ 1.
- `systemPrompt.md` instruye a Paula: "Si N ≥ 1 ya te presentaste — NO abras con 'Hola', 'Soy Paula' ni presentación."

**T2 — parseSpanishTime + Jest** (`scheduling.ts` + nuevos `jest.config.js`, `jest.setup.js`, `package.json`, `src/lib/chatbot/__tests__/parseSpanishTime.test.ts`)
- Nueva función `parseSpanishTime(text)`: parsea "seis y media", "nueve menos cuarto", "cinco de la tarde", "doce en punto", etc. Devuelve `string[] | null` (1 candidato si hora unívoca; 2 si ambigua AM/PM).
- `parseDateTime` ahora llama `parseSpanishTime` antes del regex de dígitos.
- `ParsedDateTime` gana campo opcional `timeKeyCandidates?: string[]`.
- Desambiguación en `tryHandleScheduleVisit`: si 2 candidatos, selecciona el que esté libre; si ambos libres, pregunta al cliente "¿de mañana o de tarde?".
- Jest + ts-jest añadido al proyecto. 21 tests verdes.

**T3 — restricciones de disponibilidad** (`systemPrompt.md` + `engine.ts` + `scheduling.ts`)
- `systemPrompt.md`: nuevo campo `availability_hint` en `data_extracted` — objeto `{days, time_of_day}` extraído por el LLM cuando el cliente declara disponibilidad explícita.
- `engine.ts`: persiste `availability_hint` en `metadata.availability_constraints` tras cada turno del LLM.
- `scheduling.ts`: `AvailabilityConstraints` interface + helpers `filterSlotsByConstraints` y `nextDaysWithFreeSlotsConstrained`. Aplicados en CASO A (preview días), CASO B (días alternativos), CASO C (slots del día), CASO D (conflicto de hora). Tope: si tras filtrar quedan 0 huecos → listar próximos reales con aviso "No tengo huecos con ese horario, los más próximos son…".

**T1 — context_property_id** (`engine.ts`)
- Cuando `intent === 'ask_price'` y la respuesta del LLM incluye `?p=<uuid>`, extrae el UUID y lo persiste en `metadata.context_property_id` para que el flujo de scheduling resuelva el inmueble sin re-preguntar.

**T4 — herencia de entrevista** (`scheduling.ts`)
- En `tryHandleScheduleVisit`, antes de arrancar la entrevista pre-cita: lee `interview_state` previo de la conversación (de un onboarding standalone) e hereda las respuestas.
- Calcula primer paso sin respuesta: si `savings` existe → arranca en Q2; si también `funding` → en Q3; si los 3 existen → salta directo a `finalizeScheduling` sin repetir el cuestionario.

**Verificación**:
- ✅ `npm run build` verde (sin errores TS).
- ✅ `npm test` — 21/21 tests de `parseSpanishTime` verdes.
- ✅ `gitnexus_detect_changes` — riesgo LOW/MEDIUM, sin HIGH ni CRITICAL.

---

### 2026-06-09 — Sprint chatbot UX (5 tareas: contexto + dedup + nombre + entrevista reactiva + LLM-as-parser)

**Causas raíz confirmadas en producción** (no especuladas):
- (A) Ventana de contexto de 10 mensajes era insuficiente en WhatsApp ("ok"/"vale"/"perfecto" gastaban turnos).
- (B) `findOrCreateLead` no normalizaba phone → 2 pares de duplicados en BD: `Miriam Tortosa` (`34605419384` + `+34605419384`) y `David`+`Antonio Matute gago` (mismo `+34674924499`).
- (C) `leads.name` nunca llegaba pre-cargado al system prompt → bot no usaba el nombre.
- (D) `interview_state` solo se activaba con `intent='schedule_visit'` → "Perfecto" tras reserva web pasaba de largo.
- (E) Parsers regex de `parseSavings`/`parseFunding`/`parseTipoCompra` fallaban con respuestas naturales ("30 mil", "voy con efectivo", "para vivir nosotros") → bucle "no he sabido leer la cifra".

**Cambios aplicados**:

**T1 — Ventana 30** (`engine.ts`)
- `HISTORY_WINDOW = 30` extraído como const visible. `getConversationHistory(id, 30)`.

**T2 — Dedup leads** (`whatsapp/route.ts` + migración Supabase + cleanup datos)
- ⚠️ **Migración Supabase aplicada en prod**: `leads_phone_unique_index` → `CREATE UNIQUE INDEX leads_phone_unique ON leads(phone) WHERE phone IS NOT NULL`.
- Cleanup de duplicados pre-existentes (4 leads ahora, todos `+34...`): chatbot_conversation de Miriam(whatsapp) movida al lead canónico `+34605419384`; lead Antonio Matute (`10719c81`) borrado (sin FKs); phones normalizados a `+34...` con UPDATE SQL.
- `findOrCreateLead` normaliza phone con `normalizeEsPhone` antes de `.eq()` y antes de `INSERT`. Devuelve `{id, existing, existingName}`. Maneja race condition de doble INSERT con catch de `23505` y reintento del SELECT.
- `findOrCreateConversation` también normaliza + devuelve `isNew` + `metadata`.
- **T2.3 colisión de nombre**: si `leadInfo.existing && existingName !== profileName && convInfo.isNew` → setea `metadata.pending_name_resolution = {existing_name, profile_name, asked_at}`, responde "¿Prefieres que te llame X o Y?" y cortocircuita el LLM. Comparación normalizada NFD para no falsos positivos por tildes.

**T3 — preferred_name** (`engine.ts` + `systemPrompt.md`)
- Nuevo helper `buildClientContextBlock(leadContext)` unificado para los 3 providers (OpenAI/Anthropic/Gemini) → bloque `<contexto_cliente>` con "Nombre canónico (usar SIEMPRE)" = `preferred_name || name`.
- Si `metadata.pending_name_resolution` está activo → inyecta sub-bloque `<resolucion_nombre_pendiente>` instruyendo al LLM a extraer `data_extracted.preferred_name`.
- Tras el LLM, `processMessage` lee `data_extracted.preferred_name` → persiste en `metadata.preferred_name` + limpia `pending_name_resolution`.
- `systemPrompt.md` ampliado con sección "NOMBRE DEL CLIENTE (CRÍTICO — T3)" + nuevo campo `preferred_name` en `data_extracted`.
- Webhook pasa `canonicalName = leadInfo.existingName || parsed.contactName` y `normalizedPhone` al engine.

**T5 — LLM-as-parser** (nuevo `src/lib/chatbot/llmParser.ts`)
- `parseWithLLM<T>(question, userMessage, schema: {type, enumValues?, maxLen?})` → JSON validado, soporta Gemini/OpenAI/Anthropic con `temperature: 0.1` (determinista). Modelos baratos: `gemini-flash-latest`, `gpt-4o-mini`, `claude-3-5-haiku`.
- Parsers híbridos en `scheduling.ts`: `parseSavings`/`parseFunding`/`parseTipoCompra` ahora `async`, intentan regex primero (camino feliz barato) → si null, delegan al LLM. Mensajes de retry educados cuando ambos fallan.
- Regex ampliados: parseSavings soporta `30k`/`30 mil`/`30000`/`30.000€`. Funding añade `efectivo`→`Al contado`, `preaprobada`→`Preconcedida`. TipoCompra añade `para nosotros`→`habitual`.
- `parseLLMResponse` (engine.ts) ahora `async`: cuando JSON.parse falla Y regex no rescata → llama `rescueNaturalResponse` (LLM barato que reformula el output crudo). Si tampoco rescata → ESCALA en vez del "Lo siento ¿puedes repetir?" en bucle.

**T4 — Entrevista reactiva** (nuevo `src/lib/chatbot/profileCheck.ts`)
- `needsProfile(phone)`: true si no hay `buyers_demands` para el phone, O si existe con `savings_contribution=0 AND funding_type='Contado'` (defaults sin entrevista).
- `isNeutralReply(message)`: regex que captura "perfecto", "vale", "ok", "gracias", "👍", "perfecto 🙌"… (verificado inline).
- `classifyOfferReply(message)`: regex sí/no + fallback LLM (`enum yes|no|unsure`).
- `offerInterview(...)`: setea `metadata.profile_offer_pending` + devuelve oferta educada "Por cierto {nombre}, ¿te puedo hacer 3 preguntas rápidas?".
- `startStandaloneInterview(...)`: arranca `interview_state` con `mode='standalone'` (sin propertyId/scheduledAt) + marca `profile_offered=true`.
- `markOfferDeclined(...)`: limpia pending + marca offered (no insistimos en la misma conversación).
- `InterviewState` extendido con `mode?: 'pre_schedule' | 'standalone'`.
- `finalizeScheduling` en modo `standalone`: NO crea cita; solo upsert `buyers_demands` + aviso HSM `aviso_alvaro` "Perfil de comprador completado por Paula".
- Triggers en `processMessage`:
  - Si `profile_offer_pending` → clasifica respuesta sí/no → arranca standalone interview o `markOfferDeclined`.
  - Si NO se ha ofrecido antes + (`countConversationMessages===1` O `isNeutralReply`) + `needsProfile` → `offerInterview`.

**Verificación local**:
- ✅ Build verde: `npm run build` sin errores TS, 32 rutas.
- ✅ (b) UNIQUE INDEX verificado: `INSERT ... ON CONFLICT (phone) WHERE phone IS NOT NULL DO NOTHING` con phone existente → `rows_actually_inserted: 0`.
- ✅ (h) Parser savings: "unos 30 mil"→30000, "30k"→30000, "30.000€"→30000, "50k aprox"→50000, "tengo unos 30 mil ahorrados"→30000.
- ✅ (i) Parser funding: "voy con efectivo"→Al contado, "tengo preaprobada"→Preconcedida, "sin estudiar"→Necesito estudio, "tengo preconcedida del santander"→Preconcedida.
- ✅ (j) Parser tipoCompra: "para vivir nosotros"→habitual, "para alquilar"→inversion, "para mí"→habitual, "vamos a vivir nosotros mismos"→habitual.
- ✅ Detector neutral: "perfecto"→true, "ok!"→true, "perfecto 🙌"→true, "sí me gustaría agendar visita"→false.
- ⏭️ (a)(c)(d)(e)(f)(g): aplicados por construcción; requieren conversación real WhatsApp con Gemini activo para validar E2E. Si Gemini cae, T5(h)(i)(j) siguen funcionando vía fallback regex; T3/T4 que dependen del LLM caen a comportamiento neutro sin romper.

**Decisiones de Álvaro respetadas**:
- Ventana 30 (opción A).
- Colisión nombre: bot pregunta (opción C). Persiste en `metadata.preferred_name`, NO en `leads.name`.
- Entrevista reactiva: combinada — primer mensaje + neutro (opción C).
- Parseo: LLM-as-parser con regex como fast-path (opción A).

**Gotchas para futuros agentes**:
- Cualquier sitio nuevo que escriba `leads.phone` DEBE pasar por `normalizeEsPhone` o el UNIQUE INDEX lo va a romper con `23505`.
- `mode: 'standalone'` en `InterviewState`: si se añade un step nuevo a la entrevista, recuerda que en standalone NO hay `propertyId`/`scheduledAt` (strings vacíos como sentinela).
- Tras una respuesta a colisión de nombre, `preferred_name` queda en `chatbot_conversations.metadata`. NO se actualiza `leads.name` automáticamente (cambiar el nombre canónico del lead es sensible para CRM — se queda como apodo en la conversación).

---

### 2026-06-08 — Ola 3: hardening anti-inyección del chatbot Paula

**Sin cambios de schema ni infra.** Solo cambios en `src/lib/chatbot/engine.ts` y `src/lib/chatbot/systemPrompt.md`:

- Sprint A: función `sanitizeForPrompt()` en engine.ts — escapa `{{`, `}}`, prefijos `Asistente:/Cliente:`, trunca a 500 chars. Aplicada sobre titulos/descripciones de propiedades y campos del lead.
- Sprint B: eliminado el bloque `# HISTORIAL DE CONVERSACIÓN / {{CONVERSATION_HISTORY}}` del systemPrompt.md. El historial pasa SOLO por el messages array de cada proveedor (OpenAI, Anthropic, Gemini). El system prompt ya no mezcla datos de usuario.
- Sprint C (Gemini): el contexto del lead ya no se inyecta como turn fake user/model sino en `systemInstruction`, que Gemini trata como configuración de sistema.

**Impacto en n8n/webhooks**: ninguno. La interfaz de `/api/chatbot/message` y `/api/webhooks/whatsapp` no cambió.

---

### 2026-06-08 — Ola 4: botón manual de confirmación WhatsApp en CRM

**Sin cambios de schema.** Nuevos ficheros:

- `src/app/api/appointments/[id]/send-confirmation/route.ts` — POST endpoint interno del CRM que envía la plantilla HSM `confirmacion_visita_cliente` (Meta aprobada) al lead de la cita.
  - Parámetros HSM: `{{1}}`=nombre cliente, `{{2}}`=título inmueble, `{{3}}`=fecha+hora en `Europe/Madrid`.
  - Devuelve `{ success, phone, formattedDate, leadName, propertyTitle }` en éxito.
  - Códigos de error: 404 (cita no encontrada), 400 (sin teléfono / cita cancelada), 502 (Meta rechazó).
- `src/components/admin/sections/calendar/RouteListView.tsx` — botón "Confirmar" en cada tarjeta de cita (solo visible si hay teléfono y status ≠ cancelled). Gestión de estados sending/sent con hot-toast.

**Impacto en n8n/webhooks**: ninguno. Endpoint solo accesible desde el CRM admin.

---

### 2026-06-08 — Ola 5 / R9: FK `buyers_demands → leads` + backfill

🔴 **Cambio de schema en producción** — nueva columna en `buyers_demands`:

```sql
ALTER TABLE public.buyers_demands
  ADD COLUMN lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL;
CREATE INDEX idx_buyers_demands_lead_id ON public.buyers_demands(lead_id);
-- Backfill: 2/2 filas enlazadas por coincidencia de teléfono (normalizado)
```

- La columna es **nullable** (ON DELETE SET NULL) — histórico se preserva si se borra un lead.
- **Código actualizado**: `scheduling.ts` (`upsertBuyerDemand`) y `appointmentService.ts` (`bookPublicAppointment`) ya escriben `lead_id` cuando está disponible.
- `BuyerRegistrationModal.tsx` no actualizado (flujo manual del CRM — prioridad baja; FK es nullable).
- **Inventario de columnas FK añadidas**: `buyers_demands.lead_id → leads.id`.

**Impacto en n8n/workflows**: el nodo Smart Matchmaker (`/api/n8n/diffusion`) lee `buyers_demands` por phone/zona — ahora también puede usar `lead_id` para joins más eficientes si se actualiza en el futuro. Sin cambio de contrato hoy.

---

### 2026-06-08 — Ola 5 / R8: split DocumentsManager.tsx

**Sin cambios de schema ni infra.** Refactor puro de frontend:

- `DocumentsManager.types.ts` (151 líneas): 6 interfaces + `STATUS_LABEL` + `EMAIL_RE` + `emptyOwner` + `emptyParty`.
- `DocumentsManager.utils.ts` (46 líneas): `detectKind`, `detectBuyerDocType`, `mergeBody` — funciones puras ahora exportadas como módulo.
- `DocumentsManager.tsx`: 1605 → 1469 líneas. Importa de los 2 nuevos módulos.
- Build ✓, GitNexus detect_changes: riesgo LOW, 0 procesos afectados.

---

### 2026-06-08 — Ola 2 auditoría: cambio de SCHEMA (DROP de 2 tablas)

🔴 **Cambio de schema en producción** — relevante para cualquier flujo n8n/webhook:
- **Eliminadas** las tablas `property_documents` y `offers` (migración `drop_dead_tables_property_documents_offers`). Eran legacy muertas (0 filas, 0 referencias en código, 0 FKs/vistas). **Ningún workflow n8n las usaba** — pero si algún flujo futuro las referenciaba, ya no existen.
- `operating_expenses` **vaciada**: borrados los 3 gastos `is_automated=true` (baselines de prueba). La tabla arranca vacía; Álvaro mete sus gastos reales desde FinanzasTab. El auto-seed del código se eliminó.
- Inventario de tablas: **23 → 21**.
- `tool_calculations` confirmada VIVA (la escriben `/plusvalia` y `/rentabilidad`). NO tocar.

Sin cambios en webhooks ni en el contrato de `/api/webhooks/n8n`. Solo se añadió un log diagnóstico cuando `get_pending_visit_followups` se salta por ventana horaria.

### 2026-06-08 — Auditoría CRM completa → docs/CRM-GUIDE.md

**Alcance**: auditoría de lectura de los 7 frentes del CRM (Leads & Compradores, Encargos & Documentos, Inmuebles & Catálogo, Dashboard analítico, Calendario & Citas, Chatbot & IA, Integraciones). Solo documentación — sin cambios de código.

**Schema verificado** vía Supabase MCP (22 tablas, todas con RLS). Confirmado:
- `chatbot_followups` no existe (deuda ya conocida, workaround en `metadata`)
- `operating_expenses` es el nombre real (no `expenses`)
- `ai_interactions.lead_id` es NOT NULL → tabla tiene 0 filas en prod
- `buyers_demands` sin FK a `leads` — gap arquitectural documentado

**Hallazgos principales** (4 HIGH, 6 MEDIUM, 3 LOW — sin CRITICAL):
- H1/H2: MarketingTab muestra visitantes web inflados +5 y tendencias hardcodeadas (+14.2%/+8.7%) — **datos incorrectos en dashboard**
- H3: HeatmapManager es un placeholder de 11 líneas sin conexión a datos
- H4: Citas siempre en status='pending' sin confirmación automática ni aviso al cliente
- M1: FinanzasTab auto-seed puede duplicar gastos operativos
- M2: ai_interactions.lead_id NOT NULL → tabla inútil mientras no haya lead conocido en primer mensaje

**n8n verificado** (5 workflows activos confirmados vía MCP).

**Entregable**: `docs/CRM-GUIDE.md` creado (6 secciones: mapa del sistema, fichas por área, matriz componente↔tabla↔endpoint, informe de calidad, reestructuraciones recomendadas, reglas de oro).

**Sin cambios de código ni schema.** Los fixes de los hallazgos se priorizan con Álvaro en sesión separada.

---

### 2026-06-06 — Brief #002 ejecutado (7 tareas, Operaciones reales + bot que agenda + timeline encargo + IA report)

**T1. Limpieza de baselines fake en Operaciones** (`operacionesUtils.ts`)
- `SEVILLA_BARRIOS_BASELINE` vaciada (era 18 barrios inventados: Triana 48, Nervión 42, etc.).
- `growthBaseline = [120, 131, 145, 156, 168, 184]` eliminada — el acumulado mensual ahora es solo `cumulativeDbCount` real.
- `computeBuyerProfiles`: contadores arrancan en 0. Se mantienen heurísticas SOLO sobre datos declarados (no charCode % 3). Lee también `paymentMethod`/`mortgageStatus` del formulario comprador.

**T2. Reserva web crea `buyers_demands`** (`appointmentService.ts`)
- `bookPublicAppointment` ahora hace UPSERT en `buyers_demands` con los datos básicos + log en `buyer_activity_logs`. Replica el patrón de `BuyerRegistrationModal.tsx`. Fire-and-soft: si falla NO rompe la reserva.

**T3. Visitas físicas separadas por status** (`OperacionesTab.tsx` + `operacionesUtils.ts` + `PropertyReportSelector.tsx` + `CaptacionReportModal.tsx`)
- `SelectedMetrics` añade `selectedPhysicalCompleted` y `selectedPhysicalPending`.
- Informe ahora muestra "Web: X · Físicas: Y completadas (+Z pendientes)". El PDF también.

**T4. Bot que agenda con verificación + entrevista de 3 preguntas** (`chatbot/engine.ts` + nuevo `chatbot/scheduling.ts` + `systemPrompt.md`)
- Nuevo módulo `src/lib/chatbot/scheduling.ts` con la máquina de estados (interview_state persistido en `chatbot_conversations.metadata`).
- Verifica `properties.features.visitable_slots` (shape `[{date, slots[]}]`). Si vacío → `should_escalate=true` con mensaje de aviso a Álvaro. Si hora ocupada → ofrece slots libres del día. Si día sin huecos → ofrece otros días.
- Lead nuevo → lanza entrevista de 3 preguntas (ahorros / financiación / vivienda-inversión), parsea respuestas con regex/keywords, UPSERT en `buyers_demands` + crea `appointments` con status='pending', type='visita', 30 min.
- Lead ya conocido → crea cita directa sin entrevista.
- `systemPrompt.md` actualizado: el LLM NUNCA confirma cita por su cuenta, devuelve `preferred_date` en ISO y deja la lógica al sistema.

**T5. Cita del bot visible en CRM** — Verificado por inspección: `CalendarManager` (filtra por `scheduled_at` semana), `OperacionesTab` (incluida en T3), `EncargoDrawer.actividad` (incluido en T6 — ahora consulta también por `property_id`).

**T6. Tab "Actividad" del encargo → timeline mixto** (`EncargosManager.tsx`)
- Query reescrita: appointments por `lead_id OR property_id`, `buyer_activity_logs` por `property_id`, `generated_documents` por `encargo_id`, eventos sintéticos de creación/cambio del encargo.
- Render con iconos por tipo (📅 visita, 📝 nota, 📄 documento, 🔄 estado) y badges de status (Pendiente amarillo / Completada verde / Cancelada gris tachado). Orden descendente por fecha.

**T7. Endpoint `POST /api/properties/[id]/ai-report` + modal frontend** (nuevos: `api/properties/[id]/ai-report/route.ts` + `dashboard/operaciones/AIReportModal.tsx`)
- Recopila SERVER-SIDE: property, days_on_market, appointments por status + notas, propuestas/contratos firmados, web_visits, comparables (price ±15% + misma zona). Llama Gemini Flash con prompt que prohíbe inventar y exige declarar datos faltantes.
- Hook `idealistaData` reservado pero no usado todavía.
- Botón "🤖 Generar análisis IA" en `PropertyReportSelector` (junto al Informe PDF).

**Verificación**:
- `npm run build` VERDE (TypeScript OK, 31 rutas).
- `gitnexus_detect_changes` reporta 60 símbolos touched, 10 procesos afectados — todos los del scope del brief.
- T4/T7 dependen de `GEMINI_API_KEY` en Netlify; sin ella el bot cae al keyword fallback y el endpoint AI-report devuelve 502 con mensaje claro.

**Pendiente E2E por Álvaro**:
- Inmueble con `visitable_slots` configurados + mensaje del bot pidiendo visita a hora libre/ocupada/sin slots.
- Botón "Generar análisis IA" sobre un inmueble con datos reales.
- Verificar que tras reserva web aparezca el comprador en pestaña Pedidos.

---

### 2026-06-06 — Activación del seguimiento automático L-V 9:00

El workflow `Seguimiento Leads Diario` (`VnXhrEh2G8AeR0DT`) llamaba al endpoint `/api/webhooks/n8n` con `action: "get_pending_followups"`, pero esa acción NO estaba implementada — devolvía 400 "Unknown action". Por eso 0 leads habían recibido seguimiento desde el origen del proyecto.

**Implementado:**
- Migración Supabase `add_last_followup_at_to_leads`: nueva columna `leads.last_followup_at TIMESTAMPTZ` + índice parcial filtrado por `type='buyer' AND status NOT IN ('closed','lost')`.
- Acción `get_pending_followups` en `src/app/api/webhooks/n8n/route.ts`.

**Reglas (consensuadas con Álvaro):**
- Inactividad: lead entra si `updated_at <= NOW() - 60 días`.
- Cooldown: tras recibir un seguimiento, no vuelve a entrar en 90 días.
- Tope diario: máximo 20 leads por ejecución del cron.
- Filtros: `type='buyer'`, `status NOT IN ('closed','lost')`, `phone NOT NULL`.

**Importante**: el endpoint marca `last_followup_at = NOW()` ANTES de devolver la lista. Si Meta luego falla, el lead pierde un ciclo pero no entra en bucle. Detectable vía `n8n_webhook_logs`.

**No requiere cambios en n8n** — el workflow ya hace la llamada correctamente.

## 📥 Peticiones Pendientes
- 🔴 **ACCIÓN ÁLVARO — crear 2 plantillas HSM en Meta** (necesarias para que el aviso de reserva online se entregue, #9):
  - `confirmacion_visita_cliente` (idioma `es`) → al cliente. Variables: `{{1}}` nombre, `{{2}}` inmueble, `{{3}}` fecha y hora.
  - `aviso_alvaro` (idioma `es`, categoría **Utility**) → al asesor. Variable única: `{{1}}` texto libre del aviso. Reutilizable para todos los avisos al asesor (reserva, escalación, Documenso).
  - Hasta que Meta las apruebe, esos envíos fallan en silencio (no rompen la reserva). El código ya está cableado.
- ⏸️ **Documenso "Enviar a firmar"**: bloqueado por el límite mensual del plan GRATIS (consumido con pruebas de diagnóstico el 2026-05-30). Resuelto al pagar plan PRO el 2026-06-01. El código y los 4 workflows ya están listos para producción.

## ✅ [2026-06-04] 9 fallos de QA corregidos (5 tandas)

Sesión de fixes tras pruebas de Álvaro. Causa raíz verificada en código/datos antes de tocar nada.

1. **#8 Fotos/vídeos desaparecían** — el bucket Storage `properties` NO existía → cada subida caía al fallback `URL.createObjectURL` (blob temporal) que moría al recargar. Creado bucket `properties` (público, policies read público + write authenticated). Eliminado el fallback blob; guarda en onSubmit que descarta blobs residuales.
2. **#4 Autocompletado de dirección** — nuevo `AddressAutocomplete` (Nominatim/OSM, gratis, sin key). Rellena dirección + lat/lng al elegir sugerencia. Sustituye el tecleo manual de GPS.
3. **#1 Firmas Documenso mal colocadas** — `buildSimplePdf` ahora devuelve `{ bytes, signatureBoxes }` con las coordenadas REALES de cada línea de firma (% de página, origen arriba-izq). `sendForSignature` ancla los campos sobre la línea; mapeo asesor→línea "asesor/mediador".
4. **#2 Firma no secuencial** — añadido `meta.signingOrder:"SEQUENTIAL"` en `POST /documents` (verificado en OpenAPI v1). Con `signingOrder` por recipient (asesor=1), Documenso envía al cliente solo cuando Álvaro firma.
5. **#3 Bienvenida no llegaba** — la versión ACTIVA del workflow `Notificacion Nuevo Lead` (QikfXMJumWbpI3wL) era la vieja con `type:"text"` (rechazada fuera de 24h). PUBLICADA la versión HSM `bienvenida_nuevo_lead` (activeVersion `cb0bae70`).
6. **Teléfonos** — nuevo `src/lib/phone.ts` `normalizeEsPhone` (→ `+34…`), aplicado al crear leads en BuyerRegistrationModal y appointmentService.
7. **#9 Reserva online** — sustituido el WhatsApp texto-libre (siempre rechazado) por plantillas HSM (`sendWhatsAppTemplate` nuevo). appointmentService normaliza tel + auto-crea comprador + envía `confirmacion_visita_cliente` (cliente) y `aviso_alvaro` (asesor). Requiere las 2 plantillas (ver arriba).
8. **#7 Origen de lead** — nuevo `src/lib/leadSources.ts` con etiquetas canónicas + `displaySource()`. Inserts en valoración/plusvalía/rentabilidad/comprador/reserva normalizados; WarmLeadsManager los muestra legibles (legacy traducido al vuelo).
9. **#6 Vincular inmueble↔encargo + métricas** — en el drawer del encargo (tab Publicación web) se vincula/desvincula el `property_id` y se muestran métricas (visitas web por page_path + citas).
10. **#5 Comprador no salía en difusión** — era dato de prueba (buscaba Piso, inmueble era Casa → filtro de tipo descarta, correcto). Mantenido estricto. De paso endurecido el parseo de lat/lng del inmueble (venían como string en el jsonb).

**Migración aplicada**: bucket Storage `properties`. **n8n**: workflow bienvenida publicado.
**Pendiente verificación E2E por Álvaro** (no testeable desde agente): firmas reales en Documenso, entrega WhatsApp tras aprobar plantillas, subida de fotos en prod.
- ⚠️ **n8n `Difusion Inteligente` — credenciales HTTP Bearer**: tras el update v374fdb38 (2026-06-03) el MCP avisó "credentials skipped during auto-assignment" para los nodos `Enviar WhatsApp Meta` y `Log Difusion CRM`. Verificar manualmente en n8n UI que el credencial "Bearer Auth account" (id `s3YA5o57rEEdFw1W`) sigue atado a `Enviar WhatsApp Meta`. Si no, reabrir el nodo, seleccionar la credencial y re-publicar.

## 🏗️ [2026-06-04] Refactor arquitectónico CRM — separación Vendedores / Encargos / Inmuebles / Documentos

**Problema raíz**: el apartado "Encargos" (`SellersManager.tsx`) abría el `PropertyFormModal` de Inmuebles como falso "Subir encargo". Además los conceptos Vendedor / Encargo / Inmueble / Documento estaban mezclados, generando duplicación y confusión.

**Decisiones tomadas (chat-conversación, brief 2026-06-03)**:
1. **Vendedores** = solo leads en captación (`status != 'closed'`). Cuando se firma exclusiva, el lead pasa automáticamente a `status='closed'` y **desaparece** del módulo.
2. **Encargos** = expediente jurídico/comercial completo. Tabla NUEVA `encargos` (no es Property). Vincula a un lead vendedor + Nota de Encargo firmada + anexos operativos (IBI, comunidad, energética, nota simple, otros con label libre). Es el ÚNICO sitio para hacer seguimiento del encargo durante la venta.
3. **Inmuebles** = independiente, solo publicación web. Se vincula a un encargo opcionalmente vía `encargos.property_id`.
4. **Documentos** = SIEMPRE el único punto de firma. Encargos no genera ni firma documentos: solo enlaza los que ya están firmados.

**Cambios de schema (migración `create_encargos_tables_20260603`)**:
- `encargos` (PK uuid, FK seller_lead_id → leads, FK nota_encargo_doc_id → generated_documents, FK property_id → properties, status enum activo|vendido|caducado|cancelado, datos jurídicos, RLS authenticated).
- `encargo_documents` (PK uuid, FK encargo_id CASCADE, kind enum ibi|comunidad|energetica|nota_simple|otros, label, file_url, mime, RLS).
- Columna `generated_documents.encargo_id` (FK SET NULL).
- Bucket Storage `encargo-files` (privado, signed URLs, RLS authenticated).
- Trigger `set_updated_at` (search_path=public,pg_temp).

**Cambios de código**:
- Nuevo `EncargosManager.tsx` (sustituye al obsoleto `SellersManager.tsx`, ahora eliminado). Tabs por status, KPIs, drawer "Expediente Digital" con tabs Resumen/Documentos/Actividad/Publicación.
- Nuevo `EncargoFormModal.tsx` para "Añadir encargo" (selector lead + selector nota firmada + datos jurídicos + uploads).
- Nuevos endpoints server-side: `POST /api/encargos`, `GET /api/encargos`, `PATCH /api/encargos/[id]`, `DELETE /api/encargos/[id]`. La auto-transición del lead (`status='closed'` ↔ revert) vive en el endpoint para ser atómica.
- `WarmLeadsManager.tsx` filtrado a `status != 'closed'`. Tab "Encargos firmados" y badge "Encargo activo" (añadidos en T5 de la sesión anterior) ELIMINADOS — ya no aplican al nuevo modelo.
- `EncargosFirmadosTable.tsx` eliminado (su rol pasa a EncargosManager).
- Nuevos tipos en `src/types/index.ts`: `Encargo`, `EncargoStatus`, `EncargoDocument`, `EncargoDocumentKind`.
- `AdminDashboard.tsx`: el tab `sellers` ahora renderiza `EncargosManager`.

**Borrado de datos operativos** (solicitado por usuario para empezar pruebas con DB limpia):
- Borrados: leads (24), buyers_demands (6), appointments (15), generated_documents (4), seller_activity_logs (8), buyer_activity_logs, properties (6), chatbot_conversations (9), chatbot_messages (43), web_visits (833), n8n_webhook_logs (147), tool_calculations, encargos, encargo_documents, offers, property_documents.
- Mantenidos: `document_templates` (las 6 plantillas legales), `reviews` (1), `users`/auth, `posts`/`blog`.

**Pendientes para próxima sesión**:
- UI para vincular Nota de Encargo a un encargo ya existente (editar desde el drawer). El selector está en el create-modal pero no se reutiliza al editar.
- UI para vincular `property_id` desde el tab "Publicación web" del drawer (hoy solo muestra el estado, no permite cambiarlo). Cuando se publica una property nueva en Inmuebles, ofrecerle el vínculo.
- Mover los IBI/comunidad/etc del expediente a una sección "Documentos" dentro del propio drawer si se quiere subir tras creación (ya funciona, pero no testeado E2E).

## ✅ [2026-06-03] Bienvenida web pública + Fix difusión + Firma asesor + Descarga firmado + Encargos firmados

**Resumen** (6 cambios cross-cutting empaquetados en un solo deploy):

1. **`appointmentService.ts`** — al crear un lead nuevo desde la web pública (agendar visita) ahora dispara el webhook n8n `new-lead` con el payload HSM `bienvenida_nuevo_lead`. Fire-and-forget + log de auditoría en `n8n_webhook_logs`. Antes este flujo NO disparaba ningún workflow → ningún cliente recibía la bienvenida si entraba por el calendario en vez del modal `BuyerRegistrationModal`.
2. **Workflow `6E0AP0gqLUliPQtN` (Difusion Inteligente)** — fix root-cause + publicación. La versión saved tenía el Code node correcto (con `property_price_str` y `property_floor_elevator`) pero NO estaba publicada (la activa era la antigua, sin esos campos). Además el nodo `Log Difusion CRM` usaba `$json.property_title` que, tras pasar por `Enviar WhatsApp Meta`, ya era la respuesta de Meta → el CRM devolvía 400 "Missing lead_id or summary" y rompía el loop. Cambiado a `$('Separar Destinatarios').item.json.*` y publicada nueva versión `374fdb38-f915-483b-94b8-3e4960ec8f5b`.
3. **Normalización de teléfonos en `leads`** — UPDATE en producción: todos los móviles ES con formato local (9 dígitos `^[679]\d{8}$`) y todos los `34\d{9}` sin `+` fueron normalizados a `+34…`. Meta a veces rechaza silenciosamente formatos no E.164 en HSM; ahora todos los destinatarios cumplen.
4. **Firma secuencial del asesor (Documenso)** — `sendForSignature` ahora antepone `Álvaro López Cuevas <info@tuasesoralvaro.com>` con `signingOrder: 1` automáticamente para Nota de Encargo, Propuesta, Contrato, Ficha 218/2005. Lo excluye en KYC y Parte de Visita (docs unilaterales del comprador). La lógica vive en `shouldAdvisorSign(category)` dentro de `src/lib/documenso.ts`, y `route.ts /api/documents/send` ya pasa `template.category`.
5. **Descarga del PDF firmado** — Nuevo endpoint `GET /api/documents/[id]/download` que proxea a Documenso v1 (`GET /documents/{id}/download`) y soporta tanto respuesta binaria como S3 prefirmada. Devuelve `attachment; filename="..."` con nombre limpio. En `DocumentsManager.tsx` aparece un botón verde "📥 Descargar firmado" sólo cuando `signature_status === 'completed'`.
6. **Apartado Encargos enriquecido (Warm CRM)** — `WarmLeadsManager.tsx` ahora carga `generated_documents` de categoría Nota de Encargo + `signature_status='completed'` al montarse. Pinta un badge "Encargo activo desde DD/MM/YYYY" en cada fila de lead que tenga uno, más atajo de descarga. Y nuevo tab "Encargos firmados" dentro del mismo panel → renderiza `EncargosFirmadosTable.tsx` con KPIs (total, vencimiento ≤30 días, propiedades activas, honorarios esperados), filtros (búsqueda, ventana de vencimiento, sólo con propiedades activas) y acciones (descargar firmado, abrir drawer del vendedor).

**Pendiente de verificación end-to-end por Álvaro** (no se puede testear desde el agente sin sandboxes reales):
- Registrar una visita real desde la web pública → confirmar que `bienvenida_nuevo_lead` llega.
- Lanzar una difusión real con Álvaro incluido → confirmar 12/12 envíos sin error 400 en Log CRM.
- "Enviar a firmar" Nota de Encargo nueva → confirmar que el email de Documenso llega PRIMERO a `info@tuasesoralvaro.com`.
- Tras firmar manualmente → confirmar que el botón "Descargar firmado" funciona y que el badge "Encargo activo" aparece en Warm CRM.

## ✅ Workflows n8n — HSM templates cableadas [2026-05-31]
Las 3 plantillas de Meta están **APROBADAS** (`bienvenida_nuevo_lead`, `nueva_propiedad_match`, `seguimiento_lead`, idioma `es`, categoría Marketing). Se actualizaron los 3 workflows de producción para enviar con `type:"template"` (supera la ventana 24h de Meta; antes fallaban siempre con código 131047).

- `VnXhrEh2G8AeR0DT` **Seguimiento Leads Diario** → plantilla `seguimiento_lead` (1 var: lead_name).
- `QikfXMJumWbpI3wL` **Notificacion Nuevo Lead** → plantilla `bienvenida_nuevo_lead` (2 vars: lead_name, location|"Sevilla").
- `6E0AP0gqLUliPQtN` **Difusion Inteligente** → plantilla `nueva_propiedad_match` (7 vars en orden: nombre, título, dirección, precio_str, planta+ascensor, m²_str, habitaciones_str). El nodo "Separar Destinatarios" construye `property_floor_elevator` desde `floor`+`elevator`; si `floor` está vacío usa fallback "con ascensor"/"sin ascensor".
- Endpoint `/api/n8n/diffusion/route.ts` actualizado para incluir `floor` y `elevator` en el payload (nuevos campos en `richPayload.property`).

### ✅ Nuevo workflow `X2qbhCUWngf9qmJI` "Enviar Documento a Firmar (Documenso)"
Webhook `POST /webhook/send-to-sign` recibe `{generatedDocumentId, advisorPhone?, docLabel?}` → llama a `/api/documents/send` del CRM (cableado con Documenso API v1 + campo de firma) → notifica a Álvaro por WhatsApp del éxito o del error. Sirve para los 6 tipos de documento (nota, propuesta, contrato, ficha, kyc, visita). Ya activo.

**Verificación rechazada por Meta**: no afecta a estos workflows. Sólo bloquea el tier >1000 conversaciones/día y la tilde verde. Por debajo de ese tier el envío de plantillas aprobadas funciona normalmente.

## ✅ Peticiones Completadas

### ⏸️ ARCHIVADO — Workflows n8n por política 24h de Meta
> Resuelto el 2026-05-31 al usar plantillas HSM aprobadas. Ver sección anterior.

- ⏳ **Workflows n8n fallan en producción por política de 24h de Meta.** Test end-to-end del workflow `Notificacion Nuevo Lead` confirmó que Meta acepta el API call (200 OK con `wamid`) pero después marca `status: failed` con código `131047` "Re-engagement message" porque el destinatario está fuera de la ventana de 24h. Afecta a los 3 workflows (Bienvenida, Difusión, Seguimiento) — todos envían texto libre a destinatarios que típicamente no han escrito al bot recientemente. **Solución:** crear plantillas HSM aprobadas en Meta Business Manager y cambiar los workflows a `type: "template"`. Plantillas EN CREACIÓN por Álvaro al 2026-05-27.
  - **Nombres de plantilla acordados (usar EXACTAMENTE estos al cablear los workflows):**
    - `bienvenida_nuevo_lead` (MARKETING — Meta clasifica los mensajes de bienvenida como Marketing, NO Utility) → workflow `Notificacion Nuevo Lead` / nodo `WhatsApp Bienvenida`. Params: {{1}}=nombre, {{2}}=zona.
    - `nueva_propiedad_match` (MARKETING, **7 variables** — Álvaro añadió planta+ascensor el 2026-05-29) → workflow `Difusion Inteligente` / nodo `Enviar WhatsApp Meta`. Params: {{1}}=nombre, {{2}}=título, {{3}}=dirección, {{4}}=precio, {{5}}=planta+ascensor, {{6}}=m², {{7}}=habitaciones. **OJO con el orden:** el `{{5}}` nuevo desplazó m² a `{{6}}` y habitaciones a `{{7}}`. El `{{5}}` se compone de `features.floor` (texto, ej. "3º") + `features.elevator` (bool) — el workflow debe construir la frase, ej. `"3º con ascensor"` / `"Bajo sin ascensor"`. Si `floor` está vacío, usar fallback genérico.
    - `seguimiento_lead` (MARKETING) → workflow `Seguimiento Leads Diario` / nodo `WhatsApp Seguimiento`. Params: {{1}}=nombre.
  - Al adaptar (tarea pendiente), cambiar el `jsonBody` de cada nodo de `type:"text"` a `type:"template"` con `template.name`, `language.code="es"` y `components[].parameters` mapeando los {{N}} a los campos del `$json`. La credencial Bearer (`Meta WhatsApp Cloud Token`, id `s3YA5o57rEEdFw1W`) ya está cableada — no tocarla.
  - BLOQUEADO hasta que las 3 plantillas estén en estado "Aprobada" en Meta.
## ✅ Peticiones Completadas

### ✅ [2026-05-31] Documentos del comprador (Ficha 218/2005, KYC, Parte de Visita) + Contrato privado

**Sistema documental ampliado a 6 plantillas legales** con renderer compartido (`brandedDoc.ts`) y dos variantes visuales:
- **corporate** (logo + navy + dorado) — Nota de encargo, Propuesta, Ficha 218/2005, KYC, Parte de Visita.
- **legal** (serif Times, sin logo ni colores, REUNIDOS/MANIFIESTAN/ESTIPULACIONES centrados) — Contrato privado.

**Nuevas plantillas en BD:**
- `Contrato Privado de Compraventa` — 11 cláusulas, 3 firmas (Vendedora, Compradora, Asesor Mediador).
- `Ficha Informativa y Nota Explicativa del Precio` (Decreto 218/2005) — 1 firma (Comprador), cálculo automático de ITP (default 7 %) y notaría+registro (default 1,5 %) sobre precio.
- `Declaración de Titularidad Real y Origen de Fondos` (Ley 10/2010 PBC/FT) — 1 firma. Casillas como radio buttons (titularidad propia/tercero, PRP sí/no, origen fondos).
- `Reconocimiento de Visita` — 1 firma (Visitante). Cláusula de protección de honorarios (12 meses, % configurable sobre precio de salida).

**Sistema de autorrelleno desde propuesta** (la pieza más útil): al elegir plantilla `Contrato Privado` o cualquier "doc del comprador", el paso 1 muestra un selector de **propuesta de origen** en vez del "Lead vendedor". Pulsar "Pre-rellenar" copia compradores + vendedores + inmueble + precio + escalera de pagos + honorarios desde el `merged_data` de la propuesta (y de la nota de encargo del mismo seller_lead si hay). El usuario sólo añade los datos específicos del documento (notario/IBAN para contrato; ITP/cert. energética para ficha; KYC; fecha visita).

**Implementación técnica:**
- `brandedDoc.ts`: nuevo `DocVariant` + `renderLegalHtml`. `docLayout` extendido para contrato (3 firmas) y para los 3 docs del comprador (1 firma "El Comprador" / "El Visitante").
- `documenso.ts/buildSimplePdf`: respeta `variant`, soporta hasta 3 firmas, tipografía Times para legal. **Fix**: cabecera con tamaño dinámico de título (de 15pt → 9.5pt mínimo) para evitar solape con títulos largos. **Fix**: sanitize WinAnsi ya no rompe el símbolo €.
- `DocumentsManager.tsx`: nuevo `kind="comprador"` con sub-tipo `buyerDocType` ("ficha"/"kyc"/"visita"). Tres bloques de UI específicos en el modal.
- Propuesta guarda `__owners`/`__sellers` en `merged_data` para reconstruir partes al autorrellenar contratos.
- Fix de la propuesta de la sesión anterior: el bloque "Condiciones" del modal sólo pintaba la versión nota; ahora muestra plazos+escalera+días hábiles cuando es propuesta.

**Pendiente (no bloqueante, fase posterior):**
- Cableo a n8n del Parte de Visita: cuando la IA agende cita por WhatsApp, enviar al cliente un link de Documenso para firmar el reconocimiento de visita *antes* de entrar al piso. Requiere un endpoint público `/api/documents/visita-create` que reciba `{lead_comprador_id, property_id, fecha}` y devuelva la signing URL, más el nodo n8n correspondiente.

Commits: `6779cef` (contrato), `0a08df7` (ficha+kyc+visita), `39ad245` (fix cabecera+€).

### ✅ [2026-05-30] Documentos legales con marca + FIX firma (Documenso 500)

- ✅ **Nota de Encargo y Propuesta de Compraventa con identidad de marca** (navy `#0f172a` + dorado `#FBBF24`, logo, secciones numeradas, firmas). Render único compartido en `src/lib/brandedDoc.ts` (parser `parseDoc` + `renderBrandedHtml` + `docLayout` por categoría) usado por la vista previa (iframe) y por el PDF de firma (`buildSimplePdf` en `documenso.ts`, con logo embebido en `brandLogo.ts`). La propuesta lleva comprador+vendedor, escalera de 3 pagos, 2 plazos y bloque de **aceptación del vendedor** con doble firma. Plantillas en BD `document_templates` ('Nota de Encargo', 'Propuesta de compraventa') con el texto legal definitivo de Álvaro (honorarios flexibles `{{honorarios_pct}}`, cobro a éxito, no renovación automática).
- 🐞 **CAUSA RAÍZ del error 500 "Documento generado no encontrado"** al pulsar *Enviar a firmar*: **faltaba `SUPABASE_SERVICE_ROLE_KEY` en Netlify**. Sin ella, `/api/documents/send` caía al `anon key` → las RLS de `generated_documents` (solo rol `authenticated`) devolvían 0 filas → 500 confuso. NO era un problema de Documenso.
- ✅ **Fix aplicado**:
  1. `SUPABASE_SERVICE_ROLE_KEY` añadida a Netlify (contexto `all`, scopes builds/functions/runtime/post_processing). **OJO MCP**: `manage-env-vars` con `envVarIsSecret:true` creó la key SIN valor (bug); se arregló con `POST/PUT` directo a la API REST de Netlify (`/api/v1/accounts/{acct}/env`). Si vuelve a pasar, usar REST, no el flag secret del MCP.
  2. `/api/documents/send` endurecido: **exige** el service-role (503 con mensaje claro si falta, en vez del críptico "no encontrado") y lee plantilla en **2 queries** en vez de embed PostgREST.
  3. Rebuild disparado para que el runtime recoja la env.
- ✅ **[2026-05-30/31] Documenso firma — 3 obstáculos resueltos en cascada**:
  1. **404 NOT_FOUND** al crear documento → la cuenta NO tiene API **v2** (`/api/v2/documents`→404); solo **v1** (→200). **Fix**: `DOCUMENSO_API_URL` cambiada de `/api/v2` → `/api/v1` en Netlify + `.env.local`. La respuesta v1 trae `documentId`+`uploadUrl`+`recipients` (con `recipientId`).
  2. **400 "Signers must have at least one signature field"** en el `send` → v1 exige que cada firmante tenga ≥1 campo de firma. **Fix** en `sendForSignature`: entre el upload y el send, crear un `POST /documents/{id}/fields` con `type:"SIGNATURE"` por cada recipient (anclado en la última página, columnas alternas). Flujo final: create→upload(PUT)→fields→send, todo 200. Verificado e2e con `sendForSignature` real (2 firmantes).
  3. **400 "maximum number of documents allowed for this month"** → es el **límite del plan GRATIS de Documenso**, agotado por los borradores de diagnóstico (no es un bug; borrar no libera el contador mensual). **Acción Álvaro**: esperar al reset mensual o subir de plan en Documenso para probar "Enviar a firmar" en real. El código está confirmado correcto.
  - Commits: `c911d19` (v1) + fix de campos de firma. Build verde.

### ✅ [2026-05-29] UX de chats escalados (aviso + `/bot` + auto-desescalado)

Resuelve el problema del "limbo": antes, al pasar a `status='escalated'`, el webhook `POST /api/webhooks/whatsapp` hacía `return` temprano sin avisar a nadie. **Sin migración de schema** (uso del `metadata` jsonb existente de `chatbot_conversations`).

- ✅ **(1) Aviso al asesor**: cuando llega un mensaje a un chat escalado, se notifica a Álvaro por WhatsApp (`ADVISOR_WHATSAPP_PHONE`, reusa `sendWhatsAppMessage`). **Throttle** por conversación vía `metadata.last_escalation_notify_at` (default 15 min, env `ESCALATION_NOTIFY_THROTTLE_MIN`) para no saturar.
- ✅ **(2) Comando `/bot`**: si el cliente escribe `/bot` (o `bot`/`paula`/`volver al bot`/`activar bot`/`reactivar bot`/`asistente virtual`), la conversación vuelve a `status='active'`, se limpia `escalated_to` y Paula confirma. Además, **al escalar** el bot ahora avisa al cliente de que puede escribir *bot* para volver.
- ✅ **(3) Auto-desescalado**: si no hay actividad humana (último mensaje con `intent_detected='agent_reply'`) en N días (default **3**, env `ESCALATION_AUTO_REACTIVATE_DAYS`), la IA retoma el control automáticamente al llegar el siguiente mensaje. Los mensajes del cliente NO resetean el reloj. Fallback de referencia: `metadata.escalated_at` → `started_at`.
- 🔧 Nuevo helper `markEscalated()` registra `metadata.escalated_at` al escalar (tanto en escalación automática del motor como base para el cómputo). El envío manual del asesor (`/api/admin/chat/send`) ya genera mensajes `agent_reply`, que cuentan como actividad humana.
- 🔑 **Envs opcionales nuevas** (con defaults sensatos, no obligatorias): `ESCALATION_AUTO_REACTIVATE_DAYS=3`, `ESCALATION_NOTIFY_THROTTLE_MIN=15`. Conviene añadirlas a Netlify + `.env.local` si se quiere afinar.
- `gitnexus_impact` sobre `POST` = LOW (0 callers; entrypoint de Meta). Build verde.

### ✅ [2026-05-29] Tech-debt menor (limpieza Operaciones + docs Mac)

- ✅ **Eliminadas las lecturas obsoletas** `features.dias_mercado` / `features.visitas_count` del informe de Operaciones (Fase 3 ya usa `published_at` y `web_visits`). En `operacionesUtils.ts`: `computePropertyViews` y `computeSelectedMetrics` ya no caen al jsonb estático (siempre 0). **Bug corregido de paso:** `PropertyViewsRanking` ordenaba por visitas reales pero *mostraba* `features.visitas_count` (siempre "0 visitas"); ahora recibe `visitsByProperty` y muestra la cifra real. `featureNum` se mantiene (lo usa aún `precio_valoracion`, que NO es obsoleto). `gitnexus_impact` LOW (único caller `OperacionesTab`).
- ✅ **Docs migrados a Mac**: `AGENTS.md` y `SESSION_BOOTSTRAP.md` ahora apuntan a `/Users/alvarolopezcuevas/Documents/GitHub/Tu_Asesor_V2` (canónico desde 2026-05-29); retiradas las advertencias de Windows/OneDrive. Actualizada la lista de workflows n8n del bootstrap (quitado el archivado `SCHdZGrCyWVvBsMZ`, añadido `tFk38qR62f1yEnuz`). Limpiada la sección "Known tech debt" (marcados resueltos middleware→proxy y ADVISOR_WHATSAPP_PHONE).
- ℹ️ **`npm audit` (2 moderate, `postcss`<8.5.10 vía Next)**: SIN cambio — el `audit fix` propuesto degrada Next catastróficamente. Se mantiene a la espera de bump upstream en Next 16.x.
- ⚙️ **Setup Mac**: recreados `.mcp.json` (faltaba; el `gitnexus` usa `npx`, sin rutas Windows) y `.env.local` (completo, 18 claves) desde las copias subidas; eliminados los ficheros planos `env.local`/`mcp.json`/`gitignore.txt` (secretos en claro no cubiertos por `.gitignore`). `node_modules` reinstalado para binarios nativos de Mac. GitNexus reindexado.

### ✅ [2026-05-29] Fase 4e — Generación lead-driven + página previa editable

Refinamiento del generador (a petición de Álvaro): la Nota de encargo nace del **lead vendedor** (es lo que se firma para conseguir la exclusiva), no de una propiedad ya creada.

- ✅ **Generador lead-driven**: en `DocumentsManager` el paso 1 es elegir plantilla + **lead vendedor** (antes era una `property` con `is_encargo`). Los datos del inmueble salen de `leads.preferences`.
- ✅ **Página previa editable** (paso 2): modal con TODOS los campos autorrellenados y editables antes de generar, incl. los que no están en la ficha (DNI, domicilio del propietario, referencia catastral, duración del encargo). Así el contrato sale con el 100% de los datos.
- ✅ **Varios propietarios**: lista repetible (añadir/quitar) → placeholder `{{propietarios}}` (lista formateada). El propietario principal sigue alimentando `{{vendedor.*}}`.
- ✅ **Representación**: toggle "actúa en representación" → placeholder `{{representacion}}`.
- ✅ **Firmantes Documenso**: ahora `merged_data.__recipients` lleva todos los propietarios con email válido (la ruta `/api/documents/send` los prioriza; fallback a vendedor/comprador).
- ✅ Plantilla semilla "Nota de encargo" **actualizada** (SQL) para usar `{{propietarios}}`, `{{representacion}}`, `{{inmueble.referencia_catastral}}`, `{{duracion_meses}}`.
- ⏭️ Sigue pendiente que Álvaro pase el **texto legal definitivo** y los **secrets de Documenso** ya están en Netlify+.env.local.

### ✅ [2026-05-29] Fase 4c/4d — Integración Documenso (envío a firma + webhook)

**Código escrito; pendiente de activar con los secrets de Álvaro (no verificable end-to-end sin ellos).**

- ✅ **`src/lib/documenso.ts`**: cliente de Documenso Cloud (API v2). `isDocumensoConfigured()`, `buildSimplePdf(title, body)` (genera PDF A4 con **pdf-lib** — nueva dependencia, pure-JS/serverless-safe), `sendForSignature({title,pdfBytes,recipients})`, `mapDocumensoEvent()`. ⚠️ Endpoints/shapes v2 basados en docs públicas (openapi.documenso.com) — **confirmar contra la cuenta real antes de go-live**; están aislados para corregir en un sitio.
- ✅ **`POST /api/documents/send`** (`{generatedDocumentId}`): recompone el texto (plantilla + `merged_data`), genera el PDF, lo envía a Documenso y guarda `documenso_id` + `signature_status='sent'`. Usa service-role. Si faltan envs → 503 con mensaje claro. Firmantes = vendedor (+ comprador si hay email válido).
- ✅ **`POST /api/webhooks/documenso`**: verifica secreto (`DOCUMENSO_WEBHOOK_SECRET` vía cabecera `x-documenso-secret`/variantes), mapea evento (`DOCUMENT_SENT/OPENED/SIGNED/COMPLETED/REJECTED/CANCELLED`) a `signature_status`, actualiza por `documenso_id`. Al completarse, **avisa a Álvaro por WhatsApp** (`ADVISOR_WHATSAPP_PHONE`, reusa `sendWhatsAppMessage`). GET para validación del panel.
- ✅ **UI**: botón "Enviar a firmar" en cada documento generado en estado borrador (`DocumentsManager`).
- 🔑 **ACCIÓN REQUERIDA (Álvaro):** añadir en **Netlify + `.env.local`**: `DOCUMENSO_API_URL` (ej. `https://app.documenso.com/api/v2`), `DOCUMENSO_API_TOKEN` (`api_xxx`), `DOCUMENSO_WEBHOOK_SECRET`. Configurar en Documenso un webhook → `https://<dominio>/api/webhooks/documenso` con ese mismo secreto. Verificar el flujo real (endpoints v2) en un documento de prueba.
- 📦 **Dependencia nueva:** `pdf-lib` (en `package.json`/lockfile).

### ✅ [2026-05-29] Fase 4b — Tab "Documentos": plantillas + generación con autorrelleno

- ✅ Nuevo tab admin **"Documentos"** (`AdminDashboard` → `TabType 'documents'`, icono FileText) y componente `DocumentsManager.tsx`.
- ✅ **CRUD de plantillas** (`document_templates`): crear/editar/borrar, editor con cuerpo de texto y placeholders `{{...}}`.
- ✅ **Generador con autorrelleno**: elige plantilla + encargo (property `is_encargo`) + comprador (`buyers_demands`, opcional). Construye el contexto desde el lead vendedor vinculado (`leads.property_id`): `vendedor.*`, `inmueble.*` (dirección/tipo/m²), `precio`, `comision_pct`, `honorarios`, `comprador.*`, fecha/lugar. Los campos sin dato (DNI, ref. catastral, duración) se dejan como línea de relleno "________".
- ✅ Cada generación guarda un registro en `generated_documents` (`signature_status='draft'`, `merged_data` snapshot) y abre una **vista imprimible** (window.print → PDF). Lista de documentos generados con su estado.
- ⏭️ **Pendiente 4c/4d:** subir el PDF a **Documenso** y enviarlo a firma (env `DOCUMENSO_*`) + webhook `/api/webhooks/documenso` que actualice `signature_status` (+ aviso WhatsApp a Álvaro al firmarse). El estado ya se pinta en la UI; falta el flujo real de firma.

### 🚧 [2026-05-29] Fase 4a — Esquema documental (Documenso) + RLS + seed

Primer paso de la Fase 4 (plantillas + firma digital). **Solo BD; sin código aún.**

- ⚠️ **CAMBIO DE SCHEMA (prod):** 2 tablas nuevas (migración `phase4_document_templates_and_generated_docs`):
  - `document_templates` (`id, name, category, body con {{placeholders}}, is_active, timestamps`).
  - `generated_documents` (`id, template_id, property_id, seller_lead_id, buyer_id→buyers_demands, merged_data jsonb, pdf_url, documenso_id, signature_status['draft'|'sent'|'viewed'|'completed'|'rejected'], timestamps`).
- ✅ **RLS** activado en ambas, replicando el patrón de `offers`/`property_documents`: 4 políticas `authenticated` (CRUD, `true`). **Sin acceso público** (contienen PII contractual). La escritura server-side (generación/webhook) usará el service-role (bypassa RLS).
- ✅ **Seed:** plantilla "Nota de Encargo de Venta en Exclusiva" (`category='Nota de encargo'`) con placeholders `{{vendedor.*}}`, `{{inmueble.*}}`, `{{precio}}`, `{{comision_pct}}`, `{{honorarios}}`, etc. El texto legal vinculante lo completa Álvaro.
- **Decisiones cerradas:** comprador para autorrelleno = `buyers_demands`; primer lote de plantillas = solo "Nota de encargo".
- ⏭️ **Pendiente Fase 4:** 4b (tab "Documentos" + CRUD plantillas + generación/preview PDF), 4c (envío a Documenso API), 4d (webhook `/api/webhooks/documenso` + estados + aviso WhatsApp). **Env a añadir en Netlify + `.env.local` (Álvaro):** `DOCUMENSO_API_URL`, `DOCUMENSO_API_TOKEN`, `DOCUMENSO_WEBHOOK_SECRET`.

### ✅ [2026-05-29] Fase 3 — Días publicada reales + estimación de bajada de precio

Tercera fase: el informe de captación deja de usar campos estáticos y pasa a métricas reales + una estimación cuantitativa y explicable de ajuste de precio.

- ⚠️ **CAMBIO DE SCHEMA (prod):** `ALTER TABLE properties ADD COLUMN published_at timestamptz` (nullable, aditivo, no destructivo). Backfill: `published_at = created_at` para las propiedades `status='active'`. Migración aplicada vía MCP (`add_properties_published_at`).
- ✅ **"Días publicada" reales**: nuevo helper `daysOnMarket(p) = hoy − published_at` sustituye al estático `features.dias_mercado` (que nadie rellenaba → salía 0). `computeMarketDays` y `computePropertyViews` ahora promedian solo propiedades publicadas. El informe muestra "Sin publicar" si `published_at` es null.
- ✅ **Botón Publicar**: en `PropertyFormModal`, control "Publicar hoy / Despublicar" + auto-set de `published_at` cuando una propiedad pasa a `active` sin fecha. Se conserva la fecha en otros estados.
- ✅ **Visitas reales**: `OperacionesTab` carga `web_visits` y cuenta por `page_path` que contiene el id de la propiedad (antes usaba `features.visitas_count`, a 0).
- ✅ **Estimación de bajada de precio** (`computePriceDropEstimate`, `PRICE_DROP_CONFIG`): heurística documentada y tuneable. `Ajuste% = clamp(0.5·sobreprecio% + 5·factorTiempo + 3·factorVisitas, 0, 15)`; €=redondeo a 1.000€; rango [60%·ajuste … ajuste]; confianza alta/media/baja. **Valoración de referencia (decisión Álvaro):** lead vinculado (`agent_valuation`→`estimated_value`) → fallback `features.precio_valoracion`. **Tope (decisión Álvaro):** 15% (moderado). Se muestra en el selector y en el dossier PDF con las razones (transparencia).
- `SelectedMetrics` ampliado con `isPublished`; `computeSelectedMetrics` admite override de días/visitas/valoración (retrocompatible). `Property`/`PropertyRow` + `published_at?`.
- 🔧 **Tech-debt resuelto:** `features.dias_mercado` y `features.visitas_count` quedan obsoletos (ya no se leen en el informe). Pendiente decidir si se eliminan del jsonb en una limpieza futura.

### ✅ [2026-05-29] Fase 2 — Promoción unificada a Encargo + agendado de hitos

Segunda fase del refactor del ciclo de vida. **Objetivo:** convertir un lead en Encargo/Inmueble sin re-teclear datos, por una vía única, y agendar gestiones en el Calendario.

- ✅ **`PropertyFormModal` reutilizable** (props nuevas opcionales, retrocompatibles): `initialValues?: Partial<PropertyFormValues>`, `markAsEncargo?: boolean`, `submitLabel?: string`. Además **preserva `features.is_encargo`** al guardar (antes el rebuild de `features` lo borraba → un encargo editado desde Inmuebles desaparecía de Encargos; bug corregido).
- ✅ **"Subir encargo"** (entrada manual) en `SellersManager`: botón que abre el modal con `markAsEncargo` + `status='active'`. La propiedad nace ya como encargo y aparece en la pestaña.
- ✅ **Promoción desde lead** en `WarmLeadsManager` (drawer → Ficha Inmueble): CTA "Promover a Encargo en exclusiva" que abre el **mismo** modal prerellenado desde `leads.preferences` (dirección, tipo, m², hab, baños, planta, ascensor, `agent_valuation`→`price`). Al guardar: crea la propiedad (`is_encargo`, `active`), vincula `leads.property_id`, pone `status='closed'` y registra hito `Adquisición` en `seller_activity_logs`. Lead ya promovido → muestra badge de estado en vez del botón. **Ambos caminos comparten `PropertyFormModal` (sin lógica duplicada).**
- ✅ **Hito con hora → cita en Calendario** (P2.1): el formulario de timeline de Vendedores admite `datetime-local` opcional y nueva opción de evento **"📍 Adquisición"** (= visita para captar la exclusiva, según definición de Álvaro). Si se fija fecha/hora, además de loguear el hito se crea un `appointment` vinculado al `lead_id` y aparece en el Calendario.
  - ⚠️ **Tipos de cita:** se reutiliza el enum existente sin tocar BD: `Llamada/Email/Valoración → 'admin'`, `Nota de visita → 'visita'`, `Adquisición → 'captacion'`. **Decisión pendiente:** si se quiere un tipo dedicado `'llamada'` (con color/etiqueta propios en el Calendario), requiere migración del CHECK de `appointments.type` + `AppointmentFormModal` + `calendarUtils`. No hecho para evitar DDL en prod a mitad de fase.
- Sin migración de schema en esta fase. Build verde en cada sub-commit (2a/2b/2c).

### ✅ [2026-05-29] Fase 1 — Separar ciclo de vida Vendedor de Inmuebles/Encargos

Primera fase del refactor del ciclo de vida (Vendedor → Encargo → Inmueble → Documentos). **Objetivo:** un lead de valoración ya no ensucia Inmuebles/Encargos.

- ✅ **`valoracion/page.tsx`** ya **NO inserta en `properties`**. El formulario público sólo crea el lead vendedor (`type='seller'`, `source='valoracion'`, sin `property_id`); todas las características del inmueble (dirección, tipo, m², hab, baños, planta, ascensor, ciudad, CP, estado, terraza, garaje) se guardan en `leads.preferences`. Esto además **arregla la desconexión de la "Consola de Tasación"** en Vendedores, que lee precisamente `leads.preferences`.
- ✅ **Marcador `features.is_encargo` (jsonb, sin migración de schema).** `SellersManager` ("Encargos") ahora filtra `properties` por `features->>'is_encargo' = 'true'`. Sólo aparecen propiedades promovidas desde un lead o creadas vía "Subir encargo" (Fase 2). El catálogo completo sigue en "Inmuebles".
- ✅ **Migración de datos (DML, vía Supabase MCP sobre prod, confirmada por Álvaro):**
  - Desvinculados los `leads.property_id` y **borrados los 2 drafts de prueba** (`status='draft' AND price=0`, leads "yy yy"/"hh hh", `source='valoracion'`). Verificado con `SELECT` previo.
  - **Backfill `is_encargo=true`** en las 5 propiedades reales existentes (`status<>'draft'`) para que "Encargos" no se vacíe con el nuevo filtro.
  - Post-verificación: 0 drafts, 5 encargos marcados, 0 seller leads con property.
- ⚠️ **Cambio de comportamiento a tener en cuenta:** crear una propiedad nueva desde "Inmuebles" ya **no** la hace aparecer en "Encargos" hasta que tenga `is_encargo=true`. La vía para crear encargos (botón "Subir encargo" + promoción desde lead que setean el flag) llega en **Fase 2**.
- `Property.features` (en `properties/types.ts`) ampliado con `is_encargo?: boolean` (aditivo/opcional). `gitnexus_impact` HIGH por nº de importadores (19), pero cambio puramente aditivo → 0 roturas (mismo patrón que floor+ascensor).

### ✅ [2026-05-29] Nuevos campos de propiedad: planta + ascensor

- ✅ Añadidos `floor` (texto libre, ej. "3º"/"Bajo"/"Ático") y `elevator` (booleano) al formulario de alta/edición de inmuebles (`PropertyFormModal.tsx`), persistidos dentro de `properties.features` (jsonb). No requiere migración SQL (columna `features` ya es jsonb flexible).
- ✅ Schema Zod (`propertySchema`) e interface `Property.features` ampliados con ambos campos (opcionales/retrocompatibles). `gitnexus_impact` sobre `Property` marcó HIGH por nº de importadores, pero el cambio es puramente aditivo (campos opcionales) → 0 roturas. Build verde.
- **Motivo:** dar fuente de datos al `{{5}}` de la plantilla `nueva_propiedad_match` (ver Peticiones Pendientes). Las propiedades existentes no tienen estos campos → el workflow debe contemplar fallback cuando `features.floor`/`features.elevator` no existan.

### ✅ [2026-05-28] Refactor split — CalendarManager + OperacionesTab

**Commits pusheados:** `26cfb91` (docs gitnexus), `3d5465e`, `a7be337`, `d3e535f`, `a915ebf` (CalendarManager), `e624128`, `c463a1f`, `7b3be3d`, `48aef78` (OperacionesTab). Netlify auto-deploy ✅ ready.

- ✅ **GitNexus reindexado** sobre path canónico (`npx gitnexus analyze`). El índice estaba 13 commits atrás; auto-actualizó los contadores en AGENTS.md/CLAUDE.md (commit `26cfb91`). Nota: ahora hay 2 repos indexados con el mismo nombre (legacy OneDrive + canónico) → usar `repo: "C:\dev\tu-asesor\next-app"` en las tools de GitNexus.
- ✅ **`CalendarManager.tsx` (1.290 → 200 LOC)** split en 4 fases (mismo patrón que PropertiesManager). Carpeta `calendar/`:
  - `types.ts` (45), `calendarUtils.ts` (131), `CalendarKpis.tsx` (54), `CalendarToolbar.tsx` (85), `WeekGridView.tsx` (297), `RouteListView.tsx` (149), `AppointmentFormModal.tsx` (483).
- ✅ **`OperacionesTab.tsx` (1.054 → 164 LOC)** split en 4 fases. Carpeta `dashboard/operaciones/`:
  - `operacionesUtils.ts` (327, todas las derivaciones analíticas puras), `PipelineCard.tsx` (47), `MarketDaysChart.tsx` (72), `SevillaDemandChart.tsx` (86), `GrowthChart.tsx` (90), `BuyersBreakdown.tsx` (93), `PropertyViewsRanking.tsx` (58), `PropertyReportSelector.tsx` (125), `CaptacionReportModal.tsx` (235).
- Sin cambios de comportamiento ni de contrato (ambos son default-export sin props). Build verde en cada fase; `gitnexus_impact` LOW (0 callers) y `detect_changes` con scope contenido al propio componente en cada commit.



**Commits pusheados:** `47de718`, `6783a09`, `295cf85`, `3b2cd87`, `8f773bd`, `ab7766e`, `b463857`, `850968b`, `da32ef5`.

- ✅ **Bug crítico del chatbot resuelto.** La conversación WhatsApp `60dc847c-8f70-4d37-a519-150cb995d6e1` llevaba 2 días en `escalated` desde que un cliente pidió "hablar con un humano" — el webhook hacía return temprano sin avisar. Reactivada manualmente; abierto pendiente UX para evitar el problema futuro.
- ✅ **Bug del parser LLM resuelto.** El engine devolvía JSON crudo truncado como `response` al usuario (`{"response": "¡Hola! Soy Paula...` sin cerrar) cuando Gemini se quedaba sin tokens. Fix doble: `maxOutputTokens 800→1500` + parser robusto en cascada con regex-rescue del campo `response` cuando JSON.parse falla. Verificado en producción (commit `6783a09`).
- ✅ **Limpieza `public/assets/` legacy.** -4.206 LOC. JS y CSS pre-Next.js huérfanos eliminados (11+14 ficheros). Mantenidas las 2 webp referenciadas. `pattern.svg` creado (estaba referenciado pero 404). `/assets/images/logo.png` repuntado a `/logo.png`.
- ✅ **SEO fix: dominio canonical `.es` → `.com`.** 7 referencias en `blog/[slug]/page.tsx` y `BlogManager.tsx` apuntaban a `tuasesoralvaro.es` (dominio inexistente) cuando el real es `.com`. Corregido (commit `47de718`). Google estaba indexando URLs canónicas que no resolvían.
- ✅ **`Whatsapp_Business_Api (Crude)` archivado** (no solo desactivado).
- ✅ **Refactor monumental: `PropertiesManager.tsx` (1.313 → 101 LOC).** Split en 4 fases con commit + push verificado por cada una. Estructura final:
  - `PropertiesManager.tsx` (101) — orquestador puro.
  - `properties/types.ts` (69) — `Property`, schema zod, constantes.
  - `properties/propertyUtils.tsx` (31) — `formatPrice`, `getStatusBadge`.
  - `properties/PropertiesTable.tsx` (177) — tabla + búsqueda + acciones.
  - `properties/SmartMatchmakerModal.tsx` (351) — modal de difusión (state propio: leads, sliders, webhook).
  - `properties/PropertyFormModal.tsx` (667) — modal CRUD + uploads + slots.
  - **Patrón a replicar** para `CalendarManager.tsx` (1.290) y `OperacionesTab.tsx` (1.054), commits `ab7766e..da32ef5`.

### ✅ [2026-05-26] Bootstrap + saneamiento técnico + auditoría n8n + consolidación WhatsApp

**Sesión de mantenimiento ejecutada por agente Claude. Commits: `1770cca`, `bf8b80d`. Deploy Netlify `6a16042177` ✅ ready.**

- ✅ **GitNexus reindexado** sobre path canónico `C:\dev\tu-asesor\next-app` (2218 symbols, 2885 edges, 39 flows). Antes apuntaba a la copia legacy de OneDrive con índice 6 commits atrasado.
- ✅ **`middleware.ts` → `proxy.ts`** (deprecación Next 16). Impact analysis LOW, 0 callers, 0 procesos. Build pasa (Next lo identifica como "Proxy (Middleware)").
- ✅ **`sendWhatsAppMessage` consolidado** de 3 copias (`appointmentService`, webhook whatsapp, admin chat send) a 1 lib canónica `src/lib/whatsapp.ts`. -39 LOC neto, log tags y normalización E.164 opcionales.
- ✅ **Env vars Netlify ↔ `.env.local` sincronizadas**:
  - `ADVISOR_WHATSAPP_PHONE=34697223944` en ambos.
  - `GEMINI_API_KEY` añadido a `.env.local` (estaba solo en Netlify).
  - `SUPABASE_SERVICE_ROLE_KEY` añadido a ambos (faltaba en los dos; `appointmentService` y `/api/n8n/diffusion` lo necesitan para bypassar RLS server-side).
  - Diferencias intencionales respetadas: `LLM_PROVIDER` (prod=gemini, dev=keywords), `LLM_MODEL` (prod=gemini-flash-latest, dev=gpt-4o-mini).
- ✅ **Workflows n8n**:
  - `Whatsapp_Business_Api (Crude)` (`ydq4mOuK3McNc3IF`) **desactivado** — era sandbox de otro proyecto ("velas aromáticas", `clinik-ia.com`) con un nodo HTTP "2FA" que tenía el Phone ID real de Tu Asesor + access token + PIN `123456`. Riesgo neutralizado.
  - `WhatsApp Bot - Tu Asesor` (`SCHdZGrCyWVvBsMZ`) **archivado** — código muerto post-Fase 3 (el bot vive entero en `engine.ts`).
  - `Difusion Inteligente`, `Notificacion Nuevo Lead`, `Seguimiento Leads Diario` **activados** (estaban inactivos desde 2026-05-22).
  - Credencial `httpBearerAuth` "Meta WhatsApp Cloud Token" creada (id `s3YA5o57rEEdFw1W`) y **cableada en los 3 nodos HTTP Request** (`Enviar WhatsApp Meta`, `WhatsApp Bienvenida`, `WhatsApp Seguimiento`). Token literal eliminado de headers. Verificado via MCP: los 3 publicados con `authentication: genericCredentialType` + `genericAuthType: httpBearerAuth`.
- 🔍 **Hallazgos de auditoría general (GitNexus, sin tocar):**
  - `public/assets/js/*.js` (2.481 LOC en 11 ficheros) es código legacy pre-Next sin referencias. Candidato a eliminar tras revisar imágenes/CSS.
  - Componentes monolíticos: `PropertiesManager.tsx` (1.313), `CalendarManager.tsx` (1.290), `OperacionesTab.tsx` (1.054). Hot candidates a split.
  - `engine.ts` (432 LOC) bien estructurado: keywords/openai/anthropic/gemini en handlers separados.
- 🔍 **`npm audit`**: 2 moderate (`postcss` < 8.5.10 vía Next). El "fix" propuesto baja Next a 9.3.3 (catastrófico). Se mantiene; el fix real depende de bump upstream en Next 16.x.



### ✅ [2026-05-22] Fase 4 — Configuración Completa N8N + Difusión Inteligente + Escalación

**Workflows de N8N configurados y actualizados:**
1. **WhatsApp Bot — Tu Asesor** (`SCHdZGrCyWVvBsMZ`)
   - Webhook: `POST /webhook/whatsapp-incoming`
   - Procesa mensajes reenviados desde Next.js → registra interacción → consulta propiedades → responde
   - URL: https://alvaroolopez.app.n8n.cloud/workflow/SCHdZGrCyWVvBsMZ

2. **Difusión Inteligente — Smart Matchmaker** (`6E0AP0gqLUliPQtN`) [NUEVO]
   - Webhook: `POST /webhook/smart-diffusion`
   - Recibe payload enriquecido desde `/api/n8n/diffusion/` con propiedad + leads coincidentes
   - Itera cada destinatario con `SplitInBatches` → envía WhatsApp personalizado vía Meta API → registra en CRM
   - URL: https://alvaroolopez.app.n8n.cloud/workflow/6E0AP0gqLUliPQtN

3. **Notificación Nuevo Lead** (`QikfXMJumWbpI3wL`)
   - Webhook: `POST /webhook/new-lead`
   - Recibe alerta de nuevo lead → envía mensaje de bienvenida por WhatsApp → registra en log
   - URL: https://alvaroolopez.app.n8n.cloud/workflow/QikfXMJumWbpI3wL

4. **Seguimiento Leads Diario** (`VnXhrEh2G8AeR0DT`)
   - Cron: L-V a las 9:00 AM
   - Consulta propiedades activas → genera resumen → registra en log
   - URL: https://alvaroolopez.app.n8n.cloud/workflow/VnXhrEh2G8AeR0DT

**Credenciales configuradas en `.env.local`:**
- `WHATSAPP_ACCESS_TOKEN` — Token permanente de Meta (System User)
- `WHATSAPP_PHONE_NUMBER_ID` — `1061320817073599`
- `WHATSAPP_BUSINESS_ACCOUNT_ID` — `860433866401549`
- `APP_ID` — `1018904287367632`
- `APP_SECRET` — Configurado
- `ADVISOR_WHATSAPP_PHONE` — Pendiente de número real de Álvaro

**Mejoras en el webhook de WhatsApp:**
- 🔔 **Escalación inteligente**: Cuando el bot detecta `should_escalate`, ahora envía automáticamente un WhatsApp a Álvaro con:
  - Nombre del cliente, teléfono, último mensaje, intención detectada y hora
  - El asesor puede responder directamente al cliente desde su teléfono personal

**Build:** ✅ Verificado — 0 errores

### ✅ [2026-05-22] Fase 3 — Integración de Motor Chatbot en WhatsApp & Seguridad en Campañas de Difusión N8N

**Cambios realizados:**
- 🛡️ **Seguridad en Campañas de Difusión Inteligente** (`/api/n8n/diffusion/route.ts` y `src/components/admin/sections/PropertiesManager.tsx`):
  - Migrada la lógica de coincidencia (Smart Matchmaker con radio GPS Haversine y presupuestos) al backend.
  - El frontend ya NO calcula las coincidencias localmente ni expone datos confidenciales de leads en red.
  - El payload enviado al endpoint es ahora 100% ligero y anónimo: `{ event, property_id, price_margin, geo_radius }`.
  - El endpoint de Next.js procesa la coincidencia de leads de forma privada en el servidor usando Supabase y Service Role y envía el payload enriquecido de forma segura a N8N.
  - Los logs de auditoría en la BD se registran en el servidor con total confidencialidad.
- 🤖 **Integración Unificada del Chatbot Engine en WhatsApp** (`/api/webhooks/whatsapp/route.ts`):
  - Conectado el webhook de WhatsApp directamente a `processMessage` de `src/lib/chatbot/engine.ts`.
  - Habilitado el historial de conversación en WhatsApp (recuperación de los últimos 10 mensajes) para dar coherencia contextual.
  - Cargado dinámico del contexto de propiedades activas desde Supabase para nutrir las respuestas.
  - Soporte de múltiples proveedores de LLM (GPT-4o-mini y Claude-Sonnet a través de variables de entorno) y fallback robusto a palabras clave.
  - Manejo inteligente de escalaciones directas al asesor Álvaro cuando el motor detecta la intención `ESCALATE` o el cliente lo solicita.
- 🧹 **Limpieza general**:
  - Removida la lógica local redundante de `generateChatbotResponse` para los flujos principales.
  - Build verificado: 0 errores TypeScript en los módulos modificados del motor de webhook, chatbot y difusión.

### ✅ [2026-05-19] Limpieza — Migración a Meta Cloud API Oficial

**Cambios realizados:**
- ❌ **Eliminado** `src/lib/evolutionApi.ts` — Ya no se usa Evolution API
- ✅ **Reescrito** `/api/webhooks/whatsapp/route.ts` — Solo formato Meta Cloud API
  - Verificación GET con `hub.mode` + `hub.verify_token` + `hub.challenge`
  - Parseo completo de todos los tipos de mensaje: text, image, video, audio, document, location, sticker, reaction
  - Envío de respuestas integrado vía `graph.facebook.com/v21.0`
  - Función `sendWhatsAppMessage()` nativa
- ✅ **Reescrito** `/api/webhooks/whatsapp/status/route.ts` — Verifica credenciales Meta
- ✅ **Limpiado** `.env.local` — Eliminadas variables de Evolution, añadidas Meta:
  - `WHATSAPP_VERIFY_TOKEN` (del Webhook setup en Facebook Developers)
  - `WHATSAPP_ACCESS_TOKEN` (Token permanente de la app)
  - `WHATSAPP_PHONE_NUMBER_ID` (ID del número de teléfono Business)
- ✅ Build verificado: 0 errores, 0 referencias a Evolution API

**Archivos que se mantienen sin cambios:**
- `src/lib/chatbot/engine.ts` — Motor multi-provider (keywords/OpenAI/Anthropic)
- `src/lib/chatbot/systemPrompt.md` — System prompt del asistente inmobiliario
- `/api/chatbot/message/route.ts` — Endpoint del widget web
- `/api/webhooks/n8n/route.ts` — Bridge N8N
- `/api/webhooks/chatwoot/route.ts` — Receptor Chatwoot

---

### ✅ [2026-05-14] Fase 2 — Motor Chatbot + Infraestructura
*(Historial anterior preservado)*

### ✅ [2026-05-14] Fase 1 — Infraestructura Base
*(Historial anterior preservado)*
