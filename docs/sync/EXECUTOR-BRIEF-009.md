# Executor Brief #009 — Cleanup final (tablas muertas, código huérfano, coherencia)

**Fecha**: 2026-06-10
**Origen**: análisis as-is [docs/analysis/crm-workflow-asis.md](../analysis/crm-workflow-asis.md).
Cierra la serie #007→#009. Materializa la **decisión 6** de Álvaro (retirar `ai_interactions` y
Chatwoot).

**Alcance**: problemas **#12, #14, #15, #16, #17**. Es el brief de menor riesgo (borrados de código
muerto + renombrados + docs), pero incluye **un DROP de tabla en producción** (T1) que requiere
confirmación explícita. Ejecútalo **después** de #007 y #008.

## Contexto crítico

- `git log -3`, `git status` (limpio). Lee `AGENTS.md`, `SYNC_AI.md` reciente, briefs #007 y #008.
- GitNexus al día (`npx gitnexus analyze` si hay commits sin indexar). `repo: "C:\\dev\\tu-asesor\\next-app"`.
- `gitnexus_impact` antes de borrar/renombrar cualquier símbolo o ruta; `gitnexus_detect_changes()`
  antes de commit. Supabase vía MCP + SELECT + SYNC_AI. Build + tests verdes.

## Decisiones ya tomadas (NO preguntar)

1. `ai_interactions`: **DROP** de la tabla + retirar la acción `log_interaction` del bridge n8n.
   La telemetría real vive en `chatbot_messages.intent_detected`.
2. Chatwoot: **borrar** `src/app/api/webhooks/chatwoot/route.ts` (sin llamadores).

---

## T1 — Retirar `ai_interactions` (problema #12, decisión 6)

⚠️ **Antes del DROP**: verifica que ningún workflow n8n vivo llama a la acción `log_interaction`.
Usa el MCP de n8n (read-only) o, si no es concluyente, **para y pregunta a Álvaro**. La tabla tiene
0 filas (snapshot 2026-06-10), pero el DROP es irreversible.

1. **Código**: elimina el `case 'log_interaction'` del bridge
   ([webhooks/n8n/route.ts:198-233](../../src/app/api/webhooks/n8n/route.ts)). El `switch` debe
   seguir respondiendo 400 "Unknown action" para esa cadena (comportamiento por defecto).
   `gitnexus_impact` sobre el handler `POST` antes (es entrypoint de n8n; LOW esperado).
2. **Grep de seguridad**: `git grep "ai_interactions"` y `git grep "log_interaction"` → no debe
   quedar ningún lector/escritor en código tras el cambio. La FK
   `ai_interactions.session_id → chatbot_conversations` desaparece con el DROP (no afecta a
   `chatbot_conversations`).
3. **Migración (vía MCP, requiere OK de Álvaro)**: `DROP TABLE public.ai_interactions;`
   (la tabla tiene su propia policy y FKs salientes; el DROP las arrastra). SELECT de conteo previo
   (confirmar 0 filas) + registro en SYNC_AI como cambio de schema en prod.

Commits: `refactor(n8n): retira acción log_interaction (ai_interactions deprecada)` (código) +
nota de la migración en SYNC_AI. Haz el commit de código ANTES del DROP para no dejar el handler
apuntando a una tabla inexistente entre pasos.

---

## T2 — Borrar webhook Chatwoot (problema #14, decisión 6)

[src/app/api/webhooks/chatwoot/route.ts](../../src/app/api/webhooks/chatwoot/route.ts) no tiene
llamadores (Grep en código + no figura en los workflows documentados).

1. `gitnexus_impact` sobre el `POST`/`GET` del route (LOW esperado, entrypoint externo sin callers).
2. `git grep -i chatwoot` en `src/` → confirma que solo aparece en ese fichero (y quizá menciones en
   docs/AGENTS). Si hay imports vivos en otro sitio, **para y reporta**.
3. Borra el fichero (y su carpeta `chatwoot/` si queda vacía). Actualiza `AGENTS.md` si lista el
   endpoint como crítico (la tabla "Critical files" menciona `/api/webhooks/chatwoot/route.ts` →
   quítalo).

Commit: `chore(webhooks): elimina receptor Chatwoot sin uso`.

---

## T3 — Renombrar ids de pestaña confusos (problema #16)

En [AdminDashboard.tsx](../../src/components/admin/AdminDashboard.tsx) el `TabType`
([:44](../../src/components/admin/AdminDashboard.tsx)) tiene `'sellers'` → renderiza
`EncargosManager` ([:323](../../src/components/admin/AdminDashboard.tsx)) y `'warm_sellers'` →
`WarmLeadsManager` ([:326](../../src/components/admin/AdminDashboard.tsx)). Trampa de mantenimiento.

1. Renombra `'sellers'` → `'encargos'` y `'warm_sellers'` → `'sellers'` en: el tipo `TabType`,
   el array `TABS` ([:185](../../src/components/admin/AdminDashboard.tsx)), los `activeTab === ...`
   ([:323](../../src/components/admin/AdminDashboard.tsx), [:326](../../src/components/admin/AdminDashboard.tsx))
   y el `useState` inicial si aplica.
