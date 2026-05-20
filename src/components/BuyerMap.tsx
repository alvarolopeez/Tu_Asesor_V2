"use client";

import { useEffect, useRef, useState } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Trash2, Undo, MapPin } from "lucide-react";

interface BuyerMapProps {
  area: [number, number][];
  onChange: (points: [number, number][]) => void;
}

export default function BuyerMap({ area, onChange }: BuyerMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const drawnItemsGroupRef = useRef<L.FeatureGroup | null>(null);
  const [points, setPoints] = useState<[number, number][]>(area);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Centered in Sevilla by default
    const map = L.map(mapContainerRef.current, {
      center: [37.3891, -5.9845],
      zoom: 13,
      zoomControl: true,
      scrollWheelZoom: true,
    });

    // Dark theme tiles
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 20,
    }).addTo(map);

    const drawnItems = L.featureGroup().addTo(map);
    drawnItemsGroupRef.current = drawnItems;
    mapRef.current = map;

    // Handle click to add points
    map.on("click", (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      setPoints((prev) => {
        const next = [...prev, [lat, lng] as [number, number]];
        onChange(next);
        return next;
      });
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Sync points with visual elements
  useEffect(() => {
    const map = mapRef.current;
    const drawnItems = drawnItemsGroupRef.current;
    if (!map || !drawnItems) return;

    // Clear existing visuals
    drawnItems.clearLayers();

    // Custom yellow dot icon for vertices
    const markerIcon = L.divIcon({
      className: "custom-div-icon",
      html: `<div class="w-3.5 h-3.5 bg-[#FBBF24] border-2 border-white rounded-full shadow-lg shadow-[#FBBF24]/50 hover:scale-125 transition-transform duration-150 animate-pulse"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });

    // Add markers for each vertex
    points.forEach((point, index) => {
      const marker = L.marker(point, { icon: markerIcon });
      
      // Click marker to remove it
      marker.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        setPoints((prev) => {
          const next = prev.filter((_, i) => i !== index);
          onChange(next);
          return next;
        });
      });

      marker.addTo(drawnItems);
    });

    // Draw lines/polygons
    if (points.length >= 3) {
      const polygon = L.polygon(points, {
        color: "#FBBF24",
        fillColor: "#FBBF24",
        fillOpacity: 0.15,
        weight: 3,
        lineCap: "round",
        lineJoin: "round",
      });
      polygon.addTo(drawnItems);
    } else if (points.length > 0) {
      const polyline = L.polyline(points, {
        color: "#FBBF24",
        weight: 3,
        dashArray: "5, 10",
        lineCap: "round",
      });
      polyline.addTo(drawnItems);
    }
  }, [points, onChange]);

  const handleUndo = () => {
    setPoints((prev) => {
      const next = prev.slice(0, -1);
      onChange(next);
      return next;
    });
  };

  const handleClear = () => {
    setPoints([]);
    onChange([]);
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center bg-slate-50 border border-slate-200/80 px-4 py-2.5 rounded-xl">
        <div className="flex items-center gap-2 text-slate-700 text-sm font-medium">
          <MapPin size={16} className="text-[#FBBF24]" />
          <span>{points.length} puntos seleccionados</span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleUndo}
            disabled={points.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
            title="Deshacer último punto"
          >
            <Undo size={14} />
            <span>Deshacer</span>
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={points.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-100 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-100 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
            title="Borrar todo el área"
          >
            <Trash2 size={14} />
            <span>Borrar</span>
          </button>
        </div>
      </div>

      <div className="relative border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div ref={mapContainerRef} className="h-64 sm:h-80 w-full z-10" />
        
        {points.length === 0 && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex flex-col items-center justify-center pointer-events-none z-20 text-center p-4">
            <div className="bg-[#2C3E50]/90 text-white px-4 py-3 rounded-xl border border-white/10 max-w-sm shadow-xl">
              <p className="font-bold text-sm text-[#FBBF24] mb-1">¡Dibuja tu zona ideal!</p>
              <p className="text-xs text-slate-300">Haz clic en al menos 3 lugares del mapa para rodear las zonas donde quieres vivir en Sevilla.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
