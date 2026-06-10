# Executor Brief #007 — Decisiones estructurales del flujo CRM

**Fecha**: 2026-06-10
**Origen**: análisis as-is [docs/analysis/crm-workflow-asis.md](../analysis/crm-workflow-asis.md) +
respuestas de Álvaro a las 7 preguntas abiertas + PDF "Optimización flujo de trabajo CRM"
(plan general en [docs/analysis/plan-implementacion-crm.md](../analysis/plan-implementacion-crm.md)).

**Alcance**: problemas **#1, #2, #3, #4, #5, #10** del as-is. Materializa las decisiones 1-5 de
Álvaro + la parte "estado" de la decisión 7. Lo que toca documentos (`buyer_id`, modales
prerellenados, renombrado de event_types, `leadService`) va al brief #008. Cleanup
(`ai_interactions`, Chatwoot) al #009.

## Contexto crítico para el ejecutor

- Arranca con `git log -3` y `git status` (árbol limpio esperado). Lee `AGENTS.md`,
  `docs/sync/SYNC_AI.md` (entradas recientes) y este brief entero.
- **PRIMERO: reindexa GitNexus** (`npx gitnexus analyze`) — el índice está >83 commits atrás y los
  `gitnexus_impact` saldrían falsos. El reindex auto-actualiza contadores en AGENTS.md/CLAUDE.md →
  **commit separado** `chore(gitnexus): reindex`.
- Hay **dos repos indexados con el mismo nombre**: pasa SIEMPRE `repo: "C:\\dev\\tu-asesor\\next-app"`
  a las tools de GitNexus (en Mac, el path canónico local).
- `gitnexus_impact` antes de editar cada símbolo; `gitnexus_detect_changes()` antes de cada commit.
- Migraciones/datos en Supabase: SOLO vía MCP, con `SELECT` de verificación antes y después,
  y entrada en `SYNC_AI.md`. La BD de prod tiene pocos datos (5 leads, 3 buyers_demands, 4
  appointments) — verifica conteos exactos antes de cada UPDATE.
- Build verde + `npm test` verde antes de cada commit. Commits firmados.

## Decisiones ya tomadas por Álvaro (NO preguntar)

1. **Encargo = camino único** vía `POST /api/encargos`. "Promover a Encargo" desde Vendedores deja
   de crear `properties` y pasa a llamar al endpoint de encargos. `features.is_encargo` se deja de
   escribir (vestigio).
2. **`buyers_demands` es la fuente canónica del perfil comprador.** La difusión matchea contra
   `buyers_demands JOIN leads`. `leads.preferences` queda como metadata de origen, NO para matching.
   Backfill de los compradores existentes.
3. **Dos funnels separados** (aclaración 2026-06-10):
   - **Comprador (6 estados, automáticos):** `new` / `contacted` / `qualified` / `visit_scheduled` /
     `closed` / `lost`, con las transiciones de T2. La difusión excluye **solo `closed` y `lost`**
     (un comprador con cita para UN piso sigue siendo candidato para otros).
   - **Vendedor (4 estados, manuales — según PDF "Optimización flujo de trabajo CRM"):**
     `lost`="Inactivo/perdido" · `new`="Nuevo lead" · `contacted`="Contacto establecido" ·
     `closed`="Adquisición hecha". `qualified` y `visit_scheduled` **NO se usan para vendedores**.
     La única transición automática es la que ya existe: cualquiera → `closed` al crear encargo
     (`POST /api/encargos`); el resto del funnel del vendedor es dropdown manual en WarmLeadsManager.
   - El CHECK de `leads.status` en BD conserva los 6 valores (compatibilidad). El re-etiquetado
     visual + retirada del dropdown de los 2 estados muertos en la UI del vendedor van en el
     **brief de UI** posterior. Aquí solo: nada automático mete a un vendedor en
     `qualified`/`visit_scheduled`, y data-fix de los que estén ahí hoy (T1.0).
4. **El funnel avanza con la cita**: crear cita → `visit_scheduled` (guardando el estado previo);
   cancelar → revierte al previo.
5. **Sin doble WhatsApp**: la reserva web NO dispara la bienvenida (`bienvenida_nuevo_lead`); la
   bienvenida solo se envía al registrarse SIN reservar (BuyerRegistrationModal la conserva).
