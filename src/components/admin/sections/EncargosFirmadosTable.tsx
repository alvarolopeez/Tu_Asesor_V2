"use client";

/**
 * EncargosFirmadosTable
 *
 * Vista derivada del módulo "Warm CRM" (`WarmLeadsManager`). Lista todas las
 * **notas de encargo en exclusiva FIRMADAS** (`signature_status='completed'`)
 * en una tabla con filtros y métricas operativas:
 *
 *  - Vencimiento (calculado desde merged_data.fecha_inicio + duracion_meses,
 *    o como fallback signed_at + duracion_meses por defecto 6 meses).
 *  - Propiedades activas vinculadas (cuenta `properties` cuyo id está en
 *    `lead.property_id` para los seller_leads listados).
 *  - Honorarios esperados = valor_referencia * (honorarios_pct / 100).
 *  - Atajo a "Ver PDF firmado" (proxy `/api/documents/{id}/download`).
 *  - Atajo a abrir el lead en el drawer del WarmLeadsManager.
 *
 * Recibe los datos ya cargados (encargos + properties + map vendedores) desde
 * el contenedor padre para evitar duplicar queries y mantener una sola
 * fuente de verdad sobre los leads.
 *
 * @created 2026-06-03 (tarea 5.2)
 */

import React, { useMemo, useState } from "react";
import { Download, MapPin, AlertTriangle, CheckCircle, Calendar, Eye, Search, Briefcase, Home } from "lucide-react";
import type { Lead } from "@/types";
import { formatCurrency } from "@/lib/utils";

/**
 * Forma de un encargo firmado tal y como lo monta `WarmLeadsManager` antes
 * de pasárselo a esta tabla. NO viene tal cual de la BD; el padre fusiona
 * `generated_documents` + `leads` + `properties` ya filtrados.
 */
export interface SignedEncargo {
  id: string;
  seller_lead_id: string | null;
  documenso_id: string | null;
  /** ISO timestamp aproximado de la firma (updated_at del documento cuando
   *  pasó a `completed`). */
  signed_at: string;
  /** merged_data del documento (raw jsonb). */
  merged_data: Record<string, unknown>;
  /** Lead vendedor asociado (para nombre, teléfono, etc.). */
  lead: Lead | null;
  /** Conteo de propiedades activas vinculadas a este lead (status='active'). */
  active_properties: number;
  /** Comisión esperada en € (estimación, IVA aparte). */
  expected_fee: number;
  /** Fecha de fin de exclusividad (calculada). */
  expiry_date: Date | null;
}

type VencFilter = "all" | "soon" | "expired" | "future";

interface Props {
  encargos: SignedEncargo[];
  onOpenLead?: (lead: Lead) => void;
}

const VENC_OPTIONS: { value: VencFilter; label: string }[] = [
  { value: "all", label: "Todos los vencimientos" },
  { value: "soon", label: "Vencen en ≤30 días" },
  { value: "expired", label: "Ya vencidos" },
  { value: "future", label: "Vencen > 30 días" },
];

