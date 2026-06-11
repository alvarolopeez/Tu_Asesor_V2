# Executor Brief #008 — Limpieza de deuda + timeline con efecto (documentos)

**Fecha**: 2026-06-10
**Origen**: análisis as-is [docs/analysis/crm-workflow-asis.md](../analysis/crm-workflow-asis.md) +
decisiones de Álvaro. Continuación de [EXECUTOR-BRIEF-007.md](EXECUTOR-BRIEF-007.md) (estructural).

**Alcance**: problemas **#6, #7, #8, #9, #11, #13** del as-is + la mitad "documentos" de la
decisión 7 (eventos de timeline que abren modales de documento pre-rellenados). NO arranques hasta
que **el brief #007 esté ejecutado y mergeado** — varias tareas dependen de su estado de funnel y
de su backfill `buyers_demands`.

## Contexto crítico para el ejecutor

- `git log -3`, `git status` (limpio). Lee `AGENTS.md`, `SYNC_AI.md` recientes, el brief #007 y su
  entrada en SYNC_AI (para saber qué quedó hecho).
- GitNexus reindexado (lo hizo el #007). Si `git log` muestra commits nuevos sin reindexar →
  `npx gitnexus analyze` primero. Pasa SIEMPRE `repo: "C:\\dev\\tu-asesor\\next-app"`.
- `gitnexus_impact` antes de editar cada símbolo; `gitnexus_detect_changes()` antes de cada commit.
  **`DocumentsManager.tsx` y el engine son de alto fan-in** → impact obligatorio.
- Supabase solo vía MCP con SELECT de verificación + entrada SYNC_AI. Build + tests verdes por commit.

## Decisiones ya tomadas (NO preguntar)

1. `buyers_demands` es la fuente canónica del comprador (brief #007 ya hizo el backfill y la difusión).
   En este brief: el **selector de comprador de Documentos** se nutre de `buyers_demands`.
2. Eventos de timeline con efecto (parte documentos, decisión 7 de Álvaro):
   - 'Oferta presentada' (comprador) → abre modal **Propuesta de Compraventa** pre-rellenado.
   - 'Contrato firmado' (comprador) → abre modal **Contrato Privado** pre-rellenado.
   - 'Adquisición' (vendedor) → abre modal **Nota de Encargo** pre-rellenado.
   - 'Valoración' (vendedor) → adjuntar PDF de valoración. ⚠️ **DIFERIDO** (ver T6, requiere infra de
     storage de documentos de perfil que llega con el brief de UI del PDF). El estado del lead ya lo
     movió el #007.
3. Taxonomía de event_types: se renombran los engañosos (D13 del plan). Migración de datos incluida.
4. `/rentabilidad` crea `buyers_demands` (el inversor debe verse en Pedidos).
5. Widget web de Paula: captura de contacto **sin tocar `engine.ts`** (solo widget + route).

---

## T1 — `leadService`: dedupe normalizado (problema #9)

[src/lib/leadService.ts](../../src/lib/leadService.ts) lo usan `plusvalia` y `rentabilidad`.
Hoy busca `eq('phone', phone.trim())` ([:54-58](../../src/lib/leadService.ts)) e inserta el crudo
([:73-79](../../src/lib/leadService.ts)) → `666...` y `+34666...` no matchean → duplicados, y con el
índice único `leads_phone_unique` un mismo formato repetido daría 23505.

1. Importa `normalizeEsPhone` de `@/lib/phone`. Normaliza ANTES de buscar y de insertar.
2. Maneja la race 23505: si el INSERT falla con `code === '23505'`, reintenta el SELECT por phone
   normalizado y reutiliza ese `leadId` (mismo patrón que `findOrCreateLead` en
   [whatsapp/route.ts:436-448](../../src/app/api/webhooks/whatsapp/route.ts)).
3. No cambies la firma pública (`submitLeadWithCalculation`) — `plusvalia`/`rentabilidad` no se
   enteran.

Test: `src/lib/__tests__/leadService.test.ts` (mock supabase) — phone en 2 formatos → 1 solo lead;
23505 en insert → reusa el existente. Commit: `fix(leads): leadService normaliza y deduplica phone`.

---

## T2 — `/rentabilidad` crea `buyers_demands` (problema #8)

El inversor de [rentabilidad/page.tsx:140-158](../../src/app/rentabilidad/page.tsx) entra como
`leads type='buyer'` pero **sin `buyers_demands`** → invisible en Pedidos y en difusión.

Opción elegida (mínima, server-safe): tras `submitLeadWithCalculation` con éxito y `leadId`
disponible, hacer un **upsert mínimo de `buyers_demands`** vinculado por `lead_id`:
`name`, `phone` (normalizado), `max_budget = precioCompra` (el inversor compra a ese precio →
sirve para que la difusión lo capte), `property_type='Indiferente'`, `status='Activo'`
(coherente con el modelo del #007 si ya migró estados; si el #007 dejó 'Búsqueda activa', usa el
valor vigente — **verifica el enum real en BD antes**), `lead_id`.

- Dedupe por phone normalizado (si ya hay demand para ese phone → update no destructivo, no pises
  `max_budget` si ya es > 0 e informado por otra vía).
- Hazlo en un helper reutilizable `upsertMinimalBuyerDemand(leadId, {...})` dentro de `leadService`
  o un módulo nuevo, para no duplicar la lógica con `appointmentService`/`BuyerRegistrationModal`.
- Fire-and-soft: si falla, el lead y el cálculo ya están; no rompas la UX (paso 3 igual).

⚠️ La calculadora corre con **anon key** (cliente público). Verifica que `buyers_demands` tenga
policy de insert/upsert público (como `tool_calculations` y `leads`). Si NO la tiene → el upsert
fallaría silencioso: en ese caso, **propón** (no apliques sin OK) una policy `INSERT` pública
validada espejo de la de `tool_calculations`, regístralo como cambio de RLS en SYNC_AI y pídele
confirmación a Álvaro (AGENTS.md prohíbe tocar RLS sin confirmación).

E2E: rellenar `/rentabilidad` → el comprador aparece en Pedidos con su presupuesto. Commit:
`feat(rentabilidad): el inversor entra en buyers_demands (visible en Pedidos)`.

---

## T3 — Selector de comprador real en Documentos (problema #6)

Hoy `buyerId` se inicializa a `""` en los 3 caminos
([DocumentsManager.tsx:126](../../src/components/admin/sections/DocumentsManager.tsx),
[:229](../../src/components/admin/sections/DocumentsManager.tsx),
[:316](../../src/components/admin/sections/DocumentsManager.tsx)) y el INSERT guarda
`buyer_id: form.buyerId || null` ([:592](../../src/components/admin/sections/DocumentsManager.tsx)) →
**siempre NULL**. El comprador se teclea como `owners`.

1. En `fetchAll` ([:74-79](../../src/components/admin/sections/DocumentsManager.tsx)) añade la carga
   de `buyers_demands` (`id, name, phone, email, max_budget, lead_id, status`), guardándolas en
   estado (`buyerDemands`).
2. En el paso 1 de **Propuesta** (`openEditor` con `kind==='propuesta'`,
   [:121-130](../../src/components/admin/sections/DocumentsManager.tsx)) añade un selector opcional
   "Comprador (de Pedidos)". Al elegirlo:
   - `form.buyerId = demand.id`.
   - Pre-rellena `owners[0]` con `nombre/telefono/email` de la demand (el usuario aún puede editar /
     añadir DNI / añadir más owners).
3. El INSERT ([:588-595](../../src/components/admin/sections/DocumentsManager.tsx)) ya pasa
   `buyer_id: form.buyerId || null` → ahora se rellena cuando se eligió comprador.
4. Mantén el camino manual (sin seleccionar comprador) intacto: `buyerId` queda `""`→NULL.

⚠️ `gitnexus_impact` sobre `DocumentsManager` / `openEditor` antes. No cambies `merged_data.__owners`
(lo consumen Contrato/KYC al heredar) — solo lo PRE-rellenas desde la demand.

E2E: generar una Propuesta eligiendo un comprador de Pedidos → en BD `generated_documents.buyer_id`
no es NULL y apunta a la demand correcta. Commit:
`feat(documentos): selector de comprador (buyers_demands) en la propuesta`.

---

## T4 — Navegación inter-tab: evento de timeline → modal de Documentos (decisión 7, problema #11)

**Mecanismo** (especificación obligatoria, sin sobre-ingeniería):
[AdminDashboard.tsx](../../src/components/admin/AdminDashboard.tsx) ya tiene
`const [activeTab, setActiveTab] = useState<TabType>('dashboard')` ([:53](../../src/components/admin/AdminDashboard.tsx)).

1. Añade un estado `const [docIntent, setDocIntent] = useState<DocIntent | null>(null)` donde
   `DocIntent = { kind: 'propuesta'|'contrato'|'nota'; leadId?: string; buyerId?: string; encargoId?: string }`.
2. Crea un callback `goToDocuments(intent: DocIntent)` que hace `setDocIntent(intent)` +
   `setActiveTab('documents')`. Pásalo como prop opcional a `BuyersManager` y `WarmLeadsManager`
   ([:320](../../src/components/admin/AdminDashboard.tsx), [:326](../../src/components/admin/AdminDashboard.tsx)).
3. Pasa `docIntent` + `onIntentConsumed={() => setDocIntent(null)}` a `DocumentsManager`
   ([:344](../../src/components/admin/AdminDashboard.tsx)). En `DocumentsManager`, un `useEffect`
   sobre `docIntent` que, cuando llega, preselecciona la plantilla del `kind` y abre el editor
   correspondiente (`openEditor` / `openEditorFromProposal` / `openEditorBuyerDoc`) con el
   lead/comprador/encargo del intent, y luego llama `onIntentConsumed`.

**Cableado de eventos** (en los submits de timeline; el efecto se dispara DESPUÉS de insertar el log):
- `BuyersManager` ([:346-352](../../src/components/admin/sections/BuyersManager.tsx)):
  - `logType === 'Oferta presentada'` → `goToDocuments({ kind:'propuesta', buyerId: selectedBuyer.id, leadId: selectedBuyer.lead_id })`.
  - `logType === 'Contrato firmado'` → `goToDocuments({ kind:'contrato', buyerId: selectedBuyer.id })`
    (el Contrato parte de una Propuesta de origen; si el flujo exige propuesta previa, el editor de
    contrato ya la pide — pásale lo que tengas y deja que DocumentsManager resuelva).
- `WarmLeadsManager` ([:318-326](../../src/components/admin/sections/WarmLeadsManager.tsx)):
  - `newLogType === 'Adquisición'` → `goToDocuments({ kind:'nota', leadId: selectedLead.id })`.

Mantén el log narrativo además del efecto (el evento se sigue registrando en el timeline).

E2E: en un comprador, añadir evento 'Oferta presentada' → salta a Documentos con la Propuesta
abierta y el comprador pre-rellenado. Commit:
`feat(timeline): eventos transaccionales abren el modal de documento prerellenado`.

---

## T5 — Renombrado de event_types engañosos (problema #7)

Los tipos `'IA WhatsApp'` y `'Llamada telefónica'` (auto) mienten sobre el origen. Renombrar:

1. **Código** (puntos de escritura auto):
   - [BuyerRegistrationModal.tsx:449](../../src/components/BuyerRegistrationModal.tsx) (update web)
     → `'Actualización web'`.
   - [BuyerRegistrationModal.tsx:495](../../src/components/BuyerRegistrationModal.tsx) (alta web)
     → `'Registro web'`.
   - [appointmentService.ts:235](../../src/lib/appointmentService.ts) (reserva web) → `'Reserva web'`.
   - [BuyersManager.tsx:278](../../src/components/admin/sections/BuyersManager.tsx) (alta manual CRM)
     → `'Alta en CRM'`.
2. **`getTimelineIconConfig`** en BuyersManager y el equivalente de WarmLeadsManager: añade iconos/
   colores para los tipos nuevos (reusa los que ya existen; p. ej. web → icono globo, reserva web →
   calendario). Conserva los tipos antiguos en el switch (default razonable) por si hay filas legacy
   sin migrar.
3. **Migración de datos** (vía MCP, con SELECT previo — hoy ~4 filas en `buyer_activity_logs`):
   `UPDATE buyer_activity_logs SET event_type='Registro web' WHERE event_type='IA WhatsApp' AND title ILIKE '%Registro%'`
   y variantes por `title` para mapear cada origen. Reporta el mapeo exacto antes de ejecutar.
4. Los tipos del **dropdown manual** (Llamada, Nota, Visita física realizada, Oferta presentada,
   Contrato firmado) NO se tocan — son los que elige el usuario.

Commit: `refactor(timeline): event_types legibles por origen + migración`.

---

## T6 — 'Valoración' (vendedor) adjunta PDF — ⚠️ DIFERIDO, NO IMPLEMENTAR AQUÍ

La parte de ESTADO ya está en el brief #007 (T6.2 → `contacted`). El **adjunto** del PDF de
valoración necesita infraestructura de almacenamiento de documentos de perfil
(tabla `lead_documents` o `buyer_documents`/`seller_documents` + bucket privado), que es la misma
que pide el PDF "Optimización flujo de trabajo CRM" (§1.2 documentación del comprador, §2 ficha del
vendedor). **No crees infra parcial aquí.** Déjalo para el brief de UI/perfiles (rediseño a página
completa), donde se diseña esa capa de una vez. Solo: deja una nota en SYNC_AI marcando la
dependencia. No es un cambio de código en este brief.

---

## T7 — Captura de lead en el widget web de Paula (problema #13)

⚠️ **Tarea de mayor riesgo del brief. NO toques `engine.ts` ni `scheduling.ts`.** Solo
[FloatingChatWidget.tsx](../../src/components/FloatingChatWidget.tsx) y
[chatbot/message/route.ts](../../src/app/api/chatbot/message/route.ts).

Hoy el widget es anónimo: `conversation_id` en localStorage, sin teléfono, sin lead
([message/route.ts:28-44](../../src/app/api/chatbot/message/route.ts)). Objetivo mínimo: poder
capturar el contacto cuando el visitante quiere continuar.

1. **Widget**: añade un campo opcional de contacto (nombre + teléfono) que aparece tras el primer
   par de mensajes (o con un botón "Quiero que me contacte un asesor"). Al rellenarlo, mándalo en el
   `body` de `/api/chatbot/message` como `{ visitor_name, visitor_phone }`.
2. **Route**: si llega `visitor_phone`, normalízalo (`normalizeEsPhone`) y haz `findOrCreateLead`
   (reutiliza el helper del webhook de WhatsApp si es exportable, o replica el patrón mínimo) con
   `type='buyer', source='web_widget'`. Vincula `chatbot_conversations.lead_id` a ese lead.
   Si NO llega teléfono → comportamiento actual (anónimo), sin cambios.
3. NO dispares bienvenida n8n desde aquí (es web, el contacto es saliente del cliente).

E2E: abrir el widget, dar nombre+teléfono → en BD aparece un `leads` `source='web_widget'`
vinculado a la conversación. Sin teléfono → sigue anónimo, sin regresiones. Commit:
`feat(widget): captura opcional de contacto en el chat web (sin tocar engine)`.

---

## Orden de ejecución recomendado

1. **T1** leadService → **T2** rentabilidad (depende del helper de T1).
2. **T3** selector de comprador.
3. **T4** navegación inter-tab + cableado de eventos (depende de T3 para el comprador).
4. **T5** renombrado event_types + migración.
5. **T7** widget (aislada, la más arriesgada — déjala con su propio commit y E2E).
6. (T6 no se implementa: nota en SYNC_AI.)
7. Entrada Brief #008 en `SYNC_AI.md` + push.

## Verificación final

`npm run build` + `npm test` verdes · `gitnexus_detect_changes()` por commit · checklist E2E:
calculadora rentabilidad/plusvalía duplicada → 1 lead; inversor visible en Pedidos; propuesta con
comprador real → `buyer_id` poblado; 'Oferta presentada'/'Adquisición' abren el modal correcto;
timeline con tipos legibles; widget con teléfono → lead vinculado.

## Qué NO hacer

- NO toques `engine.ts` ni `scheduling.ts` (T7 vive solo en widget + route).
- NO implementes el adjunto de valoración (T6 diferido) ni crees tabla/bucket de documentos de perfil.
- NO toques RLS sin confirmación de Álvaro (si T2 lo necesita, PROPÓN y para).
- NO borres filas legacy de activity_logs: solo migra `event_type` con UPDATE.
- NO cambies la firma de `submitLeadWithCalculation` ni el contrato de `/api/chatbot/message`
  existente (añade campos opcionales, no rompas el shape actual del widget).
- NO toques `ai_interactions` ni Chatwoot (van en #009).
