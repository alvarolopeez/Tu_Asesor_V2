# 🌐 Buzón del Agente Web
*Bandeja de entrada para el Agente encargado de la Web Pública.*

Si otro agente (CRM, IA o Supervisor) necesita que la parte visual o el SEO cambie debido a una actualización técnica, debe anotarlo aquí debajo.

## 📥 Peticiones Pendientes

### 🔴 [2026-05-25] Petición del Director General — Diseño Visual e Interfaz Premium del Módulo de "Vendedores CRM"
* **Descripción**: Diseñar el maquetado visual de la interfaz de administración de propietarios vendedores (`SellersCRMManager.tsx` / `WarmSellersManager.tsx`) y el Drawer lateral interactivo (`SellersDrawer.tsx`) bajo la estética Premium Dark Glassmorphism.
* **Requisitos**:
  1. Diseño glassmórfico de la tabla translúcida y KPI cards superiores con efectos hover ámbar `#FBBF24`.
  2. Implementación de transiciones de apertura/cierre del Drawer con `framer-motion`.
  3. Diseño de la pestaña de características físicas y "Consola de Tasación" en color ámbar.
  4. Diseño del timeline de hitos del vendedor con hilo conductor decorativo vertical, burbujas transparentes de chat e iconos Lucide de colores.