function daysUntil(d: Date | null): number | null {
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function EncargosFirmadosTable({ encargos, onOpenLead }: Props) {
  const [search, setSearch] = useState("");
  const [vencFilter, setVencFilter] = useState<VencFilter>("all");
  const [onlyActive, setOnlyActive] = useState(false);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return encargos.filter((e) => {
      if (term) {
        const haystack = [
          e.lead?.name,
          e.lead?.phone,
          (e.merged_data as any)?.inmueble?.direccion,
          (e.merged_data as any)?.["inmueble.direccion"],
        ]
          .filter(Boolean)
          .map((s) => String(s).toLowerCase())
          .join(" ");
        if (!haystack.includes(term)) return false;
      }
      if (onlyActive && e.active_properties === 0) return false;
      if (vencFilter !== "all") {
        const du = daysUntil(e.expiry_date);
        if (du === null) return false;
        if (vencFilter === "expired" && du >= 0) return false;
        if (vencFilter === "soon" && (du < 0 || du > 30)) return false;
        if (vencFilter === "future" && du <= 30) return false;
      }
      return true;
    });
  }, [encargos, search, vencFilter, onlyActive]);

  // KPIs agregados de los encargos filtrados.
  const kpi = useMemo(() => {
    const total = filtered.length;
    const expiringSoon = filtered.filter((e) => {
      const du = daysUntil(e.expiry_date);
      return du !== null && du >= 0 && du <= 30;
    }).length;
    const activeProps = filtered.reduce((sum, e) => sum + e.active_properties, 0);
    const totalFees = filtered.reduce((sum, e) => sum + e.expected_fee, 0);
    return { total, expiringSoon, activeProps, totalFees };
  }, [filtered]);

  return (
    <div className="space-y-4">
      {/* KPIs específicos de encargos */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[#1E293B]/40 border border-white/5 p-4 rounded-xl backdrop-blur-md">
          <span className="text-[10px] text-slate-400 font-medium block uppercase tracking-wider">Encargos firmados</span>
          <span className="text-2xl font-extrabold text-white mt-1 block">{kpi.total}</span>
        </div>
        <div className="bg-[#1E293B]/40 border border-white/5 p-4 rounded-xl backdrop-blur-md">
          <span className="text-[10px] text-slate-400 font-medium block uppercase tracking-wider">Vencen ≤30 días</span>
          <span className="text-2xl font-extrabold text-amber-400 mt-1 block">{kpi.expiringSoon}</span>
        </div>
        <div className="bg-[#1E293B]/40 border border-white/5 p-4 rounded-xl backdrop-blur-md">
          <span className="text-[10px] text-slate-400 font-medium block uppercase tracking-wider">Propiedades activas</span>
          <span className="text-2xl font-extrabold text-sky-400 mt-1 block">{kpi.activeProps}</span>
        </div>
        <div className="bg-[#1E293B]/40 border border-white/5 p-4 rounded-xl backdrop-blur-md">
          <span className="text-[10px] text-slate-400 font-medium block uppercase tracking-wider">Honorarios esperados</span>
          <span className="text-xl font-black text-emerald-400 mt-1 block tracking-tight">{formatCurrency(kpi.totalFees)}</span>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-[#1E293B]/40 border border-white/5 p-4 rounded-2xl backdrop-blur-md grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
        <div className="relative">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search size={16} />
          </span>
          <input
            type="text"
            placeholder="Buscar por propietario o dirección..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#0F172A]/50 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#FBBF24] transition-all"
          />
        </div>
        <select
          value={vencFilter}
          onChange={(e) => setVencFilter(e.target.value as VencFilter)}
          className="w-full bg-[#0F172A]/50 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#FBBF24] transition-all"
        >
          {VENC_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-xs text-slate-300 bg-[#0F172A]/50 border border-white/10 rounded-xl px-3 py-2.5 cursor-pointer hover:border-[#FBBF24]/30 transition-all">
          <input
            type="checkbox"
            checked={onlyActive}
            onChange={(e) => setOnlyActive(e.target.checked)}
            className="accent-[#FBBF24]"
          />
          Sólo con propiedades activas
        </label>
      </div>

      {/* Tabla */}
      <div className="bg-[#1E293B]/20 border border-white/5 rounded-2xl shadow-xl overflow-hidden backdrop-blur-md">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Briefcase className="mx-auto text-slate-500 mb-3" size={36} />
            <p className="text-slate-300 font-bold text-sm">Sin encargos que mostrar</p>
            <p className="text-slate-500 text-xs mt-1">Cuando una Nota de Encargo se firme en Documenso, aparecerá aquí.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-[#0F172A]/40 text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                  <th className="py-3 px-5">Propietario</th>
                  <th className="py-3 px-5">Inmueble</th>
                  <th className="py-3 px-5">Firmado</th>
                  <th className="py-3 px-5">Vencimiento</th>
                  <th className="py-3 px-5">Propiedades activas</th>
                  <th className="py-3 px-5">Honorarios esperados</th>
                  <th className="py-3 px-5 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((e) => {
                  const md = e.merged_data as any;
                  const inmuebleDir =
                    md?.["inmueble.direccion"] ||
                    md?.inmueble?.direccion ||
                    md?.["property.address"] ||
                    "—";
                  const du = daysUntil(e.expiry_date);
                  const vencCls =
                    du === null
                      ? "text-slate-400 border-slate-500/20 bg-slate-500/10"
                      : du < 0
                      ? "text-rose-300 border-rose-500/30 bg-rose-500/10"
                      : du <= 30
                      ? "text-amber-300 border-amber-500/30 bg-amber-500/10"
                      : "text-emerald-300 border-emerald-500/30 bg-emerald-500/10";
                  const vencLabel =
                    du === null
                      ? "—"
                      : du < 0
                      ? `Vencido hace ${Math.abs(du)} d`
                      : du === 0
                      ? "Vence hoy"
                      : `Vence en ${du} d`;
                  return (
                    <tr key={e.id} className="hover:bg-white/[0.03] transition-all group">
                      <td className="py-3 px-5">
                        {e.lead ? (
                          <button
                            onClick={() => onOpenLead?.(e.lead!)}
                            className="text-left"
                          >
                            <span className="font-bold text-white text-sm block group-hover:text-[#FBBF24] transition-all">{e.lead.name}</span>
                            {e.lead.phone && (
                              <span className="text-[10px] text-slate-400">{e.lead.phone}</span>
                            )}
                          </button>
                        ) : (
                          <span className="text-slate-500 text-xs italic">Lead no vinculado</span>
                        )}
                      </td>
                      <td className="py-3 px-5 text-slate-300 text-xs max-w-[220px] truncate">
                        <span className="flex items-center gap-1.5">
                          <MapPin size={12} className="text-slate-500 shrink-0" />
                          {inmuebleDir}
                        </span>
                      </td>
                      <td className="py-3 px-5 text-slate-300 text-xs">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle size={12} className="text-emerald-400" />
                          {formatDate(e.signed_at)}
                        </span>
                      </td>
                      <td className="py-3 px-5">
                        <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full border flex items-center gap-1.5 w-fit ${vencCls}`}>
                          {du !== null && du <= 30 && <AlertTriangle size={10} />}
                          {du === null ? <Calendar size={10} /> : null}
                          {vencLabel}
                        </span>
                        <span className="text-[10px] text-slate-500 mt-1 block">{formatDate(e.expiry_date)}</span>
                      </td>
                      <td className="py-3 px-5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            e.active_properties > 0
                              ? "text-sky-300 border-sky-500/30 bg-sky-500/10"
                              : "text-slate-400 border-slate-500/20 bg-slate-500/10"
                          }`}
                        >
                          <Home size={10} className="inline mr-1" />
                          {e.active_properties}
                        </span>
                      </td>
                      <td className="py-3 px-5 font-semibold text-emerald-300 text-xs">
                        {formatCurrency(e.expected_fee)}
                      </td>
                      <td className="py-3 px-5 text-center" onClick={(ev) => ev.stopPropagation()}>
                        <div className="flex items-center justify-center gap-2">
                          {e.documenso_id && (
                            <a
                              href={`/api/documents/${e.id}/download`}
                              className="p-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500 text-emerald-300 hover:text-white border border-emerald-500/20 transition-all hover:scale-105"
                              title="Descargar PDF firmado"
                            >
                              <Download size={14} />
                            </a>
                          )}
                          {e.lead && onOpenLead && (
                            <button
                              onClick={() => onOpenLead(e.lead!)}
                              className="p-2 rounded-lg bg-white/5 hover:bg-[#FBBF24]/10 text-slate-300 hover:text-[#FBBF24] border border-white/5 transition-all hover:scale-105"
                              title="Abrir ficha del vendedor"
                            >
                              <Eye size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