6. La propuesta la firman solo comprador → vendedor (sin Álvaro) — **brief #008**, no aquí.
7. Eventos con efecto — aquí solo los de **estado**: 'Visita física realizada' → completa la cita;
   'Valoración' (vendedor) → `qualified`. Los que abren modales de documentos → #008.
8. (Aclaración 2026-06-10 — sustituye la nota anterior.) El vendedor se rige por el modelo del PDF
   (4 estados manuales). El comprador mantiene los 6 con automatismos. Ambos coexisten sin tocar el
   schema (mismo CHECK). Si en el futuro Operaciones o Marketing leen `qualified`/`visit_scheduled`
   sobre vendedores, esos contadores quedarán a 0 hasta el brief de UI que recalibre el dashboard
   (fuera de alcance aquí).

---

## T1 — Migración de datos + helper de funnel

### T1.0 — Data fix: vendedores fuera del modelo de 4 estados (vía Supabase MCP)

`SELECT id, name, status, updated_at FROM leads WHERE type='seller' AND status IN ('qualified','visit_scheduled')` → reporta el listado.
Después `UPDATE leads SET status='contacted' WHERE type='seller' AND status IN ('qualified','visit_scheduled')`
(es el estado válido más cercano del modelo de 4: el lead ya pasó del primer contacto, pero no llegó a encargo).
`SELECT` de verificación posterior + conteo. Entrada en SYNC_AI.md.

NO migres compradores aquí — la decisión 3 los mantiene en el modelo de 6.

### T1.1 — Backfill `leads.preferences` → `buyers_demands` (migración de datos, vía Supabase MCP)

Para cada `leads` con `type='buyer'` cuyo `preferences` tenga claves de perfil
(`maxPrice`, `propertyType`, `minRooms`, `minBaths`, `paymentMethod`, `savingsContribution`,
`location`/`polygons`):

1. `SELECT` previo: lista de esos leads + sus `buyers_demands` actuales (match por `lead_id` o por
   `phone` normalizado). Reporta el mapeo a aplicar ANTES de ejecutar.
2. Si existe demand → `UPDATE` solo los campos a 0/default que el preferences pueda mejorar
   (`max_budget`, `property_type`, `rooms`, `bathrooms`, `funding_type`, `savings_contribution`,
   `preferred_zones` con la etiqueta de `location`) + `lead_id` si faltaba. **No pises valores ya
   informados** (>0 / no-default): la demand es canónica.
3. Si no existe → `INSERT` con esos campos + `name/phone/email` del lead + `lead_id`.
4. `SELECT` de verificación posterior. Entrada en SYNC_AI.md con el detalle.

Mapeo de claves: `maxPrice→max_budget` · `propertyType→property_type` · `minRooms→rooms` ·
`minBaths→bathrooms` · `paymentMethod→funding_type` · `savingsContribution→savings_contribution` ·
`location→preferred_zones[etiqueta]`. Los `polygons` NO se migran (siguen en `leads.preferences` y
la difusión los leerá vía JOIN, ver T4).

### T1.2 — Helper de funnel `src/lib/leadFunnel.ts` (nuevo)

⚠️ **Desviación deliberada del prompt de Álvaro**: pidió guardar el estado previo de la cita en
`preferences._prev_status`, pero **esa clave ya la usa el flujo de encargos** para SU reversión
([encargos/route.ts:149](../../src/app/api/encargos/route.ts) y
[encargos/[id]/route.ts:124-125](../../src/app/api/encargos/%5Bid%5D/route.ts)). Para no romper la
reversión de encargos usamos **`preferences._visit_prev_status`**. Documéntalo en SYNC_AI.

API del helper (server-side, cliente service-role inyectable):

```ts
export const FUNNEL_ORDER = ['new', 'contacted', 'qualified', 'visit_scheduled'] as const;
// closed y lost son TERMINALES: ninguna función de este helper los toca jamás.

/** Avanza el lead solo hacia delante (nunca degrada). No-op si status es closed/lost. */
export async function advanceLeadStatus(leadId: string, target: 'contacted'|'qualified'): Promise<void>;

/** Pasa a visit_scheduled guardando el estado actual en preferences._visit_prev_status.
 *  No-op si ya está en visit_scheduled/closed/lost. */
export async function setVisitScheduled(leadId: string): Promise<void>;

/** Revierte visit_scheduled → _visit_prev_status (default 'contacted' si no hay clave).
 *  SOLO si: status actual es visit_scheduled Y el lead no tiene OTRA cita activa
 *  (appointments con status IN ('pending','confirmed') y scheduled_at >= NOW()). Limpia la clave. */
export async function revertVisitStatus(leadId: string): Promise<void>;
```

