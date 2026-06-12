# Executor Brief #014 — Dashboard › Operaciones: 5 paneles más potentes y flexibles

**Fecha**: 2026-06-12
**Origen**: Álvaro quiere que la pestaña **Operaciones** del dashboard admin sea más rica y filtrable.
5 mejoras independientes (T1–T5). El diagnóstico (estado actual + fuentes de datos + fugas) **ya está hecho**.

**Ejecución**: principal **Sonnet 4.6** + subagentes (ver §6). Reglas de oro en §7.

---

## 0. Mapa del terreno (ya verificado — no lo repitas)

- Orquestador: `src/components/admin/sections/dashboard/OperacionesTab.tsx`. Carga datos en
  `fetchOperacionesData()` y reparte a subcomponentes en `dashboard/operaciones/`.
- Lógica pura (testeable): `dashboard/operaciones/operacionesUtils.ts`.
- Subcomponentes: `PipelineCard.tsx`, `MarketDaysChart.tsx`, `SevillaDemandChart.tsx`,
  `GrowthChart.tsx` (+ otros que no se tocan).
- **Todo el charting es SVG hecho a mano** (sin librería). Tipos en `dashboard/types.ts`.

### ⚠️ Fugas de datos detectadas (claves para T3 y T4)
- `OperacionesTab` hace `supabase.from("buyers_demands").select("id, name, phone, email, max_budget, status")`
  → **NO trae `preferred_zones`, `created_at`, `funding_type` ni `lead_id`**. Hay que añadirlos al select y
  a `BuyerDemandRow` (`types.ts`). Casi todos los paneles de compradores fallan por esto.
- `computeSevillaDemand()` lee `buyerLeads` (tabla `leads`) `.preferences.zonas` → **ese campo está
  VACÍO** (la zona real del comprador vive en `buyers_demands.preferred_zones`, array de etiquetas de la
  taxonomía). **Por eso el panel "Demandas por Barrios" sale vacío** ("No se encontraron compradores").
- `computeGrowth()` también lee `leads` (type=buyer) por `created_at`. Para filtrar por presupuesto hay
  que basarse en `buyers_demands` (que tiene `max_budget`).
- `computeBuyerProfiles()` (T5) lee `leads.preferences` (`funding_type`/`tipo_compra` etc.) → casi vacío;
  el dato real es `buyers_demands.funding_type`. **Por eso el Desglose sale 0/0/0/1 y NaN%** (división
  entre 0 en el propósito).
- El Pipeline solo usa `leads` type=seller (estados new/contacted/closed). Las etapas nuevas (encargo,
  contrato, cerrado) viven en **`encargos`** y **`seller_activity_logs`**, que OperacionesTab **no carga
  todavía**.

### Decisión transversal — librería de gráficos
Las 4 mejoras piden interactividad (rangos de fecha, filtros de precio, granularidad, zoom). Opciones:
- **(Recomendado) Mantener SVG a mano + controles nativos** (`<input type="date">`, `<select>`) +
  "expandir" en modal. Cero dependencias nuevas, coherente con el código actual.
- **Alternativa**: introducir `recharts` (acelera la interactividad, pero añade dependencia y rompe el
  estilo hand-rolled). Solo si el ejecutor lo justifica. **Por defecto: opción 1.**

---

## T1 — Pipeline de Propietarios: nuevas etapas + filtro de fechas

**Estado**: `PipelineCard.tsx` pinta 3 barras desde `computePipeline(sellerLeads)` →
`{ nuevos: status=new, contactados: status=contacted, adquisiciones: status=closed }`.

**Pedido de Álvaro**: añadir **Encargo firmado**, **Contrato privado firmado**, **Cerrado/Vendido**, y un
**selector de rango de fechas (desde–hasta)** para ver, p.ej., la última semana o el último año.

**Implementación**:
- Carga nueva en `OperacionesTab`: `encargos` (todas: `id, seller_lead_id, status, fecha_firma,
  created_at, property_id`) y `seller_activity_logs` (`event_type, event_date, lead_id, property_id`).
- Extiende `computePipeline` (o crea `computeOwnerPipeline`) para devolver 6 etapas:
  1. **Nuevo Lead** — `leads` seller `status='new'`.
  2. **Contacto Establecido** — `status='contacted'`.
  3. **Adquisición Hecha** — `status='closed'`.
  4. **Encargo Firmado** — `encargos` con `fecha_firma` no nula.
  5. **Contrato Privado Firmado** — encargos/leads con un `seller_activity_logs.event_type='Contrato privado'`.
  6. **Cerrado / Vendido** — `encargos.status='vendido'`.
  - ⚠️ **Decisión a confirmar con Álvaro**: "Adquisición Hecha" y "Encargo Firmado" pueden ser el mismo
    hito. Si lo son, fusiónalas; si no, déjalas separadas con definiciones claras. Documenta cuál usas.
