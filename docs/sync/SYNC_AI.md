# 🤖 Buzón del Agente IA & Automatización
*Bandeja de entrada para el Agente encargado de N8N, Chatbots y Webhooks.*

Si el CRM o la Web cambian su estructura de base de datos de manera que afecte a la automatización de WhatsApp o N8N, deben reportarlo aquí para que el Agente IA ajuste los flujos.

## 📥 Peticiones Pendientes
- ⏳ **Workflows n8n fallan en producción por política de 24h de Meta.** Test end-to-end del workflow `Notificacion Nuevo Lead` confirmó que Meta acepta el API call (200 OK con `wamid`) pero después marca `status: failed` con código `131047` "Re-engagement message" porque el destinatario está fuera de la ventana de 24h. Afecta a los 3 workflows (Bienvenida, Difusión, Seguimiento) — todos envían texto libre a destinatarios que típicamente no han escrito al bot recientemente. **Solución:** crear plantillas HSM aprobadas en Meta Business Manager y cambiar los workflows a `type: "template"`. Plantillas EN CREACIÓN por Álvaro al 2026-05-27.
  - **Nombres de plantilla acordados (usar EXACTAMENTE estos al cablear los workflows):**
    - `bienvenida_nuevo_lead` (MARKETING — Meta clasifica los mensajes de bienvenida como Marketing, NO Utility) → workflow `Notificacion Nuevo Lead` / nodo `WhatsApp Bienvenida`. Params: {{1}}=nombre, {{2}}=zona.
    - `nueva_propiedad_match` (MARKETING, **7 variables** — Álvaro añadió planta+ascensor el 2026-05-29) → workflow `Difusion Inteligente` / nodo `Enviar WhatsApp Meta`. Params: {{1}}=nombre, {{2}}=título, {{3}}=dirección, {{4}}=precio, {{5}}=planta+ascensor, {{6}}=m², {{7}}=habitaciones. **OJO con el orden:** el `{{5}}` nuevo desplazó m² a `{{6}}` y habitaciones a `{{7}}`. El `{{5}}` se compone de `features.floor` (texto, ej. "3º") + `features.elevator` (bool) — el workflow debe construir la frase, ej. `"3º con ascensor"` / `"Bajo sin ascensor"`. Si `floor` está vacío, usar fallback genérico.
    - `seguimiento_lead` (MARKETING) → workflow `Seguimiento Leads Diario` / nodo `WhatsApp Seguimiento`. Params: {{1}}=nombre.
  - Al adaptar (tarea pendiente), cambiar el `jsonBody` de cada nodo de `type:"text"` a `type:"template"` con `template.name`, `language.code="es"` y `components[].parameters` mapeando los {{N}} a los campos del `$json`. La credencial Bearer (`Meta WhatsApp Cloud Token`, id `s3YA5o57rEEdFw1W`) ya está cableada — no tocarla.
  - BLOQUEADO hasta que las 3 plantillas estén en estado "Aprobada" en Meta.
## ✅ Peticiones Completadas

### ✅ [2026-05-30] Documentos legales con marca + FIX firma (Documenso 500)

- ✅ **Nota de Encargo y Propuesta de Compraventa con identidad de marca** (navy `#0f172a` + dorado `#FBBF24`, logo, secciones numeradas, firmas). Render único compartido en `src/lib/brandedDoc.ts` (parser `parseDoc` + `renderBrandedHtml` + `docLayout` por categoría) usado por la vista previa (iframe) y por el PDF de firma (`buildSimplePdf` en `documenso.ts`, con logo embebido en `brandLogo.ts`). La propuesta lleva comprador+vendedor, escalera de 3 pagos, 2 plazos y bloque de **aceptación del vendedor** con doble firma. Plantillas en BD `document_templates` ('Nota de Encargo', 'Propuesta de compraventa') con el texto legal definitivo de Álvaro (honorarios flexibles `{{honorarios_pct}}`, cobro a éxito, no renovación automática).
- 🐞 **CAUSA RAÍZ del error 500 "Documento generado no encontrado"** al pulsar *Enviar a firmar*: **faltaba `SUPABASE_SERVICE_ROLE_KEY` en Netlify**. Sin ella, `/api/documents/send` caía al `anon key` → las RLS de `generated_documents` (solo rol `authenticated`) devolvían 0 filas → 500 confuso. NO era un problema de Documenso.
- ✅ **Fix aplicado**:
  1. `SUPABASE_SERVICE_ROLE_KEY` añadida a Netlify (contexto `all`, scopes builds/functions/runtime/post_processing). **OJO MCP**: `manage-env-vars` con `envVarIsSecret:true` creó la key SIN valor (bug); se arregló con `POST/PUT` directo a la API REST de Netlify (`/api/v1/accounts/{acct}/env`). Si vuelve a pasar, usar REST, no el flag secret del MCP.
  2. `/api/documents/send` endurecido: **exige** el service-role (503 con mensaje claro si falta, en vez del críptico "no encontrado") y lee plantilla en **2 queries** en vez de embed PostgREST.
  3. Rebuild disparado para que el runtime recoja la env.
- ✅ **[2026-05-30] Documenso firma confirmada end-to-end**: tras el fix RLS apareció un 2.º error `Documenso create document falló (404) NOT_FOUND`. **Causa raíz**: la cuenta NO tiene API **v2** (`/api/v2/documents` → 404); solo **v1** (`/api/v1/documents` → 200). El código ya era compatible con v1 (la respuesta v1 trae `documentId`+`uploadUrl`+`recipients`, exactamente lo que `sendForSignature` espera). **Fix**: cambiar `DOCUMENSO_API_URL` de `/api/v2` → `/api/v1` en Netlify + `.env.local`. Verificado el flujo completo create(200)→upload PUT(200)→send(200, `sendStatus:"SENT"`) contra la cuenta real. `documenso.ts` actualizado (comentario v1). **Acción tras el rebuild**: reprobar "Enviar a firmar" desde el panel.

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
