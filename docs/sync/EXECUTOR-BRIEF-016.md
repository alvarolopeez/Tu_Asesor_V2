# Executor Brief #016 — Nueva sección "Valoración IA" (mejor precio de venta de un inmueble)

**Fecha**: 2026-06-12
**Origen**: Álvaro. Herramienta **interna** para decidir el **mejor precio de salida** de un inmueble que
**aún no está en el CRM**. Es input-driven: Álvaro teclea los datos, la IA cruza mercado real (Idealista,
portales, índices de escrituración, valor de referencia catastral) y devuelve **3 rangos de precio**.

**Decisiones cerradas con Álvaro** (no re-debatir):
1. **Pestaña nueva del admin** (sidebar), estilo Reseñas/Blog/etc.
2. **Se guarda** (histórico) y **write-back**: la valoración puede pasar a ser la valoración oficial del
   inmueble en el CRM.
3. **Versión presentable** del PDF (para enseñar al vendedor).
4. **Referencia catastral en Fase 1**, introducida **a mano** por Álvaro (sin lookup automático del
   Catastro — eso sería fase posterior).
5. **Modelo `gemini-2.5-pro` + grounding** (el mismo del #015, ya probado).

**Ejecución**: principal **Sonnet 4.6** + subagentes (§9). Reglas de oro §10.

---

## 0. REUTILIZA el motor del #015 (clave de eficiencia)
El #015 ya dejó montado (úsalo de plantilla, NO reinventes):
- `src/lib/priceAnalysis.ts` — patrón de **prompt builder + parseo defensivo de JSON + `extractGroundingUrls`**.
- `src/app/api/properties/[id]/price-analysis/route.ts` — patrón **async** (`upsert status:running` →
  GET polling → `done`/`failed`) que sobrevive al corte del proxy de Netlify (~26-30s). Tabla `rebaja_reports`.
- `src/app/api/properties/[id]/dossier-pdf/route.ts` — generación de **PDF real**.
- `PriceDropModal.tsx` — UI de informe con polling.
- Modelo: `gemini-2.5-pro` + `tools:[{google_search:{}}]` (grounding NO admite `responseMimeType:json` →
  JSON por prompt + parseo defensivo).

**Crea hermanos**, no toques los del #015: `src/lib/valuation.ts`, `/api/valuation` (+ `[id]`),
`/api/valuation/[id]/pdf`, `ValuationManager.tsx`, tabla `valuation_reports`.

---

## T0 — Pestaña nueva "Valoración IA"
En `src/components/admin/AdminDashboard.tsx`:
- Añade `'valuation'` al union `TabType`.
- Entrada en el array `TABS` (línea ~105), p.ej. tras 'blog':
  `{ id: 'valuation', label: 'Valoración IA', icon: BadgeEuro }` (importa un icono de lucide, p.ej.
  `BadgeEuro`/`Calculator`).
- Render: `{activeTab === 'valuation' && <ValuationManager />}` (línea ~260).

## T1 — Formulario de entrada (`ValuationManager.tsx`)
Campos que rellena Álvaro:
- **Ubicación**: `dirección` (texto) **y/o** `referencia catastral` (texto, a mano). Al menos uno.
- **Zona** (taxonomía `SEVILLA_TAXONOMY` / `ZoneSelectorPremium`, opcional; ayuda al grounding).
- **Básicos**: `m²`, `habitaciones`, `baños`, `planta`, `ascensor` (bool), `tipo` (piso/casa), `año` (opcional).
- **Estado** (select obligatorio, guía el informe): `Para reformar` · `Bien conservado` · `Buen estado` ·
  `Reformado`.
- **Reformas y extras** (textarea libre): "cocina reformada 2023, climalit, A/A, suelos nuevos…".
- (Opcional) **Vincular a inmueble** existente del CRM → autocompleta básicos y habilita el write-back (T4).
- Botón **"Generar valoración"** → POST `/api/valuation`, luego polling (patrón #015).

## T2 — Motor `/api/valuation` + `src/lib/valuation.ts`
- **POST `/api/valuation`**: recibe los inputs en el body, crea fila en `valuation_reports`
  (`status:'running'`, `inputs:jsonb`), **devuelve el `id`** y lanza el análisis. (No está atado a un
  `propertyId`: la clave es el `valuation_id`.)
- **GET `/api/valuation/[id]`**: polling del resultado (mismo patrón que el #015 GET).
- `src/lib/valuation.ts` (hermano de `priceAnalysis.ts`):
  - Tipos `ValuationInputs`, `ValuationResult` (ver T3).
  - `buildValuationPrompt(inputs)` — ver §abajo.
  - `parseValuationResponse(raw)` — parseo defensivo (reusa el patrón de `parsePriceAnalysisResponse`).
  - reusa `extractGroundingUrls`.
- Gemini `process.env.VALUATION_LLM_MODEL || 'gemini-2.5-pro'` + grounding (env nueva, default = el del #015).

**Prompt** (rol = tasador senior Sevilla). Debe:
- Usar **Google Search** para €/m² reales de venta en la zona (Idealista/Fotocasa/Habitaclia) + índices de
  escrituración (Registradores/Tinsa/Mº Vivienda) + si hay ref catastral, su **valor de referencia del
  Catastro**. **Citar fuentes con URL** siempre.
- Aplicar el **estado** como ajuste base sobre el €/m² de zona (orientativo, la IA lo afina con el texto
  de reformas): `Para reformar` ≈ −15/−25 % · `Bien conservado` ≈ −5/−10 % · `Buen estado` ≈ 0 ·
  `Reformado` ≈ +5/+15 %. Que el informe **explique la cuenta** (€/m² zona → ajuste estado → ajuste
  reformas → rangos) para que sea transparente.
- Devolver **3 rangos** (ver T3) + narrativa. Si faltan datos de mercado, decirlo y bajar la confianza.
- NUNCA inventar comparables; cada €/m² con fuente real.

## T3 — Salida: 3 rangos de precio
`ValuationResult` (bloque JSON al final del markdown, parseado defensivo):
```json
{
  "precio_m2_zona": 0,
  "estado_ajuste_pct": 0.0,
  "rangos": {
    "venta_rapida": {"precio": 0, "precio_m2": 0, "dias_estimados": 0, "justificacion": ""},
    "mercado":      {"precio": 0, "precio_m2": 0, "dias_estimados": 0, "justificacion": ""},
    "premium":      {"precio": 0, "precio_m2": 0, "dias_estimados": 0, "justificacion": ""}
  },
  "confianza": "alta|media|baja",
  "comparables": [{"fuente":"", "precio_m2":0, "url":"https://..."}],
  "factores": ["reforma cocina suma X", "planta sin ascensor resta Y", ...]
}
```
- `venta_rapida` ≈ mercado −5/−10 %, cierre ~26 días (óptimo del #014). `mercado` = precio realista.
  `premium` ≈ mercado +5/+10 %, más tiempo. Cada uno con € total, €/m², días estimados y justificación.
- UI: las 3 cifras como **tarjetas hero** (verde rápida / azul mercado / ámbar premium) + narrativa
  markdown renderizada de verdad + comparables con enlaces + nivel de confianza.

## T4 — Guardado + histórico + write-back
- Tabla **`valuation_reports`** (migración): `id uuid pk default gen_random_uuid()`, `created_at`,
  `finished_at`, `status text`, `inputs jsonb`, `markdown text`, `result jsonb`, `grounding_urls text[]`,
  `error_msg text`, `property_id uuid null` (vínculo opcional). **RLS: solo service role** (el cliente
  nunca consulta la tabla directo; todo pasa por las rutas con service role — mismo modelo que
  `rebaja_reports`). Documenta SELECT antes/después de la migración.
- **Histórico**: `ValuationManager` lista las valoraciones previas (GET de las últimas N) para reabrir/comparar.
- **Write-back** (decisión de Álvaro): si la valoración está vinculada a un inmueble (o a su lead
  vendedor), botón **"Guardar como valoración del inmueble"** → escribe
  `leads.preferences.agent_valuation = rangos.mercado.precio` del lead vendedor con ese `property_id`
  (crea el lead vendedor si hace falta, o escribe en `properties.features.precio_valoracion`). **Esto
  cierra el círculo**: alimenta Operaciones y el #015 (que hoy salen `N/D`).

## T5 — PDF presentable (para el vendedor)
- Reutiliza el patrón de `dossier-pdf/route.ts` → nueva ruta `/api/valuation/[id]/pdf` con plantilla
  **client-facing**: portada de marca + datos del inmueble + **los 3 rangos** (claros y visuales) +
  comparables con fuentes + explicación del ajuste por estado/reformas + confianza + firma del asesor.
  **Sin** heurísticas internas ni jerga; es un documento para enseñar al cliente. Botón "Descargar PDF".

## 6. Matriz de aceptación (input-driven, sin tocar producción)
Probar el formulario con varios estados/zonas y verificar coherencia de los 3 rangos + que el grounding
cita fuentes reales:
| Caso | Input | Esperado |
|---|---|---|
| A | Nervión, 80 m², 3/1, **Reformado**, "cocina y baño nuevos 2024" | €/m² alto de zona +ajuste reforma; 3 rangos coherentes; comparables de Idealista citados |
| B | Triana, 75 m², 2/1, **Para reformar** | €/m² zona −20%; rangos más bajos; explica el descuento por reforma |
| C | Bormujos, 100 m², 3/2, **Buen estado**, con ref catastral | usa la ref como ancla; €/m² de Aljarafe; rangos medios |
| D | solo dirección + m², sin estado claro / zona rara | confianza "baja", lo admite, no inventa comparables |

## 7. Env nueva
`VALUATION_LLM_MODEL` (default `gemini-2.5-pro`) → Netlify + `.env.local`. `GEMINI_API_KEY` ya existe.

## 8. Tests
- `parseValuationResponse` (con/sin fences, con preámbulo de grounding, JSON incompleto → null).
- Construcción de inputs/contexto (estado + reformas presentes en el prompt).
- `npm run build` + `npm test` verdes.

## 9. Plan de delegación en subagentes
- **Principal: Sonnet 4.6**.
- **`architect-opus`** — decisión con trade-offs: ruta input-driven (POST sin propertyId → id → polling),
  esquema de los 3 rangos, mecánica de write-back (lead vs property), y reuso del PDF. Una invocación al
  inicio.
- **`investigator-haiku`** — leer `priceAnalysis.ts` + `price-analysis/route.ts` + `dossier-pdf` para
  copiar patrones; confirmar el array `TABS` y el render en `AdminDashboard.tsx`; ver cómo se guarda hoy
  `agent_valuation`/`precio_valoracion`.
- **`reviewer-sonnet`** — revisar el prompt del tasador (3 rangos, ajuste por estado, solo datos reales) y
  el diseño del PDF presentable.

## 10. Reglas de oro
- `gitnexus_impact` antes de editar `AdminDashboard.tsx` y antes de crear/editar símbolos compartidos.
- Migración de `valuation_reports` con RLS restrictiva; SELECT antes/después; NO tocar otras tablas/RLS.
- `npm run build` + `npm test` verdes; `gitnexus_detect_changes` antes de commit.
- NO tocar el motor del #015 (crea hermanos). NO commitear secretos. Sincroniza `VALUATION_LLM_MODEL`.
- Commit(s) en `master`. Actualiza `docs/sync/SYNC_AI.md`.

## 11. Qué NO hacer
- No atar la valoración a un inmueble existente (debe funcionar solo con inputs a mano).
- No lookup automático del Catastro en Fase 1 (la ref la teclea Álvaro; la IA la usa como ancla).
- No inventar comparables ni precios de escrituración (solo datos reales con fuente; si no hay, baja la
  confianza y dilo).
- No reutilizar la tabla `rebaja_reports` (crea `valuation_reports`).
