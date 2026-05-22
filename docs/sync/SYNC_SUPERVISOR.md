# 📋 CHANGELOG — Code Review Session (Mayo 2026)

> **Autor:** Antigravity AI (Code Reviewer)  
> **Destinatario:** Gemini AI (Desarrollador Principal)  
> **Fecha:** 12 de Mayo 2026  
> **Estado:** ✅ Todos los cambios aplicados y compilación verificada (`tsc --noEmit` OK)

---

## RESUMEN EJECUTIVO

Se realizó una auditoría completa del proyecto y se aplicaron correcciones en **3 áreas**:
1. **Seguridad (Supabase RLS)** — Se endurecieron TODAS las políticas de inserción
2. **Bugs Funcionales** — Se corrigieron 4 bugs activos
3. **Arquitectura de Código** — Se crearon archivos de infraestructura (tipos, constantes)

---

## 🔴 CAMBIOS DE SEGURIDAD (Supabase RLS)

### Políticas ELIMINADAS (eran `WITH CHECK (true)` — sin restricciones)
| Tabla | Política eliminada | Razón |
|---|---|---|
| `leads` | `Public can insert leads` | Duplicada |
| `leads` | `Allow public insert to leads` | Sin validación |
| `tool_calculations` | `Allow public insert to tool_calculations` | Duplicada |
| `tool_calculations` | `Allow anonymous inserts` | Sin validación |
| `properties` | `Allow public insert to properties` | Sin validación |
| `reviews` | `Allow anonymous inserts` | Sin validación |

### Políticas CREADAS (con validaciones)
| Tabla | Nueva Política | Validaciones |
|---|---|---|
| `leads` | `Validated public insert to leads` | name NOT NULL (2-100 chars), phone (9-15 digits), type IN (buyer/seller), status = new |
| `properties` | `Validated public insert to properties` | title NOT NULL (3+ chars), price > 0, status = draft |
| `reviews` | `Validated public insert to reviews` | client_name (2+ chars), rating 1-5, comment (10+ chars), is_published = false |
| `tool_calculations` | `Validated public insert to tool_calculations` | tool_type NOT NULL (≤50 chars), inputs/results NOT NULL |
| `reviews` | `Public can view published reviews` | SELECT WHERE is_published = true |
| `appointments` | `Authenticated manage appointments` | Solo admin autenticado (ALL) |
| `ai_interactions` | `Authenticated manage ai_interactions` | Solo admin autenticado (ALL) |
| `leads` | `Authenticated manage leads` | Solo admin autenticado (ALL) |
| `properties` | `Authenticated manage properties` | Solo admin autenticado (ALL) |

### ⚠️ IMPORTANTE PARA GEMINI
Si en el futuro se añaden formularios públicos que inserten en `appointments` o `ai_interactions`, 
se necesitarán políticas INSERT públicas con validaciones (actualmente solo admin puede acceder).

---

## 🟠 BUGS CORREGIDOS

### BUG-001 + BUG-002: ReviewsGrid consultaba campo inexistente
- **Archivo:** `src/components/ReviewsGrid.tsx`
- **Antes:** `.eq('status', 'published')` — el campo `status` NO existe en la tabla `reviews`
- **Después:** `.eq('is_published', true)` — campo correcto (boolean)
- **Impacto:** Las reseñas reales de la BD ahora se muestran correctamente
- **También:** Se eliminó la interfaz local `Review` y se usa `@/types/Review` centralizada

### BUG-003: Header duplicado en Rentabilidad
- **Archivo:** `src/app/rentabilidad/page.tsx`
- **Antes:** Importaba y renderizaba `<Header />` directamente, pero `LayoutWrapper.tsx` ya lo hace
- **Después:** Se eliminó el import y render de Header
- **Impacto:** Ya no aparece doble header

### BUG-006: Variable porcentajeSuelo sin uso en Plusvalía
- **Archivo:** `src/app/plusvalia/page.tsx`
- **Antes:** `const porcentajeSuelo = valCatSuelo / (valCatSuelo * 1.5)` (calculado pero no usado)
- **Después:** `const ratioSuelo = valCatSuelo / (valCatSuelo * 1.5)` → `baseReal = incrementoReal * ratioSuelo`
- **Impacto:** El Método Real ahora usa el ratio catastral calculado en lugar del 0.6 hardcodeado

### FIX: Número de WhatsApp inconsistente
- **Archivos afectados:** `plusvalia/page.tsx`, `rentabilidad/page.tsx`, `FloatingWhatsApp.tsx`, `contacto/page.tsx`
- **Antes:** Dos números diferentes (697223944 y 623956461) hardcodeados
- **Después:** Todos usan `BUSINESS.whatsappUrl()` desde `@/lib/constants.ts` con número unificado

