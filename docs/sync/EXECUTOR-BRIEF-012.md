# Executor Brief #012 — Arreglar el matching de la Difusión (Smart Matchmaker)

**Fecha**: 2026-06-12
**Origen**: Álvaro. La difusión sigue filtrando mal. Para el "Piso a la venta en Avenidas"
(190.000 €, Las Avenidas/Macarena, 2 hab, 1 baño) el modal muestra a **David** y **Alvaro**, cuando
debería mostrar **solo a miriam tortosa**. El fix de visualización (presupuestos reales) ya está hecho
en el commit `270f26e`; **este brief es solo la LÓGICA de matching + el slider de desviación**.

> Trabajo de investigación ya hecho (no lo repitas, está verificado contra la BD de producción).
> Tu tarea es la implementación + tests.

---

## 0. Diagnóstico ya confirmado (causa raíz)

El matching puro vive en `src/lib/diffusionMatch.ts` → `matchDemand(...)`. La fuente canónica del
comprador es `buyers_demands`; el lead se une por `lead_id` solo para funnel/geo. Datos reales de los
3 leads (verificados en BD):

| Lead | max_budget | rooms (demand) | baths | preferred_zones | leads.preferences | Resultado HOY | Debería |
|---|---|---|---|---|---|---|---|
| David | 290.000 | 0 | 0 | `["Macarena - Las Avenidas"]` | `{}` (vacío) | ✅ aparece | ❌ fuera (presupuesto demasiado alto) |
| Alvaro | 140.000 | 0 | 0 | `["Utrera - Utrera Centro"]` | `{}` (vacío) | ✅ aparece | ❌ fuera (zona Utrera) |
| miriam tortosa | 185.000 | 3 | 1 | `["Macarena - Las Avenidas"]` | `{}` (vacío) | ❌ NO aparece | ✅ ÚNICA que entra |

Inmueble objetivo (`properties.id = 7638d9d3-accd-4137-a5ec-fc8a232f506f`): `price=190000`,
`features.rooms="2"`, `features.baths="1"`, `features.zona=null`,
`features.address="Calle Coral, Las Avenidas, Distrito Macarena, Sevilla, Andalucía, 41009, España"`,
`features.latitude=37.411312`, `features.longitude=-5.9845503`.

**Las 3 causas (todas en `matchDemand`):**

1. **Presupuesto sin tope superior** (`diffusionMatch.ts:124-131`). Solo se exige
   `max_budget >= price*(1 - margen)`. NO hay límite por arriba → David (290k) pasa siempre. El slider
   del modal pinta "Rango 133.000 € - 247.000 €" pero el tope superior **nunca se aplica**.

2. **Geo muerto** (`diffusionMatch.ts:150-182`). El filtro lee `lead.preferences.polygons/area/latitude/longitude`,
   **pero los 3 leads tienen `leads.preferences = {}` vacío**. La zona real vive en
   `buyers_demands.preferred_zones` (array de etiquetas de la taxonomía `SEVILLA_TAXONOMY`, p.ej.
   `"Macarena - Las Avenidas"`, `"Utrera - Utrera Centro"`). Como `matchDemand` busca en el sitio
   equivocado, `hasLocationPreferences=false` para todos → **el filtro geográfico no se aplica a nadie**
   → Alvaro (Utrera) pasa.

3. **Habitaciones es filtro DURO** (`diffusionMatch.ts:144-148`). `minRooms=3 > property.rooms=2` →
   `reason:'rooms'` → miriam se cae. (Es justo la que Álvaro espera ver.)

---

## 1. Especificación EXACTA del nuevo matching (decisiones ya tomadas por Álvaro)

### 1.1 — Presupuesto: banda asimétrica alrededor del PRECIO del inmueble
- Dos márgenes independientes: **`priceMarginDown`** (a la baja) y **`priceMarginUp`** (al alza), en %.
- `lower = price * (1 - priceMarginDown/100)`, `upper = price * (1 + priceMarginUp/100)`.
- Si `max_budget > 0` → exige `lower <= max_budget <= upper`. Fuera de la banda → `reason:'budget'`.
- Si `max_budget = 0` (perfil incompleto) → se INCLUYE con warning `no_budget` (igual que hoy).
- Con esto David (290k > 247k incluso a +30%) queda fuera; miriam (185k) y Alvaro (140k) entran por
  presupuesto. Mantén la firma retro-compatible: si llega `priceMargin` (legacy, simétrico) úsalo para
  ambos lados cuando no vengan los dos nuevos.

