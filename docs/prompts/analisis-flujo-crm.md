# PROMPT — Análisis read-only del flujo de trabajo del CRM (Tu Asesor V2)

> **Cómo usar este fichero:** este es el encargo completo para un agente que hará ingeniería
> inversa documental del CRM. El agente debe leerlo entero antes de empezar. El único entregable
> es `docs/analysis/crm-workflow-asis.md` (Markdown + Mermaid). **No se aplica ningún cambio.**

---

## 0. Tu rol y la regla innegociable

Eres un arquitecto de software haciendo **ingeniería inversa documental** del CRM "Tu Asesor V2"
(inmobiliaria, Sevilla). Tu único entregable es **UN documento Markdown con diagramas Mermaid**
que describa el flujo de trabajo **tal y como funciona HOY** ("as-is"), más un inventario de problemas.

**PROHIBIDO ABSOLUTAMENTE:**
- ❌ NO modifiques ni una línea de código, schema, migración, workflow n8n ni dato.
- ❌ NO propongas un rediseño "to-be" ni reescribas el flujo. Solo documentas lo que EXISTE y señalas
  lo que está roto/duplicado/incompleto.
- ❌ NO apliques "mejoras". Si ves algo mal, lo **describes** en la sección de problemas, no lo arreglas.
- ✅ Lo único que escribes es el fichero del entregable: `docs/analysis/crm-workflow-asis.md`.

Trabajas **read-only**: leer código, leer schema de Supabase (solo `SELECT` / introspección), usar
GitNexus. Nada de `INSERT/UPDATE/DELETE/apply_migration`. Nada de tocar n8n ni Netlify.

---

## 1. Contexto del proyecto

- **Stack:** Next.js 16.2.6 (App Router, Turbopack, TS) · Supabase Postgres+RLS (ref
  `hmzqgtitlonaxbwlhcob`) · Netlify · n8n Cloud · WhatsApp Cloud API · Documenso (firma digital).
