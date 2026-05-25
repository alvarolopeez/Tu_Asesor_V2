# 🏛️ PLAN DE DISEÑO ARQUITECTÓNICO & IMPLEMENTACIÓN
## Módulo Premium de "Vendedores CRM" (SellersCRMManager)

**Destinatario:** Álvaro López Cuevas  
**De:** Director General y Coordinador del Equipo de IA ("Tu Asesor V2")  
**Fecha:** 25 de Mayo de 2026  
**Documento de Arquitectura:** `docs/sync/estudio_crm_vendedores.md` (y persistido como Artefacto)

---

## 📌 1. Visión General e Identidad del Módulo
El objetivo estratégico es dotar a **Tu Asesor V2** de un panel inmersivo de gestión comercial para propietarios que desean vender sus inmuebles, unificando, refinando y reemplazando la pestaña básica actual de leads comerciales (`WarmLeadsManager.tsx`) por una experiencia CRM de primerísimo nivel denominada **`SellersCRMManager.tsx`** o **`WarmSellersManager.tsx`**.

El nuevo módulo debe emular la densidad de datos, la interactividad reactiva en caliente y la deslumbrante estética **Premium Dark Glassmorphism** de `BuyersManager.tsx`, pero adaptándose con precisión quirúrgica al ciclo de vida de un propietario vendedor.

```
CICLO DE VIDA DEL LEAD VENDEDOR:
[ Formulario Calculadora Web ]
[ Chat con Paula IA (WhatsApp) ] ➔ [ Lead: type = 'seller' ] ➔ [ SellersCRMManager ] ➔ [ Captado Exclusiva ]
[ Alta Manual / Meta Ads     ]
```

---

## 🗄️ 2. Análisis y Modelado de Base de Datos (Supabase SQL)

### A. La Tabla `leads` como Repositorio Central
La tabla `leads` de Supabase es perfecta para centralizar todos los contactos comerciales de entrada. Cuenta con columnas idóneas que aprovecharemos al máximo:
*   `type`: Filtrado estricto donde `type = 'seller'`.
*   `source`: Almacena la procedencia del lead (`'Calculadora Valoración'`, `'Calculadora Plusvalía'`, `'Paula WhatsApp'`, `'Meta Ads'`, `'Alta Manual'`).
*   `status`: Mapea el estado del funnel del lead. Los estados oficiales para vendedores serán:
    - `"Nuevo Lead"` (Recién entrado).
    - `"Valoración Enviada"` (Se le ha enviado el informe de la calculadora).
    - `"Contacto Establecido"` (Llamada inicial realizada).
    - `"Visita Realizada"` (Inspección física/tasación efectuada).
    - `"Captado en Exclusiva"` (Mandato firmado y activo).
    - `"Inactivo / Perdido"` (Descartado).
*   `preferences` (JSONB): Columna flexible clave donde guardaremos toda la metadata del inmueble a valorar. La estructura JSONB unificada para vendedores será:
    ```json
    {
      "property_address": "Calle San Jacinto 12, 3ºB, Triana",
      "property_type": "Piso",
      "sqm": 95,
      "rooms": 3,
      "baths": 2,
      "estimated_value": 245000,
      "additionalNotes": "Comentarios de la calculadora o notas del propietario",
      "rgpd_accepted": true,
      "rgpd_accepted_at": "2026-05-25T08:30:00Z"
    }
    ```

### B. Nueva Tabla Relacional: `seller_activity_logs`
Para disponer de una línea de tiempo (timeline) cronológica inmaculada de hitos y gestiones (llamadas, correos de seguimiento, visitas de tasación, etc.), crearemos la tabla relacional `seller_activity_logs` vinculada a `leads.id`. Esto aísla el historial de vendedores de manera limpia y eficiente.

#### 📝 Script SQL de Migración (Supabase SQL Editor)
```sql
-- 1. Crear la tabla de logs de actividad de vendedores
CREATE TABLE IF NOT EXISTS public.seller_activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL, -- 'Llamada', 'Nota de visita', 'Valoración', 'Email', 'IA WhatsApp', 'Meta Ads', 'Cambio Estado'
    title TEXT NOT NULL,
    notes TEXT,
    event_date TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- 2. Habilitar Row Level Security (RLS)
ALTER TABLE public.seller_activity_logs ENABLE ROW LEVEL SECURITY;

-- 3. Crear políticas RLS de Supabase
-- A. Solo administradores autenticados pueden realizar operaciones completas (CRUD)
CREATE POLICY "Authenticated manage seller_activity_logs" 
ON public.seller_activity_logs
FOR ALL 
TO authenticated
USING (true)
WITH CHECK (true);

-- B. Permitir inserción anónima/pública controlada (para integraciones automáticas como Meta Ads o webhooks)
CREATE POLICY "Public can insert seller_activity_logs"
ON public.seller_activity_logs
FOR INSERT
TO public
WITH CHECK (
    event_type IN ('Valoración', 'IA WhatsApp', 'Meta Ads') 
    AND title IS NOT NULL
);

-- 4. Crear índice para optimizar consultas de timeline por vendedor
CREATE INDEX IF NOT EXISTS idx_seller_logs_lead_id ON public.seller_activity_logs(lead_id);
```