- **Filtro de fechas**: añade estado `{ from, to }` (default: últimos 12 meses) con dos `<input type="date">`
  + atajos rápidos ("7 días", "30 días", "Año", "Todo"). Cada etapa cuenta solo filas cuya fecha
  relevante caiga en el rango (lead→`created_at`, encargo firmado→`fecha_firma`, contrato→`event_date`,
  vendido→`updated_at`/fecha del evento de venta). Mantén la lógica de conteo en `operacionesUtils` (pura,
  testeable) recibiendo el rango como parámetro.

**Aceptación**: las 6 etapas se ven con sus conteos; cambiar el rango de fechas recalcula los números.

---

## T2 — Media de Días en Mercado: óptimo 26, franjas nuevas, filtros y zoom

**Estado**: `MarketDaysChart.tsx` pinta un SVG de 4 puntos desde `computeMarketDays(properties)` (franjas
`<150k | 150k-300k | 300k-500k | >500k`). El **"Óptimo de Cierre" está hardcodeado a `45 días`**
(`MarketDaysChart.tsx:66`). "Media del Portal" = `platformAvgDays`.

**Pedido de Álvaro**:
1. **Bajar el óptimo de cierre a 26 días** y que los informes sean **más agresivos con las rebajas**.
2. Nuevas franjas: **`<150k | 150k-250k | 250k-350k | 350k-500k | 500k-700k | 700k>`**.
3. Poder **ampliar el gráfico** (verlo grande).
4. Filtros flexibles: **por cada 50k** (granularidad de bucket configurable) **y por año**.

**Implementación**:
- Crea una constante compartida **`OPTIMO_CIERRE_DIAS = 26`** en `operacionesUtils.ts` (única fuente de
  verdad) y úsala en `MarketDaysChart` en lugar del `45` hardcodeado.
- **Conectar el 26 a la agresividad real** (clave): `computePriceDropEstimate` hoy compara
  `daysOnMarket` contra `avgDays` (la media del portal, muy ruidosa con pocos inmuebles). Cámbialo para
  usar **`OPTIMO_CIERRE_DIAS` como umbral objetivo** del `factorTiempo` (cualquier inmueble por encima de
  26 días empuja rebaja). Así el "26" no es solo decorativo: hace los informes más agresivos como pide
  Álvaro. (Mantén la confianza/explicabilidad; actualiza los tests de `computePriceDropEstimate`.)
- **Franjas configurables**: parametriza `computeMarketDays(properties, { bucketSize?, year?, ranges? })`.
  Default = las 6 franjas nuevas. Añade un control en el panel para elegir granularidad (50k / 100k) y un
  `<select>` de **año** (filtra propiedades por `published_at`/`created_at` del año elegido).
- **Ampliar**: botón "expandir" que abre un modal con el mismo gráfico a tamaño grande (SVG más alto,
  ejes/labels legibles). Reutiliza el patrón de modales existente (`AIReportModal`/`CaptacionReportModal`).

**Aceptación**: óptimo = 26 días; 6 franjas por defecto; se puede cambiar a granularidad 50k y filtrar por
año; el gráfico se amplía en modal; un inmueble con >26 días genera sugerencia de rebaja en el informe.

---

## T3 — "Demanda por Zonas" (top 10 global) — y arreglar que sale vacío

**Estado**: `SevillaDemandChart.tsx` (título "Demandas por Barrios (Sevilla)") pinta top 10 desde
`computeSevillaDemand(buyerLeads)`, que lee `leads.preferences.zonas` → **vacío** → panel sin datos.

**Pedido de Álvaro**: renombrar a **"Demanda por Zonas"**, y que sea un **top 10 de las zonas con más
demanda de TODAS las que tenemos, dé igual de dónde sean**.

**Implementación**:
- Añade `preferred_zones` (y `max_budget`, ya está) al select de `buyers_demands` en `OperacionesTab` y a
  `BuyerDemandRow`.
- Reescribe `computeSevillaDemand` → **`computeZoneDemand(buyersDemands)`**: recorre
  `buyers_demands.preferred_zones` (array de etiquetas), cuenta compradores por zona (una demand puede
  sumar a varias zonas), calcula presupuesto medio por zona desde `max_budget`, ordena desc y devuelve
  **top 10 global** (sin restringir a Sevilla capital ni a baseline). Solo cuenta demands `status='Activo'`
  (confírmalo).