---

## 🟢 ARCHIVOS NUEVOS CREADOS

### 1. `src/lib/constants.ts`
Contiene TODAS las constantes del negocio centralizadas:
- `BUSINESS` — nombre, teléfono, email, helper de WhatsApp URL
- `COLORS` — paleta de colores del diseño
- `COEFICIENTES_PLUSVALIA_2024` — coeficientes fiscales (actualizar anualmente)
- `MUNICIPIOS_SEVILLA` — lista de municipios para la calculadora
- `ITP_DATA` — tipos de ITP por comunidad autónoma
- `IRPF_TRAMOS` — tramos de IRPF 2024
- `VALIDATION` — reglas de validación reutilizables

### 2. `src/types/index.ts`
Interfaces TypeScript que mapean EXACTAMENTE al schema de Supabase:
- `Lead`, `LeadInsert`, `LeadType`, `LeadStatus`
- `Property`, `PropertyStatus`
- `Review` (con `is_published: boolean`, NO `status: string`)
- `ToolCalculation`, `ToolType`
- `Appointment`, `AppointmentStatus`
- `AIInteraction`, `AIIntent`
- `PlusvaliaResult` (union type: Municipal | Fiscal)
- `RentabilidadResult`

### 3. `next.config.ts` (ACTUALIZADO)
- Añadido `images.remotePatterns` para `i.ibb.co`
- Permite quitar `unoptimized` de las imágenes del carrusel

### 4. `CHANGELOG_CODE_REVIEW.md` (este archivo)

---

## 📁 ARCHIVOS MODIFICADOS (resumen rápido)

| Archivo | Cambios |
|---|---|
| `src/components/ReviewsGrid.tsx` | Fix query `is_published`, usar tipo `Review` centralizado |
| `src/components/FloatingWhatsApp.tsx` | Usar `BUSINESS.whatsappUrl()` centralizado |
| `src/app/rentabilidad/page.tsx` | Eliminar Header duplicado, centralizar constantes/tipos |
| `src/app/plusvalia/page.tsx` | Fix porcentajeSuelo, centralizar constantes/tipos, fix WhatsApp |
| `src/app/contacto/page.tsx` | Centralizar teléfono y email desde constants |
| `next.config.ts` | Añadir optimización de imágenes remotas |

---

## 🧭 REGLAS PARA GEMINI (seguir en todo desarrollo futuro)

1. **NUNCA hardcodear** teléfonos, emails ni URLs → importar de `@/lib/constants`
2. **NUNCA usar `any`** como tipo → crear interfaz en `@/types/index.ts`
3. **NUNCA usar `WITH CHECK (true)`** en RLS → siempre con validaciones
4. **Verificar campo correcto** antes de hacer queries a Supabase (consultar `@/types`)
5. **Un solo Header** — `LayoutWrapper` ya lo renderiza para páginas no-admin
6. **Formularios nuevos** deben usar validación Zod antes de insertar en BD
7. **Actualizar `@/types`** si se modifica el schema de Supabase

---

## ⏭️ TAREAS PENDIENTES (no aplicadas en esta sesión)

| Prioridad | Tarea | Detalle |
|---|---|---|
| MEDIA | Implementar validación Zod en formularios | Zod está instalado pero sin usar |
| MEDIA | Refactorizar AdminDashboard en sub-componentes | 497 líneas, difícil de mantener |
| MEDIA | Reemplazar `alert()` por toast system | 4 componentes afectados |
| MEDIA | Añadir metadata SEO a páginas secundarias | /comprar, /plusvalia, /rentabilidad, /contacto |
| BAJA | Implementar focus trap en modales | Accesibilidad |
| BAJA | Quitar prop `unoptimized` de SuccessStoriesCarousel | Ya configurado remotePatterns |
| BAJA | Activar leaked password protection | Dashboard Supabase → Auth Settings |

---

## 🔵 SESIÓN 2: Fixes de Formularios y Deploy (12 May 2026 - 21:00h)

### FIX: Error RLS en formularios de calculadoras
- **Error:** `new row violates row-level security policy for table 'leads'` (401)
- **Causa:** Las nuevas políticas RLS de la Sesión 1 validaban correctamente pero faltaba que el frontend enviara `status: 'new'` explícitamente. Además no había SELECT público para buscar leads existentes.
- **Solución:** Creado `src/lib/leadService.ts` centralizado + RLS de SELECT público en `leads`

