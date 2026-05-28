import { ChevronLeft, ChevronRight, Grid, List, Plus } from "lucide-react";

interface CalendarToolbarProps {
  /** Las 6 fechas (Lun→Sáb) de la semana visible, para el rótulo de rango. */
  weekDates: Date[];
  viewMode: "grid" | "route";
  onViewModeChange: (mode: "grid" | "route") => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onJumpToToday: () => void;
  /** Callback al pulsar "Nueva Cita / Bloqueo". */
  onNewClick: () => void;
}

/** Barra de navegación semanal + selector de vista + botón de alta. */
export default function CalendarToolbar({
  weekDates,
  viewMode,
  onViewModeChange,
  onPrevWeek,
  onNextWeek,
  onJumpToToday,
  onNewClick,
}: CalendarToolbarProps) {
  return (
    <div className="bg-[#1E293B] p-5 rounded-2xl border border-white/5 flex flex-col md:flex-row justify-between items-center gap-4 shadow-xl">

      {/* Navigation */}
      <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-start">
        <div className="flex items-center gap-1">
          <button
            onClick={onPrevWeek}
            className="p-2 hover:bg-white/5 rounded-xl border border-white/5 text-slate-300 transition-colors"
            title="Semana anterior"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={onJumpToToday}
            className="px-4 py-2 hover:bg-white/5 rounded-xl border border-white/5 text-slate-200 text-sm font-semibold transition-colors"
          >
            Hoy
          </button>
          <button
            onClick={onNextWeek}
            className="p-2 hover:bg-white/5 rounded-xl border border-white/5 text-slate-300 transition-colors"
            title="Semana siguiente"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <h2 className="text-white font-bold text-sm md:text-lg">
          Semana del {weekDates[0].toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} al {weekDates[5].toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
        </h2>
      </div>

      {/* View Toggle */}
      <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
        <div className="bg-slate-900 p-1 rounded-xl border border-white/5 flex">
          <button
            onClick={() => onViewModeChange('grid')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${viewMode === 'grid' ? 'bg-[#FBBF24] text-[#2C3E50]' : 'text-slate-400 hover:text-white'}`}
          >
            <Grid className="w-4 h-4" /> Cuadrícula Semanal
          </button>
          <button
            onClick={() => onViewModeChange('route')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${viewMode === 'route' ? 'bg-[#FBBF24] text-[#2C3E50]' : 'text-slate-400 hover:text-white'}`}
          >
            <List className="w-4 h-4" /> Lista de Ruta (Móvil)
          </button>
        </div>

        <button
          onClick={onNewClick}
          className="flex items-center gap-2 bg-[#FBBF24] hover:bg-yellow-500 text-[#2C3E50] font-bold text-xs px-4 py-2.5 rounded-xl transition-all shadow-md shadow-[#FBBF24]/10 shrink-0"
        >
          <Plus className="w-4 h-4" /> Nueva Cita / Bloqueo
        </button>
      </div>

    </div>
  );
}