- En `SevillaDemandChart.tsx`: cambia el título a **"Demanda por Zonas"** y el subtítulo a "Top 10 zonas
  con más compradores activos y presupuesto medio". Mantén el buscador en vivo (filtra sobre el ranking).
  (Opcional: renombra el fichero a `ZoneDemandChart.tsx` con `gitnexus_rename`.)

**Aceptación**: el panel muestra zonas reales con conteos (ej. "Macarena - Las Avenidas: 2 compradores"),
ordenadas por demanda, top 10 de toda la taxonomía. Ya no sale "No se encontraron compradores".

---

## T4 — Crecimiento de Compradores: interactivo (rango de precio + granularidad temporal)

**Estado**: `GrowthChart.tsx` pinta área SVG mensual acumulada (6 meses) desde `computeGrowth(buyerLeads)`.
Asume exactamente 6 puntos (`growthData[5]`, `growthData[0]`) → frágil si cambia la granularidad.

**Pedido de Álvaro**: más interactivo — **seleccionar rangos de precio** y **granularidad temporal**
(ej. día a día de la última semana, además de mensual/anual).

**Implementación**:
- Fuente: usa **`buyers_demands`** (tiene `max_budget` para filtrar por precio y `created_at` para el eje
  temporal) en vez de `leads`. Añade `created_at` al select + tipo.
- Parametriza `computeGrowth(buyersDemands, { granularity, from, to, priceMin, priceMax })`:
  - `granularity`: `'day' | 'week' | 'month' | 'year'`.
  - filtro de precio: `priceMin`/`priceMax` sobre `max_budget` (con presets: <150k, 150-250k, 250-350k,
    350-500k, 500-700k, 700k>, "todos") — reutiliza las mismas franjas que T2 para coherencia.
  - devuelve una serie genérica `{ label, value, cumulative }[]` (NO asumas longitud fija; arregla el
    `growthData[5]` hardcodeado para que funcione con cualquier nº de puntos).
- En `GrowthChart.tsx`: añade los controles (toggle de granularidad, `<select>` de franja de precio, y
  rango de fechas) y haz el SVG robusto a N puntos. El "+X en Nm" del pie debe derivarse de la serie real.

**Aceptación**: se puede ver el crecimiento día a día de la última semana, o por mes/año; filtrar por
franja de precio cambia la serie; el gráfico no se rompe con 7 o 30 puntos.

---

## T5 — Desglose de Compradores Activos: conectar a la BD real + regla de propósito

**Estado**: `BuyersBreakdown.tsx` pinta dos columnas (Capacidad Financiera / Propósito de Adquisición)
desde `computeBuyerProfiles(buyerLeads)`, que lee `leads.preferences` (`perfil_financiero`,
`paymentMethod`, `mortgageStatus`, `tipo_compra`). **Esa fuente está casi vacía** para los compradores
reales — el dato canónico vive en `buyers_demands.funding_type` (`'Contado'`/`'Hipoteca'`, lo edita
`BuyersManager`). Por eso la captura muestra **0/0/0/1** en financiera (solo 1 lead tenía `paymentMethod`
en preferences) y **NaN%** en propósito (`totalIntentCount = 0` → división por 0).

**Pedido de Álvaro**:
1. Que el panel esté **bien conectado a la BD** y lea el estado real de los compradores (que salgan
   reflejados).
2. **Regla de propósito** cuando NO hay dato confirmado:
   - **Hipoteca + propósito desconocido → "Vivienda Habitual"**.
   - **Contado + propósito desconocido → "Vivienda de Inversión"**.
   - Si el propósito está **confirmado**, manda el dato real (la regla NO aplica).

**Implementación**:
- **Fuente correcta**: `computeBuyerProfiles` pasa a recibir **`buyers_demands`** (solo `status='Activo'`)
  en vez de `leads`. Requiere `funding_type` + `lead_id` en el select y en `BuyerDemandRow` (§0).
- **Capacidad financiera** desde `funding_type`:
  - `'Contado'` → "Al contado".
  - `'Hipoteca'` → si el lead vinculado (`lead_id` → `leads.preferences.mortgageStatus`/`perfil_financiero`)
    tiene el detalle confirmado, clasifícalo en su sub-fila (sin estudio / estudio hecho / preconcedida);
    si no hay detalle, cuéntalo por defecto en **"Hipoteca y sin estudio"** (conservador). Documenta la
    decisión. (Con los datos actuales: David/Alvaro = Hipoteca → 2; miriam = Contado → 1.)