Todas fire-and-soft (try/catch con `console.warn`, nunca rompen el flujo llamante).

**Tests obligatorios** (`src/lib/__tests__/leadFunnel.test.ts`, mock de supabase):
forward-only (qualified no baja a contacted) · closed/lost intocables · `setVisitScheduled` guarda
el previo · `revertVisitStatus` con otra cita activa NO revierte · `revertVisitStatus` sin clave
cae a 'contacted'.

Commits: `feat(db): backfill perfil comprador a buyers_demands` (solo SYNC_AI, la migración es
DML vía MCP) · `feat(leads): helper de funnel con reversión de visita`.

---

## T2 — El funnel se mueve solo (decisiones 3 y 4 + decisión 5)

### T2.1 — Reserva web ([src/lib/appointmentService.ts](../../src/lib/appointmentService.ts))

1. Tras crear la cita (insert en `appointments`, [:254-267](../../src/lib/appointmentService.ts)) →
   `setVisitScheduled(leadId)`.
2. **Decisión 5**: elimina el bloque que dispara el webhook n8n `new-lead`
   ([:131-178](../../src/lib/appointmentService.ts), incluida la doble escritura en
   `n8n_webhook_logs`). La reserva ya envía `confirmacion_visita_cliente`; la bienvenida queda SOLO
   en `BuyerRegistrationModal` ([BuyerRegistrationModal.tsx:403-407](../../src/components/BuyerRegistrationModal.tsx),
   que NO se toca).

### T2.2 — Paula agenda ([src/lib/chatbot/scheduling.ts](../../src/lib/chatbot/scheduling.ts))

1. En el camino directo (lead conocido, sin entrevista) y en `finalizeScheduling` modo
   `pre_schedule`: tras el INSERT de `appointments` → `setVisitScheduled(leadId)`.
2. Al completar la entrevista de 3 preguntas (tanto `pre_schedule` como `standalone`, tras el
   `upsertBuyerDemand`) → `advanceLeadStatus(leadId, 'qualified')`. Orden importa: primero
   qualified, después setVisitScheduled (así `_visit_prev_status='qualified'`).

### T2.3 — Cancelaciones revierten

1. `tryHandleCancelVisit` (scheduling.ts): tras el soft-delete (`status='cancelled'`) →
   `revertVisitStatus(leadId)`.
2. Cancelación manual desde el CRM: localiza el punto donde el admin marca una cita como
   `cancelled` (Grep `'cancelled'` en `src/components/admin/sections/calendar/` —
   `AppointmentFormModal.tsx` y/o el manager). Como es client-side y el helper es server-side,
   expón un endpoint mínimo `POST /api/leads/funnel` (body `{leadId, action: 'revert_visit'}`,
   service-role) o reutiliza un endpoint admin existente — elige lo más simple y documéntalo.

### T2.4 — `new → contacted` al primer mensaje saliente

1. Webhook WhatsApp ([route.ts](../../src/app/api/webhooks/whatsapp/route.ts)): tras enviar la
   respuesta de Paula al cliente (el `sendWhatsAppMessage` final) → si el lead existe →
   `advanceLeadStatus(leadId, 'contacted')` (el helper ya hace no-op si está más avanzado).
2. Envío manual del asesor ([admin/chat/send/route.ts](../../src/app/api/admin/chat/send/route.ts)):
   ídem tras el envío, resolviendo el lead de la conversación.
3. La bienvenida HSM de n8n NO cuenta como contacto (es automática) — no toques `new-lead`.

### Tests y criterios de aceptación (T2)

- Tests unitarios del helper (T1.2) + test de integración ligero si el patrón de mocks lo permite.
- E2E manual: (a) reserva web con lead nuevo → en BD `status='visit_scheduled'` y
  `_visit_prev_status='new'`; NO llega `bienvenida_nuevo_lead`, SÍ `confirmacion_visita_cliente`;
  (b) cancela esa cita por Paula → status vuelve a `'new'`; (c) cliente WhatsApp nuevo escribe y
  Paula responde → `'contacted'`; (d) completa la entrevista → `'qualified'`; agenda → `'visit_scheduled'`.

