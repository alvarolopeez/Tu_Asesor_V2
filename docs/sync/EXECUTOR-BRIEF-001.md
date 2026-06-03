# BRIEF #001 — Fixes WhatsApp + Firma Documenso secuencial + Panel Encargos

> Este es el segundo mensaje que pegas al chat-ejecutor, después del prompt
> de arranque (`docs/sync/HANDOFF-PROMPT.md`). Si lo abres directamente, lee
> primero el HANDOFF.

---

```
Después del arranque, tienes 6 tareas. Las he ordenado por dependencias.

═══════════════════════════════════════════════════════════════════════════
CONTEXTO — causas raíz ya investigadas, NO especules
═══════════════════════════════════════════════════════════════════════════

INVESTIGACIÓN HECHA EL 2026-06-03:

(A) Bienvenida WhatsApp al registrarse comprador:
    El último lead creado tenía source='web_public', NO 'buyer_registration'.
    Se creó desde `src/lib/appointmentService.ts:77` (agendar visita desde la
    web, no el formulario BuyerRegistrationModal que ya fue parcheado).
    El workflow `Notificacion Nuevo Lead` (QikfXMJumWbpI3wL) tiene 0 ejecuciones
    desde el fix. Hay que cablear `appointmentService.ts` también.

(B) Difusión inteligente: SÍ se llamó (ejecuciones 28, 35 del workflow
    6E0AP0gqLUliPQtN). Status: error. Causa: el nodo "Log Difusion CRM"
    usa $json.property_title pero después de pasar por "Enviar WhatsApp Meta",
    $json contiene la respuesta de Meta (messaging_product, contacts, messages),
    NO los datos de la propiedad. El endpoint /api/webhooks/n8n responde
    400 "Missing lead_id or summary" y el loop SE ROMPE en la 1ª iteración.
    Por eso solo se envió a Juan Pérez (lead seed con +34600111222 ficticio)
    y nunca llegó a los siguientes 11 destinatarios.

    Fix: en el nodo "Log Difusion CRM" cambiar $json.property_title →
    $("Separar Destinatarios").item.json.property_title (y propagar para
    property_price y property_id que también usa).

    Verificar también que el Code node "Separar Destinatarios" tiene la
    versión que calcula property_price_str y property_floor_elevator. En la
    ejecución 35 el output del Code node NO los tenía — posible regresión
    de mi update anterior. Reaplicar el JS si falta.

(C) NINGÚN aviso administrativo al asesor llega.
    Causa raíz común: la ventana 24h de Meta lleva CERRADA 5 días para el
    teléfono 34697223944 (última conversación con el bot: 2026-05-29 15:12).
    Por eso ni el blog diario (workflow tFk38qR62f1yEnuz, status success
    pero Meta no entrega), ni los avisos de escalación del webhook WhatsApp,
    ni los avisos del workflow Documenso "Enviar Documento a Firmar" llegan.

    Fix sistémico: usar una plantilla HSM Utility nueva `aviso_alvaro`.
    Álvaro la crea en Meta y avisará cuando esté aprobada (TAREA SEPARADA,
    fuera de este brief). Por ahora NO toques los avisos del blog ni de
    escalación — dejarlos en texto plano hasta que la plantilla esté Aprobada
    y entonces vendremos a actualizarlos en bloque.

═══════════════════════════════════════════════════════════════════════════
DECISIONES DE ÁLVARO YA TOMADAS — NO le preguntes
═══════════════════════════════════════════════════════════════════════════

1. Firma del asesor: opción A. Documenso secuencial. Álvaro firma PRIMERO,
   luego el cliente. Sin estampa visual.
2. Descarga PDF firmado: opción A. Botón "Descargar PDF firmado" que llama
   a Documenso al pulsar. No copia automática en Supabase Storage.
3. Apartado Encargos: enriquecer la vista actual (componente
   `WarmLeadsManager.tsx`) + crear DENTRO de ese mismo panel una tabla
   nueva "Encargos firmados" con filtros (vencimiento próximo, propiedades
   activas, % comisiones esperado).

═══════════════════════════════════════════════════════════════════════════
TAREAS — en este orden
═══════════════════════════════════════════════════════════════════════════

TAREA 1 — Fix bienvenida (cablear appointmentService.ts):
    En src/lib/appointmentService.ts, tras el insert del lead con
    source='web_public', llamar a /api/n8n/new-lead (mismo patrón que
    BuyerRegistrationModal). Fire-and-forget. NO bloquear la creación de
    la cita si el webhook falla.
    Build verde. Commit. Push.

TAREA 2 — Fix bug del workflow Difusion Inteligente (6E0AP0gqLUliPQtN):
    - Lee el workflow con get_workflow_details.
    - En el nodo "Log Difusion CRM", reemplaza $json.property_title /
      property_price / property_id por
      $("Separar Destinatarios").item.json.* equivalentes.
    - Verifica que el Code node "Separar Destinatarios" tiene la versión
      que produce property_price_str y property_floor_elevator. Si NO los
      tiene, restaurar mi versión (está en SYNC_AI.md de la sesión
      2026-05-31). Usar update_workflow.
    - Importante: Álvaro debe estar en la lista de leads compradores con
      formato +34697223944 (CON el +). Verificar en BD el lead "Alvaro"
      id 3dbe89c7-... — está como 34697223944 sin +. Meta acepta sin + pero
      si el formato es incorrecto Meta puede rechazar silenciosamente.
      Si está como 34697223944 (sin +), normalizar a +34697223944. Lo mismo
      para otros leads con formato local (697223955, 605419388, etc.).

TAREA 3 — Firma secuencial del asesor con Documenso:
    En src/lib/documenso.ts, en la función sendForSignature, añadir
    automáticamente a Álvaro como signingOrder: 1 (PRIMER firmante) y
    desplazar el resto (signingOrder: 2, 3, ...).
    Email del asesor: info@tuasesoralvaro.com.
    Nombre: "Álvaro López Cuevas".
    Documento: la rotación de signingOrder ya existe, solo prepend el
    asesor al array de recipients antes del map.
    Si la categoría del documento es "KYC" o "Parte de visita", NO añadir
    al asesor (el comprador firma solo, son docs unilaterales).
    El campo SIGNATURE para Álvaro también hay que crearlo via
    POST /documents/{id}/fields (en la última página, ya hay lógica para
    múltiples firmantes en columnas).
    Build verde. Probar con un documento real (Álvaro recibirá email).

TAREA 4 — Botón "Descargar PDF firmado" en DocumentsManager:
    Endpoint nuevo: GET /api/documents/[id]/download.
    Recupera documenso_id de generated_documents, llama a
    GET /api/v1/documents/{documenso_id}/download de Documenso, devuelve el
    PDF al cliente con Content-Type application/pdf y Content-Disposition
    attachment.
    En DocumentsManager.tsx, añade un botón "📥 Descargar firmado" que
    SOLO aparece cuando signature_status === 'completed'. Link directo
    al endpoint nuevo.

TAREA 5 — Enriquecer WarmLeadsManager + tabla Encargos firmados:
    (5.1) Para cada seller_lead listado, si tiene un generated_document de
    categoría 'Nota de encargo' con signature_status='completed',
    añade un badge "Encargo activo desde DD/MM/YYYY" + botón ver PDF
    + datos de la firma (firmantes, ID Documenso).

    (5.2) Dentro del componente, añade una segunda vista/tab "Encargos
    firmados": tabla con filtros:
      - Vencimiento próximo (días hasta `fecha_fin` del encargo). Calcular
        desde merged_data.fecha_fin.
      - Propiedades activas (joins con properties).
      - % comisiones esperado (precio * honorarios_pct / 100, IVA aparte).
    Botón por fila: Ver PDF firmado | Estado Documenso | Lead vinculado.
    Si quieres separar en componente nuevo (EncargosFirmadosTable.tsx),
    OK. Mantén el contenedor del panel actual.

TAREA 6 — Verificación end-to-end:
    Al terminar todo:
    (a) Probar un registro real desde la web (agendar una visita) → debería
        crear el lead y disparar el workflow QikfXMJumWbpI3wL. Comprueba
        ejecuciones via mcp__n8n__search_executions.
    (b) Probar una difusión real con Álvaro incluido → workflow
        6E0AP0gqLUliPQtN debe completar los 12 destinatarios sin error.
    (c) Generar una nota de encargo nueva y enviarla a firmar → el primer
        email DEBE llegar a info@tuasesoralvaro.com (Álvaro).
    (d) Marcar el doc como completed manualmente (o si Álvaro firma de
        verdad) → verificar que el botón "Descargar PDF firmado" aparece
        y descarga el PDF correctamente.
    (e) Verificar que la nota firmada aparece en WarmLeadsManager con el
        badge "Encargo activo" + datos.

    NO marques nada como hecho que no hayas verificado.
    Reporta cada (a-e) con OK / FALLO + evidencia.

═══════════════════════════════════════════════════════════════════════════
RECORDATORIOS
═══════════════════════════════════════════════════════════════════════════

- npm run build VERDE antes de cada commit.
- gitnexus_impact sobre cualquier símbolo que toques (especialmente
  sendForSignature y buildSimplePdf, son hubs).
- Workflows n8n: el de Difusión es FIX (ya está roto) → editable directo.
  El nuevo workflow lo creamos en su día con id X2qbhCUWngf9qmJI por si
  necesitas referirte a él.
- Commits firmados Co-Authored-By: Claude Opus 4.8.
- Push con PAT de .mcp.json.
- Honestidad: si algo NO se puede verificar en local (Meta entrega real,
  Documenso real), DILO en el reporte.
- SYNC_AI.md: añade una entrada con los cambios cuando termines.

Al final, dame reporte tipo:
TAREA 1 [OK / FALLO]: ...
TAREA 2 [OK / FALLO]: ...
...
TAREA 6 verificación: a-OK, b-FALLO porque..., c-OK, ...
```
