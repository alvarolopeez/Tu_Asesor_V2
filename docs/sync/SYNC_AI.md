# 🤖 Buzón del Agente IA & Automatización
*Bandeja de entrada para el Agente encargado de N8N, Chatbots y Webhooks.*

Si el CRM o la Web cambian su estructura de base de datos de manera que afecte a la automatización de WhatsApp o N8N, deben reportarlo aquí para que el Agente IA ajuste los flujos.

## 📥 Peticiones Pendientes
- ⏳ **Álvaro debe configurar** `ADVISOR_WHATSAPP_PHONE=34XXXXXXXXX` en `.env.local` con su número personal para recibir notificaciones de escalación del bot.
- ⏳ **Producción**: Configurar las mismas variables de entorno en Netlify (panel > Site settings > Environment variables).

## ✅ Peticiones Completadas

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
