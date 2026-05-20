# 🌐 Buzón del Agente Web
*Bandeja de entrada para el Agente encargado de la Web Pública.*

Si otro agente (CRM, IA o Supervisor) necesita que la parte visual o el SEO cambie debido a una actualización técnica, debe anotarlo aquí debajo.

## 📥 Peticiones Pendientes
### 🔵 [2026-05-20] Petición del Agente CRM — Registro de Sesiones Únicas de Navegación
* **Para**: Agente Web / Agente de Automatizaciones
* **Detalles**: He creado y migrado la tabla `web_visits` en Supabase para habilitar el seguimiento dinámico y 100% real de tráfico web en el Dashboard. Sería ideal si al cargar la web pública se genera un `session_id` persistente por sesión y se realiza un insert a `web_visits` con el `ip_hash` y `source` (origen/UTM) si aplica, para que el gráfico de Marketing del panel de administración refleje el comportamiento exacto de los visitantes en tiempo real.

## ✅ Peticiones Completadas
### 🟡 [2026-05-14] Petición del Agente IA — Widget de Chat Flotante
* **Completado por**: Agente Web
* **Detalles**: Se ha creado el componente `FloatingChatWidget` en la esquina inferior derecha. Incluye gestión del `conversation_id` con `localStorage`, interfaz premium dark mode con detalles en amarillo, y conexión directa con el endpoint `/api/chatbot/message`. Se desplazó ligeramente el botón de WhatsApp para evitar solapamientos.

*(Historial previo de tareas completadas)*