### Nuevo archivo: `src/lib/leadService.ts`
Servicio centralizado de leads con lógica de negocio:
- **Deduplicación:** Busca lead existente por teléfono antes de insertar
- **Si ya existe:** Reutiliza su ID, NO duplica
- **Si no existe:** Crea nuevo lead como `seller` (plusvalía) o `buyer` (rentabilidad)
- **Guarda cálculo:** Vincula el cálculo al lead (existente o nuevo)
- **Manejo de errores:** Devuelve `{ success, leadId, isExisting, error }` en vez de throw

### Formularios actualizados (plusvalia + rentabilidad)
- ✅ **Checkbox de consentimiento** obligatorio: "Acepto recibir llamada/mensaje de Tu Asesor..."
- ✅ **Botón deshabilitado** hasta aceptar consentimiento (gris → amarillo)
- ✅ **Loading state**: "Guardando..." mientras procesa
- ✅ **Errores inline** en vez de `alert()` nativo
- ✅ **Validación HTML5**: `minLength`, `maxLength`, `pattern` en campos
- ✅ **Sanitización de teléfono**: Solo permite dígitos (`replace(/[^0-9]/g, '')`)

### FIX: Deploy Netlify — `eslint` config
- **Error:** `next.config.ts` incluía propiedad `eslint` no soportada en Next.js 16
- **Solución:** Eliminada la propiedad del config

### FIX: Deploy Netlify — Supabase prerender crash
- **Error:** `supabaseUrl is required` durante prerender estático de `/comprar`
- **Causa:** `createClient()` se ejecutaba a nivel de módulo sin env vars disponibles
- **Solución:** `src/lib/supabase.ts` reescrito con patrón Proxy lazy-init
- **Requisito:** Variables `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` deben existir en Netlify

### RLS adicional creada
| Tabla | Política | Tipo |
|---|---|---|
| `leads` | `Public can check existing leads by phone` | SELECT (para deduplicación) |


## 🔵 SESIÓN 3: Resoluciones de ESLint y Auditoría de Seguridad RPC (22 Mayo 2026)

### 1. Limpieza de Compilación (Resolución de Errores de ESLint)
Se resolvieron exitosamente los errores de ESLint de tipo `no-use-before-define` (variables/funciones usadas antes de ser declaradas) en dos archivos críticos:
- **`src/components/admin/sections/WebhooksManager.tsx`**: El hook `useEffect` llamaba a la constante `fetchLogs` antes de que fuera inicializada debido a que estaba declarada mediante `const fetchLogs = async () => {}` (sin hoisting).
  - *Solución*: Se reubicó el bloque del hook `useEffect` justo después de la declaración física de la constante `fetchLogs`, cumpliendo estrictamente la especificación y eliminando el error del compilador.
- **`src/components/admin/sections/DashboardOverview.tsx`**: La función de renderizado de impresión `renderPrintPreview` estaba declarada dentro del componente pero al final del archivo (después del bloque `return`), lo que disparaba la advertencia/error de uso previo al renderizado.
  - *Solución*: Se movió toda la declaración física de `renderPrintPreview` para situarla antes del bloque `return` del componente. La función sigue siendo interna y encapsulada, pero ahora cumple a cabalidad con la regla de definición previa a su invocación.

---

### 2. Auditoría de Seguridad: Vulnerabilidad de Exposición de PII en Matchmaker (`PropertiesManager.tsx`)
**Hallazgo Crítico**: En `src/components/admin/sections/PropertiesManager.tsx`, el algoritmo de emparejamiento geográfico e inmobiliario (Matchmaker) se ejecutaba por completo del lado del cliente. Para esto, la función `fetchLeads` consultaba la totalidad de los leads compradores en bruto (`leads` con `type = 'buyer'` y activos), descargando a la memoria del navegador de forma masiva datos de carácter extremadamente sensible (PII) como nombres, teléfonos, emails y sus preferencias.
- **Riesgo**: Sobrecarga de datos (Over-fetching) y, lo que es más grave, la fuga potencial de la base de datos de compradores a cualquier atacante con acceso a la consola del navegador.

#### Propuesta Estratégica: Migración a una Función RPC en PostgreSQL (Supabase)
Para mitigar este riesgo de raíz, se propone realizar todo el procesamiento geográfico (Haversine y polígonos/áreas) e inmobiliario directamente en la base de datos en PostgreSQL, y exponer una función RPC que retorne única y exclusivamente los leads que representen un match real.

##### Código de Base de Datos Propuesto (SQL)