---

## 🏛️ 3. Plano Arquitectónico del Módulo "Vendedores CRM" (`SellersCRMManager.tsx`)
El nuevo componente reemplazará a `WarmLeadsManager.tsx` (Warm Leads de Vendedores) y se dividirá en tres áreas visuales y lógicas de alta gama:

```
+-----------------------------------------------------------------------------------+
| 💼 GESTOR DE VENDEDORES POTENCIALES (SellersCRMManager)                            |
+-----------------------------------------------------------------------------------+
|  [Contadores KPI Cards: Total Vendedores | Valoraciones Enviadas | En Exclusiva ]  |
+-----------------------------------------------------------------------------------+
|  [🔍 Buscador Fuzzy ]   [Funnel Status Filter: Todos | Nuevos | Contactados ]      |
+-----------------------------------------------------------------------------------+
|  TABLA GLASSMORPHIC (Leads Vendedores)                                            |
|  Nombre         | Teléfono   | Origen           | Estado        | F. Registro     |
|  Álvaro López   | 694216833  | Plusvalía Web    | [Valoración]  | 25 May 2026     |
+-----------------------------------------------------------------------------------+
```

### A. UI Principal y Tabla de Cristal Templado
*   **KPI Cards Superiores:** Tarjetas Translúcidas con filtro `backdrop-blur-md` y bordes tenues `border-white/5`. Muestran estadísticas reactivas:
    - *Vendedores Activos* (Contador).
    - *Tasa de Conversión a Exclusiva* (Porcentaje).
    - *Ticket Medio de Venta Estimado* (Promedio de `preferences.estimated_value`).
*   **Buscador Fuzzy Predictivo:** Filtra en tiempo real por nombre, teléfono, email, dirección del inmueble o fuente de origen.
*   **Funnel Selector:** Chips interactivos para filtrar la tabla al instante por su estado de captación.

### B. El Drawer Lateral de Edición en Caliente (SellersDrawer)
Al hacer clic en cualquier fila de la tabla, se despliega suavemente desde la derecha un Drawer inmersivo estructurado en tres pestañas:

1.  **Pestaña 👤 Perfil Personal:**
    - Inputs editables en caliente (`onBlur`/`Enter`) para: Nombre, Teléfono, Email, y un Selector de Fuente (`source`).
    - **Selector de Estado del Funnel:** Cabecera interactiva con colores dinámicos (Ámbar para nuevo, Azul para contacto, Verde brillante para Exclusiva) que actualiza Supabase automáticamente.
2.  **Pestaña 🏠 Datos del Inmueble a Valorar:**
    - Dirección completa de la propiedad.
    - Campos de características físicas: Tipo de inmueble (Piso, Casa, Local), Metros cuadrados (`sqm`), Dormitorios, y Baños.
    - **Consola de Tasación y Negociación:** Caja destacada con bordes ámbar `#FBBF24` que muestra la valoración estimada por el algoritmo web público (`estimated_value`), un input para establecer la estimación definitiva del agente inmobiliario, y el porcentaje de comisión negociada pactada (CAC calculator dinámico).
3.  **Pestaña 📋 Historial y Timeline Cronológico:**
    - Carga en orden descendente los eventos de `public.seller_activity_logs`.
    - Presenta un botón rápido para añadir notas en caliente (ej: *"Llamada 25/05: Interesado en firmar exclusiva el próximo lunes"*).
    - Renderiza una caja de chat glassmórfica para cada hito con iconos diferenciados de Lucide React por canal.

---

## 🤖 4. Prompts de Delegación Quirúrgicos para el Equipo de IA

