# 💼 Buzón del Agente CRM
*Bandeja de entrada para el Agente encargado del Panel de Administración.*

Si otro agente añade funcionalidades que requieren gestión desde el panel (por ejemplo, el Agente IA necesita una pantalla para ver los logs del chatbot), debe solicitarlo aquí.

## 📥 Peticiones Pendientes

### 🔴 [2026-05-25] Petición del Director General — Desarrollo Completo del Módulo Premium de "Vendedores CRM"
* **Descripción**: Evolucionar la sección básica de leads comerciales (`WarmLeadsManager.tsx`) para crear una experiencia de administración inmersiva de propietarios vendedores (`SellersCRMManager.tsx` / `WarmSellersManager.tsx`).
* **Requisitos**:
  1. Cargar datos de `leads` filtrando estrictamente por `type = 'seller'`.
  2. Implementar Drawer lateral completo ("SellersDrawer") con edición en caliente interactiva (`onBlur`/`Enter`) para datos personales, datos físicos del inmueble a valorar y consola de tasación/comisión.
  3. Integrar la tabla de timeline cronológico de hitos consultando y guardando en la nueva tabla de Supabase `public.seller_activity_logs`.
* **Instrucciones**: Consulta y sigue al detalle el plan arquitectónico completo en [docs/sync/estudio_crm_vendedores.md](file:///Users/alvarolopezcuevas/Documents/GitHub/Tu_Asesor_V2/docs/sync/estudio_crm_vendedores.md).

---

## ✅ Peticiones Completadas

### 🟢 [2026-05-25] Petición del Usuario — Retoques y Optimización del CRM (Conexión de IA, Sincronización de Comentarios, Aportación con Hipoteca y Taxonomía Expandida)

**Estado:** Completado
**Resumen de cambios:**
1. **Conexión de IA Paula Copilot en CRM**:
   - Agregamos la cabecera `Authorization: Bearer <token>` a la petición `fetch` en `ZoneSelectorPremium.tsx` recuperando la sesión activa del administrador (`supabase.auth.getSession()`), resolviendo el error 401 y conectando con éxito el Copilot IA al backend de Gemini 1.5 Flash.
2. **Sincronización de Comentarios de Compradores en la Ficha del CRM**:
   - Modificamos el manejador de envío público en `BuyerRegistrationModal.tsx` para inyectar automáticamente un hito detallado de tipo "IA WhatsApp" en la tabla `buyer_activity_logs` tanto al registrar un comprador nuevo como al actualizar sus preferencias. Esto permite ver los comentarios/notas (`additionalNotes`) de manera fluida en la línea de tiempo del comprador en el CRM ("Ficha").
3. **Campo de Aportación de Ahorros con Hipoteca**:
   - Agregamos el input de "Aportación de ahorros propia (€)" en el Paso 4 (Financiación) del formulario de registro público (`BuyerRegistrationModal.tsx`) si el método de pago seleccionado es "Con Hipoteca".
   - Sincronizamos este valor para que se guarde de forma nativa en la columna `savings_contribution` en la base de datos de Supabase, habilitando cálculos financieros instantáneos dentro del CRM.
4. **Ampliación de Municipios y Barrios de la Provincia de Sevilla**:
   - Expandimos la taxonomía oficial de zonas en `ZoneSelectorPremium.tsx`, en el System Prompt del backend `/api/ai/zones/route.ts` y en el detector local de palabras clave con 8 municipios adicionales y sus sub-barrios correspondientes (Gines, Castilleja de la Cuesta, San Juan de Aznalfarache, Espartinas, Alcalá de Guadaíra, La Rinconada, Utrera, Mairena/Viso del Alcor).

### 🟢 [2026-05-20] Petición del Usuario — Refinamiento Premium de Dashboard de Operaciones (Sevilla) y Consola Financiera Completa

**Estado:** Completado
**Resumen de cambios:**
1. **Interactive Sevilla Zonas de Demanda:**
   - Incorporamos un listado base de 18 zonas y barrios de Sevilla (Triana, Nervión, Los Remedios, Centro, Sevilla Este, etc.) cruzados en tiempo real con la base de datos de Supabase.
   - Implementamos un buscador reactivo integrado en el gráfico de barras horizontales doradas (`#FBBF24`) para filtrar por cualquier zona o barrio.
   - Añadimos visualizaciones dinámicas de compradores activos, porcentaje representativo y presupuesto promedio.
2. **Crecimiento de Compradores Activos:**
   - Añadimos un gráfico de área SVG temporal interactivo con un degradado premium que expone el crecimiento mensual acumulado de la base de datos de compradores.
3. **Desglose de Capacidad Financiera y Propósitos:**
   - Diseñamos una interfaz analítica con porcentajes (`%`) e indicadores absolutos que desglosa a los compradores activos por Capacidad Financiera (Hipoteca y sin estudio, Hipoteca con estudio, Preconcedida, Al contado) y por Propósito (Vivienda Habitual vs Inversión).
   - Añadimos una caja de *Insight Operativo* que calcula de forma automática el porcentaje de clientes con liquidez inmediata.
4. **Consola de Configuración Financiera y Sobreescrituras:**
   - Añadimos una consola de simulación con controles deslizantes interactivos para ajustar la comisión de honorarios (del 2% al 10%) e IRPF.
   - Permitimos la sobreescritura (override) en caliente de los KPIs principales (Facturado, Previsiones, CAC) que se inyectan reactivamente en el flujo de renderizado del panel.
5. **CRUD de Gastos Operativos Completo e In-Place:**
   - Implementamos la edición *in-place* sobre la tabla `operating_expenses` en caliente, con estados visuales activos (bordes dorados e iconos de guardado) y cálculos automáticos de IRPF y beneficio neto.


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
