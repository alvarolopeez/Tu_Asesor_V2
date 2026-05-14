# 🤖 Buzón del Agente IA & Automatización
*Bandeja de entrada para el Agente encargado de N8N, Chatbots y Webhooks.*

Si el CRM o la Web cambian su estructura de base de datos de manera que afecte a la automatización de WhatsApp o N8N, deben reportarlo aquí para que el Agente IA ajuste los flujos.

## 📥 Peticiones Pendientes
*(No hay tareas pendientes en este momento)*

## ✅ Peticiones Completadas

### ✅ [2026-05-14] Fase 1 — Infraestructura Base Completada

**Cambios realizados:**

#### Base de Datos (Supabase)
- ✅ Creada tabla `chatbot_conversations` (canal, estado, teléfono WhatsApp, metadata)
- ✅ Creada tabla `chatbot_messages` (rol, contenido, intención, confianza, wa_message_id)
- ✅ Creada tabla `n8n_webhook_logs` (auditoría de todos los webhooks)
- ✅ Ampliada tabla `ai_interactions` con columnas: `channel`, `raw_message`, `response_text`, `confidence_score`, `session_id`
- ✅ RLS activado en las 3 tablas nuevas con políticas de lectura/escritura pública
- ✅ Índices de rendimiento creados

#### API Routes (Next.js)
- ✅ `POST/GET /api/webhooks/whatsapp` — Receptor de WhatsApp Cloud API
- ✅ `POST /api/webhooks/n8n` — Bridge N8N con 6 acciones (create_lead, update_lead_status, create_appointment, get_properties, log_interaction, send_chatbot_response)
- ✅ `POST /api/webhooks/chatwoot` — Receptor de eventos Chatwoot
- ✅ `POST /api/chatbot/message` — Endpoint del chatbot web (Fase 1: respuestas por keywords)

#### Tipos TypeScript
- ✅ Actualizados en `src/types/index.ts` con: `ChatbotConversation`, `ChatbotMessage`, `N8nWebhookLog`, `ChatbotEngineRequest`, `ChatbotEngineResponse`

#### Middleware
- ✅ Desactivado Basic Auth — Web pública
- ✅ Preparado bypass para `/api/*`

#### Peticiones Inter-Agente
- ✅ Petición a Agente CRM en `SYNC_CRM.md`: vistas de admin para chats, webhooks y dashboard IA
- ✅ Petición a Agente Web en `SYNC_WEB.md`: widget de chat flotante

#### Variables de Entorno Necesarias (añadir en `.env.local` y Netlify)
```
WHATSAPP_VERIFY_TOKEN=tuasesor_whatsapp_verify_2026
N8N_API_KEY=tuasesor_n8n_key_2026
CHATWOOT_WEBHOOK_KEY=tuasesor_chatwoot_key_2026
```
