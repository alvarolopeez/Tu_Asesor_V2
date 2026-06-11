# Executor Brief #011 — Completar el plan CRM: migraciones, difusión 2.0, UI vendedor, perfiles a página completa y flujo de Propuesta

**Fecha**: 2026-06-11
**Origen**: [docs/analysis/plan-implementacion-crm.md](../analysis/plan-implementacion-crm.md) (plan maestro
del PDF "Optimización flujo de trabajo CRM") — este brief ejecuta TODO lo que los briefs #007–#010 dejaron
pendiente: resto de Fase 0, resto de Fase 1, resto de Fase 2, Fase 3 completa, Fase 4 completa y flecos.
**Prerrequisito**: briefs #007, #008, #009 y #010 ejecutados y pusheados (verifica con `git log`).

---

## ⚠️ Cómo ejecutar este brief — LÉEME PRIMERO

Este brief es grande. **NO intentes hacerlo entero en una sola sesión.** Ejecuta por SESIONES, en este
orden, cerrando cada una con push + entrada en SYNC_AI (la sesión siguiente arranca leyendo SYNC_AI):

- **SESIÓN A** → S0 (arranque) + F0 (migraciones, con OK de Álvaro) + F1 (difusión 2.0 y bugs de
  inmuebles) + F2 (UI vendedor). Es la sesión más mecánica y de más valor inmediato.
- **SESIÓN B** → F3 (perfiles a página completa). Es la más grande de UI; depende de F0 (tablas nuevas).
- **SESIÓN C** → F4 (flujo de Propuesta con gate; empieza por el SPIKE Documenso) + F5 (flecos n8n/Chatwoot)
  + cierre de docs.

Cada sesión empieza con: `git log -5` + `git status` (limpio) → leer `AGENTS.md`, `docs/sync/SYNC_AI.md`
(entradas de #007–#011) → `npx gitnexus analyze` si hay commits sin indexar (los contadores de
AGENTS.md/CLAUDE.md cambian → commit separado `chore(gitnexus): reindex`).