Commits: `feat(funnel): reserva web y Paula mueven el funnel + skip bienvenida en reserva` ·
`feat(funnel): cancelaciones revierten visit_scheduled` · `feat(funnel): contacted al primer
mensaje saliente`.

---

## T3 — Promoción desde Vendedores → `POST /api/encargos` (decisión 1, problema #2)

En [WarmLeadsManager.tsx](../../src/components/admin/sections/WarmLeadsManager.tsx):

1. El CTA "Promover a Encargo en exclusiva" deja de abrir `PropertyFormModal`. Pasa a abrir
   **`EncargoFormModal`** ([encargos/EncargoFormModal.tsx](../../src/components/admin/sections/encargos/EncargoFormModal.tsx))
   con el lead preseleccionado y los campos prerellenados desde `leads.preferences`:
   `direccion` (compón como hace `buildPromoteInitialValues` hoy), `sqm`, `rooms`, `baths`,
   `precio_captacion` ← `agent_valuation`. Si `EncargoFormModal` no admite `initialValues`/lead
   preseleccionado, añádele props opcionales retrocompatibles (mismo patrón que se usó con
   `PropertyFormModal` en Fase 2 del 2026-05-29).
2. Elimina `handleLeadPromoted` ([:399-422](../../src/components/admin/sections/WarmLeadsManager.tsx)):
   el `POST /api/encargos` ya hace la transición a `closed` (con `_prev_status`) y el log de timeline.
   NO dupliques el log 'Adquisición' desde el cliente.
3. Elimina `buildPromoteInitialValues` → PropertyFormModal y la prop `markAsEncargo` de
   [PropertyFormModal.tsx](../../src/components/admin/sections/properties/PropertyFormModal.tsx):
   **deja de escribirse `features.is_encargo`** (ni al crear ni al preservar — quita también la
   preservación del flag en el rebuild de features). No borres el dato existente en BD.
   ⚠️ `gitnexus_impact` sobre `PropertyFormModal` antes: tiene muchos importadores; el cambio debe
   ser solo de eliminación de la prop y del flag.
4. Comprueba con Grep que nadie más lee `is_encargo` (a fecha del as-is: nadie en rutas vivas;
   EncargosManager lee la tabla `encargos`). Si aparece algún lector residual, repórtalo en
   SYNC_AI y déjalo funcional.

### Criterio de aceptación

- E2E: desde el drawer de un vendedor → "Promover a Encargo" → se abre el modal de encargo
  prerellenado → guardar → el encargo aparece en la pestaña Encargos, el lead desaparece de
  Vendedores (`closed`), su timeline tiene UN solo hito de captación, y NO se ha creado ninguna
  property.
- `git grep "markAsEncargo"` → 0 resultados. `git grep "is_encargo"` → solo lecturas legacy
  documentadas o nada.

Commit: `refactor(encargos): promoción desde Vendedores usa POST /api/encargos (camino único)`.

---

## T4 — Difusión lee `buyers_demands JOIN leads` (decisión 2, problemas #3 y bug precio del PDF)

En [src/app/api/n8n/diffusion/route.ts](../../src/app/api/n8n/diffusion/route.ts):

1. Sustituye la query base ([:100-104](../../src/app/api/n8n/diffusion/route.ts)) por:
   `buyers_demands` (todas) + JOIN/lookup de `leads` por `lead_id` (select `id, name, phone, email,
   status, preferences`).
2. **Filtro de funnel** (decisión 3): descarta solo si el lead vinculado tiene
   `status IN ('closed','lost')`. Demands **sin** `lead_id`: se INCLUYEN (no hay funnel que las
   excluya) con `console.warn` para visibilidad.
3. **Presupuesto** (el bug del PDF): si `max_budget > 0` → aplica
   `max_budget >= price * (1 - price_margin/100)`; si `max_budget = 0` (perfil incompleto, p. ej.
   reserva web sin entrevista) → INCLUIR y loguear `[diffusion] demand sin presupuesto, incluida`.
