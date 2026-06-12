# Executor Brief #015 — Generador de Informes de Rebaja (la superherramienta)

**Fecha**: 2026-06-12
**Origen**: Álvaro. El Generador de Informes de Captación es su **argumento nº1 para conseguir rebajas de
precio**. Hoy es flojo; quiere convertirlo en una herramienta que genere informes **muy completos,
descargables**, donde **una IA analice los datos EN DIRECTO y le diga al cliente a la cara que está caro**
— con datos de mercado reales que lo demuestren.

**Decisiones cerradas con Álvaro** (no las re-debatas):
1. **PDF real** descargable (no `window.print()`).
2. **Veredicto de rebaja 100% generado por la IA** — el gancho es que el cliente vea a una máquina
   analizar y dictaminar el sobreprecio. Más potente que la palabra del asesor.
3. **Datos externos + modelo Pro con razonamiento** (calidad por encima de coste; se ejecuta puntualmente).
4. **Solo "rebaja"** en esta sección (NADA de informe de captación).

**Ejecución**: principal **Sonnet 4.6** + subagentes (§9). Reglas de oro §10.

---

## 0. Estado actual + EVIDENCIA de la prueba en vivo (4 inmuebles, ya verificado)

Piezas hoy (desconectadas): `PropertyReportSelector.tsx` (panel) · `CaptacionReportModal.tsx`
(`window.print()`) · `AIReportModal.tsx` + `src/app/api/properties/[id]/ai-report/route.ts` (Gemini
markdown) · heurística `computeSelectedMetrics`/`computePriceDropEstimate` en `operacionesUtils.ts`.

**Se probó el endpoint real con 4 inmuebles de distinto estado.** Conclusiones (úsalas, no las repitas):
- ✅ El razonamiento del LLM ya es bueno (clavó A=sobrevalorado, B=bueno, C=tibio, D=sin datos).
- 🔴 **5 carencias confirmadas en vivo** (lo que hay que arreglar):

| # | Carencia | Evidencia |
|---|---|---|
| 1 | **Bug de zona** | `ctx.property.zone = null` en los 4, pese a `features.zona` informado. El route lee `features.location.zone` (`route.ts:201,213`); la propiedad lo guarda **plano** en `features.zona`/`features.address`. |
| 2 | **Sin comparables de mercado** | `similar_properties.sample = 0` en 3 de 4 → la IA dice "está caro" pero **no lo demuestra con cifras de mercado**. *El agujero más grande.* |
| 3 | **No recibe la valoración del asesor** | el contexto no incluye `agent_valuation` (vive en `leads.preferences.agent_valuation` del lead vendedor con `property_id`). No puede anclar "X€ por encima de tu valoración". |
| 4 | **No lee el feedback de visitas** | solo lee `appointments.notes`; **ignora `buyer_activity_logs`** (notas de cada visita/oferta). Ahí está la munición real ("3 compradores coinciden en que está caro", "vio otro 30k más barato"). |
| 5 | **Sin veredicto numérico** | salida 100% narrativa; no hay `{precio_recomendado, rebaja_€, rebaja_%}` para cifra hero ni para el PDF. |

Otros defectos del PDF actual: `window.print()` (no descarga real); "Media de Zona" = `selectedValuation || selectedPrice` (cuando no hay valoración muestra el propio precio → diferencial 0%); frase hardcodeada "menos de 45 días"; el análisis IA real **no está dentro** del dossier; markdown renderizado en crudo (`whitespace-pre-wrap`).

---