**Reglas transversales (idénticas a #007–#010)**:
- GitNexus: hay DOS repos indexados con el mismo nombre → pasa SIEMPRE `repo: "C:\\dev\\tu-asesor\\next-app"`.
  `gitnexus_impact` antes de editar cada símbolo; `gitnexus_detect_changes()` antes de cada commit;
  avisar a Álvaro si sale HIGH/CRITICAL antes de proceder.
- Supabase SOLO vía MCP (project `hmzqgtitlonaxbwlhcob`): SELECT de verificación antes y después de cada
  UPDATE/INSERT/DDL + entrada en SYNC_AI. El MCP solo devuelve el ÚLTIMO statement de un batch — lanza
  las queries de verificación por separado. DDL con `apply_migration`, DML con `execute_sql`.
- `npm run build` + `npm test` verdes antes de cada commit. 1 tarea ≈ 1 commit.
- NO tocar `engine.ts`/`scheduling.ts` del chatbot, ni RLS sin OK, ni workflows n8n de PRODUCCIÓN sin el
  procedimiento de F5. NO pegar secretos en commits/transcript.

---

## Estado heredado de #007–#010 (lo que YA existe y debes REUSAR, no reinventar)

| Pieza | Dónde | Qué hace |
|---|---|---|
| `leadFunnel.ts` | `src/lib/leadFunnel.ts` | `advanceLeadStatus` (forward-only), `setVisitScheduled`, `revertVisitStatus`. `closed`/`lost` terminales. ⚠️ Dos claves de reversión en `leads.preferences` que NO se mezclan: `_prev_status` (encargos) y `_visit_prev_status` (citas). |
| `POST /api/leads/funnel` | `src/app/api/leads/funnel/route.ts` | Puente client→helper (`revert_visit` / `advance`). Sin API key (mismo patrón que `/api/encargos`). |
| **Funnel doble** | — | Comprador: 6 estados con automatismos. Vendedor: 4 estados MANUALES (`new`/`contacted`/`closed`/`lost`); ningún automatismo mete a un vendedor en `qualified`/`visit_scheduled`. |
| `DocIntent` | `DocumentsManager.types.ts` + `AdminDashboard.tsx` (`goToDocuments`) | Navegación inter-tab → abre el editor de Documentos prerellenado (`kind: 'propuesta'|'contrato'|'nota'`). `BuyersManager` y `WarmLeadsManager` ya reciben `onGoToDocuments`. |
| Selector de comprador en Propuesta | `DocumentsManager.tsx` (`genBuyerId`, `buyerDemands`) | `generated_documents.buyer_id` YA se rellena al elegir comprador de Pedidos. |
| `diffusionMatch.ts` | `src/lib/diffusionMatch.ts` | Matching PURO de difusión (20 tests). La ruta `api/n8n/diffusion` lee `buyers_demands` JOIN `leads` (funnel descarta solo `closed`/`lost`; geo vía `lead.preferences`). |
| `upsertMinimalBuyerDemand` | `src/lib/leadService.ts` | Upsert no destructivo de demand (dedupe por lead_id/phone). |
| Event types legibles | `BuyersManager` `getTimelineIconConfig` | `Registro web`, `Actualización web`, `Reserva web`, `Alta en CRM` ya migrados (#008 T5). |
| Tombstone `log_interaction` | `api/webhooks/n8n/route.ts` | No-op `{success, deprecated}`. 3 workflows n8n activos aún lo llaman (se retira en F5). |
| Tests | `npm test` (jest, 112) | Patrón de mock de Supabase por tablas: copia el de `src/lib/__tests__/leadFunnel.test.ts` o `generateBlogRoute.test.ts`. |
| Pestañas | `AdminDashboard.tsx` | `encargos`→EncargosManager, `sellers`→WarmLeadsManager (renombradas en #009). `activeTab` NO se persiste. |
| ⚠️ Auth de `/admin` | `AdminDashboard.tsx` + `src/proxy.ts` | **proxy.ts NO protege nada** (passthrough). La protección es client-side: `supabase.auth.getSession()` + form de login DENTRO de AdminDashboard. Las rutas nuevas de F3 deben replicar este gate (ver F3.0). |
| ⚠️ Timeout Netlify | — | El proxy de Netlify corta conexiones >~26s aunque la lambda siga y termine. Si creas un endpoint lento, el cliente puede ver timeout con el trabajo hecho (ver el patrón llamada+verificación del blog, #010). |

---

## Decisiones ya tomadas (NO preguntar — del PDF + Álvaro en #007/#009)

1. **D1/R8** Funnel vendedor a 4 estados EN LA UI (`new`=Nuevo lead, `contacted`=Contacto establecido,
   `closed`=Adquisición hecha, `lost`=Inactivo/perdido). El CHECK de BD conserva los 6 (compatibilidad).
2. **D2/R5** Estados del comprador (`buyers_demands.status`): migran a `'Activo'`/`'Desactivado'`.
   Mapeo: "Búsqueda activa"/"En negociación"/"Con piso reservado"→`Activo`; "Inactivo"→`Desactivado`.
   Pedidos muestra Activos por defecto + vista "Archivo" con los desactivados (NO se borran).
3. **D4/R19** Impactos de difusión → tabla nueva `diffusion_impacts` + evento 'Difusión' en
   `buyer_activity_logs`.
4. **D5/R3** Documentación del comprador → tabla nueva `buyer_documents` + bucket privado `buyer-files`
   (espejo de `encargo_documents`/`encargo-files`).
5. **D6/D7/R13** Propuesta: firma SOLO el comprador primero (**Álvaro NO firma la propuesta** — lo
   confirmó en #007); estado intermedio `buyer_signed` oculto al vendedor; gate manual "Aceptar
   propuesta" en el encargo → entonces firma el vendedor.
6. **D9/R15** Cláusulas manuales: campo libre en la página previa → placeholder
   `{{clausulas_adicionales}}` en las plantillas Nota de Encargo, Propuesta y Contrato.
7. **D10/R18** Visitas de inmueble: track explícito `page_path = "/comprar/p/<property_id>"` al abrir el
   modal de detalle (la URL real no cambia).
8. **D11/R17** Evento 'Notaría' con fecha → cita `type='cierre'` (enum ya existe, sin uso).
9. **D12** Páginas completas: rutas App Router `/admin/buyers/[id]`, `/admin/sellers/[id]`,
   `/admin/encargos/[id]` (shell server + tabs client), reutilizando la lógica de los managers. Las
   listas siguen en el dashboard; el click abre la página.
10. **Defaults para las preguntas abiertas del plan** (si Álvaro no dice lo contrario, aplica esto y
    déjalo anotado en SYNC_AI):
    - **Q2** → SÍ: "Cita de venta" (comprador) y "Cita de adquisición" (vendedor) siguen creando cita en
      calendario con los tipos actuales (`visita`/`captacion`).
    - **Q3** → el Contrato privado firmado NO cambia `encargos.status` automáticamente: registra el
      evento y Álvaro lo cambia a mano tras notaría. (Sí cierra al COMPRADOR, ver F4.5.)
    - **Q5** → la exclusión de destinatarios de difusión es POR CAMPAÑA (no se persiste entre campañas).

---

# SESIÓN A

## F0 — Migraciones y fundamentos de datos ⚠️ REQUIERE OK EXPLÍCITO DE ÁLVARO

**Procedimiento**: prepara las 5 migraciones, muéstraselas a Álvaro EN UN SOLO MENSAJE (una pregunta,
no cinco) y aplícalas una a una tras su OK, cada una con SELECT antes/después + entrada SYNC_AI.

### F0.1 — `buyers_demands.status` → Activo/Desactivado (DML + ola de código en el MISMO commit-wave)

1. SELECT previo: `SELECT status, count(*) FROM buyers_demands GROUP BY status` (hoy: 'Búsqueda activa').
2. `UPDATE buyers_demands SET status = CASE WHEN status='Inactivo' THEN 'Desactivado' ELSE 'Activo' END`.
   No hay CHECK sobre la columna (verificado en #008) — no hace falta DDL.
3. **Ola de código — TODOS los escritores/lectores del valor viejo** (grep `Búsqueda activa` y
   `STATUS_OPTIONS`): `BuyersManager.tsx` (interface `BuyerDemand['status']`, `STATUS_OPTIONS`,
   `activeCount`, badges/colores, filtro), `BuyerRegistrationModal.tsx` (insert y update),
   `appointmentService.ts` (2 escrituras), `scheduling.ts` `upsertBuyerDemand` (⚠️ es el ÚNICO cambio
   permitido en scheduling.ts: el string literal del status), `leadService.ts`
   `upsertMinimalBuyerDemand`. Todos pasan a escribir `'Activo'`. ⚠️ Greppea también
   `src/**/__tests__/**`: hay fixtures de tests que hardcodean el string viejo y romperían
   `npm test` — actualízalos en el mismo commit.
4. **Pedidos**: por defecto lista `status='Activo'`; añade toggle/vista "Archivo" que lista
   `'Desactivado'`. El dropdown de estado del comprador queda con 2 opciones.
5. **Difusión**: en `api/n8n/diffusion/route.ts`, además del funnel del lead, descarta demands con
   `status='Desactivado'` (añádelo a `matchDemand` en `diffusionMatch.ts` como check de demand +
   test).

### F0.2 — Tabla `diffusion_impacts`

```sql
CREATE TABLE public.diffusion_impacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES properties(id) ON DELETE SET NULL,
  buyer_demand_id uuid REFERENCES buyers_demands(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  phone text,
  status text NOT NULL DEFAULT 'sent',
  sent_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.diffusion_impacts ENABLE ROW LEVEL SECURITY;
-- Policy espejo de las tablas internas: solo authenticated (y service role bypassa RLS).
CREATE POLICY "Allow authenticated manage" ON public.diffusion_impacts
  FOR ALL USING (auth.role() = 'authenticated');
```

### F0.3 — Tabla `buyer_documents` + bucket `buyer-files`

- Tabla espejo de `encargo_documents` (lee su definición real con el MCP antes de crearla):
  `id, buyer_demand_id uuid REFERENCES buyers_demands(id) ON DELETE CASCADE, kind text, label text,
  file_url text, file_size_bytes bigint, mime_type text, created_at timestamptz DEFAULT now()` +
  RLS authenticated como F0.2.
- Bucket `buyer-files` PRIVADO (como `encargo-files`): créalo vía SQL
  (`INSERT INTO storage.buckets (id, name, public) VALUES ('buyer-files','buyer-files', false)`) y
  copia las policies que tenga `encargo-files`. Léelas con la VISTA estándar (no el catálogo crudo,
  que falla por search_path vía MCP):
  `SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE schemaname='storage' AND tablename='objects'`.
  ⚠️ Si la lectura devuelve 0 filas, PARA y revisa — NO dejes el bucket sin policies. Es RLS → va
  dentro del OK global de F0.
- Si F3.1 necesita un campo de descripción libre en la demand: comprueba AHORA el schema de
  `buyers_demands` (¿existe `notes`/`description`?) y, si hay que añadir columna, inclúyela en ESTE
  bloque de OK (ninguna migración fuera de F0).
- Subida/descarga: replica el patrón de `EncargoFormModal` (upload a path `<demand_id>/<kind>/...`,
  download con signed URL).

### F0.4 — CHECK de `signature_status` + `'buyer_signed'`

1. Lee el constraint real: `SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE
   conrelid='generated_documents'::regclass AND contype='c'`.
2. Si hay CHECK sobre `signature_status`: `ALTER TABLE ... DROP CONSTRAINT <nombre>` + `ADD CONSTRAINT`
   con los valores actuales + `'buyer_signed'`. Si NO hay CHECK, no hagas nada (anótalo).

### F0.5 — Plantillas con `{{clausulas_adicionales}}`

`SELECT id, name, body FROM document_templates` → en las plantillas Nota de Encargo, Propuesta y
Contrato privado, añade al body (antes del bloque de firmas) una sección:
`\n\nCLÁUSULAS ADICIONALES\n{{clausulas_adicionales}}\n`. UPDATE por id (3 filas). El merge actual
(`mergeBody`) sustituye claves no informadas por "________" — en F4.2 harás que si el campo está vacío
se sustituya por "Ninguna." (no por la raya).

Commits F0: `feat(db): estados Activo/Desactivado en buyers_demands + ola de escritores` ·
`feat(db): tablas diffusion_impacts y buyer_documents + bucket buyer-files` ·
`feat(db): signature_status buyer_signed + clausulas adicionales en plantillas` (ajusta el troceo a
lo que apruebe Álvaro).

## F1 — Difusión 2.0 + bugs de inmuebles

### F1.1 — Previsualización con exclusión de destinatarios (R19)

1. `api/n8n/diffusion/route.ts`: añade al contrato del body dos campos opcionales (retrocompatibles):
   `dry_run: true` → ejecuta el matching y devuelve `{recipients: [...]}` SIN llamar a n8n ni loguear;
   `excluded_demand_ids: string[]` → filtra esas demands del envío real.
2. `SmartMatchmakerModal.tsx`: antes de lanzar, llama con `dry_run` → muestra la lista con checkboxes
   (todos marcados) → el envío real pasa `excluded_demand_ids` con los desmarcados. El payload a n8n
   NO cambia de shape (el workflow `Difusion Inteligente` no se toca).
3. La exclusión es por campaña (default Q5) — no se persiste.

### F1.2 — Registro de impactos (R19) + evento en timeline

En el envío real (no dry_run): por cada destinatario, INSERT en `diffusion_impacts`
(property_id, buyer_demand_id, lead_id, phone) + INSERT en `buyer_activity_logs`
(`buyer_id` = demand id, `event_type: 'Difusión'`, title con el inmueble, property_id). Añade el caso
`'Difusión'` a `getTimelineIconConfig` (📣 / color propio). Fire-and-soft: si el log falla, el envío no
se rompe.

### F1.3 — Selección múltiple de imágenes (R20)

`PropertyFormModal.tsx` (~línea 535): `multiple` en el input de imágenes + bucle de subida secuencial
con indicador de progreso (n de m). ⚠️ `gitnexus_impact` sobre PropertyFormModal antes (alto fan-in).

### F1.4 — Fix visitas a 0 (R18, causa raíz verificada)

El detalle del inmueble en `/comprar` es un modal que no cambia la URL y `AnalyticsTracker` solo
registra `usePathname()`. Fix (D10): al abrir el modal → POST a `/api/analytics/track` con
`page_path: "/comprar/p/<property_id>"` (replica el shape exacto que envía AnalyticsTracker — léelo
antes). ⚠️ El endpoint exige `session_id` además de `page_path` (400 si falta y la visita no se
inserta, sin error visible): léelo del mismo sitio de donde lo saca AnalyticsTracker (localStorage) o
genera uno con `crypto.randomUUID()` si no existe. Verifica que el tab "Publicación web"
(EncargosManager) y Operaciones cuentan esas filas (buscan el id dentro de `page_path`).

### F1.5 — Informe IA con impactos (R21)

`api/properties/[id]/ai-report/route.ts`: cuenta `diffusion_impacts` del property_id y pásalo al
prompt/respuesta del informe.

Commits F1: `feat(diffusion): preview con exclusion de destinatarios (dry_run)` ·
`feat(diffusion): registro de impactos + evento Difusion en timeline` ·
`feat(properties): subida multiple de imagenes` · `fix(analytics): track de vistas del detalle de
inmueble` · `feat(ai-report): incluye impactos de difusion`.

## F2 — UI del vendedor

### F2.1 — Funnel vendedor a 4 estados en la UI (R8/D1)

`WarmLeadsManager.tsx`: `STATUS_CONFIG` pasa de 6 a 4 entradas (labels de la decisión 1); el dropdown
del drawer y el filtro de estado solo ofrecen esos 4. ⚠️ Mantén un fallback de render para filas
legacy con `qualified`/`visit_scheduled` (badge gris "Estado legacy") — en BD hoy no hay ninguna
(#007 T1.0 verificó 0), pero no rompas si aparece. Recalibra los lectores de estados de VENDEDOR en
`DashboardOverview` / `OperacionesTab` / `MarketingTab` (grep `qualified` y `visit_scheduled` filtrando
por type='seller'): donde contaban 6 estados de vendedor, pasan a 4. NO toques los contadores de
COMPRADOR (siguen con 6).

### F2.2 — Alta manual de vendedores (R6)

Botón "+ Nuevo vendedor" en WarmLeadsManager → modal con: nombre*, teléfono* (con `normalizeEsPhone` +
dedupe: si el phone ya existe muestra el lead existente en vez de duplicar — patrón 23505 de
`leadService`), email, origen (usa `LEAD_SOURCE_OPTIONS`), dirección del inmueble (a
`preferences.property_address`). INSERT `type='seller', status='new'`. Log inicial en
`seller_activity_logs` (`event_type: 'Alta en CRM'`).

### F2.3 — Botón "Firmar documento" en la ficha del inmueble (R9)

En el tab "Ficha Inmueble" del drawer del vendedor: botón "Firmar Nota de Encargo" →
`onGoToDocuments({ kind: 'nota', leadId: selectedLead.id })` (el mecanismo DocIntent del #008 ya hace
todo el trabajo). Visible solo si el lead no está `closed`.

Commits F2: `feat(sellers): funnel de 4 estados en la UI + recalibrado de dashboards` ·
`feat(sellers): alta manual de vendedores` · `feat(sellers): boton firmar nota de encargo (DocIntent)`.

**Cierre SESIÓN A**: build+tests verdes → detect_changes → entrada SYNC_AI (qué migraciones se
aplicaron, conteos, defaults usados) → push.

---

# SESIÓN B

## F3 — Perfiles a página completa + timelines

### F3.0 — Gate de auth reutilizable (PRIMERO, bloquea el resto de F3)

`proxy.ts` NO protege `/admin/*`; la protección vive client-side en AdminDashboard
(`supabase.auth.getSession()` + form de login + bypass dev). Extrae ese gate a un componente
reutilizable `src/components/admin/AdminAuthGate.tsx` (client) que: comprueba sesión → muestra login si
no hay → renderiza `children` si hay. Refactoriza AdminDashboard para usarlo (⚠️ `gitnexus_impact`
antes; cuidado de no romper el flujo `fetchData` post-login) y úsalo como wrapper en las 3 rutas nuevas.
NO toques proxy.ts.

### F3.1 — `/admin/buyers/[id]` (R1–R5)

Shell server component + tabs client. Tres apartados:
- **Características**: los campos de la demand (presupuesto, tipo, habs/baños, financiación, ahorros,
  descripción libre → usa/añade columna `notes` si la tabla la tiene; si no, campo en demand que ya
  exista — verifica el schema antes) + **edición directa de zonas con buscador** sobre la taxonomía
  (`SEVILLA_TAXONOMY`) manteniendo el copiloto IA (`ZoneSelectorPremium`) como alternativa.
- **Documentación**: lista/subida/borrado de `buyer_documents` (bucket `buyer-files`, signed URLs),
  réplica del patrón de documentos del encargo.
- **Actividad**: timeline por colores reutilizando `getTimelineIconConfig`; alta de eventos Llamada,
  Nota, **Cita de venta** (crea `appointments` type='visita' vía el patrón actual de BuyersManager),
  y los autos (Difusión de F1.2, Propuesta de F3.4); edición y borrado de eventos (ya existen en
  BuyersManager — muévelos/compártelos).
- Estados Activo/Desactivado (toggle) — coherente con F0.1.
- En la lista de Pedidos (BuyersManager): el click/CTA abre `/admin/buyers/[id]` (target _blank
  opcional). El drawer actual puede quedarse como vista rápida o retirarse — elige lo que menos código
  duplique y documéntalo.

### F3.2 — `/admin/sellers/[id]` (R7/R11)

Apartados: **Perfil** (datos de contacto + funnel 4 estados) / **Ficha inmueble** (campos de
`preferences` + consola de tasación actual + botón "Firmar Nota de Encargo" de F2.3) / **Citas y
anotaciones** (timeline `seller_activity_logs` por colores; eventos Nota, Llamada, **Cita de
adquisición** → `appointments` type='captacion', cita opcional en calendario como hoy; añade
edición/borrado de eventos). Reutiliza la lógica de WarmLeadsManager (extrae a hooks/componentes
compartidos lo que necesites — no dupliques los submit handlers que ya disparan funnel/DocIntent).

### F3.3 — `/admin/encargos/[id]` (R12/R17/R18)

Apartados: **Resumen** (datos del encargo + hueco para el gate de propuestas de F4.4) / **Documentos**
(los `encargo_documents` + `generated_documents` vinculados, como el tab actual) / **Actividad**
(timeline editable por colores; eventos Visita, Llamada, Propuesta (auto F3.4), Contrato privado
(fecha de firma), **Notaría** con fecha → crea cita `type='cierre'`) / **Publicación web** (el tab
actual; las visitas ya cuentan tras F1.4). **Dónde viven los eventos del encargo (decisión YA tomada,
no la reabras)**: en `seller_activity_logs`, filtrando por
`lead_id = encargo.seller_lead_id AND property_id = encargo.property_id`; si el encargo no tiene
`property_id`, filtra solo por `lead_id` y muestra todos los eventos del vendedor (anótalo en la UI
como "timeline del vendedor"). Los eventos nuevos del encargo se insertan SIEMPRE con ambos campos
informados para que el filtro funcione (F3.4 y F4 deben respetarlo). No crees tabla nueva.

### F3.4 — Auto-eventos desde documentos (R4/R17/P11)

- Al generar una Propuesta con comprador seleccionado (`buyer_id` poblado, #008): INSERT evento
  `'Propuesta'` en `buyer_activity_logs` (y en el timeline del vendedor si hay lead vendedor).
- Webhook Documenso `completed` (`api/webhooks/documenso/route.ts`): según la categoría de la
  plantilla del documento, INSERT evento de firma ("Nota de Encargo firmada" → seller log,
  "Propuesta firmada" → buyer+seller, "Contrato privado firmado" → ambos). ⚠️ `gitnexus_impact` antes:
  este webhook actualiza firmas en producción — los inserts nuevos deben ser fire-and-soft (try/catch)
  para no romper el flujo de firma.

Commits F3: `feat(admin): gate de auth reutilizable` · `feat(admin): perfil de comprador a pagina
completa` · `feat(admin): perfil de vendedor a pagina completa` · `feat(admin): encargo a pagina
completa` · `feat(timeline): auto-eventos desde documentos`.

**Cierre SESIÓN B**: build+tests → detect_changes → SYNC_AI → push. E2E manual para Álvaro: abrir cada
perfil desde su lista, crear/editar/borrar un evento en cada timeline, subir un documento de comprador,
estado Activo/Desactivado.

---

# SESIÓN C

## F4 — Flujo de Propuesta con gate manual

### F4.0 — SPIKE Documenso (PRIMERO; decide la mecánica de TODO F4)

Con la cuenta real (API v1, `src/lib/documenso.ts`) y UN documento de prueba: ¿se puede añadir un
firmante a un documento ya completado? ¿se puede crear un documento con 2 recipients y retener/suprimir
el email del segundo? Resultado:
- **(a)** v1 lo permite → un solo documento, 2 recipients secuenciales, el link del vendedor se
  entrega al pulsar "Aceptar propuesta".
- **(b)** no lo permite (probable) → DOS documentos: "Propuesta" (firma comprador) + "Aceptación de
  propuesta" (firma vendedor) generado al pulsar el botón, referenciando la primera
  (`merged_data.__source_proposal_id`).
⚠️ El plan gratuito de Documenso tiene límite mensual de documentos — si el spike devuelve 400
"maximum number of documents", es límite de plan, no bug: anótalo en SYNC_AI, **escala a Álvaro y NO
implementes F4.2–F4.5 sin spike completado** (F4.1/F1/F5 no dependen de él). Borra el documento de
prueba al acabar. Anota el resultado (opción a o b) en SYNC_AI y sigue con la opción que aplique.

### F4.1 — Cláusulas adicionales en el editor (R15, par de F0.5)

> ✅ **HECHA (adelantada el 2026-06-11, hotfix post-Sesión B a petición de Álvaro — ver SYNC_AI).**
> No repetir en Sesión C. En el mismo hotfix: borrado/edición de borradores de
> `generated_documents` (snapshot `__form` en merged_data) + título descriptivo con dirección
> + actividad del comprador fusionada (read-only) en el timeline del encargo.

`DocumentsManager.tsx`: campo textarea "Cláusulas adicionales" en la página previa de Nota, Propuesta y
Contrato → clave `clausulas_adicionales` en el ctx del merge (vacío → "Ninguna.", no "________").

### F4.2 — Propuesta: firma solo del comprador → `buyer_signed` (R13/D7)

0. **Antes de tocar nada**: `SELECT DISTINCT category FROM document_templates` — necesitas el valor
   EXACTO de la categoría de la propuesta para los guards de este bloque (no asumas el substring;
   `detectKind` en `DocumentsManager.utils.ts` matchea `propuesta` en category O name — usa el mismo
   criterio en server).
1. En el envío a firmar de una PROPUESTA (`api/documents/send` — léelo entero antes): los recipients
   son SOLO el/los compradores (`__owners`). Álvaro deja de firmar la propuesta: `shouldAdvisorSign`
   (`src/lib/documenso.ts`) funciona por EXCLUSIÓN (true para todo salvo KYC/visita) — añade una rama
   afirmativa `return false` para la categoría propuesta usando el valor verificado en el paso 0. El
   vendedor NO recibe nada todavía.
2. **Webhook Documenso** (`api/webhooks/documenso/route.ts`): hoy escribe el resultado de
   `mapDocumensoEvent` SIN mirar la categoría. Modifica el bloque del update para bifurcar ANTES de
   escribir: si el evento mapea a `completed` Y la categoría de la plantilla del documento es
   propuesta → escribe `buyer_signed`; cualquier otro caso → comportamiento actual intacto. SIN aviso
   al vendedor (el aviso a Álvaro sí se mantiene). ⚠️ Esta bifurcación de status se hace AQUÍ (F4.2),
   NO en F3.4 — F3.4 solo AÑADE inserts de eventos fire-and-soft, no toca el status. Si ejecutas las
   sesiones en orden, F3.4 ya habrá pasado por este webhook: revisa que no haya doble escritura.

### F4.3 — Gate "Aceptar propuesta" en el encargo (R13/R16)

En el Resumen del encargo (F3.3), **query exacta** (no la reinterpretes): propuestas con
`signature_status='buyer_signed'` AND `seller_lead_id = encargo.seller_lead_id` AND `template_id` de
categoría propuesta (mismo criterio del paso 0 de F4.2). Nota: `generated_documents.property_id` se
rellena al generar (lo hace DocumentsManager), pero la propuesta puede existir ANTES que el encargo →
el join canónico es por `seller_lead_id`. **Si hay VARIAS propuestas `buyer_signed`** para el mismo
vendedor, lista TODAS (con comprador y fecha) y Álvaro elige cuál aceptar — no asumas unicidad.
Botón **"Aceptar propuesta"** → dispara la firma del vendedor según el resultado del spike (a o b) →
al completarse → `signature_status='completed'`, la propuesta aparece en Documentos del encargo +
evento 'Propuesta aceptada' en el timeline (con `lead_id` + `property_id` del encargo, ver F3.3).

### F4.4 — Contrato privado desde el encargo (R14) + cierre del comprador

Botón "Generar Contrato privado" en el encargo con propuesta aceptada → DocIntent `kind:'contrato'`
con la propuesta de origen preseleccionada (el editor ya autorrellena desde la propuesta). Al
completarse la firma del contrato (webhook): evento 'Contrato privado' + **el LEAD del comprador pasa
a `closed`** (vía `buyer_id` → `buyers_demands.lead_id`; UPDATE directo de `leads.status`, no uses el
helper — `closed` es terminal a propósito) + la demand pasa a `'Desactivado'`. ⚠️ **Idempotencia**:
Documenso reintenta el webhook — lee el status actual del lead ANTES y ejecuta el bloque entero
(evento + lead + demand) solo `if (status !== 'closed')`; un reintento no debe duplicar el evento.
`encargos.status` NO se toca (default Q3).

### F4.5 — Evento Notaría → cita (R17/D11)

Si no quedó hecho en F3.3: evento 'Notaría' con fecha en el timeline del encargo → INSERT
`appointments` `type='cierre'` con la fecha.

Commits F4: `feat(documenso): spike + mecanica de firma elegida` · `feat(documentos): clausulas
adicionales` · `feat(propuesta): firma solo comprador + buyer_signed` · `feat(encargos): gate aceptar
propuesta` · `feat(encargos): contrato privado desde el encargo + cierre del comprador`.

## F5 — Flecos finales

### F5.1 — Retirar los nodos `log_interaction` de n8n ⚠️ workflows de PRODUCCIÓN — pide OK

Con OK explícito de Álvaro, **workflow a workflow y con plan de reversión**:
0. ANTES de tocar cada workflow: `get_workflow_details` y guarda el JSON completo en un archivo local
   (`docs/sync/n8n-backups/<id>.json`, no commitear) — es tu rollback.
- `Difusion Inteligente` (`6E0AP0gqLUliPQtN`): elimina el nodo "Log Difusion CRM" **y reconecta
  `Enviar WhatsApp Meta` → `Loop Destinatarios` directamente** (el nodo está DENTRO del loop — si solo
  lo borras sin reconectar, rompes la difusión).
- `Seguimiento Leads Diario` (`VnXhrEh2G8AeR0DT`): ídem — "Log Seguimiento CRM" está en el loop;
  reconecta `WhatsApp Seguimiento` → `Loop Seguimiento`.
- `Notificacion Nuevo Lead` (`QikfXMJumWbpI3wL`): "Log Bienvenida CRM" es el último nodo; bórralo sin más.
Después VERIFICA: ejecuta la difusión de prueba (vía SmartMatchmaker con exclusión total o un test
manual del workflow) y comprueba que el loop COMPLETA. **Si no completa → restaura el nodo desde el
backup y PARA (el tombstone se queda)**. Solo con la verificación en verde: elimina el tombstone
`case 'log_interaction'` del bridge (`api/webhooks/n8n/route.ts`) + su entrada en `available_actions`
+ el comentario de cabecera.

### F5.2 — Chatwoot cosmético

Quita la opción "Chatwoot" de los filtros de `ChatManager.tsx` y `WebhooksManager.tsx` y el caso del
icono. Para el union `ChatChannel` (`src/types/index.ts`): comprueba antes si
`chatbot_conversations.channel` tiene CHECK en BD con 'chatwoot' (SELECT de pg_constraint) — el union
de TS puedes reducirlo a `'whatsapp' | 'web_widget'` (0 conversaciones chatwoot en BD, verificado
#009); el CHECK de BD NO se toca.

### F5.3 — Cierre de documentación

`docs/CRM-GUIDE.md` (bloque de actualización + matriz con las rutas/tablas nuevas) + entrada Brief #011
en `SYNC_AI.md` (por sesión, si no se hizo ya) + nota de cabecera en el plan
(`plan-implementacion-crm.md`): "ejecutado al 100% por briefs #007–#011". Push final.

---

## Verificación final (por sesión y global)

`npm run build` + `npm test` verdes · `gitnexus_detect_changes()` por commit · E2E manual consolidada:
difusión con preview/exclusión e impactos visibles en el timeline · subida múltiple de imágenes ·
visitas del inmueble cuentan · vendedor con 4 estados y alta manual · los 3 perfiles a página completa
operativos con timelines editables · documentación del comprador sube/descarga · propuesta:
comprador firma → no le llega nada al vendedor → "Aceptar propuesta" → firma vendedor → contrato →
comprador `closed` y demand `Desactivado` · difusión sigue funcionando tras quitar los nodos Log.

## Qué NO hacer

- NO toques `engine.ts` ni `scheduling.ts` (excepción única: el string `'Búsqueda activa'`→`'Activo'`
  de F0.1 en `upsertBuyerDemand`).
- NO apliques NINGUNA migración de F0 sin el OK explícito (incluye el bucket: es RLS de storage).
- NO cambies el contrato del payload difusión→n8n (`Separar Destinatarios` espera el mismo shape);
  `dry_run`/`excluded_demand_ids` viven solo entre el CRM y su propia ruta.
- NO toques los workflows n8n de producción fuera del procedimiento F5.1 (y el blog `Blog Diario
  Noticias` / `Generador Diario Blog` no se tocan en absoluto).
- NO uses el helper `leadFunnel` para poner a nadie en `closed` (es terminal a propósito); el cierre
  del comprador en F4.4 es un UPDATE directo y consciente.
- NO borres el drawer de WarmLeadsManager/BuyersManager sin dejar la lista funcional — la página
  completa es ADICIONAL salvo que quitar el drawer reduzca duplicación (documenta la elección).
- NO crees tablas/buckets fuera de los definidos en F0 (nada de `seller_documents` todavía — la
  documentación del VENDEDOR no está en el PDF).
- NO firmes a Álvaro en la propuesta (D7); sigue firmando Nota de Encargo y Contrato privado.
