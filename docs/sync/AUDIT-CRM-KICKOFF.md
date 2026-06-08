# 🔍 KICKOFF — Auditoría a fondo del CRM Tu Asesor V2

> **Qué es esto:** el brief de arranque para una sesión nueva dedicada a auditar
> todo el CRM y producir una guía técnica completa. Creado el 2026-06-08 desde
> el chat-ejecutor tras una sesión de brainstorming con Álvaro.
>
> **Cómo usarlo:** abre un chat NUEVO (ver "Modelo y arranque" al final), pega el
> bloque "PROMPT DE ARRANQUE" del final, y el agente trabajará desde aquí.

---

## Decisiones ya tomadas (NO volver a preguntar)

| Decisión | Valor |
|---|---|
| **Alcance** | TODO el sistema: CRM admin + web pública/formularios + chatbot/IA + integraciones (n8n, Documenso, Supabase). |
| **Acción** | **SOLO DOCUMENTAR.** No tocar código en esta pasada. Los fixes se priorizan y se deciden después con Álvaro. |
| **Entregable** | Una guía técnica para agentes IA: `docs/CRM-GUIDE.md`. Incluye DENTRO una sección de informe de calidad + reestructuraciones recomendadas (no hace falta documento aparte). |
| **Verificación** | Cada hallazgo se cruza contra el **schema real de Supabase** vía MCP antes de afirmarlo. Nada de suposiciones. |
| **Modelo** | Sonnet 4.x de orquestador + workflow multi-agente. Opus solo puntual (`architect-opus`) para validar reestructuraciones gordas. |

---

## Contexto mínimo del proyecto

- **Stack:** Next.js 16.2.6 (App Router, Turbopack, TypeScript) en Netlify. Tailwind + CSS vanilla. Supabase Postgres + RLS (ref `hmzqgtitlonaxbwlhcob`). n8n Cloud. WhatsApp Cloud API v21.0. Documenso API v1.
- **Repo:** `github.com/alvarolopeez/Tu_Asesor_V2`, default `master`. Path local: `/Users/alvarolopezcuevas/Documents/GitHub/Tu_Asesor_V2`.
- **MCP disponibles:** gitnexus (code intel), github, supabase, netlify, n8n.
- **Lee primero:** `AGENTS.md`, `docs/sync/SYNC_AI.md` (últimas entradas), `task.md`.
- **Dimensión:** ~30.000 líneas en `src`, 38 componentes admin, 17 API routes, 14 módulos en `lib`.
- **Archivos más grandes (candidatos a "hacen demasiado"):** DocumentsManager (1604), BuyersManager (1464), ZoneSelectorPremium (1367), WarmLeadsManager (1293), `/comprar` (1188), chatbot/scheduling (1107), BuyerRegistrationModal (1021), EncargosManager (986), api/ai/zones (931).

> ⚠️ El chatbot (`engine.ts`, `scheduling.ts`, `systemPrompt.md`) se acaba de
> reescribir a fondo (timezone Madrid, fechas, entrevista, anti-spoofing). Hay
> deuda técnica **ya documentada y conocida** en el último commit: prompt-injection
> vía historial/catálogo, LLM ciego al system override, tabla `chatbot_followups`
> dedicada pendiente, DST edge cases. NO re-descubrir esto como nuevo — referenciarlo.

---

## Plan de ejecución: workflow multi-agente por áreas

Repartir el sistema en **7 frentes auditados en paralelo**. Cada subagente lee SU
frente completo y devuelve hallazgos estructurados. Un agente sintetizador une,
deduplica y prioriza. Recomendado: lanzar con la tool `Workflow` (ultracode),
`agentType: 'gsd:gsd-code-reviewer'` o `Explore` para el fan-out de lectura.

### Frente 1 — Leads & Compradores
- **Componentes:** `WarmLeadsManager.tsx`, `BuyersManager.tsx`, `ZoneSelectorPremium.tsx`, `src/components/BuyerRegistrationModal.tsx`, `BuyerMap.tsx`.
- **Endpoints:** `/api/n8n/new-lead`.
- **Tablas:** `leads`, `buyers_demands`, `buyer_activity_logs`, `seller_activity_logs`.
- **Foco conocido:** históricamente hubo desconexión `leads` ↔ `buyers_demands` (la pestaña "Pedidos" lee solo `buyers_demands`). Verificar que TODAS las vías de alta (form web, reserva, chatbot) escriben en ambas donde toca.

