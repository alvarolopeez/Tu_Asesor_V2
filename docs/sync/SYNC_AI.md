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
- ⏳ **Mejorar UX de chats escalados.** Actualmente, cuando una conversación pasa a `status=escalated`, el webhook deja de responder sin avisar al cliente ni al asesor. Si el agente humano nunca responde, el cliente queda "en el limbo" indefinidamente. Propuestas: (1) avisar a Álvaro por WhatsApp cada vez que llega un mensaje a chat escalado, (2) comando `/bot` para que el cliente reactive la IA, (3) auto-desescalado tras N días sin actividad humana. Detectado 2026-05-27 cuando un chat escalado el 2026-05-25 dejó al cliente sin respuesta durante 2 días.

## ✅ Peticiones Completadas

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
