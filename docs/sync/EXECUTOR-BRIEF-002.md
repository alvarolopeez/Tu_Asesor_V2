# BRIEF #002 — Operaciones reales + Bot que agenda + Encargo timeline

> Después del prompt de arranque (`docs/sync/HANDOFF-PROMPT.md`), pega este brief.
> Causas raíz YA investigadas — el ejecutor NO debe re-investigar nada salvo que el
> diagnóstico no encaje con lo que vea en el código.

---

```
Después del arranque, tienes 7 tareas. Las he ordenado por dependencias y
por tamaño creciente. La 4 es la grande (motor del chatbot); el resto son
de bajo riesgo.

═══════════════════════════════════════════════════════════════════════════
CAUSAS RAÍZ YA INVESTIGADAS (NO especules, NO reinvestigues)
═══════════════════════════════════════════════════════════════════════════

(A) Operaciones tab muestra datos falsos:
    src/components/admin/sections/dashboard/operaciones/operacionesUtils.ts
    tiene 6 baselines hardcodeadas que se SUMAN a los datos reales:
      - SEVILLA_BARRIOS_BASELINE (líneas ~71-90, 18 barrios inventados:
        Triana 48, Nervión 42, Los Remedios 35, etc.)
      - growthBaseline = [120, 131, 145, 156, 168, 184] (~línea 187)
      - sinEstudioCount=32, estudioHechoCount=45, preconcedidaCount=63,
        contadoCount=40 (perfiles financieros, ~líneas 209-212)
      - habitualCount=126, inversionCount=54 (intención compra, ~líneas
        214-215)

(B) Punto 3: comprador no aparece en pestaña "Pedidos":
    AdminDashboard.tsx línea 190 mapea Pedidos → BuyersManager.tsx.
    BuyersManager.tsx lee EXCLUSIVAMENTE de la tabla `buyers_demands`
    (líneas 131, 259, 268, 300, 320). NO toca `leads`.
    Pero src/lib/appointmentService.ts línea ~120 SOLO inserta en `leads`,
    nunca en `buyers_demands`. Por eso el comprador no aparece.
    Compara con src/components/BuyerRegistrationModal.tsx que SÍ inserta
    en ambas tablas (es el patrón consistente).

(C) Punto 4 actividad vacía: EncargosManager.tsx (función EncargoDrawer,
    línea 376) ya tiene la tab "actividad" (línea 602, 419), pero la
    query carga solo `appointments` filtrando por `seller_lead_id`. No
    incluye anotaciones, propuestas firmadas ni cambios de estado.
    Álvaro quiere TIMELINE COMPLETO mixto.

(D) Punto 5 bot no verifica disponibilidad:
    src/lib/chatbot/engine.ts detecta el intent `schedule_visit` pero NO
    llama a create_appointment, NO lee `properties.features.visitable_slots`
    (que SÍ existe en el schema, ver types.ts línea 54), NO cruza con
    appointments existentes y NO escala.

(E) Punto 6 cita del bot no aparece: consecuencia directa de (D). Al
    arreglar (D) se arregla solo.

═══════════════════════════════════════════════════════════════════════════
DECISIONES DE ÁLVARO YA TOMADAS — NO le preguntes
═══════════════════════════════════════════════════════════════════════════

1. Punto 3: la solución es replicar el patrón de BuyerRegistrationModal —
   appointmentService.ts debe insertar TAMBIÉN en buyers_demands
   (con los campos que tenga del formulario de reserva, el resto vacíos).
2. Tab actividad del encargo: opción C — timeline mixto con
   visitas (appointments), notas/anotaciones, propuestas firmadas
   (generated_documents) y cambios de estado del encargo.
3. Punto 3.2 informe: filtrar conteo por status='completed'. Mostrar las
   `pending` en un contador aparte ("3 visitas pendientes").
4. Cuando el inmueble NO tenga visitable_slots configurados (citas online
   desactivadas), el bot ESCALA a Álvaro con should_escalate=true.
5. Entrevista del bot al lead NUEVO antes de agendar: 4 preguntas en
   orden — (1) ahorros aportados (número), (2) estado de la hipoteca
   (sin estudio / estudio hecho / preconcedida / contado), (3) si es
   compra para vivienda personal o inversión, (4) ya tiene el precio
   y la zona por el inmueble. Estos datos van a `buyers_demands`.

═══════════════════════════════════════════════════════════════════════════
TAREAS — en este orden
═══════════════════════════════════════════════════════════════════════════

────────────────────────────────────────────────────────────────
TAREA 1 — Limpiar baselines fake de Operaciones (XS)
────────────────────────────────────────────────────────────────
Edita src/components/admin/sections/dashboard/operaciones/operacionesUtils.ts:
- SEVILLA_BARRIOS_BASELINE → vaciar array a []. Conservar la función
  computeSevillaDemand pero que parta de un agregado real (group by zona
  desde leads.preferences.preferredZones / buyers_demands.preferred_zones).
- growthBaseline → eliminar la suma con la baseline; devolver solo el
  cumulativeDbCount real.
- En computeBuyerProfiles: sinEstudioCount, estudioHechoCount,
  preconcedidaCount, contadoCount → iniciar a 0. Mismo con habitualCount,
  inversionCount.

Criterio de aceptación: con 0 leads en BD, ningún KPI debe mostrar nº
inventados. Todos los charts/cards se ven en cero o vacíos.

────────────────────────────────────────────────────────────────
TAREA 2 — Reserva web crea también buyers_demands (S)
────────────────────────────────────────────────────────────────
En src/lib/appointmentService.ts (función bookPublicAppointment), tras
crear el lead nuevo, AÑADIR un insert en `buyers_demands`:

  await supabaseAdmin.from('buyers_demands').insert([{
    name: cleanName, phone: cleanPhone, email: cleanEmail,
    status: 'Búsqueda activa',
    last_activity_at: new Date().toISOString(),
    // los demás campos (max_budget, rooms, bathrooms, property_type,
    // preferred_zones, funding_type, savings_contribution) quedan NULL —
    // el bot los rellenará en su entrevista (Tarea 4) o Álvaro a mano.
  }])

Si ya existe un buyers_demands con ese phone, hacer update.
Mirar BuyerRegistrationModal.tsx para reusar el patrón exacto.

Criterio: tras reservar visita con tel nuevo, el comprador aparece en
la pestaña "Pedidos" del CRM (BuyersManager) tras recargar.

────────────────────────────────────────────────────────────────
TAREA 3 — Visitas reales + filtro pending/completed en informe (S)
────────────────────────────────────────────────────────────────
En src/components/admin/sections/dashboard/OperacionesTab.tsx:

- Cargar también appointments con property_id, status, scheduled_at.
- En computePropertyViews y en informes, separar:
  - visitas_web = web_visits.filter(page_path contiene property_id).length
  - visitas_fisicas_completadas = appointments.filter(
      property_id === p.id && status === 'completed').length
  - visitas_fisicas_pendientes = appointments.filter(
      property_id === p.id && status === 'pending').length
- En el card "Visitas Totales" del informe, mostrar:
    Web: X · Físicas: Y completadas (+Z pendientes)

Criterio: si reservo 1 visita y no la marco completada, sale como
"0 completadas (+1 pendiente)", NO suma al conteo total de éxito.

────────────────────────────────────────────────────────────────
TAREA 4 — Bot agenda con verificación + entrevista (L, la gorda)
────────────────────────────────────────────────────────────────
En src/lib/chatbot/engine.ts:

  4.1. Cuando intent === 'schedule_visit', AÑADIR un step de verificación
       ANTES de devolver al usuario un texto de confirmación:

  a) Identificar la propiedad de interés (desde el contexto de la
     conversación o de la última propiedad que la IA le había sugerido).
     Tabla a leer: properties.features.visitable_slots con shape
     [{ date: 'YYYY-MM-DD', slots: ['10:00','11:00','12:00'] }, ...].

  b) Si visitable_slots NO existe o está vacío → marcar
     should_escalate=true con mensaje "Para visitar este inmueble necesito
     consultar a Álvaro directamente. Le aviso ahora mismo y te
     contactará personalmente." Detener el flujo aquí.

  c) Si existe pero la hora pedida NO está en los slots O ya hay un
     appointment para ese property_id+scheduled_at:
     → Calcular slots disponibles del día = slots[date] menos appointments
       existentes ese día.
     → Devolver respuesta con: "Para ese día tengo libres: 10:00, 12:00 y
       17:00. ¿Cuál te viene mejor?"
     → NO crear cita.

  d) Si la hora pedida está libre Y dentro de slots:
     → SI el lead es NUEVO (no existe en buyers_demands con su teléfono),
       lanzar entrevista de 4 preguntas EN ORDEN antes de confirmar:
         q1: "¿Qué ahorros aportarías a la compra? (en €)"
         q2: "¿Cómo vas con la financiación? (sin estudiar / estudio hecho /
              hipoteca preconcedida / pago al contado)"
         q3: "¿Es para vivir tú o inversión?"
       (precio máximo y zona se infieren del inmueble y de los slots; no
        preguntar.)
       Después de las 3 respuestas, hacer UPSERT en buyers_demands con esos
       campos rellenos y crear la cita.
     → SI el lead YA existe en buyers_demands: crear la cita directa sin
       entrevista.

  e) Crear el appointment via supabase.from('appointments').insert(...)
     con status='pending', type='visita', duration_minutes=30.

  4.2. Manejo de la entrevista de 4 preguntas:
       Usa state en chatbot_conversations.metadata.interview_state = {
         step: 1|2|3, answers: {...}, target_appointment: {...}
       }
       En cada mensaje del usuario, si interview_state está activo,
       interpretar la respuesta como answer al step actual, avanzar step,
       o terminar y crear cita+UPSERT buyers_demands.

  4.3. En src/lib/chatbot/systemPrompt.md: añadir las nuevas reglas para
       que el LLM las siga (estructura JSON de respuesta, cuándo escalar,
       cuándo hacer entrevista, no inventar disponibilidad).

Criterio de aceptación:
  - Si pido visita a una hora libre con lead nuevo: el bot me pregunta
    las 3 cosas y al final me confirma cita Y aparece en /admin/calendar.
  - Si pido visita a hora ocupada: me ofrece slots libres del día, sin
    crear cita.
  - Si pido visita en inmueble sin slots: el bot escala a Álvaro.

────────────────────────────────────────────────────────────────
TAREA 5 — Cita del bot visible en CRM (XS, automática tras T4)
────────────────────────────────────────────────────────────────
Al insertar appointments con property_id, calendar y panels que ya leen
de appointments (CalendarManager, OperacionesTab, EncargoDrawer) la
mostrarán solas. Solo verificar que:
- CalendarManager.tsx renderiza por scheduled_at.
- EncargoDrawer.tsx tab "actividad" la muestra (resuelve también T6 si
  se hace bien).
- OperacionesTab informe la suma como visita pendiente (de la T3).

No hace falta código nuevo aquí. Solo verificar y reportar.

────────────────────────────────────────────────────────────────
TAREA 6 — Tab Actividad del encargo: timeline completo (S)
────────────────────────────────────────────────────────────────
En EncargosManager.tsx, función EncargoDrawer, la tab "actividad" (~línea
419-454). Hacer query en paralelo de:
  - appointments (property_id, scheduled_at, status, type, notes)
  - buyer_activity_logs (filtrados por seller_lead_id si aplica)
  - generated_documents donde encargo_id = encargo.id
  - Cambios del encargo: usar updated_at del encargo + un log si existe

Renderizar como timeline ordenado descendente por fecha, con icono por
tipo de evento (📅 visita, 📝 nota, 📄 documento, 🔄 cambio de estado).
Visitas en status="pending" con badge "Pendiente" en amarillo;
"completed" en verde; "cancelled" en gris tachado.

Criterio: al abrir un encargo que tenga 2 visitas + 1 propuesta firmada,
los 3 eventos salen en orden cronológico en la tab.

────────────────────────────────────────────────────────────────
TAREA 7 — Informe IA del inmueble (M)
────────────────────────────────────────────────────────────────
Nuevo endpoint: POST /api/properties/[id]/ai-report

Recopila del backend (NO desde el cliente):
  - property (precio, m², habitaciones, baths, features, published_at,
    días en mercado = NOW() - published_at)
  - appointments del inmueble (cuenta completed, pending, cancelled +
    notes de cada uno)
  - generated_documents del inmueble (propuestas hechas y status)
  - web_visits (count por page_path)
  - similares del catálogo: properties activas con price ±15% y mismo
    barrio para promedios

Construir prompt para el LLM (usar la mismainfra de chatbot/engine.ts —
Gemini Flash por defecto, ver process.env.LLM_PROVIDER) con rol:
"Eres analista inmobiliario senior en Sevilla. A partir de los datos del
inmueble y de sus interacciones reales (visitas, anotaciones,
propuestas, días en mercado, visitas web), produce un informe en
markdown con: (1) Diagnóstico de mercado, (2) Análisis de demanda real
del inmueble vs media de la plataforma, (3) Recomendación de ajuste de
precio si procede (con rango €), (4) Próximos pasos accionables.
NO inventes datos que no estén en el contexto. Si faltan datos, di que
faltan."

Devolver el markdown del informe + los datos crudos.

DEJAR HOOK PREPARADO para Idealista (próxima fase): un campo opcional
`idealistaData?` en el contexto del prompt, que de momento se omite. El
plan de Álvaro es enchufar la API más adelante.

En el frontend (componente del informe en OperacionesTab o donde se
genere): un botón "🤖 Generar análisis IA" que llama al endpoint y
renderiza el markdown.

Criterio: con 1 inmueble que tenga 3 visitas y 1 propuesta, el informe
generado debe mencionar esos datos concretos en su análisis. Si los
datos son escasos (inmueble recién publicado, sin visitas), debe decirlo
explícitamente, NO inventar.

═══════════════════════════════════════════════════════════════════════════
VERIFICACIÓN — al terminar las 7 tareas
═══════════════════════════════════════════════════════════════════════════
(a) BD operativa vacía + recargar Operaciones tab → todos los KPIs en 0
    o "Sin datos suficientes". Ningún número fake.
(b) Reservar visita en la web con tel nuevo (+34611111111 inventado):
    → aparece en pestaña Pedidos (no solo en leads).
    → aparece en calendario como pendiente.
    → aparece en OperacionesTab informe como pendiente, NO suma a totales.
(c) Marcar esa visita como completada en CalendarManager:
    → el conteo total sube +1 en el informe.
(d) Crear un inmueble con visitable_slots = [{date:'YYYY-MM-DD',
    slots:['10:00','12:00','17:00']}] y escribir al bot pidiendo visita
    a las 11:00:
    → el bot responde con horas libres (10:00, 12:00, 17:00).
(e) Mismo inmueble, pedir visita a las 10:00 desde un teléfono nuevo:
    → bot pregunta las 3 cosas, al final confirma cita Y se crea en BD
      tanto el appointment como el buyers_demands con perfil rellenado.
(f) Inmueble SIN visitable_slots, pedir visita:
    → bot escala (should_escalate=true) y Álvaro recibe WhatsApp
      `aviso_alvaro`.
(g) Abrir un encargo que tenga visita + propuesta firmada → tab
    Actividad muestra timeline con los dos eventos en orden.
(h) Botón "Generar análisis IA" en un inmueble con datos → markdown
    razonado con cifras reales.

NO marques nada como hecho sin verificar. Si Documenso o Meta están
fuera de juego, reportarlo, no simular.

═══════════════════════════════════════════════════════════════════════════
RECORDATORIOS
═══════════════════════════════════════════════════════════════════════════
- gitnexus_impact ANTES de editar cada símbolo (sobre todo en T4 y T6).
- npm run build VERDE antes de cada commit.
- Migración Supabase con apply_migration si la T7 necesita índices.
- SYNC_AI.md actualizado al final.
- Commits firmados Co-Authored-By: Claude Opus 4.8.
- Push con PAT de .mcp.json.
- Honestidad: T4 punto (d) y (e) son testeables con seed data; T7 (h)
  necesita LLM real disponible (GEMINI_API_KEY en Netlify). Reporta.

Al final, dame reporte tabla:
TAREA 1 [OK / FALLO]: ...
TAREA 2 [OK / FALLO]: ...
...
Verificación: a-OK, b-FALLO porque..., c-OK, ...
```
