"use client";

import { useEffect, useRef, useState } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Trash2, Undo, MapPin, Check, Pencil, X, Plus } from "lucide-react";

interface BuyerMapProps {
  polygons: [number, number][][];
  onChange: (polygons: [number, number][][]) => void;
  isOpen: boolean;
  onClose: () => void;
}

export default function BuyerMap({ polygons, onChange, isOpen, onClose }: BuyerMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const polygonLayerGroupRef = useRef<L.FeatureGroup | null>(null);
  
  // Local active state to allow discarding unless saved
  const [localPolygons, setLocalPolygons] = useState<[number, number][][]>(polygons);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [showDrawingOptions, setShowDrawingOptions] = useState(false);
  const [isDrawingGestureActive, setIsDrawingGestureActive] = useState(false);

  // Refs for tracking drawing states in event handlers
  const isDrawingModeRef = useRef(false);
  const isDrawingGestureRef = useRef(false);
  const currentPointsRef = useRef<L.LatLng[]>([]);
  const tempPolylineRef = useRef<L.Polyline | null>(null);
  const forceMapRedrawRef = useRef<(() => void) | null>(null);

  // Stable function to call forceMapRedraw from state-update callbacks
  const forceMapRedraw = () => forceMapRedrawRef.current?.();

  // Keep state sync
  useEffect(() => {
    isDrawingModeRef.current = isDrawingMode;
  }, [isDrawingMode]);

  // Keep localPolygons updated if initial prop changes (e.g. reset)
  useEffect(() => {
    setLocalPolygons(polygons);
  }, [polygons]);

  // Initialize Map
  useEffect(() => {
    if (!isOpen || !mapContainerRef.current || mapRef.current) return;

    // Centered in Sevilla
    const map = L.map(mapContainerRef.current, {
      center: [37.3891, -5.9845],
      zoom: 13,
      zoomControl: false, // Position control manually for custom styling
      scrollWheelZoom: true,
      doubleClickZoom: true,
    });

    // Add bright street tiles (CartoDB Voyager - avoids adblockers and offers high quality)
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 20,
    }).addTo(map);

    // Custom zoom control in bottom-right
    L.control.zoom({ position: "bottomright" }).addTo(map);

    const polygonGroup = L.featureGroup().addTo(map);
    polygonLayerGroupRef.current = polygonGroup;
    mapRef.current = map;

    const container = mapContainerRef.current;

    // Professional ResizeObserver to handle modal fade-in transition, resizing, and all layout shifts automatically.
    // This solves the blank map viewport/tile-loading bug comprehensively.
    const resizeObserver = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.invalidateSize();
      }
    });
    resizeObserver.observe(container);

    // Pointer gesture event listeners for freehand drawing

    const handlePointerDown = (e: PointerEvent) => {
      if (!isDrawingModeRef.current || !mapRef.current) return;
      
      // Stop Leaflet map dragging and browser gestures
      e.stopPropagation();
      e.preventDefault();
      
      isDrawingGestureRef.current = true;
      setIsDrawingGestureActive(true);
      currentPointsRef.current = [];

      const latlng = mapRef.current.mouseEventToLatLng(e);
      currentPointsRef.current.push(latlng);

      if (tempPolylineRef.current) {
        tempPolylineRef.current.remove();
      }

      tempPolylineRef.current = L.polyline([latlng], {
        color: "#FBBF24", // Golden-yellow brand color
        weight: 4,
        dashArray: "6, 8",
        lineCap: "round",
        lineJoin: "round",
      }).addTo(mapRef.current);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isDrawingGestureRef.current || !mapRef.current || !tempPolylineRef.current) return;

      e.stopPropagation();
      e.preventDefault();

      const latlng = mapRef.current.mouseEventToLatLng(e);
      const points = currentPointsRef.current;
      const lastPoint = points[points.length - 1];

      if (lastPoint) {
        const p1 = mapRef.current.latLngToContainerPoint(lastPoint);
        const p2 = mapRef.current.latLngToContainerPoint(latlng);
        const distance = Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
        if (distance < 8) return; // Smooth out points
      }

      currentPointsRef.current.push(latlng);
      tempPolylineRef.current.setLatLngs(currentPointsRef.current);
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!isDrawingGestureRef.current || !mapRef.current) return;

      e.stopPropagation();
      e.preventDefault();

      isDrawingGestureRef.current = false;
      setIsDrawingGestureActive(false);

      if (tempPolylineRef.current) {
        tempPolylineRef.current.remove();
        tempPolylineRef.current = null;
      }

      const points = currentPointsRef.current;
      if (points.length < 3) {
        toastError("El área es muy pequeña. Dibuja un círculo más amplio.");
        // Force tiles to re-render even on cancelled drawing
        forceMapRedraw();
        return;
      }

      const coords = points.map((p) => [p.lat, p.lng] as [number, number]);
      
      setLocalPolygons((prev) => [...prev, coords]);
      setIsDrawingMode(false);
      setShowDrawingOptions(true);

      // Force map tile re-render after drawing finishes
      forceMapRedraw();
    };

    // Helper function to force Leaflet to re-render tiles after drawing
    // This solves the blank/white screen that occurs because pointer event
    // interception during drawing disrupts Leaflet's tile loading pipeline.
    const forceMapRedrawFn = () => {
      const m = mapRef.current;
      if (!m) return;

      // Schedule multiple re-render attempts with increasing delays
      // to ensure tiles are fully recovered
      requestAnimationFrame(() => {
        m.invalidateSize();
      });
      setTimeout(() => {
        if (mapRef.current) {
          // Tiny sub-pixel pan forces Leaflet to re-evaluate & reload all tiles
          mapRef.current.panBy([1, 0], { animate: false });
          mapRef.current.panBy([-1, 0], { animate: false });
        }
      }, 50);
      setTimeout(() => {
        if (mapRef.current) {
          mapRef.current.invalidateSize();
        }
      }, 200);
    };
    forceMapRedrawRef.current = forceMapRedrawFn;

    container.addEventListener("pointerdown", handlePointerDown, { passive: false });
    container.addEventListener("pointermove", handlePointerMove, { passive: false });
    container.addEventListener("pointerup", handlePointerUp, { passive: false });

    return () => {
      resizeObserver.disconnect();
      container.removeEventListener("pointerdown", handlePointerDown);
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointerup", handlePointerUp);

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [isOpen]);

  // Sync polygons to Leaflet visual layers
  useEffect(() => {
    const map = mapRef.current;
    const group = polygonLayerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    localPolygons.forEach((poly, index) => {
      const polygon = L.polygon(poly, {
        color: "#D97706", // Amber dark
        fillColor: "#FBBF24", // Golden yellow
        fillOpacity: 0.25,
        weight: 3,
        lineCap: "round",
        lineJoin: "round",
      });

      // Simple mouse hover effect
      polygon.on("mouseover", () => {
        polygon.setStyle({
          fillOpacity: 0.4,
          weight: 4,
          color: "#FBBF24",
        });
      });

      polygon.on("mouseout", () => {
        polygon.setStyle({
          fillOpacity: 0.25,
          weight: 3,
          color: "#D97706",
        });
      });

      polygon.addTo(group);
    });

    // Fit map bounds to show drawn shapes on initial load if any exist
    if (localPolygons.length > 0 && group.getBounds().isValid()) {
      map.fitBounds(group.getBounds(), { padding: [40, 40] });
    }
  }, [localPolygons]);

  // Trigger leaflet map control toggle safely
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    try {
      if (isDrawingMode) {
        if (map.dragging) map.dragging.disable();
        if (map.touchZoom) map.touchZoom.disable();
        if (map.doubleClickZoom) map.doubleClickZoom.disable();
        if (map.scrollWheelZoom) map.scrollWheelZoom.disable();
        if (map.boxZoom) map.boxZoom.disable();
        if (map.keyboard) map.keyboard.disable();
        if ((map as any).tap) (map as any).tap.disable();
      } else {
        if (map.dragging) map.dragging.enable();
        if (map.touchZoom) map.touchZoom.enable();
        if (map.doubleClickZoom) map.doubleClickZoom.enable();
        if (map.scrollWheelZoom) map.scrollWheelZoom.enable();
        if (map.boxZoom) map.boxZoom.enable();
        if (map.keyboard) map.keyboard.enable();
        if ((map as any).tap) (map as any).tap.enable();
      }
    } catch (err) {
      console.warn('[BuyerMap] Error toggling map handlers:', err);
    }

    // Force map to recalculate its viewport and redraw tiles after mode change to prevent blank/white states
    forceMapRedraw();
  }, [isDrawingMode]);

  const handleStartDrawing = () => {
    setIsDrawingMode(true);
    setShowDrawingOptions(false);
  };

  const handleUndo = () => {
    setLocalPolygons((prev) => prev.slice(0, -1));
    setShowDrawingOptions(false);
  };

  const handleClear = () => {
    setLocalPolygons([]);
    setShowDrawingOptions(false);
  };

  const handleSave = () => {
    onChange(localPolygons);
    onClose();
  };

  // Toast helper for small feedback without importing extra libraries
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastError = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      {/* Premium Dark Glassmorphic Header */}
      <div className="bg-[#2C3E50]/90 backdrop-blur-md px-6 py-4 flex justify-between items-center border-b border-white/10 shrink-0 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="bg-[#FBBF24]/20 p-2.5 rounded-xl border border-[#FBBF24]/30 text-[#FBBF24]">
            <MapPin size={22} className="animate-pulse" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white tracking-wide">Delimitar Zonas Inmobiliarias</h3>
            <p className="text-xs text-slate-300">Dibuja círculos o figuras directamente con tu dedo o ratón</p>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="p-2.5 bg-white/5 hover:bg-white/15 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-all active:scale-95 shadow-inner"
          title="Cerrar y descartar cambios"
        >
          <X size={20} />
        </button>
      </div>

      {/* Map Workspace */}
      <div className="relative flex-1 w-full bg-slate-100 overflow-hidden">
        {/* Leaflet container */}
        <div 
          ref={mapContainerRef} 
          className={`w-full h-full z-10 ${isDrawingMode ? "cursor-crosshair touch-none" : "cursor-grab"}`} 
        />

        {/* Dynamic Toast Feedback */}
        {toastMsg && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-red-600/95 border border-red-500/50 backdrop-blur-md text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-xl animate-bounce flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-white animate-ping" />
            <span>{toastMsg}</span>
          </div>
        )}

        {/* Elegant top-left floating instructions */}
        <div className="absolute top-4 left-4 z-20 pointer-events-none max-w-xs sm:max-w-sm hidden sm:block">
          <div className="bg-slate-900/90 backdrop-blur-md border border-white/10 p-4 rounded-2xl shadow-2xl space-y-2">
            <p className="text-xs font-bold text-[#FBBF24] flex items-center gap-1.5">
              <Pencil size={14} /> Instrucciones
            </p>
            <ol className="text-[11px] text-slate-300 list-decimal pl-4 space-y-1">
              <li>Muévete por el mapa hasta encontrar tu zona de Sevilla.</li>
              <li>Pulsa <span className="font-bold text-white">"Dibujar zona"</span> abajo.</li>
              <li>Arrastra tu dedo o ratón haciendo un círculo cerrado alrededor del área elegida.</li>
              <li>Puedes dibujar múltiples zonas continuas o separadas.</li>
            </ol>
          </div>
        </div>

        {/* Floating Idealista-style Controls Panel */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 w-[calc(100%-2rem)] max-w-md">
          <div className="bg-[#2C3E50]/95 backdrop-blur-md border border-white/15 p-5 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.4)] flex flex-col gap-4">
            
            {/* Zone count & status */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2 text-white">
                <MapPin size={16} className="text-[#FBBF24] animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  {localPolygons.length === 0 ? "Sin zonas dibujadas" : `${localPolygons.length} ${localPolygons.length === 1 ? "zona seleccionada" : "zonas seleccionadas"}`}
                </span>
              </div>
              {localPolygons.length > 0 && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleUndo}
                    className="flex items-center gap-1 bg-white/5 hover:bg-white/15 border border-white/10 px-2.5 py-1 rounded-lg text-[11px] font-bold text-slate-300 transition-colors"
                    title="Deshacer última zona"
                  >
                    <Undo size={12} /> Deshacer
                  </button>
                  <button
                    type="button"
                    onClick={handleClear}
                    className="flex items-center gap-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 px-2.5 py-1 rounded-lg text-[11px] font-bold text-red-400 transition-colors"
                    title="Borrar todas las zonas"
                  >
                    <Trash2 size={12} /> Borrar
                  </button>
                </div>
              )}
            </div>

            {/* Controls CTAs */}
            <div className="flex flex-col gap-2.5">
              {isDrawingMode ? (
                <div className="bg-yellow-500/10 border border-yellow-500/30 p-3 rounded-xl text-center animate-pulse">
                  <p className="text-xs text-[#FBBF24] font-bold">
                    {isDrawingGestureActive ? "Trazando área..." : "Arrastra en el mapa para dibujar tu zona"}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Suelte el ratón o dedo para cerrar la figura</p>
                </div>
              ) : showDrawingOptions ? (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={handleStartDrawing}
                    className="flex items-center justify-center gap-1.5 bg-white/5 hover:bg-white/15 border border-white/15 py-3 rounded-xl text-xs font-bold text-white transition-all active:scale-95"
                  >
                    <Plus size={16} className="text-[#FBBF24]" />
                    Dibujar más zonas
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    className="flex items-center justify-center gap-1.5 bg-[#FBBF24] hover:bg-[#e5a917] py-3 rounded-xl text-xs font-black text-[#2C3E50] transition-all active:scale-95 shadow-lg shadow-yellow-500/20"
                  >
                    <Check size={16} />
                    Guardar y Continuar
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  <button
                    type="button"
                    onClick={handleStartDrawing}
                    className="flex items-center justify-center gap-2 bg-[#FBBF24] hover:bg-[#e5a917] py-3.5 rounded-xl text-xs font-black text-[#2C3E50] transition-all active:scale-95 shadow-lg shadow-yellow-500/20"
                  >
                    <Pencil size={15} />
                    Comenzar a dibujar zona
                  </button>
                  
                  {localPolygons.length > 0 && (
                    <button
                      type="button"
                      onClick={handleSave}
                      className="flex items-center justify-center gap-1.5 bg-[#FBBF24] hover:bg-[#e5a917] py-3.5 rounded-xl text-xs font-black text-[#2C3E50] transition-all active:scale-95 shadow-lg shadow-yellow-500/20"
                    >
                      <Check size={16} />
                      Guardar selección actual
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
