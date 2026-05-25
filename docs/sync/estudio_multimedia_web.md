# 🏛️ ESTUDIO ARQUITECTÓNICO & PLAN DE IMPLEMENTACIÓN
## Integración Premium de Vídeos y Planos Técnicos en Web Pública

**Destinatario:** Álvaro López Cuevas / Agente Web  
**De:** Director General y Coordinador del Equipo de IA ("Tu Asesor V2")  
**Fecha:** 25 de Mayo de 2026  
**Documento de Sincronización:** `docs/sync/estudio_multimedia_web.md`

---

## 📌 1. Diagnóstico de la Situación y Desafío
En el panel de administración privado del CRM (`PropertiesManager.tsx`), Álvaro dispone de un sofisticado cargador multimedia que permite subir:
1. **Vídeos (MP4)**: Almacenados en la columna JSONB como `features.video_url`.
2. **Planos Técnicos (PDF o Imágenes)**: Almacenados en la columna JSONB como `features.plan_url`.

Sin embargo, en el portal público de compra (`src/app/comprar/page.tsx`), **estos recursos son invisibles** para los clientes potenciales debido a dos omisiones técnicas:
- La interfaz TypeScript `PropertyFeatures` a nivel de frontend no tiene declarados los campos `video_url` ni `plan_url`.
- No existe ningún componente, pestaña ni contenedor visual dentro de la ficha de detalle de propiedad inmersiva para renderizar estos valiosos elementos multimedia.

Para mantener nuestra promesa de una experiencia inmobiliaria digital de máxima categoría mundial, debemos integrar estos recursos de manera **inmersiva, estética (Premium Dark Glassmorphism) y fluida**.

---

## 💎 2. Propuesta de Diseño Estético & Experiencia de Usuario (UI/UX)

Proponemos la creación de un nuevo módulo autocontenido denominado **"Sección Multimedia & Distribución"** en la columna izquierda (65%) del detalle del inmueble, ubicado exactamente **debajo de la descripción** y **antes del CTA de WhatsApp**.

```
+-------------------------------------------------------------+
| 🎥 MULTIMEDIA Y DISTRIBUCIÓN (Tabs: Vídeo | Plano)           |
+-------------------------------------------------------------+
| [ Tab: 🎥 Recorrido en Vídeo ]  [ Tab: 🗺️ Plano de la Casa ] |
+-------------------------------------------------------------+
|                                                             |
|  ( Si es pestaña Vídeo )                                     |
|  +-------------------------------------------------------+  |
|  | [🎥 Player aspect-video con borde ámbar y controles]   |  |
|  +-------------------------------------------------------+  |
|                                                             |
|  ( Si es pestaña Plano )                                     |
|  - Imagen de plano con botón flotante "Ampliar Plano"       |
|  - Botón "Descargar Plano Técnico (PDF)" si es PDF          |
|                                                             |
+-------------------------------------------------------------+
```

### A. El Reproductor de Vídeo (`video_url`)
- **Detección Dinámica**: Si la URL apunta a un archivo directo (ej. `.mp4`), renderizar un reproductor nativo HTML5 con la etiqueta `<video>` con `controls`, `playsInline` y `preload="metadata"`. Si es un enlace de YouTube o Vimeo, renderizar un `<iframe>` responsivo con la relación de aspecto `aspect-video`.
- **Estilo Glassmorphic**: Enmarcado en una tarjeta translúcida `bg-[#1E293B]/40 border border-white/5 rounded-2xl p-6 backdrop-blur-sm shadow-xl`. El reproductor contará con esquinas redondeadas `rounded-xl` y un sutil borde ámbar `#FBBF24` en hover.

### B. El Visualizador de Planos (`plan_url`)
- **Detección de Formato**:
  - **Formato PDF**: Si el string contiene `.pdf`, renderizar una tarjeta de llamada a la acción con un icono elegante de archivo de Lucide (`FileText`), el título *"Plano Técnico de Distribución (PDF)"* y un botón de descarga prominente: `"Descargar Plano en PDF"` con el icono `Download`, fondo dorado ámbar y letras oscuras.
  - **Formato Imagen (JPG, PNG, WEBP)**: Renderizar la imagen del plano dentro de un contenedor escalado. Agregar un botón de overlay flotante con el icono `Maximize` y texto `"Ampliar Plano"` que abrirá el plano en un visor a pantalla completa dedicado (similar al de la galería de fotos pero optimizado con fondo negro translúcido y centrado inmaculado para analizar las cotas y distribución).

### C. Navegación por Pestañas (Tabs Interactivos)
- Si la propiedad cuenta con **tanto vídeo como plano**, renderizar un menú de pestañas en la cabecera del módulo con botones glassmórficos y bordes dorados que permitan conmutar suavemente entre la reproducción del vídeo y la inspección del plano.
- Si solo cuenta con uno de los dos recursos, renderizar directamente el módulo correspondiente sin pestañas, maximizando el espacio útil y simplificando la UI.

---

## 🛠️ 3. Modificaciones Técnicas en `comprar/page.tsx`

1. **Actualización de la Interfaz**:
   Añadir a `PropertyFeatures` los campos opcionales:
   ```typescript
   interface PropertyFeatures {
     // ... campos existentes
     video_url?: string;
     plan_url?: string;
   }
   ```

2. **Gestión del Estado de Pestañas**:
   Crear un estado local `const [activeMediaTab, setActiveMediaTab] = useState<'video' | 'plan'>('video')` que se inicialice por defecto al abrir la ficha del inmueble en el recurso que esté disponible.

