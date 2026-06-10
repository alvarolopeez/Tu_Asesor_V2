# Plan de implementación — Optimización del flujo de trabajo del CRM

> **Fecha:** 2026-06-10 · **Fuentes:** `Optimizacion flujo de trabajo CRM.pdf` (instrucciones de Álvaro)
> cruzado con [crm-workflow-asis.md](crm-workflow-asis.md) (análisis as-is + inventario de 17 problemas).
> **Objetivo:** ejecutar el flujo que define el PDF Y corregir los problemas del as-is, en fases
> commiteables y verificables de forma independiente.

---

## 0. Lectura del PDF — requisitos extraídos

| # | Requisito (PDF) | Sección |
|---|---|---|
| R1 | Perfil del comprador a **página completa** (nueva pestaña del navegador), 3 apartados: Características / Documentación / Actividad y anotaciones | §1 |
| R2 | Características: datos de búsqueda + descripción libre; **edición directa de zonas con buscador** manteniendo el copiloto IA | §1.1 |
| R3 | Documentación del comprador: **subida de archivos**, cruzable con documentos legales | §1.2 |
| R4 | Actividad comprador: timeline limpio **por colores**; eventos: Llamada, Nota, Cita de venta, **Propuesta (auto al generar el contrato de propuesta vinculado)** | §1.3 |
| R5 | Estados del pedido: **solo Activo / Desactivado**; los desactivados se archivan (no desaparecen) | §1 |
| R6 | **Alta manual de vendedores** | §2 |
| R7 | Perfil vendedor a página completa, mismo estilo; apartados: Perfil / Ficha inmueble / Citas y anotaciones | §2 |
| R8 | Estados vendedor: **Inactivo-perdido, Nuevo lead (inicial), Contacto establecido, Adquisición hecha** (4, no 6) | §2 |
| R9 | Ficha inmueble: rellenar datos en la captación → botón **"Firmar documento"** → lleva a Documentos con la Nota de Encargo prerellenada | §2.2 |
| R10 | **Única vía** a Encargo: nota firmada por ambos → sección Encargos → crear seleccionando el vendedor (como ahora) | §2.2 |
| R11 | Actividad vendedor: eventos **Nota, Llamada, Cita de adquisición**, todos con cita opcional en calendario | §2.3 |
| R12 | Encargo a página completa; secciones Resumen / Documentos / Actividad / Publicación web | §3 |
| R13 | **Flujo de la Propuesta**: se crea en Documentos **seleccionando perfil de comprador Y de vendedor** (cruce automático de datos) → **firma SOLO el comprador** → aparece en el Resumen del encargo con botón **"Aceptar propuesta"** (el vendedor NO se entera) → al aceptar, le llega al vendedor para firmar → propuesta enlazada al encargo | §3.1 |
| R14 | Tras la propuesta firmada por ambos: opción de firmar el **Contrato privado** desde Documentos seleccionando el encargo (cruce de datos) → firmado = cobro de honorarios, a la espera de notaría | §3.1 |
| R15 | En propuesta y encargo: **opción de añadir cláusulas manuales** al rellenar | §3.1* |
| R16 | Documentos del encargo: igual que ahora; la propuesta firmada por ambos aparece ahí | §3.2 |
| R17 | Actividad encargo: por colores, editable (añadir/quitar) + autos; eventos: **Visita, Llamada, Propuesta, Contrato privado (fecha firma), Notaría (fecha)** | §3.3 |
| R18 | Publicación web: igual, pero **arreglar visitas a 0** | §3.4 |
| R19 | Difusión: **registrar impactos en el historial de cada comprador**; poder **excluir leads de la lista antes de enviar**; **bug del filtro por precio máximo** | §4.1 |
| R20 | Subida de imágenes de inmuebles: permitir **selección múltiple** | §4.2 |
| R21 | Informe vivienda (IA): incluir **nº de impactos de difusión** a compradores | §4.3 |

### Causas raíz ya verificadas de los bugs del PDF

- **R18 (visitas a 0):** el detalle del inmueble en `/comprar` es un modal que no cambia la URL
  ([comprar/page.tsx:537](../../src/app/comprar/page.tsx)) y `AnalyticsTracker` registra solo
  `usePathname()` ([AnalyticsTracker.tsx:30](../../src/components/AnalyticsTracker.tsx)) → ningún
  `web_visits.page_path` contiene jamás el id del inmueble, y los contadores (tab Publicación web,
  Operaciones) buscan el id dentro de `page_path`.