### 1.2 — Habitaciones y baños: tolerancia ±1 (no duro)
- Rechaza **solo** si la demanda pide MÁS de lo que hay con diferencia > 1:
  `if (demand.rooms > 0 && (demand.rooms - property.rooms) > 1) → reason:'rooms'`.
  Ídem baños con `demand.bathrooms` y `property.baths`.
- miriam (pide 3, hay 2 → diff 1) **pasa**. Quien pida 4 sobre un 2 hab (diff 2) se cae.

### 1.3 — Metros (m²): nunca excluye
- `buyers_demands.min_sqm` es **informativo**, NO filtra. (Hoy `matchDemand` ni lo mira; mantenlo así,
  y deja un comentario explícito de que es soft por decisión de Álvaro.)

### 1.4 — Geo: por NOMBRE de zona (no por radio km)
- Un comprador pasa el filtro geográfico si:
  - `preferred_zones` está vacío/null → **sin filtro** (se incluye, permisivo, como hoy con geo ausente), **o**
  - la **zona del inmueble** está entre sus `preferred_zones`.
- **Zona del inmueble** (resuélvela en este orden):
  1. Si `property.features.zona` está informado (etiqueta de la taxonomía) → úsalo.
  2. **Fallback obligatorio** (los inmuebles actuales tienen `zona=null`): match por texto contra
     `property.features.address`. Normaliza (minúsculas, sin acentos) y considera que una `preferred_zone`
     coincide si **alguno de sus segmentos** aparece en la dirección. Ej.: `"Macarena - Las Avenidas"`
     → segmentos `["macarena", "las avenidas"]`; la dirección contiene "las avenidas" → match.
     `"Utrera - Utrera Centro"` → `["utrera", "utrera centro"]` → no está en la dirección → no match.
- El slider de **radio km deja de tener sentido** (no hay coordenadas en los compradores) → quítalo del
  modal (ver 2.3). Conserva `geoRadius` en la firma como opcional/no usado o elimínalo limpiamente
  (mira los llamadores). Adyacencia de zonas (incluir todo el distrito) queda FUERA de scope.

### Resultado esperado para el caso de prueba (criterio de aceptación duro)
Para el piso de Avenidas con `priceMarginDown=10`, `priceMarginUp=10` (o los defaults que decidas):
**solo miriam** aparece. David fuera (presupuesto), Alvaro fuera (zona). Con `priceMarginUp=30` el
resultado NO debe cambiar (290k sigue > 247k).

---

## 2. Cambios por fichero

### 2.1 — `src/lib/diffusionMatch.ts` (núcleo)
- `matchDemand(...)`: nueva firma de params:
  - sustituye `priceMargin: number` por `priceMarginDown: number` + `priceMarginUp: number` (acepta
    `priceMargin` legacy como fallback simétrico).
  - sustituye `geoRadius` + lectura de `lead.preferences` por **geo por zona**: añade
    `demandZones: string[]` (= `buyers_demands.preferred_zones`) y a `DiffusionPropertyParams` un
    `zona?: string | null` y `address?: string | null`.
- Implementa 1.1–1.4. Añade un helper puro `propertyMatchesZones(prop, zones)` (normalización sin
  acentos incluida) exportado para testear. Mantén el módulo PURO (sin Supabase ni env).
- Actualiza el JSDoc de cabecera (las "Reglas") para reflejar la nueva lógica.

### 2.2 — `src/app/api/n8n/diffusion/route.ts`
- Añade `preferred_zones` al `select` de `buyers_demands` (hoy no se trae).
- Lee del payload `price_margin_down` / `price_margin_up` (con fallback a `price_margin`).
- Construye `propertyParams` con `zona: property.features?.zona` y `address: property.features?.address`
  (las coordenadas ya no hacen falta para geo; puedes dejarlas o quitarlas).
- Pasa `demandZones: demand.preferred_zones || []` a `matchDemand`.
- **El payload enriquecido hacia n8n NO cambia de shape** (mismo contrato `recipients[...]`). El
  `richPayload.filters` puede pasar a `{ priceMarginDown, priceMarginUp }` (informativo).