2. ⚠️ **Si la pestaña activa se persiste** (localStorage / query param / cookie) → añade un mapeo de
   compatibilidad para los valores antiguos al cargar, o los usuarios con la pestaña vieja guardada
   caerían a un tab inexistente. Grep `'warm_sellers'` y `activeTab` para verificar si se persiste;
   si no se persiste, no hace falta.
3. Hazlo con búsqueda acotada al fichero (no find-and-replace global: `'sellers'` podría aparecer
   como substring de `'warm_sellers'` — cuida el orden de los reemplazos).

Commit: `refactor(admin): ids de pestaña coherentes (encargos/sellers)`.

---

## T4 — Verificar `tool_calculations` (problema #15) — diagnóstico, no fix a ciegas

0 filas en prod pese a que `/plusvalia` y `/rentabilidad` insertan ahí. **No es bug de RLS**:
`tool_calculations` tiene policy `Validated public insert` (insert público válido con
`tool_type NOT NULL AND length<=50 AND inputs NOT NULL AND results NOT NULL`) — verificado el
2026-06-10. Hipótesis principal: **ausencia de uso real desde el wipe del 2026-06-04**.

1. Inserta un cálculo real de prueba desde la web en local/staging (no en prod) rellenando
   `/plusvalia` o `/rentabilidad` → confirma que aparece la fila. Si aparece → no hay bug, cierra la
   tarea con una nota en SYNC_AI ("confirmado: inserta correctamente; 0 filas = sin uso desde wipe").
2. Si NO aparece → revisa el `console.error` de `leadService` ([:106-108](../../src/lib/leadService.ts),
   try/catch silencioso): el insert del cálculo no bloquea, así que un fallo pasa desapercibido.
   Captura el error real y reporta la causa antes de proponer fix.

Sin commit de código si la hipótesis se confirma (solo nota SYNC_AI). Si hay bug → micro-commit con
el fix concreto.

---

## T5 — Sincronizar la documentación (problema #17)

La doc de relevo quedó desfasada respecto al estado real (y respecto a #007/#008).

1. **`docs/sync/SYNC_AI.md`**: ya debe tener las entradas de #007 y #008. Añade una corrección
   explícita: la difusión **lee `buyers_demands` JOIN `leads`** (la entrada de 2026-06-08 Ola 5/R9
   decía erróneamente que leía `buyers_demands` cuando en realidad leía `leads.preferences`; el
   #007 lo corrigió de verdad). Nota también que `offers`/`property_documents` siguen eliminadas y
   `SellersManager` no existe.
2. **`docs/CRM-GUIDE.md`**: actualiza la matriz componente↔tabla↔endpoint con: difusión→`buyers_demands`,
   pestaña Encargos→`EncargosManager`/tabla `encargos`, retirada de `ai_interactions` y Chatwoot,
   los nuevos event_types (#008) y el funnel doble (comprador 6 / vendedor 4, #007).
3. **`docs/analysis/crm-workflow-asis.md`**: añade una nota de cabecera "⚠️ Documento as-is a fecha
   2026-06-10; los problemas #1-#14 se abordan en los briefs #007-#009 — ver estado en SYNC_AI". NO
   reescribas el análisis (es una foto histórica), solo el aviso de cabecera.
4. **`AGENTS.md`**: quita Chatwoot de "Critical files" (si T2 no lo hizo ya) y revisa que la lista
   de tablas/inventario no mencione `ai_interactions` como viva.

Commit: `docs(sync): actualiza CRM-GUIDE/SYNC_AI/AGENTS tras refactor #007-#009`.

---

## Orden de ejecución recomendado

1. **T2** Chatwoot (borrado aislado, sin dependencias).
2. **T1** ai_interactions: commit de código → (OK de Álvaro) → DROP.
3. **T3** ids de pestaña.
4. **T4** verificación tool_calculations.
5. **T5** docs (al final, recoge todo lo anterior) + entrada Brief #009 en SYNC_AI + push.

## Verificación final

`npm run build` + `npm test` verdes · `gitnexus_detect_changes()` por commit · `git grep` limpio de
`ai_interactions`, `log_interaction`, `chatwoot` en `src/` · la pestaña Encargos y Vendedores siguen
abriendo el componente correcto tras el renombrado · docs coherentes con el código.

## Qué NO hacer

- NO hagas el DROP de `ai_interactions` sin: (a) confirmar 0 filas, (b) verificar que ningún
  workflow n8n usa `log_interaction`, (c) OK explícito de Álvaro.
- NO toques `chatbot_messages` (es la telemetría real que sustituye a `ai_interactions`).
- NO hagas find-and-replace global de `'sellers'` (colisiona con `'warm_sellers'`; acota al fichero
  y cuida el orden).
- NO reescribas `crm-workflow-asis.md` (es histórico; solo nota de cabecera).
- NO toques RLS de `tool_calculations` (la policy pública es correcta; el 0-filas no es de RLS).