- **Arranque obligatorio (PASO 1 — conseguir contexto):**
  1. Lee `AGENTS.md` y `CLAUDE.md` (rol, stack, ficheros críticos, reglas de oro).
  2. Lee `docs/sync/SYNC_AI.md` — entradas recientes primero. Es el log de relevo entre agentes;
     ahí está el estado real (sprints #004–#006 del chatbot Paula y las fases de Documenso).
  3. Lee `docs/sync/SESSION_BOOTSTRAP.md` si existe.
  4. Verifica que conectan los MCP: **gitnexus, supabase, github**.
  5. Comprueba `git status` / `git log -5` (árbol limpio esperado).
- **GitNexus** está indexado: usa `gitnexus_query({query})`, `gitnexus_context({name})`,
  `gitnexus_route_map` y `gitnexus_tool_map` para trazar flujos en vez de grepear a ciegas. Si hay
  doble repo indexado, pasa `repo:"C:\\dev\\tu-asesor\\next-app"`.
- Puedes delegar la exploración read-only a `investigator-haiku` para ahorrar plan, pero **la síntesis
  y los diagramas los haces tú**.
- **Output en español.**

---

## 2. Mapa de partida (verifícalo, NO lo des por cierto)

Punto de arranque observado por otro agente; tu trabajo es **confirmarlo contra el código actual** y
corregir lo que haya cambiado.

### 2.1 — Capa ADMIN (CRM)

| Actor / Entidad | Pestaña | Componente | Tabla(s) | Historial |
|---|---|---|---|---|
| Comprador | Pedidos | `BuyersManager` | `buyers_demands` (+ `leads type=buyer`) | `buyer_activity_logs` |
| Vendedor | Vendedores | `WarmLeadsManager` | `leads type=seller` (`preferences` jsonb) | `seller_activity_logs` |
| Inmueble | Inmuebles | `PropertiesManager` + `properties/*` | `properties` (`features` jsonb) | — |
| Encargo | Encargos | `SellersManager` + `/api/encargos`, `/api/encargos/[id]` | `properties` con `features.is_encargo` | ofertas + `property_documents` |
| Documentos | Documentos | `DocumentsManager` + `/api/documents/send`, `/api/documents/[id]/download`, `/api/webhooks/documenso` | `document_templates`, `generated_documents` | `signature_status` (Documenso) |

### 2.2 — Capa PÚBLICA (web)

| Touchpoint | Ruta | Qué captura | Dónde aterriza (verificar) |
|---|---|---|---|
| Home / landing | `/` | navegación, CTA | — |
| Catálogo de compra | `/comprar` | filtros, vistas de inmueble | `web_visits`, interés comprador |
| Calculadora valoración | `/valoracion` | datos de vivienda + contacto | `leads type=seller` (¿+ `properties`? ¿+ `tool_calculations`?) |
| Calculadora plusvalía | `/plusvalia` | datos fiscales + contacto | `leads` / `tool_calculations` |
| Calculadora rentabilidad | `/rentabilidad` | datos inversión | `tool_calculations` |
| Contacto | `/contacto` | formulario | `leads` |
| Reseñas | `/dejar-resena` | reseña cliente | `reviews` |
| Blog | `/blog`, `/blog/[slug]` | SEO/contenido | — |
| Chatbot Paula (widget) | en web → `/api/chatbot/message` | conversación, datos extraídos | `chatbot_conversations`, `chatbot_messages`, `leads` |
| Reserva online de visita | flag `features.is_visitable_online` en `properties` | hueco elegido | `appointments` |

**Ficheros/rutas clave a inspeccionar (mínimo):**
- Admin: `src/components/admin/AdminDashboard.tsx`, `BuyersManager.tsx`, `WarmLeadsManager.tsx`,
  `SellersManager.tsx`, `PropertiesManager.tsx` + `properties/*`, `DocumentsManager.tsx`.
- Público: `src/app/page.tsx`, `src/app/comprar/page.tsx`, `src/app/valoracion/page.tsx`,
  `src/app/plusvalia/page.tsx`, `src/app/rentabilidad/page.tsx`, `src/app/contacto/page.tsx`,
  `src/app/dejar-resena/page.tsx`, y el widget del chatbot (búscalo).
- Librería/API: `src/lib/documenso.ts`, `src/lib/chatbot/{engine,scheduling}.ts`, `src/types/index.ts`,
  y rutas: `/api/n8n/new-lead`, `/api/n8n/diffusion`, `/api/chatbot/message`, `/api/webhooks/whatsapp`,
  `/api/webhooks/documenso`, `/api/appointments/[id]/send-confirmation`, `/api/properties/[id]/ai-report`,
  `/api/encargos`, `/api/encargos/[id]`, `/api/documents/send`, `/api/documents/[id]/download`.

**Tablas a introspeccionar en Supabase** (lista, columnas, FKs): `leads`, `properties`,
`buyers_demands`, `offers`, `property_documents`, `appointments`, `seller_activity_logs`,
`buyer_activity_logs`, `document_templates`, `generated_documents`, `tool_calculations`, `web_visits`,
`chatbot_conversations`, `chatbot_messages`, `ai_interactions`, `n8n_webhook_logs`, `reviews`.

---

## 3. Preguntas que el documento DEBE responder

1. **Entrada de comprador:** todos los caminos por los que un comprador entra (web `/comprar`, chatbot
   Paula, alta manual, Meta Ads, n8n) y dónde aterriza. **Aclara la relación/duplicidad entre `leads
   type=buyer` y `buyers_demands`** (¿cuándo se usa cada una? ¿se sincronizan?).
2. **Entrada de vendedor:** caminos (calculadoras `/valoracion`, `/plusvalia`, Paula, alta manual) y
   dónde aterriza. **Traza exactamente qué filas crea `/valoracion`** (¿crea `properties` además del
   lead? ¿con qué `status`/`price`? ¿escribe en `leads.preferences` o en `properties.features`?).
3. **De Lead → Encargo → Inmueble:** cómo y quién promueve un lead vendedor a encargo, cómo se marca
   (`features.is_encargo`), cómo se relaciona `leads.property_id` ↔ `properties.id`, y qué distingue
   un encargo de un inmueble de catálogo normal. Diagrama de **estados** del funnel `STATUS_CONFIG`
   (new/qualified/contacted/visit_scheduled/closed/lost) con sus transiciones.
4. **Sistema de eventos / historiales (NÚCLEO — lo que más le importa a Álvaro):**
   - `seller_activity_logs` y `buyer_activity_logs`: **tipos de evento**, cómo se crean (auto-inyectados
     al cambiar estado vs alta manual en el timeline), y **qué efecto real dispara HOY cada tipo de
     evento** (¿solo registra texto? ¿cambia estado? ¿crea cita? ¿notifica? ¿genera documento?).
   - `appointments`: cómo se enlazan visitas / llamadas / captación a leads e inmuebles, y su relación
     con los timelines.
   - Construye una **tabla "Evento → Efecto actual → Efecto esperado/hueco"** por cada tipo de evento.
     Aquí Álvaro quiere ver claro qué función cumple cada evento y qué le falta para ser automático.
5. **Documentos legales:** plantillas (`document_templates`) → **autorrelleno** (mapa **placeholder
   `{{...}}` → fuente de dato real**: qué sale de `leads`, `properties`, `buyers_demands`, `offers`, y
   qué se rellena a mano) → generación (`generated_documents`) → envío a Documenso (`/api/documents/send`,
   `src/lib/documenso.ts`) → webhook (`/api/webhooks/documenso`) → ciclo de `signature_status`. **Aclara
   de dónde sale el comprador** para el autorrelleno.
6. **Capa pública → CRM:** por cada touchpoint público (sección 2.2), traza qué dato captura, qué
   fila/tabla crea, en qué actor del CRM se convierte, y qué automatización dispara (n8n `new-lead`,
   WhatsApp de bienvenida, etc.). Señala formularios que escriban en sitios distintos de donde el admin
   los lee.
7. **Duplicados / bugs / ineficiencias:** todo lo que genere eventos duplicados, datos desincronizados,
   confirmaciones falsas, race conditions, eventos sin efecto, o caminos que escriben en un sitio y leen
   de otro.

---

## 4. Estructura EXACTA del entregable (`docs/analysis/crm-workflow-asis.md`)

1. **Resumen ejecutivo** — 1 párrafo + **diagrama global Mermaid** del sistema completo (público + admin).
2. **Glosario de actores y entidades** — tabla verificada (actor → pestaña/ruta → componente → tabla →
   historial), separando capa pública y capa admin.
3. **Modelo de datos real** — tablas relevantes con columnas clave y FKs + **diagrama ER Mermaid**
   (`erDiagram`).
4. **Capa pública / web** — **diagrama de flujo Mermaid** (`flowchart`) de todos los touchpoints públicos
   y a qué tabla/actor van + **tabla "touchpoint → dato capturado → tabla destino → automatización
   disparada"**. Incluye el widget de Paula y la reserva online de visitas.
5. **Flujos de entrada (detalle)** — 5.1 Comprador y 5.2 Vendedor, cada uno con **flowchart Mermaid**
   end-to-end (desde el touchpoint público hasta el actor en el CRM) y narrativa con `archivo:línea`.
6. **Ciclo de vida Lead → Encargo → Inmueble** — **diagrama de estados Mermaid** (`stateDiagram-v2`) +
   tabla de transiciones (estado origen → destino → quién/qué lo dispara).
7. **Sistema de eventos e historiales** — por cada timeline: tipos, mecanismo de creación, y la **tabla
   "Evento → Efecto actual → Hueco"**.
8. **Documentos legales** — **diagrama de secuencia Mermaid** (`sequenceDiagram`) generación→firma→webhook
   + **tabla placeholder→fuente de dato**.
9. **Integraciones que tocan el flujo** — Paula (chatbot), n8n (`new-lead`, `diffusion`), WhatsApp,
   Documenso: qué disparan y cuándo.
10. **🔴 Inventario de problemas** — lista numerada. Cada ítem:
    `título · ubicación (archivo:línea) · evidencia · impacto · severidad (alta/media/baja)`. Solo
    **diagnóstico**, sin solución (máx. una línea de "posible dirección" si es evidente).
11. **❓ Preguntas abiertas para Álvaro** — decisiones que el código no resuelve y que él debe aclarar
    para refinar el flujo.
12. **Apéndice** — índice de archivos, rutas API y tablas relevantes con una frase de qué hace cada uno.

---

## 5. Método y barra de calidad

- **Traza cada flujo end-to-end** siguiendo las llamadas reales (UI → handler → API → Supabase →
  efectos), no asumas.
- Cada afirmación importante va anclada con `archivo:línea`.
- Los diagramas Mermaid deben **renderizar** (valida la sintaxis antes de entregar).
- Distingue claramente **lo que el código hace** de **lo que parece pretender**: los huecos van a la
  sección 10, no mezclados en el as-is.
- Marca explícitamente con `⚠️ NO VERIFICADO` cualquier cosa que no hayas podido confirmar.

---

## 6. Checklist final antes de entregar

- [ ] El documento responde las 7 preguntas de la sección 3 (incluida la capa pública).
- [ ] Tiene los diagramas Mermaid de la sección 4 (global, ER, público, comprador, vendedor, estados,
      secuencia de documentos) y **todos renderizan**.
- [ ] Inventario de problemas con ubicaciones reales (`archivo:línea`).
- [ ] Cero cambios en código/DB/n8n/Netlify (solo creaste `docs/analysis/crm-workflow-asis.md`).
- [ ] `git status` solo muestra ese fichero nuevo.

---

## 7. Qué NO hacer (recordatorio)

- NO apliques cambios ni "mejoras" — solo documentas y diagnosticas.
- NO propongas el rediseño "to-be" (eso lo hará Álvaro cruzando este as-is con su propia idea).
- NO toques RLS, secrets, migraciones, workflows n8n ni credenciales.
- NO inventes: si no lo verificaste en el código/BD, márcalo como `⚠️ NO VERIFICADO`.