## T1 — Capa de datos: darle a la IA TODO lo que necesita
Centraliza la recolección server-side (amplía `ai-report/route.ts` o crea
`/api/properties/[id]/price-analysis`). El contexto del LLM debe incluir:
- **Zona corregida** (#1): lee `features.zona` y `features.address` (planos), NO `features.location.*`.
- **Valoración del asesor** (#3): `leads.preferences.agent_valuation`/`estimated_value` del lead vendedor
  con `property_id = inmueble`. Si no hay, queda null (la IA la derivará de comparables).
- **Feedback de compradores** (#4): trae `buyer_activity_logs` del `property_id` (event_type, title,
  notes, event_date) además de `appointments.notes`. **Pásale los textos al LLM** — son el argumento
  cualitativo. (Ojo: hoy el endpoint solo trae appointments; añade la query a `buyer_activity_logs`.)
- **Señales CRM**: días en mercado vs **objetivo 26** (constante `OPTIMO_CIERRE_DIAS`, ver brief #014),
  visitas web (count server-side con `ilike page_path`), visitas físicas por status, propuestas firmadas,
  impactos de difusión.
- **Comparables** (#2): dos fuentes.
  - *Internos*: properties `status='active'`, misma zona (por `features.zona`), precio ±15% → €/m².
  - *Externos (grounding)*: el modelo usa **Google Search** para encontrar precios reales de venta de
    pisos comparables en esa zona de Sevilla (€/m² de mercado) y **citar las fuentes** (URLs). Esto es lo
    que convierte el informe en demoledor.

## T2 — Motor IA: veredicto en directo, con razonamiento y datos externos
- **Modelo**: `process.env.REBAJA_LLM_MODEL` = el **Gemini Pro con razonamiento más capaz disponible**
  (⚠️ confirma el id exacto contra la API vigente — candidatos `gemini-3.x-pro` / `gemini-2.5-pro`) **con
  `tools: [{ google_search: {} }]`**. Env separada del chatbot y del blog. Sincronízala en Netlify +
  `.env.local`.
- **Salida doble**: (a) **narrativa markdown** del análisis y (b) **veredicto estructurado** al final en un
  bloque ```json``` con `{ veredicto: "caro"|"ajustado"|"correcto", sobreprecio_pct, precio_recomendado,
  rebaja_eur, rebaja_pct_low, rebaja_pct_high, confianza, comparables:[{fuente,precio_m2,url}], motivos:[] }`.
  ⚠️ El grounding es **incompatible** con `responseMimeType: application/json` → exige el JSON por prompt y
  **parséalo defensivo** (cascada de `generateNewsPost.ts` `parseDraftJson`). Si no hay JSON válido → usa
  la heurística como fallback (T5).
- **Streaming "en directo"** (el gancho de Álvaro): usa `streamGenerateContent` (SSE/ReadableStream) para
  que el panel muestre el análisis **escribiéndose en vivo** y remate con el veredicto. ⚠️ Verifica que
  streaming + grounding + razonamiento son compatibles en el modelo elegido; si no, degrada a no-streaming
  con animación de "analizando…". La latencia del razonamiento aquí es una VENTAJA (efecto dramático).
- **Prompt**: rol = tasador senior de Sevilla; usa SOLO datos reales (CRM + comparables grounded); si el
  inmueble está caro, dilo sin rodeos con la cifra; si no hay datos (caso D) admite "datos insuficientes";
  NUNCA inventa comparables (solo los grounded/reales). Sube `maxOutputTokens` para informe completo.

## T3 — UI del panel: análisis en vivo + cifra hero
- Botón "Generar análisis de rebaja" → abre el panel/modal que **streamea** el análisis.
- Remate visual: **cifra hero** tipo *"Este inmueble está un 16% por encima de mercado · Precio
  recomendado 270.000 € (−50.000 €)"*, con los comparables y sus fuentes debajo, y los motivos (incluido
  el feedback de visitas citado).
- Renderiza el **markdown de verdad** (un render ligero), no `whitespace-pre-wrap`.

## T4 — PDF real y descargable (dossier de cliente)
- Genera un **PDF de verdad** con **`@react-pdf/renderer`** (puro JS, va en Netlify; evita
  puppeteer/chromium). Botón "Descargar dossier PDF".
- Contenido completo: portada con marca + datos del asesor + fecha + ref; **fotos** del inmueble; ficha;
  **tabla de comparables con fuentes/links**; **gráficos** (días en mercado vs objetivo 26, visitas) como
  SVG embebido; el **veredicto de la IA** (cifra + motivos); la **narrativa IA completa**; tabla de
  **feedback de visitas**; firmas (asesor / propietario). Sin frases hardcodeadas (fuera el "45 días").

## T5 — Guardarraíles (demoledor pero defendible)
- La heurística `computePriceDropEstimate` deja de ser el output al cliente, pero se conserva como **cota
  de cordura + fallback**: si la IA falla/no parsea, se muestra la estimación heurística; y si la cifra de
  la IA se desvía absurdamente de la heurística/comparables, márcalo (no publiques un número disparatado).
- La IA solo cita comparables **reales** (grounded o internos), nunca inventados. Cada cifra de mercado
  lleva fuente.

## 6. Matriz de aceptación (recrea los 4 escenarios de forma controlada y autolimpiante)
Crea inmuebles de prueba `status='draft'` (no salen en `/comprar`), marcados `features.__test=true` +
título `ZZTEST`, con sus `appointments`/`buyer_activity_logs`/`web_visits`/lead-valoración, **y bórralos
al terminar** (orden FK-seguro; ver el patrón ya usado: borrar logs→appts→web_visits→leads→buyer→props).
Resultados esperados del nuevo motor:

| Caso | Estado | Veredicto esperado |
|---|---|---|
| **A** | 320k Nervión, 4.000 €/m², 95 días, feedback negativo, valoración 270k | **caro** → rebaja fuerte (~−15%, ~270-285k), citando comparables y el feedback "está caro" |
| **B** | 180k Triana, 2.400 €/m², 8 días, muchas visitas, oferta | **ajustado/correcto** → NO bajar |
| **C** | 240k Los Remedios, 45 días, feedback mixto | **algo caro** → rebaja leve |
| **D** | 150k, 1 día, 0 señales | **datos insuficientes** → sin veredicto numérico |

## 7. Env nueva
`REBAJA_LLM_MODEL` (= Gemini Pro razonamiento, id a confirmar) → Netlify + `.env.local`.
`GEMINI_API_KEY` ya existe.

## 8. Tests
- Parseo defensivo del veredicto JSON (con/ sin fences, con preámbulo de grounding).
- Recolección de contexto: zona correcta, valoración presente, `buyer_activity_logs` incluidos.
- Fallback a heurística cuando el LLM no devuelve JSON.
- `npm run build` + `npm test` verdes.

## 9. Plan de delegación en subagentes
- **Principal: Sonnet 4.6**.
- **`architect-opus`** — **decisión real con trade-offs**: arquitectura de streaming + grounding + PDF
  (qué hacer si streaming y grounding no son compatibles en el modelo; cómo estructurar el veredicto;
  @react-pdf vs alternativa). Una invocación deliberada al inicio.
- **`investigator-haiku`** — confirmar id exacto del modelo Gemini Pro disponible + sintaxis de grounding y
  streaming en la doc vigente; localizar dónde se guarda la valoración del asesor; leer el patrón de
  `generateNewsPost.ts`.
- **`reviewer-sonnet`** — revisar el prompt del tasador (que sea agresivo pero solo con datos reales) y el
  diseño del dossier PDF.

## 10. Reglas de oro
- `gitnexus_impact` antes de editar `ai-report` route, `PropertyReportSelector`, `CaptacionReportModal`,
  `AIReportModal`, `operacionesUtils` (pasa `repo:"C:\\dev\\tu-asesor\\next-app"`).
- `npm run build` + `npm test` verdes; `gitnexus_detect_changes` antes de commit.
- **NO** exponer inmuebles de prueba en la web (`draft`), borrarlos siempre. **NO** tocar RLS, secrets,
  n8n, ni otras pestañas. No commitear secretos. Nueva dependencia `@react-pdf/renderer` justificada.
- Commit(s) en `master`. Actualiza `docs/sync/SYNC_AI.md`.

## 11. Qué NO hacer
- No informe de captación (solo rebaja). No `window.print()`. No comparables inventados (solo reales con
  fuente). No dejar el bug de zona ni ignorar `buyer_activity_logs`. No bloquear el veredicto detrás de la
  valoración del asesor (la IA la deriva de comparables si falta).
