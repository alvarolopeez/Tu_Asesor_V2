import { Clock, PlusCircle } from "lucide-react";
import { TIME_SLOTS, DAYS_OF_WEEK } from "./types";
import type { AppointmentWithRelations } from "./types";
import { getBadgeStyle, getAppointmentForSlot, getAppointmentTitle } from "./calendarUtils";

interface WeekGridViewProps {
  weekDates: Date[];
  appointments: AppointmentWithRelations[];
  /** Día activo en la vista móvil de un solo día (índice 0=Lun … 5=Sáb). */
  selectedDayIndex: number;
  onSelectDay: (idx: number) => void;
  /** Crear cita en un slot vacío. */
  onSlotCreate: (date: Date, timeSlot: string) => void;
  /** Abrir una cita existente para editarla. */
  onApptEdit: (appt: AppointmentWithRelations) => void;
  /** Bloquear la agenda completa de un día. */
  onBlockDay: (date: Date) => void;
}

/**
 * Cuerpo del calendario en modo cuadrícula:
 * grid semanal (desktop) + vista de un único día con pestañas (móvil).
 */
export default function WeekGridView({
  weekDates,
  appointments,
  selectedDayIndex,
  onSelectDay,
  onSlotCreate,
  onApptEdit,
  onBlockDay,
}: WeekGridViewProps) {
  return (
    <>
      {/* Desktop Weekly Grid */}
      <div className="hidden md:block bg-[#1E293B] rounded-2xl border border-white/5 overflow-hidden shadow-2xl">

        <div className="overflow-x-auto">
          <div className="min-w-[900px]">

            {/* Header Days Row */}
            <div className="grid grid-cols-7 border-b border-white/5 bg-slate-900/60 sticky top-0 z-10">
              <div className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-center border-r border-white/5 flex items-center justify-center">
                Hora
              </div>
              {weekDates.map((date, idx) => {
                const isToday = new Date().toDateString() === date.toDateString();
                return (
                  <div
                    key={idx}
                    className={`p-3 text-center border-r border-white/5 flex flex-col justify-center relative ${isToday ? 'bg-[#FBBF24]/5' : ''}`}
                  >
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{DAYS_OF_WEEK[idx]}</span>
                    <span className={`text-lg font-black mt-0.5 ${isToday ? 'text-[#FBBF24]' : 'text-white'}`}>
                      {date.getDate()}
                    </span>
                    {isToday && (
                      <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#FBBF24] shadow-md shadow-[#FBBF24]/50" />
                    )}

                    {/* Bloqueo rápido de día */}
                    <button
                      onClick={() => onBlockDay(date)}
                      className="text-[9px] hover:text-red-400 text-slate-500 font-semibold absolute top-1 right-2 transition-colors"
                      title="Bloquear día completo"
                    >
                      Bloquear
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Grid Body */}
            <div className="divide-y divide-white/5">
              {TIME_SLOTS.map((timeSlot) => (
                <div key={timeSlot} className="grid grid-cols-7 group/row">

                  {/* Hour Column */}
                  <div className="py-2.5 px-3 text-xs font-semibold text-slate-400 bg-slate-900/20 border-r border-white/5 flex items-center justify-center gap-1.5 select-none">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    {timeSlot}
                  </div>

                  {/* Day Columns */}
                  {weekDates.map((date, dayIdx) => {
                    const appt = getAppointmentForSlot(appointments, date, timeSlot);
                    const isToday = new Date().toDateString() === date.toDateString();

                    return (
                      <div
                        key={dayIdx}
                        className={`p-1.5 min-h-[60px] border-r border-white/5 transition-all relative group flex flex-col justify-stretch ${isToday ? 'bg-[#FBBF24]/[0.01]' : ''} hover:bg-white/[0.02]`}
                      >
                        {appt ? (
                          // Render Slot Event Card
                          (() => {
                            const style = getBadgeStyle(appt.type || "visita");
                            const eventTitle = getAppointmentTitle(appt);

                            // Solo renderizar el inicio real en el slot de tiempo correspondiente (evitar repetir visualmente)
                            const apptDate = new Date(appt.scheduled_at);
                            const apptHours = String(apptDate.getHours()).padStart(2, '0');
                            const apptMinutes = String(apptDate.getMinutes()).padStart(2, '0');
                            const apptTime = `${apptHours}:${apptMinutes}`;

                            if (apptTime !== timeSlot) {
                              // Devolver un div fantasma con diseño continuado de fondo
                              return (
                                <div className={`text-[10px] py-1 px-2 rounded-lg border border-dashed flex items-center justify-center opacity-40 select-none ${style.bg}`}>
                                  (continuación)
                                </div>
                              );
                            }

                            return (
                              <div
                                onClick={() => onApptEdit(appt)}
                                className={`rounded-xl p-2 border transition-all text-left flex flex-col justify-between cursor-pointer select-none shadow-md h-full relative overflow-hidden group ${style.bg}`}
                              >
                                {/* Color Indicator tag */}
                                <div className="flex items-center gap-1.5 mb-1">
                                  <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                                  <span className="text-[9px] uppercase tracking-wider font-extrabold opacity-80">{style.label}</span>
                                </div>

                                <p className="text-[11px] font-black text-white leading-tight line-clamp-1">
                                  {eventTitle}
                                </p>

                                {appt.properties?.title && appt.type !== 'blocked' && (
                                  <span className="text-[9px] text-slate-300 mt-1 line-clamp-1 italic">
                                    🏠 {appt.properties.title}
                                  </span>
                                )}

                                {appt.location && (
                                  <span className="text-[9px] text-slate-400 mt-0.5 line-clamp-1 flex items-center gap-0.5">
                                    📍 {appt.location}
                                  </span>
                                )}
                              </div>
                            );
                          })()
                        ) : (
                          // Empty slot (Hover creation helper)
                          <button
                            onClick={() => onSlotCreate(date, timeSlot)}
                            className="w-full h-full rounded-xl border border-dashed border-white/0 group-hover:border-white/10 group-hover:bg-white/5 flex items-center justify-center text-slate-500 opacity-0 group-hover:opacity-100 transition-all py-3 gap-1"
                          >
                            <PlusCircle className="w-4 h-4 text-[#FBBF24]" />
                            <span className="text-[10px] font-bold text-slate-400">Agendar</span>
                          </button>
                        )}
                      </div>
                    );
                  })}

                </div>
              ))}
            </div>

          </div>
        </div>

      </div>

      {/* Mobile Single-Day Grid View */}
      <div className="block md:hidden space-y-4">

        {/* Horizontal Day Selector Tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-hide">
          {weekDates.map((date, idx) => {
            const isSelected = selectedDayIndex === idx;
            const isToday = new Date().toDateString() === date.toDateString();
            return (
              <button
                key={idx}
                type="button"
                onClick={() => onSelectDay(idx)}
                className={`flex flex-col items-center justify-center px-4 py-2.5 rounded-xl border min-w-[70px] transition-all relative ${
                  isSelected
                    ? "bg-[#FBBF24] border-[#FBBF24] text-[#2C3E50]"
                    : "bg-[#1E293B] border-white/5 text-slate-300 hover:text-white"
                }`}
              >
                <span className="text-[10px] uppercase font-bold tracking-wider opacity-85">
                  {DAYS_OF_WEEK[idx].substring(0, 3)}
                </span>
                <span className="text-base font-extrabold mt-0.5">{date.getDate()}</span>
                {isToday && !isSelected && (
                  <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-[#FBBF24]" />
                )}
                {isToday && isSelected && (
                  <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-slate-900" />
                )}
              </button>
            );
          })}
        </div>

        {/* Quick Full Day Block for Selected Day */}
        <div className="bg-[#1E293B] p-3 rounded-xl border border-white/5 flex items-center justify-between">
          <span className="text-xs text-slate-400 font-medium">
            Agenda del {DAYS_OF_WEEK[selectedDayIndex]} {weekDates[selectedDayIndex].getDate()}
          </span>
          <button
            type="button"
            onClick={() => onBlockDay(weekDates[selectedDayIndex])}
            className="text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-3 py-1.5 rounded-lg font-bold transition-all"
          >
            Bloquear Día Completo
          </button>
        </div>

        {/* Vertical Single Day Time slots */}
        <div className="bg-[#1E293B] rounded-2xl border border-white/5 divide-y divide-white/5 overflow-hidden shadow-2xl">
          {TIME_SLOTS.map((timeSlot) => {
            const date = weekDates[selectedDayIndex];
            const appt = getAppointmentForSlot(appointments, date, timeSlot);

            return (
              <div key={timeSlot} className="flex min-h-[64px] items-stretch">
                {/* Hour Column */}
                <div className="w-20 shrink-0 bg-slate-900/40 border-r border-white/5 flex flex-col items-center justify-center text-xs font-bold text-slate-400 px-2">
                  <Clock className="w-3.5 h-3.5 text-slate-500 mb-0.5" />
                  {timeSlot}
                </div>

                {/* Event Pill Column */}
                <div className="flex-1 p-2 flex flex-col justify-stretch">
                  {appt ? (
                    (() => {
                      const style = getBadgeStyle(appt.type || "visita");
                      const eventTitle = getAppointmentTitle(appt);

                      const apptDate = new Date(appt.scheduled_at);
                      const apptHours = String(apptDate.getHours()).padStart(2, '0');
                      const apptMinutes = String(apptDate.getMinutes()).padStart(2, '0');
                      const apptTime = `${apptHours}:${apptMinutes}`;

                      if (apptTime !== timeSlot) {
                        return (
                          <div className={`text-[10px] py-1 px-3 rounded-lg border border-dashed flex items-center justify-center opacity-40 select-none ${style.bg} h-full`}>
                            (continuación)
                          </div>
                        );
                      }

                      return (
                        <div
                          onClick={() => onApptEdit(appt)}
                          className={`rounded-xl p-2.5 border transition-all text-left flex flex-col justify-between cursor-pointer select-none shadow-md h-full relative overflow-hidden group ${style.bg}`}
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                            <span className="text-[9px] uppercase tracking-wider font-extrabold opacity-80">{style.label}</span>
                          </div>

                          <p className="text-xs font-black text-white leading-tight">
                            {eventTitle}
                          </p>

                          {appt.properties?.title && appt.type !== 'blocked' && (
                            <span className="text-[10px] text-slate-300 mt-1 italic block">
                              🏠 {appt.properties.title}
                            </span>
                          )}

                          {appt.location && (
                            <span className="text-[10px] text-slate-400 mt-1 block">
                              📍 {appt.location}
                            </span>
                          )}
                        </div>
                      );
                    })()
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSlotCreate(date, timeSlot)}
                      className="w-full h-full rounded-xl border border-dashed border-white/5 hover:border-[#FBBF24]/30 hover:bg-white/5 flex items-center justify-center text-slate-500 hover:text-[#FBBF24] transition-all py-3 gap-1.5"
                    >
                      <PlusCircle className="w-4 h-4 text-[#FBBF24]" />
                      <span className="text-xs font-bold text-slate-400">Agendar slot</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </>
  );
}