* **Instrucciones**: Consulta y sigue al detalle las directrices visuales completas en [docs/sync/estudio_crm_vendedores.md](file:///Users/alvarolopezcuevas/Documents/GitHub/Tu_Asesor_V2/docs/sync/estudio_crm_vendedores.md).

### 🔴 [2026-05-25] Petición del Director General — Integración Premium de Vídeos y Planos Técnicos en Catálogo
* **Descripción**: Habilitar y estructurar la visualización de los vídeos (`video_url`) y los planos técnicos (`plan_url`) cargados en los anuncios de las viviendas para los usuarios en la web pública (`comprar/page.tsx`).
* **Requisitos**:
  1. Declaración e integración de los campos opcionales en la interfaz `PropertyFeatures`.
  2. Diseño de una sección glassmorphic interactiva de cristal templado autocontenida ("Multimedia y Planos") debajo de la descripción.
  3. Integración de un sistema de pestañas de navegación fluida si ambos recursos existen.
  4. Reproductor HTML5 responsivo y visor PDF/Imagen dedicado de alta gama con lightbox.
* **Instrucciones**: Consulta y sigue al detalle las directrices técnicas completas en [docs/sync/estudio_multimedia_web.md](file:///Users/alvarolopezcuevas/Documents/GitHub/Tu_Asesor_V2/docs/sync/estudio_multimedia_web.md).




## ✅ Peticiones Completadas

### 🟡 [2026-05-25] Petición del Director General — Sincronización en Tiempo Real del Calendario de Visitas en Web Pública para Evitar Colisiones de Citas (Double Booking)
* **Completado por**: Agente Web
* **Detalles**:
  1. **Consulta de Citas Activas de Supabase (`/comprar/page.tsx`)**:
     * Implementamos una consulta en tiempo real a la tabla `appointments` de Supabase al seleccionar una propiedad. Filtramos las citas activas (`status != 'cancelled'`) que tengan lugar entre el momento actual (`now`) y los próximos 14 días.
     * Guardamos las citas recuperadas en el nuevo estado reactivo tipado de manera estricta: `appointments` (`useState<Partial<Appointment>[]>([])`).
  2. **Refactorización de `getNext14Days` para Filtrado Local Inmediato**:
     * Modificamos la firma de `getNext14Days(features: PropertyFeatures | null, existingAppointments: Partial<Appointment>[])` para recibir la lista de citas existentes activas de la propiedad.
     * Implementamos lógica de comparación de fecha y hora local basada en la zona horaria del navegador del cliente (Europa/Madrid), comparando el año, mes, día y horas/minutos exactos de cada slot contra las citas existentes para filtrar automáticamente cualquier horario colisionado.
  3. **Higiene Total de Tipos en TypeScript**:
     * Eliminamos todos los tipos laxos `any` de los bloques `catch` de `loadProperties` y `handleBookAppointment` reemplazándolos por `catch (err: unknown)`, e integrando formateo y logueo de errores seguro (`err instanceof Error ? err.message : String(err)`).
     * Aseguramos un tipado estricto en todas las interacciones con `PropertyFeatures` y `Appointment`, resolviendo advertencias de variables sin usar y logrando un linter 100% libre de errores.
  4. **Verificación de Compilación y Calidad**:
     * Compilación de producción de Next.js ejecutada con éxito absoluto (`npm run build`), certificando cero errores de compilación y optimización estática perfecta de la ruta `/comprar`.
     * Ejecutada la auditoría de cambios `gitnexus_detect_changes()`, validando que las modificaciones y flujos de ejecución afectados (`ComprarPage → getNext14Days`) estén localizados de forma segura.

### 🟡 [2026-05-25] Petición del Usuario — Retoques y Optimización del CRM (Conexión de IA, Sincronización de Comentarios, Aportación con Hipoteca y Taxonomía Expandida)
* **Completado por**: Agente Web y Agente CRM (Coordinado por Antigravity Principal)
* **Detalles**:
  1. **Conexión de IA Paula Copilot en CRM**:
     - Agregamos la cabecera `Authorization: Bearer <token>` a la petición `fetch` en `ZoneSelectorPremium.tsx` recuperando la sesión activa del administrador (`supabase.auth.getSession()`), resolviendo el error 401 y conectando con éxito el Copilot IA al backend de Gemini 1.5 Flash.
  2. **Sincronización de Comentarios de Compradores en la Ficha del CRM**:
     - Modificamos el manejador de envío público en `BuyerRegistrationModal.tsx` para inyectar automáticamente un hito detallado de tipo "IA WhatsApp" en la tabla `buyer_activity_logs` tanto al registrar un comprador nuevo como al actualizar sus preferencias. Esto permite ver los comentarios/notas (`additionalNotes`) de manera fluida en la línea de tiempo del comprador en el CRM ("Ficha").
  3. **Campo de Aportación de Ahorros con Hipoteca**:
     - Agregamos el input de "Aportación de ahorros propia (€)" en el Paso 4 (Financiación) del formulario de registro público (`BuyerRegistrationModal.tsx`) si el método de pago seleccionado es "Con Hipoteca".
     - Sincronizamos este valor para que se guarde de forma nativa en la columna `savings_contribution` en la base de datos de Supabase, habilitando cálculos financieros instantáneos dentro del CRM.
  4. **Ampliación de Municipios y Barrios de la Provincia de Sevilla**:
     - Expandimos la taxonomía oficial de zonas en `ZoneSelectorPremium.tsx`, en el System Prompt del backend `/api/ai/zones/route.ts` y en el detector local de palabras clave con 8 municipios adicionales y sus sub-barrios correspondientes (Gines, Castilleja de la Cuesta, San Juan de Aznalfarache, Espartinas, Alcalá de Guadaíra, La Rinconada, Utrera, Mairena/Viso del Alcor).

### 🟡 [2026-05-24] Petición del Director General — Componentes Visuales y UI de Alta Gama (Leaflet CSS, Formulario con Notas, Carrusel Fullscreen y Asistente Paula)
* **Completado por**: Agente Web
* **Detalles**:
  1. **Importación CSS de Leaflet (`layout.tsx`)**:
     * Importado el archivo `'leaflet/dist/leaflet.css'` en el layout principal `layout.tsx` a nivel de raíz, solucionando de manera global los bugs de rendering de cajas blancas/grises de Leaflet en producción.
  2. **Bloque libre en Formulario de Comprador (`BuyerRegistrationModal.tsx`)**:
     * En el Paso 3 (Características), implementamos un textarea titulado 'Notas adicionales / Requisitos específicos' (`additionalNotes`) que permite introducir información de texto libre al comprador.
     * Integrado con el envío de datos de Supabase para guardarse de forma segura en `preferences.additionalNotes`.
  3. **Visualización de Imágenes a Pantalla Completa (`/comprar/page.tsx`)**:
     * Añadido botón premium flotante "Expandir" sobre el carrusel de imágenes del detalle de propiedades con el icono `Maximize`.
     * Diseñado un overlay inmersivo a pantalla completa (`fixed inset-0 bg-black/95 z-[100] flex flex-col justify-center items-center`) que permite ver las fotos en máxima resolución, cambiar de imagen con las flechas laterales e incluye navegación por teclado nativa (flechas izquierda/derecha y Esc para salir).
  4. **WhatsApp Estático + Asistente Virtual Paula 10s (`FloatingWhatsApp.tsx`)**:
     * Eliminada la animación `animate-bounce` del botón flotante para otorgar un aspecto estático y limpio en la esquina inferior derecha.
     * Creado un disparador temporal (`setTimeout`) a los 10 segundos de la entrada del usuario a la web que despliega suavemente un bocadillo premium dark-glassmorphic (`bg-[#1E293B]/95 border-white/10 backdrop-blur-xl`).
     * Presenta la asesora virtual Paula con un avatar animado y un punto verde de "en línea", un bocadillo de bienvenida y un textarea interactivo que redirige al usuario a WhatsApp Web/Móvil enviando el mensaje personalizado. Incluye un botón discreto de cerrar `[X]`.
     * **Hotfix Visual**: Añadido un puntero triangular a la derecha del bocadillo de chat mediante pseudo-elementos Tailwind (`after:content-[''] after:absolute after:bottom-[24px]...`) para emular perfectamente un globo de diálogo flotante.
  5. **Migración de Capa de Mapa a CartoDB Voyager (`BuyerMap.tsx`)**:
     * Migrada la fuente de mapas de OpenStreetMap estándar a **CartoDB Voyager** (`https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png`) con subdominios `abcd` y `maxZoom: 20`, previniendo que los adblockers en producción interfieran con la carga de los tiles del mapa y optimizando significativamente la nitidez y resolución del mapa interactivo de zonas de Sevilla.
  6. **Verificación del Linter y Compilación**:
     * Ejecutada la compilación completa de Next.js (`npm run build`) con un éxito rotundo (100% libre de errores) y verificado con `gitnexus_detect_changes()`.

### 🟡 [2026-05-24] Petición del Director General — Mejoras Premium, Validación y Reestructuraciones Visuales en Catálogo y Formularios
* **Completado por**: Agente Web
* **Detalles**:
  1. **Formulario de Comprador (`BuyerRegistrationModal.tsx` y `BuyerMap.tsx`)**:
     * Corregidas las letras blancas sobre fondo blanco en todos los inputs, selects y textareas agregando `text-slate-800 bg-white`.
     * Integrada validación en tiempo real y mensajes de error en rojo debajo de cada input para: Nombre (mínimo 2 caracteres), Teléfono (9-15 dígitos con la regex `VALIDATION.phone.regex`), Email (formato válido opcional), y Precio máximo (mayor que 0).
     * Añadido checkbox de consentimiento obligatorio de RGPD para WhatsApp/Email en el Paso 1, y guardada la aceptación y hora exacta (`new Date().toISOString()`) en la metadata (`preferences.rgpd_accepted` y `preferences.rgpd_accepted_at`) enviada a Supabase.
     * Añadido el llamado `map.invalidateSize()` con un `setTimeout` de 150ms en el bloque `useEffect` de inicialización de Leaflet en `BuyerMap.tsx`, solucionando por completo el problema de carga gris/blanco en pantallas modales.
  2. **Reestructuración de Catálogo (`/comprar/page.tsx`)**:
     * Se convirtió toda la tarjeta del catálogo de propiedades en clicable (`cursor-pointer hover:border-[#FBBF24]/30`), y se reemplazó el botón de la parte inferior por un indicador visual estático que dice "Ver Detalle Completo".
     * Rediseñada la visualización de detalle a pantalla completa (`fixed inset-0 z-50 bg-[#0f172a] overflow-y-auto flex flex-col`) con barra superior y botón de navegación "Volver al catálogo" con una transición interactiva elegante.
     * Estructurado el detalle inmersivo en 2 columnas:
       * **Izquierda (65%)**: Carrusel premium con indicadores de fotos y controles deslizantes, especificaciones de vivienda con tarjetas de cristal templado, descripción en texto fluido y botón de WhatsApp Directo de color verde brillante (`bg-[#25D366]`).
       * **Derecha (35%)**: Panel de cristal glassmorphic exclusivo para agendamiento de visitas online en tiempo real, integrando el flujo de reserva con el backend.
  3. **Banner de Cookies (`CookieConsent.tsx` y `LayoutWrapper.tsx`)**:
     * Creado un componente flotante `CookieConsent.tsx` en la esquina inferior izquierda con diseño dark-glassmorphic, con animación fluida de entrada y salida mediante transiciones nativas de Tailwind.
     * Integrado el control persistente con `localStorage` de manera que una vez aceptado o rechazado no vuelve a mostrarse.
     * Registrado en `LayoutWrapper.tsx` para estar disponible globalmente en toda la web pública.
  4. **Verificación de Compilación**:
     * Compilación local (`npm run build`) completada con un éxito rotundo del 100% sin un solo error de TypeScript o Next.js.

### 🟡 [2026-05-23] Petición del Director General — Eliminación de Widget de Chat Flotante y Redirección de CTA a WhatsApp del Chatbot
* **Completado por**: Agente Web
* **Detalles**:
  1. **Remoción de FloatingChatWidget (`src/components/LayoutWrapper.tsx`)**:
     * Eliminamos la importación y la renderización del widget flotante de chat amarillo (`<FloatingChatWidget />`) en `LayoutWrapper.tsx`.
     * Esto desactiva el chatbot flotante del frontend de forma limpia, mejorando el rendimiento y evitando interferencias con el widget flotante principal de WhatsApp.
  2. **Actualización de Redirección de WhatsApp (`src/lib/constants.ts`)**:
     * Modificamos la función `whatsappUrl` para que apunte directamente al número del chatbot automatizado (`34694216833`) en vez de al número personal de Álvaro (`34697223944`).
     * Esto garantiza que todas las solicitudes de contacto y redirecciones de WhatsApp que interactúen con la web pública sean atendidas directamente por el flujo de chat inteligente.
  3. **Verificación de Compilación Exitosa (`npm run build`)**:
     * Ejecutamos una compilación local rápida (`npm run build`) y validamos que todo el proyecto compile sin ningún error de tipo en TypeScript ni advertencias, logrando una compilación 100% limpia.

### 🟠 [2026-05-22] Petición del Director General — Fase Final de Unificación Estética Global (Fondo Oscuro Premium, Testimonios Glassmorphic, Suscripción, Header y Footer)
* **Completado por**: Agente Web
* **Detalles**:
  1. **Testimonios en Cuadrícula (`src/components/ReviewsGrid.tsx`)**:
     * Modificamos el estado de carga (skeleton loader) para usar un bloque animado oscuro (`bg-[#1E293B]/50 border-white/5`) en lugar del fondo claro original.
     * Convertimos las tarjetas de opiniones de clientes en un diseño glassmórfico refinado (`bg-[#1E293B]/70 border-white/5 backdrop-blur-md`), con un efecto interactivo premium en hover (`hover:border-[#FBBF24]/30 hover:scale-[1.02] transition-all duration-300`).
     * Escapamos las comillas dobles usando entidades HTML (`&ldquo;` y `&rdquo;`) para cumplir con las reglas del linter de React/Next.js.
  2. **Sección de Suscripción Premium (`src/components/SubscribeSection.tsx`)**:
     * Migramos el fondo de amarillo brillante (`bg-[#FBBF24]`) a un fondo unificado premium oscuro (`bg-[#0f172a] border-t border-white/5`) con efectos sutiles de luces difuminadas (blobs ámbar y azul en los extremos).
     * Modificamos el contenedor del icono de la campana para usar el estándar glassmorphic (`bg-[#1E293B]/70 border border-white/10 backdrop-blur-md`), aplicando un efecto de animación interactiva y color dorado (`text-[#FBBF24]`).
     * Rediseñamos el botón de llamada a la acción (CTA) con fondo ámbar/dorado brillante y letras oscuras (`bg-[#FBBF24] text-[#0f172a]`), añadiendo sombras de luz dorada (`shadow-[0_0_20px_rgba(251,191,36,0.2)]`) y efecto hover interactivo.
     * Actualizamos la paleta de colores de textos a blanco (`text-white`), ámbar (`text-[#FBBF24]`) y gris pizarra suave (`text-slate-300` / `text-slate-400`).
  3. **Footer Global Inmersivo (`src/app/layout.tsx`)**:
     * Actualizamos el fondo del footer a un tono de azul de fondo más profundo (`bg-[#0b0f19] border-t border-white/5`), eliminando por completo el color plano original `#2C3E50`.
     * Refactorizamos los enlaces de navegación, contacto y políticas legales para que utilicen el componente `<Link>` de `next/link` en lugar de etiquetas tradicionales `<a>`, previniendo errores de compilación y optimizando la carga SPA.
     * Adaptamos la tipografía del pie de página a la gama premium (`text-slate-400` y transiciones suaves de hover `hover:text-[#FBBF24]`).
  4. **Navegación y Menú Header (`src/components/Header.tsx`)**:
     * Cambiamos el fondo del menú desplegable (dropdown) de servicios y el menú móvil overlay de `bg-[#2C3E50]/95` a la estética oscura premium unificada `bg-[#0f172a]/95`.
     * Corregimos los colores de contraste y el botón principal del panel móvil a `text-[#0f172a]` para maximizar la legibilidad en pantallas reducidas.
  5. **Verificación de Higiene de Código**:
     * Ejecutamos validaciones del linter de ESLint garantizando 0 errores en todos los componentes modificados.

### 🟤 [2026-05-22] Petición del Director General — Unificación Estética de Color de Fondo Global (#0f172a) y Tarjetas Glassmorphic (#1E293B) en Landing y Catálogo
* **Completado por**: Agente Web
* **Detalles**:
  1. **Unificación Completa de Color de Fondo a `#0f172a`**:
     * Migramos la sección de captación de leads en la landing page (`#vender` en `src/app/page.tsx`) de `bg-[#1a252f]` a `bg-[#0f172a]`.
     * Modificamos el degradado del Hero (`src/app/page.tsx` línea 16) para que termine en `to-[#0f172a]`, logrando una transición visual imperceptible hacia la siguiente sección.
     * Agregamos la clase `bg-[#0f172a]` a la sección `About the Model` (`src/app/page.tsx` línea 50) para que continúe el fondo oscuro global de manera homogénea.
     * Cambiamos el fondo principal del catálogo de compra (`src/app/comprar/page.tsx`) de `bg-[#1a252f]` a `bg-[#0f172a]`.
     * Eliminamos por completo el color `#1a252f` de todos los componentes de la interfaz (`BuyerRegistrationModal.tsx`, `SuccessStoriesCarousel.tsx`, y `FloatingChatWidget.tsx`), reemplazándolo por el color de fondo premium unificado `#0f172a`.
  2. **Glassmorphism de Cristal Templado Coherente (`#1E293B`)**:
     * En el catálogo de compra (`/comprar`), actualizamos el fondo de la barra de filtros de `bg-[#2C3E50]/75` a `bg-[#1E293B]/70 border-white/5 backdrop-blur-md`.
     * Modificamos las tarjetas de propiedad del catálogo de `bg-[#2C3E50]/70 border-white/10` al estándar glassmorphic `bg-[#1E293B]/70 border-white/5 backdrop-blur-md`.
     * Rediseñamos el modal premium de detalle de inmueble de `bg-[#2C3E50]` a `bg-[#1E293B]/95 border-white/10 backdrop-blur-xl`.
     * En `SuccessStoriesCarousel.tsx`, convertimos las tarjetas de testimonios del antiguo fondo `#1a252f` al nuevo estándar `bg-[#1E293B]/70 border-white/5 backdrop-blur-md`.
     * En `FloatingChatWidget.tsx`, adaptamos el degradado del panel de mensajes a `from-[#1E293B] to-[#0f172a]` y el fondo del contenedor principal a `bg-[#1E293B]`.
  3. **Optimización de Contraste e Inputs en Zonas de Interacción**:
     * Cambiamos los menús selectores (`<select>`) del catálogo de compra (`/comprar`) de `bg-[#2C3E50]` a `bg-[#0f172a]/80`, ofreciendo un alto contraste y un diseño limpio y moderno.
     * En `BuyerRegistrationModal.tsx`, adaptamos la superposición (overlay) de fondo de `bg-[#2C3E50]/80` a `bg-black/80 backdrop-blur-sm` y rediseñamos los botones con fondo `#0f172a` y hover `hover:bg-slate-900` para garantizar una accesibilidad y elegancia superiores.

### 🟣 [2026-05-22] Petición del Director General — Rediseño Premium Oscuro, Glassmorphism, Accesibilidad y Limpieza de Tipos en Calculadoras y Catálogo
* **Completado por**: Agente Web
* **Detalles**:
  1. **Migración a Tema Oscuro Global (`bg-[#1a252f]`)**: Se rediseñaron por completo las interfaces públicas de las calculadoras de rentabilidad (`/rentabilidad`), plusvalía (`/plusvalia`) y valoración inmobiliaria (`/valoracion`) desde sus anteriores colores claros a una experiencia oscura de alta gama, integrada con blobs de luz dorada y azul difuminados, y tramas decorativas SVG.
  2. **Glassmorphism Premium**: Se actualizaron todos los inputs, selectores, tarjetas e indicadores a una estética transparente de cristal templado (`bg-white/5 border border-white/10` y `backdrop-blur-md`), con bordes semitransparentes elegantes y efectos de brillo interactivos en hover (`shadow-[0_0_30px_rgba(251,191,36,0.15)]`).
  3. **Accesibilidad WCAG (`a11y`)**:
     * Se añadieron etiquetas descriptivas (`aria-label`) a todos los botones del carrusel de fotos y de cierre del modal de detalle de `/comprar`, así como al botón de cierre en `/valoracion`.
     * Se rediseñó el carrusel de testimonios en `SuccessStoriesCarousel.tsx`, mejorando la accesibilidad mediante un foco visible claro con contornos ámbar (`focus-visible:ring-2 focus-visible:ring-[#FBBF24]`) para la navegación por teclado, y mejorando las descripciones `aria-label`.
  4. **Higiene de Tipos en TypeScript**: Se eliminaron casteos forzados de tipo `(results as any)` en el flujo de plusvalía y WhatsApp mediante el tipado riguroso del discriminador `tipo` de `PlusvaliaResult` (`PlusvaliaResultMunicipal` o `PlusvaliaResultFiscal`).
  5. **Mantenimiento del Embudo de Captación**: Se mantuvo intacta la lógica de bloqueo en 3 pasos con desenfoque de KPIs de resultados para la captación y registro de leads comerciales conforme a la RGPD.
  6. **Corrección de Centrado Horizontal en `/valoracion`**: Se aplicó un hotfix en la estructura del contenedor `<main>` mediante clases flex (`flex flex-col items-center`), centrando horizontalmente el wizard de valoración y la sección de preguntas frecuentes (FAQ) en pantalla.

### 🟢 [2026-05-21] Petición del Agente CRM — Mostrar Inmuebles Activos y Calendario de Visitas en Web Pública
* **Completado por**: Agente Web
* **Detalles**:
  1. **Visualización del Catálogo Activo**: La página pública `/comprar` consulta de forma óptima la tabla `properties` en Supabase filtrando por `status = 'active'`. Renderiza las fichas con diseño premium de tarjeta de cristal (glassmorphism), incluyendo precio, zona, galería de fotos con hover dinámico, baños, dormitorios y metros cuadrados.
  2. **Calendario de Reserva Online Granular**: Si `is_visitable_online` es `true` o `visitable_slots.active` es `true`, integra un calendario interactivo en la vista de detalle que calcula los siguientes 14 días y extrae de forma inteligente los horarios de visita independientes por día desde el campo JSONB `features.visitable_slots.schedule` (con fallback de días/horas estáticas).
  3. **Conexión de Citas**: La reserva invoca a `bookPublicAppointment` para guardar los datos del comprador y registrar su visita en Supabase, la cual sincroniza de inmediato con el calendario del panel de administración en color 🔵 Azul.

### 🔵 [2026-05-20] Petición del Agente CRM — Registro de Sesiones Únicas de Navegación
* **Completado por**: Agente Web
* **Detalles**: Se actualizó `AnalyticsTracker.tsx` para interceptar las visitas de la web pública y enrutar el tráfico de forma segura al endpoint `/api/analytics/track`. Esto genera un `session_id` persistente por sesión (vía `localStorage`), y realiza la inserción incluyendo el hash de IP anonimizado (GDPR compliant) y la detección dinámica del tráfico (`source`) a partir de parámetros UTM (por ejemplo, `utm_source`, `source`, `gclid`, `fbclid`, `utm_medium`) o cabecera `Referer`, asegurando que el panel de marketing en `/admin` represente con precisión las visitas y orígenes en tiempo real.

### 🟡 [2026-05-14] Petición del Agente IA — Widget de Chat Flotante
* **Completado por**: Agente Web
* **Detalles**: Se ha creado el componente `FloatingChatWidget` en la esquina inferior derecha. Incluye gestión del `conversation_id` con `localStorage`, interfaz premium dark mode con detalles en amarillo, y conexión directa con el endpoint `/api/chatbot/message`. Se desplazó ligeramente el botón de WhatsApp para evitar solapamientos.

*(Historial previo de tareas completadas)*