- El `dry_run` ya devuelve `propertyType/rooms/bathrooms/funnelStatus` (commit 270f26e); mantenlo.

### 2.3 — `src/components/admin/sections/properties/SmartMatchmakerModal.tsx`
- Reemplaza el **slider único de "Desviación de Presupuesto ±X%"** por **DOS sliders**:
  "Desviación a la baja" (`priceMarginDown`) y "Desviación al alza" (`priceMarginUp`), con sus estados.
  Muestra el rango resultante `precio*(1-down) – precio*(1+up)`.
- **Quita el slider de "Radio de Distancia Geográfica"** (geo ya es por zona, automático). Reajusta el
  grid (queda como 2 sliders de presupuesto, o 1 fila). Puedes añadir una nota fija tipo "Zona: por
  zonas de interés del comprador".
- En el `fetch` del dry_run y en `launchWhatsAppCampaign`, envía `price_margin_down` y
  `price_margin_up` en vez de `price_margin`/`geo_radius`. Actualiza el `useEffect` de cruce (deps).
- El desglose holgado/ajustado/negociable puede seguir como está (clasificación visual por `max_budget`
  vs `price`), no es bloqueante.

### 2.4 — (Opcional, recomendado) `PropertyFormModal.tsx`
- Añade un selector de zona única de la taxonomía (`ZoneSelectorPremium` / `SEVILLA_TAXONOMY`, ya usados
  en `BuyersManager`) que escriba `features.zona`. Así los inmuebles futuros tienen zona explícita y el
  matching no depende del fallback por texto. Si lo dejas fuera, el fallback por dirección (1.4) cubre
  los inmuebles actuales. Documenta la decisión.

---

## 3. Tests obligatorios — `src/lib/__tests__/diffusionMatch.test.ts`
Actualiza los tests existentes a la nueva firma y AÑADE casos que reproduzcan el escenario real:
1. **Presupuesto tope superior**: budget 290k, price 190k, up=10 → `reason:'budget'`. up=30 → sigue fuera.
2. **Presupuesto en banda**: budget 185k, price 190k, down=10/up=10 → match (por presupuesto).
3. **Presupuesto bajo fuera**: budget 90k, price 190k, down=10 → `reason:'budget'`.
4. **Rooms ±1**: demand.rooms=3, property.rooms=2 → match. demand.rooms=4, property.rooms=2 → `reason:'rooms'`.
5. **Baths ±1**: análogo.
6. **m² soft**: min_sqm alto NUNCA produce rechazo.
7. **Geo por zona (match)**: demandZones `["Macarena - Las Avenidas"]`, property.address con "Las Avenidas" → match.
8. **Geo por zona (no match)**: demandZones `["Utrera - Utrera Centro"]`, misma address → `reason:'geo'`.
9. **Geo sin zonas**: `demandZones=[]` → sin filtro (incluye).
10. **Escenario integrado**: los 3 leads reales contra el piso → solo miriam `match:true`.

---

## 4. Reglas de oro (obligatorio)
- `gitnexus_impact({target:"matchDemand", direction:"upstream", repo:"C:\\dev\\tu-asesor\\next-app"})`
  antes de editar; reporta el blast radius (esperado: la ruta `/api/n8n/diffusion` y los tests).
- `npm run build` verde **y** `npm test` (los tests de matchDemand) verdes antes de commitear.
- `gitnexus_detect_changes` antes del commit; el scope debe ser solo los 3-4 ficheros de arriba.
- **NO** toques workflows n8n de producción, RLS, secrets ni el contrato del payload hacia n8n.
- Commit en `master` (Netlify despliega solo). Mensaje `fix(diffusion): matching por banda asimétrica de presupuesto + geo por zona + tolerancia ±1 hab/baños`. Co-Authored-By correspondiente.
- Actualiza `docs/sync/SYNC_AI.md` con una entrada fechada resumiendo el cambio de lógica (y que el
  slider de geo-km se retiró).

## 5. Qué NO hacer
- No reintroducir el matching por `leads.preferences` (está vacío; la fuente es `buyers_demands`).
- No volver a la lista doble / 2 pasos del modal (ya es 1 paso; respétalo).
- No hacer m² excluyente. No hacer hab/baños duro. No tope inferior-only en presupuesto.
- No inventar coordenadas por zona (geo es por nombre, decisión de Álvaro).