- **R19 (precio máximo):** la difusión matchea contra `leads.preferences.maxPrice`
  ([diffusion/route.ts:164-166](../../src/app/api/n8n/diffusion/route.ts)), clave que solo escribe el
  modal web público; los compradores perfilados por Paula o a mano (que viven en
  `buyers_demands.max_budget`) no tienen esa clave → el filtro "no lo capta". Es el problema #3 del as-is.
- **R20 (imágenes):** falta el atributo `multiple` en el input
  ([PropertyFormModal.tsx:535-540](../../src/components/admin/sections/properties/PropertyFormModal.tsx)).

---

## 1. Decisiones de diseño derivadas (vetables por Álvaro)

El PDF no llega al nivel de schema; estas son las decisiones que asumo para implementarlo.
**D = decisión, con alternativa si la hay.**

- **D1 — Funnel vendedor (R8):** se mantiene el CHECK actual de `leads.status` en BD (6 valores,
  por compatibilidad), pero la UI de vendedores pasa a 4: `new`→"Nuevo lead",
  `contacted`→"Contacto establecido", `closed`→"Adquisición hecha", `lost`→"Inactivo/perdido".
  **Migración de datos:** los leads existentes en `qualified`/`visit_scheduled` pasan a `contacted`.
  Esto resuelve el problema #5 del as-is (3 semánticas): Operaciones y Marketing se recalibran a los
  4 estados.
- **D2 — Estados comprador (R5):** `buyers_demands.status` migra a `'Activo'`/`'Desactivado'`
  (mapeo: "Búsqueda activa"/"En negociación"/"Con piso reservado"→Activo; "Inactivo"→Desactivado).
  La pestaña Pedidos muestra activos por defecto + vista "Archivo" con los desactivados.
- **D3 — Fuente canónica del perfil comprador:** `buyers_demands` (decisión ya indicada por Álvaro).
  La difusión deja de leer `leads.preferences` y pasa a leer `buyers_demands` (Activo) con join a
  `leads` vía `lead_id` para teléfono/identidad. `leads.preferences` del comprador queda como dato
  de captación histórico (el modal público seguirá escribiéndolo, pero ya nada crítico lo lee).
- **D4 — Impactos de difusión (R19/R21):** nueva tabla `diffusion_impacts`
  (`id, property_id, buyer_demand_id, lead_id, phone, status, sent_at`) escrita por el endpoint de
  difusión + evento 'Difusión' en `buyer_activity_logs` para que se vea en el timeline. El informe IA
  cuenta desde la tabla. *(Alternativa: solo logs de timeline — peor para métricas.)*
- **D5 — Documentación del comprador (R3):** nueva tabla `buyer_documents` espejo de
  `encargo_documents` + bucket privado `buyer-files` (RLS authenticated, signed URLs).