### 💼 A. Prompt para el Agente CRM (Backend & Lógica)
> **Rol:** CRM & Database Sinking Specialist  
> **Objetivo:** Implementar la capa de datos de Supabase, las consultas filtradas, las mutaciones reactivas en caliente del Drawer del vendedor y la inyección automática en el timeline.  
> **Directrices Técnicas:**
> 1. Modifica la importación de datos en el administrador de CRM para apuntar a la tabla `leads` filtrando exclusivamente por `type = 'seller'`.
> 2. Implementa la mutación de actualización en Supabase. Al modificar cualquier campo del Drawer de Vendedor (nombre, teléfono, email, dirección, metros, habitaciones, etc.), dispara un `onBlur` o tecla `Enter` que realice un `.update()` en la tabla `leads` modificando las columnas correspondientes (incluyendo el payload JSONB de `preferences`).
> 3. Escribe la lógica para leer y escribir en la nueva tabla `public.seller_activity_logs`. Al abrir el Drawer de un lead, realiza un fetch ordenado por `event_date DESC`. Al presionar "Añadir hito", realiza un `.insert()` guardando el `lead_id`, `event_type`, `title` and `notes`.
> 4. Cuando el estado del funnel de captación cambie (ej: de `"Nuevo Lead"` a `"Contacto Establecido"`), inyecta de forma automática un hito en `seller_activity_logs` con `event_type = 'Cambio Estado'`, titulándolo *"Estado actualizado a: Contacto Establecido"* y con notas del sistema.
> 5. Sigue una filosofía de control de errores rigurosa, evitando caídas visuales si algún campo `preferences` contiene JSONB corrupto o nulo.

### 🌐 B. Prompt para el Agente Web (Frontend UI/UX Specialist)
> **Rol:** Web Frontend & Components Developer  
> **Objetivo:** Diseñar y programar la interfaz visual `SellersCRMManager.tsx` y el Drawer interactivo `SellersDrawer.tsx` bajo la estética Premium Dark Glassmorphism.  
> **Directrices Técnicas:**
> 1. Crea el componente principal `src/components/admin/sections/SellersCRMManager.tsx` en sustitución del antiguo WarmLeadsManager.
> 2. Diseña la tabla de leads vendedores con fondos translúcidos (`bg-[#1E293B]/40 border-white/5 backdrop-blur-md hover:border-[#FBBF24]/20 transition-all duration-300`).
> 3. **El Drawer de Vendedor (`SellersDrawer.tsx`):**
>    - Debe abrirse y cerrarse con transiciones laterales suaves utilizando `framer-motion` (`x: 0` a `x: '100%'`).
>    - Implementa una barra superior inmersiva con el nombre del lead y el selector de estado en forma de dropdown elegante con un punto de pulso animado.
>    - Maqueta las tres sub-pestañas (Perfil, Propiedad, Timeline) utilizando un diseño glassmórfico de cristal templado.
>    - En la pestaña de Propiedad, crea sliders interactivos o cajas numéricas para los metros cuadrados y dormitorios, destacando la "Consola de Tasación" en color ámbar (`#FBBF24`).
>    - En la pestaña de Timeline, dibuja un hilo visual vertical decorativo donde cuelguen las burbujas de hitos de forma escalonada e interactiva, mostrando iconos de Lucide (📞 para Llamadas, ✉️ para Emails, 📊 para Valoraciones, 🤖 para IA WhatsApp).
> 4. Garantiza una responsividad perfecta y una legibilidad soberbia adaptada al tema oscuro de la aplicación.

### ⚙️ C. Prompt para el Agente de Automatización y Seguridad
> **Rol:** Backend, Integrations & Security Specialist  
> **Objetivo:** Ejecutar la migración de base de datos en Supabase, registrar interfaces TypeScript en `types/index.ts` y auditar las políticas RLS.  
> **Directrices Técnicas:**
> 1. Ejecuta el script SQL en la base de datos de Supabase para crear la tabla `seller_activity_logs`, configurando adecuadamente las claves foráneas, índices y políticas RLS descritas en el plan.
> 2. Declara e integra las interfaces en `src/types/index.ts` para tipar limpiamente el nuevo log:
>    ```typescript
>    export interface SellerActivityLog {
>      id: string;
>      lead_id: string;
>      event_type: string;
>      title: string;
>      notes: string | null;
>      event_date: string;
>      created_at: string;
>    }
>    ```
> 3. Asegura que la interfaz `Lead` en `src/types/index.ts` incluya soporte nativo para los estados del funnel de vendedor y el tipado correcto de `preferences` de tipo vendedor.
> 4. Audita las políticas de inserción públicas en la tabla `leads` para garantizar que cuando una calculadora de plusvalía o la IA WhatsApp inserten un lead de tipo vendedor, Supabase no rebote la petición por infracción RLS (401/403).

---

## 📈 Conclusión y Activación
Álvaro, esta propuesta técnica redefine por completo la gestión de leads propietarios en **Tu Asesor V2**. Al dotar a la sección de Vendedores de un timeline cronológico de hitos, edición reactiva en caliente del Drawer lateral y una consola de tasación dedicada, el CRM se convierte en un motor de captación y seguimiento inmobiliario de categoría mundial.

Estamos listos para desplegar a los agentes especialistas para la programación y ensamblaje de esta espectacular característica en cuanto apruebes la orden de ejecución.

---
*Plan de diseño arquitectónico guardado en `docs/sync/estudio_crm_vendedores.md` y registrado en la bitácora del Director General.*
