# 💼 Buzón del Agente CRM
*Bandeja de entrada para el Agente encargado del Panel de Administración.*

Si otro agente añade funcionalidades que requieren gestión desde el panel (por ejemplo, el Agente IA necesita una pantalla para ver los logs del chatbot), debe solicitarlo aquí.

## 📥 Peticiones Pendientes
*(No hay tareas pendientes en este momento)*

---

## ✅ Peticiones Completadas

### 🟢 [2026-05-20] Petición del Agente Web — Integración de Mapas de Captación y Coincidencias de Inmuebles

**Estado:** Completado
**Resumen de cambios:**
1. **Coordenadas de Compradores (Polígonos):** El formulario de registro de compradores ahora incluye un mapa interactivo (Leaflet con CartoDB Dark Matter) que permite delimitar áreas poligonales de búsqueda. Estos vértices se guardan en la tabla `leads` como `preferences.area` (formato `[number, number][]`).
2. **Campos de Inmuebles y Matchmaker:** Al subir un inmueble en `PropertiesManager.tsx`, se solicitan `propertyType`, `rooms`, `baths`, `latitude` y `longitude` (se guardan en la columna JSONB `features`).
3. **Algoritmo de Coincidencia (Ray-Casting Point-in-Polygon):** Tras guardar el inmueble, se evalúan al instante todos los compradores activos. Si su polígono de búsqueda `preferences.area` contiene la ubicación `[lat, lng]` del inmueble y coincide con sus otras preferencias (precio máximo, tipo de inmueble, mínimo de habitaciones/baños), se notifica de inmediato al administrador con un modal premium con accesos rápidos a WhatsApp y Email para contactarlos directamente.

### 🟢 [2026-05-20] Petición del Usuario — Desarrollo del 100% de Dashboard CRM (Marketing, Operaciones, Finanzas, Ecosistema)

**Estado:** Completado
**Resumen de cambios:**
1. **Pestañas del Dashboard (`/admin`):** Implementada la navegación de sub-pestañas: Marketing, Operaciones, Finanzas y Ecosistema.
2. **Tab de Marketing:** Embudo de conversión en SVG, gráfico de donut de fuentes de tráfico, rendimiento de IA (conversaciones, citas auto-agendadas, derivaciones financieras), y tiempo de primer contacto.
3. **Tab de Operaciones:** Pipeline de propietarios, gráfico de líneas de días en mercado por precio, mapa de calor de demanda por zonas de Madrid, inmuebles Top/Bottom de visitas, y generador interactivo de informes de valoración PDF.
4. **Tab de Finanzas:** Volumen de ventas, honorarios del 2%, ticket medio, pipeline notaría, evolución de comisiones (gráfico de área SVG), e historial de transacciones.
5. **Tab de Ecosistema:** Estado de integraciones, tasa de error de webhooks, ping de latencia y estado de seguridad de Supabase (RLS).

### 🟢 [2026-05-14] Petición del Agente IA — Vistas de Chatbot en Admin

**Estado:** Completado
**Resumen de cambios:**
1. **Vista de Conversaciones (`/admin/chats`):** `ChatManager.tsx` actualizado para mostrar lista de conversaciones con filtros (canal, estado) y chat bubbles con metadatos (intención, timestamp).
2. **Vista de Webhook Logs (`/admin/webhooks`):** Nuevo componente `WebhooksManager.tsx` añadido a `AdminDashboard.tsx`. Tabla paginada de logs con despliegue de payload JSON e indicador visual de errores.
3. **Dashboard IA (`/admin`):** `DashboardOverview.tsx` ahora obtiene indicadores reales de métricas de chatbots (volúmenes de mensajes y top 5 intenciones) leyendo de la base de datos de Supabase.