4. **Tipo**: usa `buyers_demands.property_type` con la misma regla actual (descarta solo si ambos
   lados están definidos, ninguno es "Indiferente" y difieren).
5. **Habitaciones/baños**: `property rooms >= demands.rooms` (0 = sin filtro); ídem baños.
6. **Geo**: conserva la lógica actual (polygons / lat-lng / distancia) leyéndola de
   `lead.preferences` vía el JOIN cuando exista. Si la demand no tiene lead o el lead no tiene datos
   geo → **sin filtro geo** (se incluye). NO intentes geocodificar `preferred_zones`.
7. **Payload a n8n**: mismo contrato (el workflow no se toca). `name/phone/email`: del lead si hay,
   si no de la demand. `maxPricePreference` ← `max_budget`. `lead_id` ← `lead_id` (o `null`).
8. El log a `n8n_webhook_logs` se mantiene igual.

### Tests y criterio de aceptación

- Si la lógica de matching es extraíble a función pura, extrae y testea (presupuesto 0, sin lead,
  closed/lost descartado, visit_scheduled INCLUIDO, margen de precio).
- E2E manual con seed: una demand creada por la entrevista de Paula (con `max_budget` real) DEBE
  aparecer en el match de un inmueble dentro de presupuesto, y NO aparecer si
  `max_budget < price*(1-margen)`. Un lead `visit_scheduled` debe seguir entrando.

Commit: `fix(diffusion): matching contra buyers_demands JOIN leads (presupuesto real + funnel solo closed/lost)`.

---

## T5 — `/valoracion`: dedupe + normalización (problema #4)

En [src/app/valoracion/page.tsx:113-140](../../src/app/valoracion/page.tsx):

1. `normalizeEsPhone(formData.phone)` (de `@/lib/phone`) antes de cualquier query.
2. `SELECT id, preferences FROM leads WHERE phone = normalizado` → si existe: `UPDATE` con
   merge de `preferences` (las claves nuevas del formulario pisan las antiguas del mismo nombre,
   el resto se conserva) + `name`/`email` si vienen informados. Si no existe: `INSERT` como hoy
   pero con el phone normalizado.
3. Maneja la race 23505 con catch + retry del SELECT (mismo patrón que `findOrCreateLead` en
   [whatsapp/route.ts:405-455](../../src/app/api/webhooks/whatsapp/route.ts)).
4. La UX no cambia: el usuario ve el mismo paso de éxito en ambos caminos.

Criterio: enviar el formulario 2 veces con el mismo teléfono (formatos `6XXXXXXXX` y `+346XXXXXXXX`)
→ 1 solo lead en BD, preferences actualizadas, ningún error visible.

Commit: `fix(valoracion): dedupe por phone normalizado (índice único 23505)`.

---

## T6 — Eventos de timeline con efecto de ESTADO (decisión 7, parte #007)

### T6.1 — 'Visita física realizada' completa la cita (comprador)

En [BuyersManager.tsx](../../src/components/admin/sections/BuyersManager.tsx) (submit del log,
[:346-352](../../src/components/admin/sections/BuyersManager.tsx)): si `logType === 'Visita física
realizada'` → tras insertar el log, busca la cita más reciente del comprador
(vía `buyers_demands.lead_id` → `appointments` con `status IN ('pending','confirmed')`, la de
`scheduled_at` más reciente ≤ ahora; si no hay pasadas, la más próxima) y márcala
`status='completed'`. Si la demand no tiene `lead_id` o no hay cita → solo el log + toast
informativo ("sin cita que completar"). NO toca el funnel del lead.

### T6.2 — 'Valoración' marca el contacto del vendedor

En [WarmLeadsManager.tsx](../../src/components/admin/sections/WarmLeadsManager.tsx) (submit del
timeline, [:318-326](../../src/components/admin/sections/WarmLeadsManager.tsx)): si
`newLogType === 'Valoración'` → además del log (y la cita opcional si lleva fecha), llama a
`advanceLeadStatus(leadId, 'contacted')` (mismo mecanismo que en T2.3 para llamar al helper desde
cliente). Semántica: enviar la valoración ES un contacto saliente → asegura que el vendedor está al
menos en "Contacto establecido". El helper es forward-only → no-op si ya está más avanzado
(`closed`/`lost`).