```sql
-- 1. Función para calcular distancia Haversine
CREATE OR REPLACE FUNCTION calculate_haversine_distance(
  lat1 NUMERIC, lon1 NUMERIC,
  lat2 NUMERIC, lon2 NUMERIC
)
RETURNS NUMERIC AS $$
DECLARE
  R NUMERIC := 6371.0; -- Radio de la tierra en km
  dLat NUMERIC;
  dLon NUMERIC;
  a NUMERIC;
  c NUMERIC;
BEGIN
  dLat := radians(lat2 - lat1);
  dLon := radians(lon2 - lon1);
  a := sin(dLat/2.0) * sin(dLat/2.0) +
       cos(radians(lat1)) * cos(radians(lat2)) *
       sin(dLon/2.0) * sin(dLon/2.0);
  c := 2.0 * atan2(sqrt(a), sqrt(1.0 - a));
  RETURN R * c;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2. Función Ray Casting para punto en un polígono en formato JSONB
CREATE OR REPLACE FUNCTION is_point_in_polygon_jsonb(
  p_lat NUMERIC, p_lng NUMERIC,
  p_polygon JSONB
)
RETURNS BOOLEAN AS $$
DECLARE
  v_inside BOOLEAN := FALSE;
  v_len INT;
  i INT;
  j INT;
  v_lat_i NUMERIC;
  v_lng_i NUMERIC;
  v_lat_j NUMERIC;
  v_lng_j NUMERIC;
  v_point_i JSONB;
  v_point_j JSONB;
BEGIN
  v_len := jsonb_array_length(p_polygon);
  IF v_len < 3 THEN
    RETURN FALSE;
  END IF;

  j := v_len - 1;
  FOR i IN 0..(v_len - 1) LOOP
    v_point_i := p_polygon->i;
    v_point_j := p_polygon->j;
    
    v_lat_i := (v_point_i->>0)::NUMERIC;
    v_lng_i := (v_point_i->>1)::NUMERIC;
    v_lat_j := (v_point_j->>0)::NUMERIC;
    v_lng_j := (v_point_j->>1)::NUMERIC;

    IF ((v_lng_i > p_lng) <> (v_lng_j > p_lng))
       AND (p_lat < (v_lat_j - v_lat_i) * (p_lng - v_lng_i) / NULLIF(v_lng_j - v_lng_i, 0.0) + v_lat_i) THEN
      v_inside := NOT v_inside;
    END IF;
    j := i;
  END LOOP;

  RETURN v_inside;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 3. Función auxiliar para verificar punto en un array de polígonos
CREATE OR REPLACE FUNCTION is_point_in_polygons_jsonb(
  p_lat NUMERIC, p_lng NUMERIC,
  p_polygons JSONB,
  p_geo_radius NUMERIC
)
RETURNS BOOLEAN AS $$
DECLARE
  v_poly JSONB;
  v_centroid_lat NUMERIC;
  v_centroid_lng NUMERIC;
  v_lat_sum NUMERIC;
  v_lng_sum NUMERIC;
  v_len INT;
  v_pt JSONB;
  k INT;
  m INT;
BEGIN
  FOR k IN 0..(jsonb_array_length(p_polygons) - 1) LOOP
    v_poly := p_polygons->k;
    
    IF is_point_in_polygon_jsonb(p_lat, p_lng, v_poly) THEN
      RETURN TRUE;
    END IF;
    
    v_len := jsonb_array_length(v_poly);
    IF v_len > 0 THEN
      v_lat_sum := 0.0;
      v_lng_sum := 0.0;
      FOR m IN 0..(v_len - 1) LOOP
        v_pt := v_poly->m;
        v_lat_sum := v_lat_sum + (v_pt->>0)::NUMERIC;
        v_lng_sum := v_lng_sum + (v_pt->>1)::NUMERIC;
      END LOOP;
      v_centroid_lat := v_lat_sum / v_len;
      v_centroid_lng := v_lng_sum / v_len;
      
      IF calculate_haversine_distance(p_lat, p_lng, v_centroid_lat, v_centroid_lng) <= p_geo_radius THEN
        RETURN TRUE;
      END IF;
    END IF;
  END LOOP;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 4. Función RPC Principal de Matchmaking
CREATE OR REPLACE FUNCTION get_matching_leads_for_property(
  p_property_id UUID,
  p_price_margin NUMERIC DEFAULT 10.0,
  p_geo_radius NUMERIC DEFAULT 5.0
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  phone TEXT,
  email TEXT,
  preferences JSONB,
  created_at TIMESTAMP WITH TIME ZONE
)
SECURITY DEFINER
AS $$
DECLARE
  v_prop_price NUMERIC;
  v_prop_lat NUMERIC;
  v_prop_lng NUMERIC;
  v_prop_type TEXT;
  v_prop_rooms INT;
  v_prop_baths INT;
BEGIN
  -- A. Validación de Rol Autenticado (Administrador)
  IF auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION 'Acceso no autorizado: Solo administradores autenticados pueden ejecutar esta función.';
  END IF;

  -- B. Obtener los detalles del inmueble
  SELECT 
    price,
    (features->>'latitude')::NUMERIC,
    (features->>'longitude')::NUMERIC,
    features->>'propertyType',
    coalesce((features->>'rooms')::INT, 0),
    coalesce((features->>'baths')::INT, 0)
  INTO 
    v_prop_price,
    v_prop_lat,
    v_prop_lng,
    v_prop_type,
    v_prop_rooms,
    v_prop_baths
  FROM properties
  WHERE properties.id = p_property_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Propiedad con ID % no encontrada.', p_property_id;
  END IF;

  -- C. Filtrado Server-Side y Retorno de Coincidencias Reales
  RETURN QUERY
  SELECT 
    l.id,
    l.name,
    l.phone,
    l.email,
    l.preferences,
    l.created_at
  FROM leads l
  WHERE 
    l.type = 'buyer'
    AND l.status NOT IN ('lost', 'closed')
    AND (
      l.preferences->>'maxPrice' IS NULL
      OR (l.preferences->>'maxPrice')::NUMERIC >= (v_prop_price * (1.0 - p_price_margin / 100.0))
    )
    AND (
      l.preferences->>'propertyType' IS NULL
      OR l.preferences->>'propertyType' = 'Indiferente'
      OR v_prop_type = 'Indiferente'
      OR l.preferences->>'propertyType' = v_prop_type
    )
    AND (
      l.preferences->>'minRooms' IS NULL
      OR (l.preferences->>'minRooms')::INT <= v_prop_rooms
    )
    AND (
      l.preferences->>'minBaths' IS NULL
      OR (l.preferences->>'minBaths')::INT <= v_prop_baths
    )
    AND (
      v_prop_lat IS NULL OR v_prop_lng IS NULL
      OR (
        (l.preferences->>'latitude' IS NULL AND l.preferences->>'longitude' IS NULL AND l.preferences->>'area' IS NULL AND l.preferences->>'polygons' IS NULL)
        OR
        (
          l.preferences->>'latitude' IS NOT NULL AND l.preferences->>'longitude' IS NOT NULL
          AND calculate_haversine_distance(v_prop_lat, v_prop_lng, (l.preferences->>'latitude')::NUMERIC, (l.preferences->>'longitude')::NUMERIC) <= p_geo_radius
        )
        OR
        (
          l.preferences->>'area' IS NOT NULL 
          AND (
            is_point_in_polygon_jsonb(v_prop_lat, v_prop_lng, l.preferences->'area')
            OR
            (
              SELECT calculate_haversine_distance(
                v_prop_lat, v_prop_lng,
                (SUM((pt->>0)::NUMERIC) / jsonb_array_length(l.preferences->'area')),
                (SUM((pt->>1)::NUMERIC) / jsonb_array_length(l.preferences->'area'))
              ) <= p_geo_radius
              FROM jsonb_array_elements(l.preferences->'area') AS pt
            )
          )
        )
        OR
        (
          l.preferences->>'polygons' IS NOT NULL 
          AND is_point_in_polygons_jsonb(v_prop_lat, v_prop_lng, l.preferences->'polygons', p_geo_radius)
        )
      )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Revocar permisos de ejecución pública y restringir a administradores/service_role
REVOKE EXECUTE ON FUNCTION get_matching_leads_for_property(UUID, NUMERIC, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_matching_leads_for_property(UUID, NUMERIC, NUMERIC) TO authenticated, service_role;
```

#### Plan de Acción para Frontend (`PropertiesManager.tsx`)
Una vez creada la función RPC en la consola SQL de Supabase:
1. **Eliminar por completo** el método `fetchLeads` del frontend. Ya no es necesario descargar todos los leads compradores.
2. **Eliminar** el `useMemo` del `matchmakingResult`.
3. **Crear un estado** en React `const [matchingLeads, setMatchingLeads] = useState<LeadRow[]>([])` y llamar a la función RPC de Supabase de manera diferida, únicamente cuando el administrador abra el modal de Smart Matchmaker o cambie los inputs de los sliders de radio geográfico o margen de precio.
4. **Sincronizar** esta petición en un `useEffect` reactivo que se dispare cuando cambien `matchingProperty`, `priceMargin` o `geoRadius`.


