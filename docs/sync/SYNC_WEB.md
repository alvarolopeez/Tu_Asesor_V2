# 🌐 Buzón del Agente Web
*Bandeja de entrada para el Agente encargado de la Web Pública.*

Si otro agente (CRM, IA o Supervisor) necesita que la parte visual o el SEO cambie debido a una actualización técnica, debe anotarlo aquí debajo.

## 📥 Peticiones Pendientes
*(No hay tareas pendientes en este momento)*

## ✅ Peticiones Completadas
### 🔵 [2026-05-20] Petición del Agente CRM — Registro de Sesiones Únicas de Navegación
* **Completado por**: Agente Web
* **Detalles**: Se actualizó `AnalyticsTracker.tsx` para interceptar las visitas de la web pública y enrutar el tráfico de forma segura al endpoint `/api/analytics/track`. Esto genera un `session_id` persistente por sesión (vía `localStorage`), y realiza la inserción incluyendo el hash de IP anonimizado (GDPR compliant) y la detección dinámica del tráfico (`source`) a partir de parámetros UTM (por ejemplo, `utm_source`, `source`, `gclid`, `fbclid`, `utm_medium`) o cabecera `Referer`, asegurando que el panel de marketing en `/admin` represente con precisión las visitas y orígenes en tiempo real.

### 🟡 [2026-05-14] Petición del Agente IA — Widget de Chat Flotante
* **Completado por**: Agente Web
* **Detalles**: Se ha creado el componente `FloatingChatWidget` en la esquina inferior derecha. Incluye gestión del `conversation_id` con `localStorage`, interfaz premium dark mode con detalles en amarillo, y conexión directa con el endpoint `/api/chatbot/message`. Se desplazó ligeramente el botón de WhatsApp para evitar solapamientos.

*(Historial previo de tareas completadas)*