- **D6 — Estados de firma de la propuesta (R13):** `generated_documents.signature_status` amplía su
  CHECK con `'buyer_signed'` (firmada por el comprador, oculta al vendedor, pendiente de "Aceptar
  propuesta"). Flujo: `draft → sent → buyer_signed → (aceptar) → sent(vendedor) → completed`.
- **D7 — Firmantes de la propuesta (R13):** la propuesta la firma **solo el comprador** primero y el
  vendedor tras la aceptación. **Álvaro deja de ser firmante de la propuesta** (hoy
  `shouldAdvisorSign` lo antepone). Sigue firmando Nota de Encargo y Contrato privado.
- **D8 — Mecánica Documenso del gate (R13):** requiere un **spike** (T4.0) contra la cuenta real:
  la API v1 probablemente no permite añadir firmantes a un documento completado. Opciones:
  **(a)** un solo documento con 2 recipients secuenciales y entrega manual del link al vendedor
  (si v1 permite suprimir su email); **(b)** dos documentos: "Propuesta" (firma comprador) +
  "Aceptación de propuesta" (firma vendedor) generado al pulsar el botón, referenciando la primera.
  Se decide con el resultado del spike; el plan no se bloquea (el resto de la fase 4 es independiente).
- **D9 — Cláusulas manuales (R15):** campo de texto libre en la página previa → placeholder
  `{{clausulas_adicionales}}` añadido a las plantillas Nota de Encargo, Propuesta y Contrato
  (UPDATE de las 3 filas de `document_templates`; el texto legal lo valida Álvaro).
- **D10 — Tracking de vistas de inmueble (R18):** al abrir el modal de detalle se dispara un track
  explícito con `page_path = "/comprar/p/<property_id>"`. Los contadores existentes (buscan el id en
  `page_path`) matchean sin tocarlos. *(Alternativa: cambiar la URL real con `?p=` — más invasiva.)*
- **D11 — Notaría (R17):** el evento 'Notaría' con fecha crea una cita `type='cierre'` (el enum ya
  existe y está sin uso).
- **D12 — Páginas completas (R1/R7/R12):** nuevas rutas App Router
  `/admin/buyers/[id]`, `/admin/sellers/[id]`, `/admin/encargos/[id]` (server component shell +
  client tabs), reutilizando la lógica de los managers actuales. Las listas siguen en el dashboard;
  el click abre la página (target _blank opcional).
- **D13 — Taxonomía de eventos (P7 del as-is):** se renombran los tipos engañosos al migrar los
  timelines: `'IA WhatsApp'` → `'Registro web'` / `'Actualización web'` / `'Reserva web'` según
  origen; el alta manual en CRM deja de etiquetarse `'Llamada telefónica'` → `'Alta en CRM'`.
  Migración de datos de las filas existentes (4 filas hoy).
- **D14 — `features.is_encargo` (P2):** se deja de escribir (deprecado). La promoción
  "lead → property" de WarmLeadsManager se retira; su lugar lo ocupa el flujo R9/R10.

---

## 2. Fases de implementación

> Reglas transversales: cada tarea = 1 commit con build verde (`npm run build`), tests
> (`npm test`) y `gitnexus_detect_changes` limpio. **Antes de la fase 1: reindexar GitNexus**
> (`npx gitnexus analyze` — está 83 commits atrás; toca los contadores de AGENTS.md/CLAUDE.md →
> commit separado). Toda migración de BD en producción se aplica **solo tras confirmación explícita
> de Álvaro** y se registra en `docs/sync/SYNC_AI.md`.

### FASE 0 — Migraciones y fundamentos de datos *(requiere confirmación de Álvaro: DDL en prod)*

| Tarea | Qué | Resuelve |
|---|---|---|
| T0.1 | Migración `leads`: UPDATE `qualified`/`visit_scheduled` → `contacted`; sin tocar el CHECK | R8, P5 |
| T0.2 | Migración `buyers_demands.status` → 'Activo'/'Desactivado' (mapeo D2) | R5 |
| T0.3 | Tabla `diffusion_impacts` + RLS authenticated | R19, R21 |
| T0.4 | Tabla `buyer_documents` + bucket `buyer-files` (privado) + RLS | R3 |
| T0.5 | ALTER CHECK `generated_documents.signature_status` + `'buyer_signed'` | R13 |
| T0.6 | UPDATE plantillas (Nota/Propuesta/Contrato): añadir `{{clausulas_adicionales}}` al body | R15 |
| T0.7 | Data-fix: `UPDATE seller_activity_logs SET event_type='Adquisición' WHERE event_type='GitCommit'` | P1 |

### FASE 1 — Bugs rápidos y difusión (independientes entre sí, alto valor inmediato)

| Tarea | Qué | Ficheros clave | Resuelve |
|---|---|---|---|
| T1.1 | `event_type` correcto al crear encargo ('Adquisición') | [encargos/route.ts:165](../../src/app/api/encargos/route.ts) | P1 |
| T1.2 | `/valoracion`: `normalizeEsPhone` + dedupe por phone (si existe → update de `preferences`, nunca 23505 al usuario) | [valoracion/page.tsx:115](../../src/app/valoracion/page.tsx) | P4 |
| T1.3 | `leadService`: normalizar phone en búsqueda e insert | [leadService.ts:54-77](../../src/lib/leadService.ts) | P9 |
| T1.4 | **Difusión lee `buyers_demands`** (max_budget, rooms, property_type, preferred_zones; zonas/geo vía lead si hay polygons) con join a `leads` por `lead_id` | [diffusion/route.ts](../../src/app/api/n8n/diffusion/route.ts) | R19, P3 |
| T1.5 | SmartMatchmakerModal: previsualización de destinatarios con checkbox para **excluir** antes de lanzar (el payload a n8n ya va filtrado) | [SmartMatchmakerModal.tsx](../../src/components/admin/sections/properties/SmartMatchmakerModal.tsx) | R19 |
| T1.6 | Registrar cada envío en `diffusion_impacts` + evento 'Difusión' en `buyer_activity_logs` | diffusion/route.ts | R19 |
| T1.7 | `multiple` en el input de multimedia + bucle de subida + progreso | [PropertyFormModal.tsx:535](../../src/components/admin/sections/properties/PropertyFormModal.tsx) | R20 |
| T1.8 | Track de vista de inmueble al abrir el modal (`/comprar/p/<id>`, D10); verificar que Publicación web y Operaciones cuentan | [comprar/page.tsx](../../src/app/comprar/page.tsx), [AnalyticsTracker.tsx](../../src/components/AnalyticsTracker.tsx) | R18 |
| T1.9 | Informe IA del inmueble: incluir nº de impactos de difusión (desde `diffusion_impacts`) | [ai-report/route.ts](../../src/app/api/properties/%5Bid%5D/ai-report/route.ts) | R21 |

### FASE 2 — Flujo único Vendedor → Nota de Encargo → Encargo

| Tarea | Qué | Resuelve |
|---|---|---|
| T2.1 | UI funnel vendedor a 4 estados (D1) + recalibrar Operaciones/Marketing/difusión que leían `qualified`/`visit_scheduled` | R8, P5 |
| T2.2 | Alta manual de vendedores (botón + modal en Vendedores) | R6 |
| T2.3 | Ficha inmueble: botón **"Firmar documento"** → navega a Documentos con plantilla Nota de Encargo + lead preseleccionado (query params; DocumentsManager los consume) | R9 |
| T2.4 | **Retirar "Promover a Encargo"** (camino A) y dejar de escribir `features.is_encargo`; el alta de encargo (nota firmada → Encargos) queda como única vía | R10, P2 |
| T2.5 | Renombrar id de tab `'sellers'`→`'encargos'` y `'warm_sellers'`→`'sellers'` (limpieza) | P16 |

### FASE 3 — Perfiles a página completa + timelines por colores

| Tarea | Qué | Resuelve |
|---|---|---|
| T3.1 | Ruta `/admin/buyers/[id]`: Características (edición directa de zonas con buscador + copiloto) / Documentación (`buyer_documents`) / Actividad (colores; eventos Llamada, Nota, Cita de venta→`appointments`, Propuesta auto, Difusión auto); estados Activo/Desactivado + vista Archivo | R1-R5 |
| T3.2 | Ruta `/admin/sellers/[id]`: Perfil / Ficha inmueble (con T2.3) / Citas y anotaciones (Nota, Llamada, Cita de adquisición; cita opcional en calendario — conserva la mecánica actual) | R7, R11 |
| T3.3 | Ruta `/admin/encargos/[id]`: Resumen / Documentos / Actividad (Visita, Llamada, Propuesta, Contrato privado, Notaría→cita `cierre`) / Publicación web (visitas reales tras T1.8) | R12, R17, R18 |
| T3.4 | Migrar taxonomía de eventos (D13) + edición/borrado de eventos en los 3 timelines | R4, R17, P7 |
| T3.5 | Auto-eventos desde documentos: al generar propuesta → evento 'Propuesta' (comprador + encargo); webhook Documenso `completed` → evento de firma según categoría | R4, R17, P11 |

### FASE 4 — Flujo de Propuesta con gate manual ("Aceptar propuesta")

| Tarea | Qué | Resuelve |
|---|---|---|
| T4.0 | **SPIKE Documenso** (cuenta real, 1 doc de prueba): ¿se puede añadir firmante tras completar? ¿suprimir email de un recipient? → fija D8 (opción a o b) | R13 |
| T4.1 | Generador de propuesta: **selector de comprador real** (`buyers_demands` Activo) + selector vendedor → autorrelleno cruzado; guarda `buyer_id` (deja de estar siempre NULL) | R13, P6 |
| T4.2 | Campo "cláusulas adicionales" en la página previa (Nota/Propuesta/Contrato) → `{{clausulas_adicionales}}` | R15 |
| T4.3 | Envío de propuesta **solo al comprador** (sin Álvaro, D7); al completarse la firma del comprador → `signature_status='buyer_signed'` (webhook distingue por categoría); **sin aviso al vendedor** | R13 |
| T4.4 | Resumen del encargo: propuestas `buyer_signed` del mismo vendedor/inmueble + botón **"Aceptar propuesta"** → dispara la firma del vendedor (mecánica según T4.0) → `completed` → aparece en Documentos del encargo + evento | R13, R16 |
| T4.5 | Contrato privado generado **desde el encargo** (cruza datos de encargo + propuesta aceptada); al firmarse → evento 'Contrato privado' + propuesta de cambio `encargos.status` (pregunta abierta Q3) | R14 |
| T4.6 | Evento 'Notaría' con fecha → cita `type='cierre'` en calendario | R17 |

### FASE 5 — Coherencia y limpieza final

| Tarea | Qué | Resuelve |
|---|---|---|
| T5.1 | `/rentabilidad`: crear `buyers_demands` mínimo (Activo) para que el inversor aparezca en Pedidos | P8 |
| T5.2 | Retirar `ai_interactions` (acción n8n `log_interaction`) y webhook Chatwoot **si Álvaro confirma** | P12, P14 |
| T5.3 | Captura de lead en el widget web de Paula (pedir teléfono cuando hay intención) — *backlog, no está en el PDF* | P13 |
| T5.4 | Actualizar `docs/sync/SYNC_AI.md`, `docs/CRM-GUIDE.md` y el as-is con el nuevo flujo | P17 |

---

## 3. Matriz de trazabilidad

**PDF → tareas:** R1→T3.1 · R2→T3.1 · R3→T0.4+T3.1 · R4→T3.1+T3.5 · R5→T0.2+T3.1 · R6→T2.2 ·
R7→T3.2 · R8→T0.1+T2.1 · R9→T2.3 · R10→T2.4 · R11→T3.2 · R12→T3.3 · R13→T4.0-T4.4 · R14→T4.5 ·
R15→T0.6+T4.2 · R16→T4.4 · R17→T3.3+T3.5+T4.6 · R18→T1.8 · R19→T1.4+T1.5+T1.6 · R20→T1.7 · R21→T1.9

**Problemas del as-is → tareas:** P1→T0.7+T1.1 · P2→T2.4 · P3→T1.4 · P4→T1.2 · P5→T0.1+T2.1 ·
P6→T4.1 · P7→T3.4 · P8→T5.1 · P9→T1.3 · P10→absorbido por D1/D2 (los estados que no se actualizaban
desaparecen del funnel) · P11→T3.5 · P12→T5.2 · P13→T5.3 · P14→T5.2 · P15→vigilancia (sin tarea;
re-medir tras fase 1) · P16→T2.5 · P17→T5.4

---

## 4. Riesgos y prerrequisitos

1. **Migraciones en producción** (fase 0): no se aplican sin OK explícito; cada una con SELECT previo
   de verificación y registro en SYNC_AI. T0.2 y T0.1 cambian datos vivos (5 leads, 3 demands hoy —
   riesgo bajo por volumen).
2. **RLS / bucket nuevos** (T0.3, T0.4): política `authenticated` espejo de `encargo-files`;
   AGENTS.md exige confirmación para tocar RLS → se pide en fase 0.
3. **Documenso**: el gate manual depende del spike T4.0 (capacidades reales de la API v1 y límites
   del plan). La opción (b) de D8 funciona seguro con lo ya probado (create→upload→fields→send).
4. **Refactor UI a páginas**: `/admin/*` está excluido del tracking y protegido — ⚠️ verificar el
   mecanismo de auth de `/admin` (proxy.ts) antes de crear rutas nuevas (pendiente de revisión al
   empezar la fase 3).
5. **Paula no se toca** en este plan (engine/scheduling intactos), salvo que T1.4 cambia el lector de
   la difusión — los perfiles que Paula escribe en `buyers_demands` pasan a SER visibles para
   difusión (mejora directa).
6. **n8n**: sin cambios de workflows; T1.4/T1.6 solo cambian el lado servidor del payload (mismo
   contrato con el nodo `Separar Destinatarios`). Si el spike T4.0 exige aviso WhatsApp al vendedor,
   se reutiliza `aviso_alvaro`/plantilla existente (sin workflow nuevo).

## 5. Preguntas que quedan para Álvaro (no bloquean fases 0-2)

- **Q1.** Propuesta: ¿confirmas que tú NO firmas la propuesta (D7), solo comprador→vendedor?
- **Q2.** ¿La "Cita de venta" del comprador y la "Cita de adquisición" del vendedor deben seguir
  creando cita en el calendario con los tipos actuales (`visita`/`captacion`)? (asumo que sí)
- **Q3.** Cuando se firma el Contrato privado, ¿el encargo pasa automáticamente a `vendido`, o lo
  cambias tú a mano tras notaría?
- **Q4.** ¿Retiramos `ai_interactions` y el webhook de Chatwoot (T5.2)?
- **Q5.** Difusión: al excluir leads de una campaña (T1.5), ¿quieres que la exclusión se recuerde
  para futuras campañas del mismo inmueble, o es por campaña?

## 6. Orden de ejecución propuesto

```
Reindex GitNexus → FASE 0 (con tu OK a las migraciones) → FASE 1 (bugs, valor inmediato)
→ FASE 2 (flujo encargo) → FASE 3 (UI páginas) → FASE 4 (propuesta + gate) → FASE 5 (limpieza)
```

Las fases 1 y 2 son independientes entre sí (pueden invertirse). La 3 depende de 0; la 4 depende de
0 y de su spike. Cada fase termina con: build verde, tests verdes, `gitnexus_detect_changes`,
checklist E2E manual para Álvaro y entrada en SYNC_AI.md.
