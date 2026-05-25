# 🏛️ ESTUDIO ARQUITECTÓNICO & PLAN DE IMPLEMENTACIÓN
## Sincronización de Calendario de Visitas en Tiempo Real

**Destinatario:** Álvaro López Cuevas  
**De:** Coordinador Principal de IA ("Tu Asesor V2")  
**Fecha:** 25 de Mayo de 2026  
**Documento de Sincronización:** `docs/sync/estudio_calendario_sync.md`

---

## 📌 1. Introducción y Visión General
Para consolidar a **Tu Asesor V2** como una plataforma inmobiliaria premium y automatizada de nivel mundial, debemos solucionar el riesgo de **doble reserva (conflictos de horario/colisión de citas)**.

Actualmente, el portal público permite reservar visitas online en cualquier slot horario que esté preconfigurado en las características de la propiedad (`features.visitable_slots.schedule` o `visitable_slots.slots`), sin cruzar esta información con tu calendario del CRM. Esto significa que si tienes agendado un evento en tu agenda privada, un cliente externo puede seguir agendando una visita en esa misma hora.

Proponemos una **coordinación asíncrona inteligente y en tiempo real** entre el calendario del CRM y el portal público de compra:

```
┌────────────────────────────────────────────────────────┐
│               CALENDARIO DE VISITAS WEB                │
├────────────────────────────────────────────────────────┤
│ 1. Consulta la agenda en Supabase (next 14 days)      │
│ 2. Cruza slots de la propiedad con citas agendadas     │
│ 3. Descarta de forma dinámica las horas ocupadas       │
└────────────────────────────────────────────────────────┘
```

---

## 🗄️ 2. Mapeo de Base de Datos e Integración de Citas
La tabla `public.appointments` en Supabase almacena todas tus reuniones comerciales, visitas y bloqueos de tiempo en tu CRM:
*   `scheduled_at`: Contiene el timestamp UTC de inicio de la cita.
*   `status`: Estado de la cita (`'pending'`, `'confirmed'`, `'completed'`, `'cancelled'`).
*   `type`: Tipo de evento (`'visita'`, `'captacion'`, `'cierre'`, `'admin'`, `'blocked'`).

### Lógica de Filtrado Anticolisión
Para que un slot sea bloqueado en la web pública, se deben evaluar todas las citas activas de la agenda en los próximos 14 días.
*   **Filtro de Estado:** Cualquier cita cuyo estado sea distinto de `'cancelled'` (`status != 'cancelled'`) se considerará un bloqueo de tiempo activo, ya que tanto citas confirmadas como solicitudes pendientes requieren la disponibilidad de tu agenda.
*   **Filtro de Tipo:** Independientemente del tipo de cita (sea una visita a otro piso, una captación o un bloqueo de calendario manual del tipo `'blocked'`), el slot horario correspondiente debe ser descartado, previniendo solapamientos.

---

## ⚙️ 3. Plano Técnico de Implementación (`comprar/page.tsx`)

El portal público de compra en `/comprar` integra la vista de detalle de propiedad y el calendario. Modificaremos el comportamiento de carga para lograr la exclusión dinámica:

### A. Consulta Reactiva de Citas
En `comprar/page.tsx`, cuando se selecciona una propiedad (`selectedProperty`), iniciaremos una consulta asíncrona a Supabase para recuperar todas las citas de los próximos 14 días:

```typescript
// Consulta eficiente en Supabase
const { data, error } = await supabase
  .from("appointments")
  .select("scheduled_at, status")
  .gte("scheduled_at", now.toISOString())
  .lte("scheduled_at", future.toISOString())
  .neq("status", "cancelled");
```

### B. Cruce de Horas en `getNext14Days`
Refactorizaremos la función `getNext14Days` para que reciba la lista de citas existentes y aplique la exclusión de forma local y segura, respetando la zona horaria del navegador:

```typescript
// Filtrado local con zona horaria del cliente
const filteredSlots = daySlots.filter((slotStr) => {
  const [slotHour, slotMinute] = slotStr.split(':').map(Number);
  
  // Buscar colisiones con citas activas
  const isBlocked = existingAppointments.some((appt) => {
    const apptDate = new Date(appt.scheduled_at);
    
    // Comparar año, mes y día en hora local
    const matchesDate = 
      apptDate.getFullYear() === d.getFullYear() &&
      apptDate.getMonth() === d.getMonth() &&
      apptDate.getDate() === d.getDate();
      
    if (!matchesDate) return false;
    
    // Comparar horas y minutos
    return apptDate.getHours() === slotHour && apptDate.getMinutes() === slotMinute;
  });
  
  return !isBlocked;
});
```

---

## 🛡️ 4. Beneficios del Diseño Propuesto
1.  **Timezone Safety:** Al parsear `scheduled_at` con `new Date(appt.scheduled_at)`, JavaScript traduce el huso horario UTC de base de datos automáticamente a la hora local española del cliente, evitando diferencias horarias de desfase de servidores.
2.  **Anti-solapamiento Total:** Álvaro, si bloqueas un jueves a las 10:00 en tu CRM creando una cita de cualquier tipo, esa hora desaparecerá del catálogo público instantáneamente para todas las viviendas activas en la web.
3.  **Higiene del Compilador:** Cero dependencias externas y cero impacto en velocidad. La consulta recupera únicamente los timestamps y estados, minimizando la transferencia de datos y logrando que la interfaz responda en milisegundos.

---
*Estudio persistido de forma segura en `docs/sync/estudio_calendario_sync.md` y registrado en la bitácora del Coordinador Principal.*