⚠️ NO uses `'qualified'` como target — `qualified` no existe en el funnel del vendedor (decisión 3).
La subida del PDF de valoración como adjunto es del **brief #008**, aquí solo el estado.

Criterios: E2E manual de ambos (log → efecto visible en Calendario / en el badge de estado).

Commit: `feat(timeline): eventos con efecto de estado (visita completada, valoración cualifica)`.

---

## T7 — Cierre: fix 'GitCommit' (problema #1)

1. [encargos/route.ts:165](../../src/app/api/encargos/route.ts): `event_type: "GitCommit"` →
   `event_type: "Adquisición"` (reutiliza el tipo existente con icono propio,
   [WarmLeadsManager.tsx:508](../../src/components/admin/sections/WarmLeadsManager.tsx)).
2. Data-fix vía MCP (con SELECT previo; hoy es 1 fila):
   `UPDATE seller_activity_logs SET event_type='Adquisición' WHERE event_type='GitCommit'`.
3. Verifica que el timeline del vendedor pinta el icono de maletín, no el default.

Commit: `fix(encargos): event_type legible en el log de captación + data-fix`.

---

## Orden de ejecución recomendado

1. Reindex GitNexus → commit `chore(gitnexus): reindex`.
2. **T1.0** data fix de vendedores (MCP + SYNC_AI) → **T1.1** backfill compradores (MCP + SYNC_AI) →
   **T1.2** helper + tests → commit.
3. **T2.1 → T2.2 → T2.3 → T2.4** (un commit por sub-tarea; T2.1 incluye el skip de bienvenida).
4. **T3** promoción → encargos.
5. **T4** difusión.
6. **T5** valoración.
7. **T6** eventos de estado.
8. **T7** GitCommit + data-fix.
9. Actualizar `docs/sync/SYNC_AI.md` (entrada Brief #007 con todo) + push.

## Verificación final

1. `npm run build` verde. 2. `npm test` verde (incluye los tests nuevos de `leadFunnel`).
3. `gitnexus_detect_changes()` por commit. 4. Checklist E2E manual para Álvaro (consolidada):
reserva web nueva (funnel + 1 solo WhatsApp + sin bienvenida), cancelación (reversión), WhatsApp
nuevo (contacted), entrevista (qualified), promoción (encargo único, sin property), difusión
(demand de Paula matchea; visit_scheduled entra; presupuesto filtra), valoración duplicada
(1 lead), timeline (visita completa cita, valoración cualifica), encargo nuevo (log 'Adquisición').

## Qué NO hacer

- NO metas a un vendedor en `qualified` ni `visit_scheduled` desde ningún flujo automático
  (decisión 3 aclarada 2026-06-10: el vendedor tiene 4 estados). Si dudas, el helper de funnel
  solo se llama desde caminos de comprador (reserva web, Paula, mensajes salientes de chat); para
  el vendedor solo aplica T6.2 con target=`'contacted'` y la transición a `'closed'` del API de
  encargos (que ya existe).
- NO toques el dropdown de estados en WarmLeadsManager (`STATUS_CONFIG` con 6 entradas) — la
  retirada visual de `qualified`/`visit_scheduled` del vendedor es del **brief de UI** posterior.
  En este brief solo se garantiza que ningún automatismo los asigna y que los actuales se migran
  (T1.0).
- NO toques `BuyerRegistrationModal` (su bienvenida y su doble escritura leads+demands se quedan).
- NO uses la clave `preferences._prev_status` para la reversión de citas — colisiona con el flujo
  de encargos. Es `_visit_prev_status` (ver T1.2).
- NO cambies el contrato del payload con el workflow n8n de difusión (`Separar Destinatarios`
  espera los mismos campos) ni toques ningún workflow en n8n.
- NO implementes todavía: `closed` del comprador al completarse el Contrato Privado (depende de
  `generated_documents.buyer_id`, que hoy es siempre NULL → brief #008), el registro de impactos de
  difusión y la exclusión manual de destinatarios (PDF §4.1 → brief posterior), el renombrado de
  `'IA WhatsApp'` (#008), `leadService` (#008), `ai_interactions`/Chatwoot (#009).
- NO borres datos de `features.is_encargo` ni de `leads.preferences` — solo se deja de escribir/leer.
- NO apliques ningún UPDATE/INSERT en prod sin SELECT previo de verificación y entrada en SYNC_AI.
