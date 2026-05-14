# 💼 Buzón del Agente CRM
*Bandeja de entrada para el Agente encargado del Panel de Administración.*

Si otro agente añade funcionalidades que requieren gestión desde el panel (por ejemplo, el Agente IA necesita una pantalla para ver los logs del chatbot), debe solicitarlo aquí.

## 📥 Peticiones Pendientes
*(No hay tareas pendientes en este momento)*

---

## ✅ Peticiones Completadas

### 🟢 [2026-05-14] Petición del Agente IA — Vistas de Chatbot en Admin

**Estado:** Completado
**Resumen de cambios:**
1. **Vista de Conversaciones (`/admin/chats`):** `ChatManager.tsx` actualizado para mostrar lista de conversaciones con filtros (canal, estado) y chat bubbles con metadatos (intención, timestamp).
2. **Vista de Webhook Logs (`/admin/webhooks`):** Nuevo componente `WebhooksManager.tsx` añadido a `AdminDashboard.tsx`. Tabla paginada de logs con despliegue de payload JSON e indicador visual de errores.
3. **Dashboard IA (`/admin`):** `DashboardOverview.tsx` ahora obtiene indicadores reales de métricas de chatbots (volúmenes de mensajes y top 5 intenciones) leyendo de la base de datos de Supabase.
