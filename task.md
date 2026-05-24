# 📝 Tareas del Agente Web — Tu Asesor V2

Lista de mejoras premium implementadas en el front-end y la web pública para una experiencia de usuario sobresaliente.

## 🚀 Tareas y Estado

- [x] **1. Formulario de Comprador (`BuyerRegistrationModal.tsx` y `BuyerMap.tsx`)**
  - [x] Corregidas letras blancas sobre fondo blanco en todos los inputs, selects y textareas añadiendo las clases `text-slate-800 bg-white`.
  - [x] Validación estricta en tiempo real de campos con errores en rojo:
    - **Nombre completo**: obligatorio, mínimo 2 caracteres.
    - **Teléfono**: obligatorio, 9-15 dígitos validado con la expresión regular `VALIDATION.phone.regex` central.
    - **Email**: formato de correo válido opcional.
    - **Precio máximo**: número positivo mayor que 0.
  - [x] Añadido checkbox de consentimiento obligatorio de RGPD para contacto por WhatsApp/Email en el Paso 1.
  - [x] Sincronización en Supabase de la aceptación de RGPD y hora exacta de consentimiento dentro del JSON de metadatos `preferences`.
  - [x] Corregido renderizado gris/blanco del mapa de Leaflet en `BuyerMap.tsx` añadiendo `map.invalidateSize()` con `setTimeout` de 150ms en la inicialización.

- [x] **2. Reestructuración de Catálogo (`/comprar/page.tsx`)**
  - [x] Toda la tarjeta de propiedad del catálogo es ahora clicable (`cursor-pointer hover:border-[#FBBF24]/30`) para abrir el detalle.
  - [x] Cambiado botón inferior a un indicador puramente estático y visual de "Ver Detalle Completo".
  - [x] Rediseñada la vista de detalle a pantalla completa (`fixed inset-0 z-50 bg-[#0f172a] overflow-y-auto flex flex-col`) con botón de volver atrás elegante.
  - [x] Organización del detalle premium y minimalista en dos columnas:
    - **Izquierda (65%)**: Carrusel fotográfico con hover e indicador de fotos, ficha de especificaciones con tarjetas de cristal templado, descripción limpia y gran botón verde interactivo para contacto directo por WhatsApp.
    - **Derecha (35%)**: Panel glassmorphic exclusivo para agendamiento online de visitas en tiempo real.

- [x] **3. Banner de Cookies (`CookieConsent.tsx` y `LayoutWrapper.tsx`)**
  - [x] Creado componente flotante `CookieConsent.tsx` en la esquina inferior izquierda con diseño dark-glassmorphic de alta gama.
  - [x] Animación de entrada fluida basada en estados y transiciones nativas de Tailwind, libre de dependencias pesadas.
  - [x] Integración de control persistente en `localStorage` para evitar que vuelva a aparecer tras ser aceptado o rechazado.
  - [x] Importado e integrado en `LayoutWrapper.tsx` para estar disponible globalmente en toda la web pública.
