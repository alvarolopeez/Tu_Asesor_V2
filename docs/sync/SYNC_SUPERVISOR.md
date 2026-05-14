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