- **Propósito de adquisición** con la regla de Álvaro:
  - Lee el propósito **confirmado** de `leads.preferences.tipo_compra` (`'habitual'`/`'inversion'`) vía
    `lead_id`. Si existe → úsalo (prevalece).
  - Si NO hay confirmado → aplica la regla: `funding_type='Hipoteca'` → Habitual; `'Contado'` → Inversión.
  - (Con los datos actuales: David/Alvaro = Hipoteca → Habitual; miriam = Contado → Inversión →
    Habitual 2 / Inversión 1.)
- **Guardas anti-NaN** en `BuyersBreakdown.tsx`: si `totalFinCount`/`totalIntentCount` es 0, muestra `0%`
  en vez de `NaN%` (incluida la línea "Insight Operativo", que también divide por `totalFinCount`).
- (Futuro, opcional, fuera de scope) Añadir un campo de propósito al formulario del comprador
  (`BuyersManager`) para que Álvaro pueda **confirmar** habitual/inversión a mano; hoy el propósito
  confirmado solo lo aportaría el chatbot/web.

**Aceptación**: con los 3 compradores actuales → Capacidad: Hipoteca 2 / Contado 1 (sin 0s falsos);
Propósito: Habitual 2 / Inversión 1 (sin `NaN%`). Un comprador con `tipo_compra` confirmado prevalece
sobre la regla. Tests de `computeBuyerProfiles`: fuente `buyers_demands`, regla de fallback por
`funding_type`, y propósito confirmado que sobreescribe la regla.

---

## 5. Notas de implementación
- Mantén la lógica de cálculo en `operacionesUtils.ts` (pura, sin Supabase) y los componentes solo de
  presentación: así puedes **testear** cada `compute*` con jest (ya hay tests en ese estilo).
- Reutiliza una sola definición de franjas de precio (T2 y T4) — expórtala desde `operacionesUtils`.
- `OPTIMO_CIERRE_DIAS = 26` como constante exportada y única.
- Cuidado con los `select(...)` de Supabase: añade los campos nuevos (`preferred_zones`, `created_at`,
  encargos, seller_activity_logs) — varios paneles fallan hoy por leer la fuente equivocada.

## 6. Plan de delegación en subagentes
- **Principal: Sonnet 4.6** — implementa y commitea.
- **`investigator-haiku`** — read-only: confirmar el shape de `encargos` y `seller_activity_logs`
  (columnas reales vía el cliente Supabase o leyendo EncargoProfileClient), localizar todos los usos de
  `computeSevillaDemand`/`computeGrowth`, leer los tests existentes de `operacionesUtils`.
- **`architect-opus`** — **solo para UNA decisión**: la semántica del Pipeline (T1) — si "Adquisición
  Hecha" y "Encargo Firmado" son el mismo hito y cómo definir cada etapa sin solapamientos. Es una
  decisión con trade-offs reales sobre el modelo de datos; pásale el contexto de `encargos` +
  `seller_activity_logs` + `leads`. (Si la respuesta es obvia al implementar, no lo invoques.)
- **`reviewer-sonnet`** — revisar los nuevos `compute*` y que la UI de filtros sea coherente entre paneles.

## 7. Reglas de oro
- `gitnexus_impact` antes de editar cada `compute*` y cada componente (pasa `repo:"C:\\dev\\tu-asesor\\next-app"`).
- `npm run build` + `npm test` verdes antes de commit. Añade/actualiza tests de `computeOwnerPipeline`,
  `computeMarketDays` (franjas + año), `computeZoneDemand`, `computeGrowth` (granularidad + precio) y
  `computePriceDropEstimate` (umbral 26).
- `gitnexus_detect_changes` antes del commit; scope acotado a `dashboard/operaciones/*` + `types.ts` +
  `OperacionesTab.tsx`.
- **NO** toques RLS, secrets, n8n ni el resto de pestañas del dashboard. No metas dependencias nuevas sin
  justificarlo (default: sin librería de charts).
- Commit(s) en `master`. Actualiza `docs/sync/SYNC_AI.md` con una entrada fechada.

## 8. Qué NO hacer
- No dejar `computeSevillaDemand`/`computeGrowth` leyendo `leads.preferences` (está vacío; usa
  `buyers_demands`).
- No dejar el "26" solo como texto: debe alimentar `computePriceDropEstimate`.
- No asumir longitud fija de series (arregla `growthData[5]`).
- No romper los paneles que NO se piden (BuyersBreakdown, PropertyViewsRanking, generador de informes).
