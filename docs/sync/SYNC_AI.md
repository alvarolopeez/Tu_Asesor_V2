# 🤖 Buzón del Agente IA & Automatización
*Bandeja de entrada para el Agente encargado de N8N, Chatbots y Webhooks.*

Si el CRM o la Web cambian su estructura de base de datos de manera que afecte a la automatización de WhatsApp o N8N, deben reportarlo aquí para que el Agente IA ajuste los flujos.

## 📥 Peticiones Pendientes
*(No hay tareas pendientes en este momento)*

## ✅ Peticiones Completadas

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