### Frente 2 — Encargos & Documentos
- **Componentes:** `EncargosManager.tsx`, `encargos/EncargoFormModal.tsx`, `DocumentsManager.tsx`.
- **Libs:** `documenso.ts`, `brandedDoc.ts`, `brandLogo.ts`.
- **Endpoints:** `/api/encargos`, `/api/encargos/[id]`, `/api/documents/send`, `/api/documents/[id]/download`, `/api/webhooks/documenso`.
- **Tablas:** `encargos`, `encargo_documents`, `generated_documents`, `document_templates`.
- **Foco:** flujo de firma E2E, autorrelleno entre documentos, vínculo property↔encargo, timeline de actividad.

### Frente 3 — Inmuebles & Catálogo
- **Componentes:** `PropertiesManager.tsx`, `properties/PropertyFormModal.tsx`, `app/comprar/page.tsx`, `HeatmapManager.tsx`.
- **Lógica:** matchmaker (RPC `get_matching_leads_for_property`), `/api/n8n/diffusion`.
- **Tablas:** `properties`.
- **Foco:** shape de `features` (jsonb con `visitable_slots`, `address`, lat/lng, etc.), bucket Storage `properties`, parseo lat/lng, publicación.

### Frente 4 — Dashboard analítico
- **Componentes:** `dashboard/DashboardOverview.tsx`, `dashboard/OperacionesTab.tsx`, `dashboard/FinanzasTab.tsx`, `dashboard/MarketingTab.tsx`, `dashboard/operaciones/*`.
- **Tablas:** `web_visits`, `appointments`, `tool_calculations`, `expenses`.
- **Foco:** que NO queden baselines/datos inventados (se limpiaron en brief #002 pero verificar FinanzasTab y MarketingTab, que no se tocaron). Métricas reales vs hardcoded.

### Frente 5 — Calendario & Citas
- **Componentes:** `CalendarManager.tsx`, `calendar/AppointmentFormModal.tsx`.
- **Libs:** `appointmentService.ts`.
- **Tablas:** `appointments`.
- **Foco:** consistencia de timezone (Madrid vs UTC), status de citas (pending/completed/cancelled), que las citas del bot y de la web aparezcan.

### Frente 6 — Chatbot & IA
- **Libs:** `chatbot/engine.ts`, `chatbot/scheduling.ts`, `chatbot/systemPrompt.md`.
- **Componentes:** `ChatManager.tsx`.
- **Endpoints:** `/api/chatbot/message`, `/api/webhooks/whatsapp`, `/api/webhooks/whatsapp/status`, `/api/admin/chat/send`, `/api/webhooks/chatwoot`.
- **Libs aux:** `whatsapp.ts`, `phone.ts`.
- **Tablas:** `chatbot_conversations`, `chatbot_messages`, `ai_interactions`.
- **Foco:** REFERENCIAR la deuda ya documentada (ver aviso arriba), no re-descubrirla. Buscar lo NUEVO.

### Frente 7 — Integraciones & datos
- **Endpoints:** `/api/webhooks/n8n`, `/api/n8n/diffusion`, `/api/n8n/new-lead`, `/api/webhooks/chatwoot`, `/api/webhooks/documenso`, `/api/health`, `/api/analytics/track`.
- **Componentes:** `WebhooksManager.tsx`.
- **n8n:** 4 workflows activos (Seguimiento Leads, Notificación Nuevo Lead, Difusión Inteligente, Enviar Documento a Firmar) — verificar vía MCP n8n.
- **Supabase:** schema completo + **RLS** (security-critical, NO modificar). Listar tablas, columnas huérfanas, FKs, índices.
- **Tablas:** `n8n_webhook_logs`, todas las anteriores a nivel schema.

### Barrido de secundarios (no olvidar)
`BlogManager.tsx`, `ReviewsManager.tsx`, `app/api/ai/zones`, páginas públicas `valoracion`/`plusvalia`/`rentabilidad`/`contacto`/`dejar-resena`. Asignar al frente más cercano o a un mini-frente extra.

---

## Qué busca CADA frente (dimensiones de auditoría)

1. **Código muerto** — funciones/componentes/imports/vars sin usar, ramas inalcanzables, archivos huérfanos.
2. **Conexiones rotas o faltantes** — componente que lee/escribe una tabla que no existe o columna inexistente; endpoint sin caller; UI que no refleja datos reales; tabla sin UI que la muestre. **Cruzar SIEMPRE con schema Supabase real.**
3. **Bugs** — lógica incorrecta, race conditions, manejo de errores ausente, timezone, parseo frágil, fire-and-forget sin log.
4. **Duplicación** — lógica repetida entre componentes (ej: normalización de teléfono, formateo de fechas, queries idénticas), candidatos a extraer a `lib`.
5. **Optimización** — queries N+1, `select *` innecesarios, refetch redundante, componentes que hacen demasiado (>800 líneas), falta de memoización donde duela.

Cada hallazgo: `{ severidad: CRITICAL|HIGH|MEDIUM|LOW, área, título, archivo:línea, detalle, evidencia (incl. cruce Supabase si aplica), recomendación }`.

---

## Estructura del entregable: `docs/CRM-GUIDE.md`

1. **Mapa del sistema** — las 7 áreas y cómo se conectan (diagrama en texto/mermaid).
2. **Ficha por área** — para cada manager/sección: qué hace · qué tablas lee/escribe · qué endpoints llama · qué componentes la forman · flujo de datos · zonas frágiles.
3. **Matriz componente ↔ tabla ↔ endpoint** — tabla de referencia rápida para saber qué se toca al cambiar algo.
4. **Informe de calidad** — código muerto, duplicación, bugs confirmados, deuda técnica, clasificados por severidad (consolidado de los 7 frentes).
5. **Reestructuraciones recomendadas** — priorizadas con esfuerzo/impacto, para la hoja de ruta de Álvaro.
6. **Reglas de oro para agentes** — qué NO tocar (RLS, secrets, migraciones prod, workflows n8n, credenciales WhatsApp), convenciones del proyecto, gotchas conocidos.

---

## Modelo y arranque

- **Chat NUEVO** (no continuar el chat-ejecutor: arrastra contexto irrelevante).
- **Modelo principal: Sonnet 4.x** (`/model claude-sonnet-...`). La auditoría es lectura estructurada + detección de patrones; Opus secuencial sobre 30k líneas fundiría el cap del bloque 5h sin ganancia.
- **Ejecución:** workflow multi-agente (ultracode) para el fan-out de los 7 frentes en paralelo + síntesis. Opus solo vía subagente `architect-opus` para validar las 2-3 reestructuraciones gordas, si surgen.
- **Al terminar:** `gitnexus_detect_changes` no aplica (no se toca código); solo commitear el nuevo `docs/CRM-GUIDE.md` y registrar la entrada en `docs/sync/SYNC_AI.md`.

---

## PROMPT DE ARRANQUE (pegar en el chat nuevo)

```
Eres mi Principal Software Engineer en "Tu Asesor V2" (CRM + web inmobiliaria,
Sevilla). Vamos a hacer una AUDITORÍA A FONDO del CRM y producir una guía técnica.

ARRANQUE:
1. cd /Users/alvarolopezcuevas/Documents/GitHub/Tu_Asesor_V2 && git log -3 --oneline && git status --short
2. Lee docs/sync/AUDIT-CRM-KICKOFF.md ENTERO — es tu brief, tiene el plan completo,
   las 7 áreas, qué buscar y la estructura del entregable.
3. Lee AGENTS.md y las últimas 3 entradas de docs/sync/SYNC_AI.md.
4. Verifica que cargan los MCP: gitnexus, supabase, n8n (los necesitarás).

REGLAS:
- SOLO DOCUMENTAR. No toques código en esta pasada.
- Cruza cada hallazgo contra el schema REAL de Supabase (MCP) antes de afirmarlo.
  Si no puedes verificar algo, dilo — no especules.
- Ejecuta la auditoría con un workflow multi-agente (los 7 frentes en paralelo +
  síntesis). Modelo de esta sesión: Sonnet. Opus solo puntual si una
  reestructuración gorda lo justifica (architect-opus).
- Entregable: docs/CRM-GUIDE.md con las 6 secciones del kickoff. Al terminar,
  commit + entrada en SYNC_AI.md. Commits firmados Co-Authored-By: Claude Opus 4.8.
- El chatbot tiene deuda YA documentada en el último commit (prompt-injection,
  LLM ciego al override, chatbot_followups, DST): referénciala, no la redescubras.

Empieza por el arranque y dame un plan de ejecución antes de lanzar el workflow.
```

---

*Generado desde el chat-ejecutor (Opus 4.8) el 2026-06-08 tras brainstorming. La ejecución va en chat nuevo con Sonnet.*