3. **Visor de Plano a Pantalla Completa**:
   Crear un estado `const [isFullscreenPlan, setIsFullscreenPlan] = useState(false)` para abrir la imagen del plano a pantalla completa de manera aislada y limpia.

---

## 🤖 4. Prompt de Delegación Técnico para el Agente Web

Aquí tienes las instrucciones quirúrgicas listas para que el **Agente Web** las implemente de inmediato en el código:

> **Rol:** Web Frontend Developer  
> **Objetivo:** Implementar la visualización premium de Vídeos y Planos de viviendas en el portal público de compra (`src/app/comprar/page.tsx`) bajo la estética Premium Dark Glassmorphism.  
> 
> **Especificaciones Técnicas:**
> 
> 1. **Declaración en la Interfaz**:
>    Abre `src/app/comprar/page.tsx` y actualiza la interfaz `PropertyFeatures` para incluir:
>    - `video_url?: string;`
>    - `plan_url?: string;`
> 
> 2. **Lógica de Estados**:
>    Crea dos nuevos estados dentro del componente principal `ComprarPage`:
>    - `const [activeMediaTab, setActiveMediaTab] = useState<'video' | 'plan'>('video');`
>    - `const [isFullscreenPlan, setIsFullscreenPlan] = useState(false);`
>    - Asegúrate de resetear `activeMediaTab` y `isFullscreenPlan` en el `useEffect` que carga los detalles de la propiedad seleccionada (`selectedProperty`), de modo que si hay vídeo se inicie en `'video'` y si no, en `'plan'`.
> 
> 3. **Maquetado del Módulo Multimedia**:
>    Ubica la columna izquierda del detalle del inmueble (dentro del modal de `selectedProperty`) y añade la nueva sección justo debajo de la descripción (`{/* Descripción limpia */}`) y antes del bloque de WhatsApp.
> 
>    Sigue esta estructura lógica:
>    - Extrae las variables del features de forma segura:
>      `const f = (selectedProperty.features || {}) as PropertyFeatures;`
>      `const videoUrl = f.video_url;`
>      `const planUrl = f.plan_url;`
>    - Si no existe `videoUrl` ni `planUrl`, no renderices nada.
>    - Si existen ambos, dibuja una barra de pestañas en la parte superior con un diseño glassmorphic (`bg-white/5 border border-white/10 rounded-xl p-1 mb-4 flex gap-1`). Los botones de las pestañas deben lucir activos con fondo ámbar (`bg-[#FBBF24] text-[#0f172a] font-bold`) o inactivos (`text-slate-400 hover:text-white hover:bg-white/5 font-medium`) con transiciones suaves.
>    - **Renderizado del Vídeo**:
>      - Si se visualiza el vídeo:
>        - Si es un archivo directo (contiene `.mp4` o no tiene patrones de youtube/vimeo), renderiza la etiqueta HTML5 `<video src={videoUrl} controls className="w-full aspect-video rounded-xl border border-white/10 bg-black/40" preload="metadata" playsInline />`.
>        - Si contiene patrones de `youtube.com`, `youtu.be` o `vimeo.com`, renderiza un `<iframe>` responsivo con la relación de aspecto `aspect-video w-full rounded-xl border border-white/10`.
>    - **Renderizado del Plano**:
>      - Si se visualiza el plano:
>        - Si `planUrl` contiene `.pdf` (ignorando mayúsculas), renderiza una caja informativa glassmorphic (`bg-white/5 border border-white/10 rounded-xl p-6 text-center`) que contenga un icono Lucide `FileText` de gran tamaño en color ámbar (`text-[#FBBF24]`), una descripción que diga *"Plano Técnico en formato PDF"* y un botón de enlace `<a>` con `href={planUrl} download target="_blank"` con estilos de botón premium (`bg-[#FBBF24] text-[#0f172a] hover:bg-yellow-400 hover:scale-[1.02] flex items-center justify-center gap-2 font-bold py-3.5 px-6 rounded-xl transition-all shadow-lg text-sm mb-2`) e icono `Download`.
>        - Si es una imagen, muestra una vista previa escalada con bordes redondeados (`rounded-xl border border-white/10 cursor-pointer overflow-hidden relative group`) que en hover muestre una capa semitransparente con un botón flotante central de Lucide `Maximize` y texto *"Ampliar Plano"*. Al hacer clic, activa `setIsFullscreenPlan(true)`.
> 
> 4. **Visor de Plano a Pantalla Completa**:
>    Crea un modal overlay absolute/fixed (`fixed inset-0 bg-black/95 z-[100] flex flex-col justify-center items-center select-none`) que se active cuando `isFullscreenPlan` sea `true`.
>    - Debe mostrar el plano en su resolución original optimizado para lectura.
>    - Incluye un botón flotante de cierre `[X]` en la esquina superior derecha con el icono `X` que llame a `setIsFullscreenPlan(false)`.
>    - Permite cerrar el modal presionando la tecla `Escape` (añádelo al hook `useEffect` de navegación por teclado existente o crea uno nuevo).
> 
> 5. **Higiene y Estética Premium**:
>    - Garantiza que todos los componentes utilicen tipografía legible y colores acordes al tema oscuro.
>    - Añade pequeños subtítulos aclaratorios en cada pestaña para guiar al usuario.
>    - Ejecuta y verifica que no existan errores de tipado o de compilación (`npm run build`).

---

*Plan arquitectónico y directrices guardadas en `docs/sync/estudio_multimedia_web.md`.*
