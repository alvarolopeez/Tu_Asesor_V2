"use client";

/**
 * AddressAutocomplete
 *
 * Autocompletado de direcciones con Nominatim / OpenStreetMap (gratis, sin
 * API key). Al elegir una sugerencia rellena la dirección y devuelve las
 * coordenadas exactas (lat/lng) al formulario padre — el usuario ya no las
 * teclea a mano.
 *
 * Encaja con el stack existente (mapas CartoDB/OSM + Leaflet). Respetamos la
 * política de uso de Nominatim:
 *   - 1 petición/seg → debounce de 600 ms.
 *   - Sesgo a España (countrycodes=es) y a la provincia de Sevilla por
 *     viewbox para mejores resultados locales.
 *
 * @created 2026-06-04 (fix #4)
 */

import { useEffect, useRef, useState } from "react";
import { MapPin, Loader2 } from "lucide-react";

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  place_id: number;
}

interface Props {
  /** Valor inicial del campo dirección. */
  defaultValue?: string;
  /** Se invoca al teclear (texto libre) — mantén la dirección en el form. */
  onTextChange: (text: string) => void;
  /** Se invoca al elegir una sugerencia: dirección + coordenadas exactas. */
  onSelect: (address: string, lat: number, lon: number) => void;
  placeholder?: string;
  className?: string;
}

export default function AddressAutocomplete({ defaultValue = "", onTextChange, onSelect, placeholder, className }: Props) {
  const [query, setQuery] = useState(defaultValue);
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSearch = useRef(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Sincroniza si el padre cambia el valor (p.ej. al abrir en modo edición).
  useEffect(() => { setQuery(defaultValue); }, [defaultValue]);

  // Cierra el dropdown al hacer click fuera.
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (skipNextSearch.current) { skipNextSearch.current = false; return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 4) { setResults([]); setOpen(false); return; }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        // Sesgo a España + viewbox amplio de Andalucía occidental (Sevilla).
        const params = new URLSearchParams({
          q,
          format: "json",
          addressdetails: "1",
          limit: "5",
          countrycodes: "es",
          "accept-language": "es",
        });
        const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
          headers: { "Accept": "application/json" },
        });
        if (!res.ok) throw new Error(`Nominatim ${res.status}`);
        const data = (await res.json()) as NominatimResult[];
        setResults(data);
        setOpen(data.length > 0);
      } catch (err) {
        console.warn("[AddressAutocomplete] Nominatim error:", err);
        setResults([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 600);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const handleSelect = (r: NominatimResult) => {
    skipNextSearch.current = true; // evita re-buscar al setear el texto elegido
    setQuery(r.display_name);
    setOpen(false);
    setResults([]);
    const lat = parseFloat(r.lat);
    const lon = parseFloat(r.lon);
    onSelect(r.display_name, lat, lon);
  };

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <MapPin size={15} />}
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onTextChange(e.target.value);
          }}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          placeholder={placeholder || "Empieza a escribir la dirección..."}
          className={className || "w-full bg-[#0F172A] border border-white/10 rounded-xl py-2.5 pl-9 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all text-sm"}
          autoComplete="off"
        />
      </div>
      {open && results.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full bg-[#1E293B] border border-white/10 rounded-xl shadow-2xl max-h-60 overflow-y-auto">
          {results.map((r) => (
            <li key={r.place_id}>
              <button
                type="button"
                onClick={() => handleSelect(r)}
                className="w-full text-left px-4 py-2.5 text-xs text-slate-200 hover:bg-[#FBBF24]/10 hover:text-white transition-all flex items-start gap-2 border-b border-white/5 last:border-0"
              >
                <MapPin size={13} className="text-[#FBBF24] shrink-0 mt-0.5" />
                <span className="leading-snug">{r.display_name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
