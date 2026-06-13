# Executor Brief #017 — Página pública `/valoracion`: autocompletado Catastro + rango de precio instantáneo + captación

**Fecha**: 2026-06-14
**Origen**: Álvaro quiere subir de nivel la página pública de valoración (`src/app/valoracion/page.tsx`). Hoy: wizard de 6 pasos que captura el lead vendedor en `leads.preferences` pero (a) no le da ningún precio al cliente, (b) la dirección es texto libre con erratas, (c) el lead entra en silencio (sin avisar a Álvaro).

**Decisiones ya tomadas por Álvaro (NO volver a preguntar):**
1. **Autocompletado de dirección vía Catastro oficial** (gratis, sin API key, captura la referencia catastral → mejora la valoración IA posterior del CRM).
2. **Precio = rango instantáneo + captación**. Cálculo barato por zona (€/m² × m² × ajuste estado) mostrado al momento como rango ancho. SIN IA en vivo, SIN coste por lead, SIN riesgo de abuso. El informe IA completo lo sigue generando Álvaro desde el CRM (Brief #016) y se lo envía.
3. **Automatización: aviso a Álvaro (WhatsApp) + bienvenida al cliente**.

## Contexto crítico para el ejecutor

- Arranca con `git log -3` y `git status`. Último commit esperado: el de este brief.
- Lee `AGENTS.md`, `docs/sync/SYNC_AI.md` (entradas recientes, sobre todo Brief #016 sobre Valoración IA), y este brief entero antes de tocar nada.
- `gitnexus_impact` antes de editar cualquier símbolo existente. HIGH/CRITICAL → pausa y avisa.
- `gitnexus_detect_changes()` antes de cada commit.
- Build verde (`npm run build`) y tests verdes (`npm test`) antes de cada commit.
- Commits firmados `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`.
- **NO uses Google Maps ni ninguna API de pago.** Catastro y cálculo local solamente.
- **NO expongas `/api/valuation` (Gemini Pro) al público.** Ese endpoint es solo para el CRM. La web usa el cálculo local de T2.

## Maquinaria existente que SÍ debes reutilizar

- `src/lib/catastro.ts` → `resolveCatastro(refCat)` y `CatastroLocation`. Ya resuelve refCat → ubicación oficial (barrio/distrito/CP/coords). Usa los servicios JSON `COVCCallejero.svc/json/...` del Catastro. **Estúdialo: el endpoint nuevo de autocompletado usa los servicios hermanos del mismo host.**
- `src/lib/valuation.ts` → `ESTADO_AJUSTE`, tipos `EstadoInmueble`. Alinea el factor de estado del cálculo rápido con estos ajustes conceptuales.
- `src/lib/whatsapp.ts` → `sendWhatsAppTemplate(to, templateName, bodyParams[], options)`. Plantilla `aviso_alvaro` (Utility, idioma es, 2 params de body) ya en uso (ver `appointmentService.ts:245-360` y `whatsapp/route.ts:267`).
- `src/lib/phone.ts` → `normalizeEsPhone`.
- `ADVISOR_WHATSAPP_PHONE` (env) = teléfono de Álvaro.

---

## T1 — Autocompletado de dirección con Catastro

### Objetivo
Que el vendedor seleccione su calle de una lista real y, al dar el número, capturemos la **referencia catastral** de la vivienda. Eso garantiza dirección exacta (objetivo de Álvaro) y alimenta `resolveCatastro` para la valoración IA del CRM.

### Endpoint proxy server-side (obligatorio — el Catastro no permite CORS desde el browser)

Crear `src/app/api/catastro/route.ts` con dos modos vía query param `action`:

**`action=vias`** — autocompletar nombres de calle:
- Params: `municipio` (default "SEVILLA"), `provincia` (default "SEVILLA"), `q` (texto que escribe el usuario).
- Llama a `https://ovc.catastro.meh.es/OVCServWeb/OVCWcfCallejero/COVCCallejero.svc/json/ConsultaVia?Provincia={provincia}&Municipio={municipio}&TipoVia=&NombreVia={q}`.
- Parsea el JSON (estructura `consulta_callejeroResult.callejero.calle[]`, cada una con `dir.tv` (tipo vía: CL/AV/...) y `dir.nv` (nombre)). Devuelve `[{ tipoVia, nombreVia, label }]` (máx 8).
- Degradación elegante: si el Catastro falla/timeout (usa el `fetchWithTimeout` pattern de `catastro.ts`, 5-6s), devuelve `[]` (NO 500) para que el front caiga a input libre.

**`action=inmueble`** — resolver la referencia catastral de una dirección:
- Params: `municipio`, `provincia`, `tipoVia`, `nombreVia`, `numero`.
- Llama a `https://ovc.catastro.meh.es/OVCServWeb/OVCWcfCallejero/COVCCallejero.svc/json/Consulta_DNPLOC?Provincia={provincia}&Municipio={municipio}&Sigla={tipoVia}&Calle={nombreVia}&Numero={numero}`.
- Estructura de respuesta: `consulta_dnplocResult`. Caso 1 inmueble → `bico.bi.idbi.rc` (concatenar `pc1+pc2+car+cc` para la refcat de 20 chars, o `pc1+pc2` + resto). Caso multi (edificio con varios pisos) → `lrcdnp.rcdnp[]` (lista). 
- Devuelve `{ referencia_catastral, direccion_oficial, multiple: boolean, opciones?: [{ refcat, escalera, planta, puerta }] }`.
- Si es multi (varias viviendas en el número), devolver hasta ~30 opciones con planta/puerta para que el usuario elija la suya (opcional — ver UI). Si no elige, quedarse con la dirección a nivel de número (refcat parcial 14 chars sirve para coords/CP).
- Degradación: si falla, `{ referencia_catastral: null }` y el front sigue con la dirección tecleada.

⚠️ Investiga la forma EXACTA del JSON del Catastro con una llamada real antes de codificar el parser (el Catastro anida raro y cambia entre caso único/múltiple). El parser de `catastro.ts` (`Consulta_DNPRC`, líneas 71-91) es tu plantilla de cómo navegar esa estructura.

### UI (paso 2 del wizard, `valoracion/page.tsx`)

- Sustituir el input libre de "Calle / Avenida" por un **combobox con autocompletado**: a medida que el usuario teclea (debounce ~300ms, mínimo 3 chars), llamar a `/api/catastro?action=vias&municipio=...&q=...` y mostrar dropdown de sugerencias. Al elegir una, fijar `tipoVia` + `nombreVia` en el form.
- Mantener el campo "Nº" como ahora.
- Municipio: por defecto "Sevilla" (editable). Opcional: autocompletar municipio también con `ConsultaMunicipio` si Álvaro lo pide (no obligatorio en este brief — Sevilla capital cubre el grueso).
- Al pasar de paso (o al blur del número): llamar a `/api/catastro?action=inmueble&...` y guardar `referencia_catastral` + `direccion_oficial` en el form.
- Si el Catastro devuelve varias viviendas en el número: mostrar un selector opcional "¿Cuál es tu vivienda?" (planta/puerta). Si el usuario lo ignora, seguimos sin refcat exacta (no bloquear el flujo).
- **Fallback total**: si el autocompletado no devuelve nada o el usuario prefiere teclear, debe poder escribir la calle a mano igual que ahora. El Catastro es una ayuda, NUNCA un bloqueo.

### Persistencia
- Guardar en `leads.preferences`: `referencia_catastral`, `direccion_oficial` (la del Catastro si existe), además de los campos actuales (`street`, `number`, `zipcode`, `city`...).
- Si tenemos `referencia_catastral`, el `property_address` debe preferir `direccion_oficial`.

### Criterio de aceptación T1
- Escribo "Aguamarina" en la calle → aparece dropdown con vías reales de Sevilla que matchean.
- Elijo una + pongo número → al avanzar, en `leads.preferences` queda `referencia_catastral` poblada (verificable en Supabase).
- Si el Catastro está caído → puedo teclear la dirección a mano y el flujo continúa sin error.

---

## T2 — Rango de precio instantáneo (el gancho)

### Objetivo
Al terminar el wizard, mostrar al vendedor un **rango ancho y orientativo** de cuánto vale su vivienda, calculado al instante y gratis, con un CTA hacia el informe completo.

### Nueva lib `src/lib/zoneValuation.ts`

```ts
/**
 * Estimación rápida y barata de rango de precio para la web pública de valoración.
 * NO usa IA ni red — aritmética local sobre una tabla de €/m² por zona.
 * El informe preciso lo genera Álvaro con el motor IA del CRM (Brief #016).
 *
 * ⚠️ TABLA A CALIBRAR POR ÁLVARO: los €/m² son orientativos 2025-2026.
 *    El rango ancho (±12%) absorbe imprecisión; aun así Álvaro debe revisar los valores.
 */

// €/m² de referencia por código postal de Sevilla capital + pueblos.
// VALORES INICIALES ORIENTATIVOS — Álvaro debe calibrarlos.
export const ZONE_PRICES_M2: Record<string, number> = {
  // Sevilla capital
  '41001': 3400, '41002': 2600, '41003': 2700, '41004': 3300,
  '41005': 2500, '41006': 1700, '41007': 1900, '41008': 1700,
  '41009': 1900, '41010': 2500, '41011': 3000, '41012': 1700,
  '41013': 2600, '41014': 1900, '41018': 2800, '41019': 1500,
  '41020': 1700,
  // Aljarafe / pueblos (ejemplos — completar)
  '41940': 2300, // Tomares
  '41927': 1800, // Mairena del Aljarafe
  '41930': 2000, // Bormujos
  '41700': 1500, // Dos Hermanas
  '41900': 1700, // Camas
  // ...
};

const FALLBACK_M2 = 1700;          // Sevilla provincia genérico
const FALLBACK_CAPITAL = 2200;     // si CP empieza por 410xx pero no está mapeado

// Factor por estado (alineado con ESTADO_AJUSTE de valuation.ts).
const ESTADO_FACTOR: Record<string, number> = {
  reformar: 0.82,
  bueno: 1.0,
  reformado: 1.12,
};

export interface QuickRangeInput {
  zipcode?: string;
  sqm: number;
  condition?: string;        // 'reformar' | 'bueno' | 'reformado'
  hasElevator?: boolean;
  hasTerrace?: boolean;
  hasGarage?: boolean;
}

export interface QuickRange {
  low: number;
  high: number;
  central: number;
  pricePerM2: number;
  confidence: 'orientativa';
}

export function computeQuickRange(input: QuickRangeInput): QuickRange | null {
  if (!input.sqm || input.sqm <= 0) return null;
  const cp = (input.zipcode || '').trim();
  const base =
    ZONE_PRICES_M2[cp] ??
    (cp.startsWith('410') || cp.startsWith('411') ? FALLBACK_CAPITAL : FALLBACK_M2);

  const estado = ESTADO_FACTOR[input.condition || 'bueno'] ?? 1.0;
  // Extras: pequeños bumps acotados (no inflar).
  let extras = 1;
  if (input.hasGarage) extras += 0.04;
  if (input.hasTerrace) extras += 0.02;
  if (input.hasElevator) extras += 0.01;

  const central = base * input.sqm * estado * extras;
  const round = (n: number) => Math.round(n / 1000) * 1000;
  return {
    central: round(central),
    low: round(central * 0.88),
    high: round(central * 1.12),
    pricePerM2: Math.round(base * estado),
    confidence: 'orientativa',
  };
}
```

Tests obligatorios en `src/lib/__tests__/zoneValuation.test.ts`: CP mapeado, CP capital no mapeado (fallback capital), CP fuera (fallback provincial), estado reformar vs reformado, sqm 0 → null, extras acotados.

### UI — rediseño del paso 6 (`valoracion/page.tsx`)

Hoy el paso 6 dice "Estudio Personalizado Requerido / Le contactaré en breve" y NO da precio. Cambiarlo a:

- **Hero con el rango**: "Tu vivienda en {zona} se sitúa aproximadamente entre **{low} €** y **{high} €**" (formateado es-ES). Diseño grande, dorado, alineado con el estilo actual.
- Subtexto honesto: "Estimación orientativa basada en datos de mercado de la zona. El precio óptimo de salida depende de factores que analizo uno a uno."
- **CTA principal**: "Álvaro te enviará un informe detallado y personalizado" + confirmación de que ya está en camino (se conecta con T3).
- Mantener el botón "Volver al inicio".
- Calcular el rango client-side con `computeQuickRange(formData)` justo antes de renderizar el paso 6 (instantáneo, sin red).
- Edge case: si `computeQuickRange` devuelve null (sin sqm), mostrar el mensaje actual de "te contactaré" sin rango.

### Unificar la promesa (consejo del análisis)
- Paso 5: cambiar "recibir el informe de valoración al instante" → "ver una estimación al instante y recibir un informe detallado de Álvaro".
- Eliminar la contradicción entre paso 5 ("al instante") y paso 6 ("en breve").

### Criterio de aceptación T2
- Completo el wizard → el paso 6 me muestra un rango de precio coherente con mi zona y m².
- El cálculo es instantáneo (sin spinner, sin llamada de red).
- Cambiar el estado de "reformar" a "reformado" sube el rango.

---

## T3 — Automatizaciones: aviso a Álvaro + bienvenida al cliente

### Mover la creación del lead a un endpoint server-side

Hoy la página escribe el lead con `supabase` anon directamente (client-side). Para disparar WhatsApp (que necesita `WHATSAPP_ACCESS_TOKEN`, secreto server) hay que centralizar en el servidor.

Crear `POST /api/valuation/lead` (`src/app/api/valuation/lead/route.ts`):
- Recibe el `formData` del wizard (incluyendo `referencia_catastral`, rango calculado).
- Hace el **mismo upsert de lead** que hoy hace la página (dedupe por `normalizeEsPhone`, merge de `preferences`, manejo de 23505) — mueve esa lógica del cliente a aquí, con service role.
- Tras crear/actualizar el lead, dispara:
  1. **Aviso a Álvaro** (`sendWhatsAppTemplate(ADVISOR_WHATSAPP_PHONE, 'aviso_alvaro', [p1, p2])`):
     - p1 = "Nueva valoración solicitada"
     - p2 = `{nombre} · {direccion} · {m²} m² · estimado {low}-{high} € · tel {phone}`
     - Fire-and-forget con catch (no romper la respuesta al cliente si WhatsApp falla).
  2. **Bienvenida al cliente** (ver dependencia HSM abajo) — `sendWhatsAppTemplate(phone, 'valoracion_recibida', [nombre], { normalize: true })`. Envolver en try/catch: si la plantilla aún no está aprobada, loguear y seguir (NO romper).
- Anti-abuso: rate-limit ligero por IP (p.ej. máx 5/hora — reutiliza patrón si existe alguno, o un Map en memoria con ventana) + honeypot field opcional. No metas captcha pesado.
- Devuelve `{ ok: true, leadId }`.

La página (`valoracion/page.tsx`) pasa a llamar a este endpoint en `handleSubmit` en vez de escribir Supabase directo.

### Dependencia externa (Álvaro, en Meta) — plantilla HSM `valoracion_recibida`
La bienvenida al cliente es primer contacto (sin ventana de 24h) → **requiere plantilla HSM aprobada por Meta**. Álvaro debe crearla:
- Nombre: `valoracion_recibida`, categoría **Utility**, idioma **es**.
- Texto sugerido: *"Hola {{1}}, he recibido tu solicitud de valoración. Estoy preparando un informe detallado y personalizado de tu vivienda y te lo haré llegar muy pronto. Un saludo, Álvaro."*
- 1 parámetro de body ({{1}} = nombre).
- **Mientras la plantilla NO esté aprobada**: el código la llama igual pero el fallo se traga con catch (el lead y el aviso a Álvaro funcionan; solo falta el WhatsApp al cliente). Documentar en SYNC_AI.md que queda pendiente la aprobación.

### Criterio de aceptación T3
- Envío una valoración de prueba → Álvaro recibe un WhatsApp con el resumen del lead.
- El lead se crea/actualiza igual que antes (dedupe correcto).
- Si la plantilla `valoracion_recibida` está aprobada → el cliente recibe su WhatsApp; si no, el flujo no se rompe.

---

## T4 — Limpieza y copy (consejos del análisis)

1. **Dirección sucia**: al construir `property_address`, omitir "Piso {floor}" si `floor` está vacío. Preferir `direccion_oficial` del Catastro si existe.
2. **`cpMap` manual** (líneas 37-57): se puede mantener como fallback de ciudad, pero ya no es la vía principal (el Catastro/municipio lo cubre). No es obligatorio borrarlo; si lo dejas, documenta por qué.
3. **Copy inconsistente**: paso 1 dice "La Macarena y alrededores" → cambiar a "Sevilla y provincia" (coherente con la FAQ). 
4. Revisar que el `useEffect` del `cpMap` no pise el municipio que venga del autocompletado de Catastro.

### Criterio de aceptación T4
- Una valoración sin planta no genera "Piso ," en la dirección.
- El copy de la página es coherente (Sevilla y provincia, no solo Macarena).

---

## Orden recomendado de ejecución

1. **T2** — `zoneValuation.ts` + tests + rediseño del paso 6 con el rango. (Núcleo, sin dependencias externas, victoria visible rápida.)
2. **T1** — endpoint `/api/catastro` + autocompletado en paso 2. (Investiga el JSON real del Catastro primero.)
3. **T3** — endpoint `/api/valuation/lead` + notificaciones; migrar `handleSubmit` a usarlo.
4. **T4** — limpieza de copy y dirección.

Un commit por T. Mensajes descriptivos (NADA de "arreglos varios").

## Verificación final
1. `npm run build` verde.
2. `npm test` verde (nuevos tests de `zoneValuation`).
3. `gitnexus_detect_changes()`.
4. Actualizar `docs/sync/SYNC_AI.md` con una entrada por T + las dos dependencias externas pendientes (plantilla HSM, calibración tabla €/m²).
5. `git push origin master`.

## Qué NO hacer
- NO exponer `/api/valuation` (Gemini Pro) al público. La web usa SOLO el cálculo local de T2.
- NO usar Google Maps ni ninguna API de pago para el autocompletado. Solo Catastro.
- NO bloquear el wizard si el Catastro falla — siempre debe poder teclearse la dirección a mano.
- NO prometer un precio cerrado: el rango es ancho y "orientativo". El precio fino lo da Álvaro.
- NO romper el flujo de creación de lead si WhatsApp falla (fire-and-forget con catch).
- NO inventar valores de €/m² fuera de rango real: los iniciales son orientativos y van marcados para que Álvaro los calibre.

## Dependencias externas que quedan en manos de Álvaro
1. Crear y aprobar la plantilla HSM `valoracion_recibida` en Meta (para la bienvenida al cliente).
2. Calibrar `ZONE_PRICES_M2` en `src/lib/zoneValuation.ts` con sus precios reales de zona.

## Si algo te bloquea
Reporta en `docs/sync/SYNC_AI.md` y para. Mejor preguntar que dejar algo a medias.
