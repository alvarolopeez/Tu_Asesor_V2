"use client";

import React, { useState, useMemo, useCallback } from "react";
import { 
  FolderTree, 
  Search, 
  Sparkles, 
  ChevronDown, 
  ChevronRight, 
  Check, 
  Plus, 
  X, 
  MessageSquare,
  Send,
  HelpCircle,
  Loader2
} from "lucide-react";
import { supabase } from "@/lib/supabase";

// ─── TAXONOMÍA OFICIAL DE SEVILLA (SEVILLA DB-TAXONOMY) ───────────────────
export interface SevillaTaxonomyData {
  label: string;
  isCapital: boolean;
  barrios: string[];
}

export const SEVILLA_TAXONOMY: Record<string, SevillaTaxonomyData> = {
  // Sevilla Capital
  "Centro": {
    label: "Sevilla Capital - Centro",
    isCapital: true,
    barrios: [
      "Santa Cruz / Alfalfa",
      "Casco Antiguo / Arenal",
      "San Vicente / San Lorenzo",
      "Regina / Encarnación",
      "Puerta de Jerez / Prado"
    ]
  },
  "Triana": {
    label: "Sevilla Capital - Triana",
    isCapital: true,
    barrios: [
      "Triana Casco Antiguo / Calle Betis",
      "Barrio León",
      "El Tardón",
      "Voluntad / Pagés del Corro",
      "Ronda de Triana"
    ]
  },
  "Los Remedios": {
    label: "Sevilla Capital - Los Remedios",
    isCapital: true,
    barrios: [
      "Los Remedios Centro / Asunción",
      "Tablada",
      "Parque de los Príncipes"
    ]
  },
  "Nervión": {
    label: "Sevilla Capital - Nervión",
    isCapital: true,
    barrios: [
      "Nervión Centro / Buhaira",
      "Viapol / San Bernardo",
      "Ramón y Cajal / Ciudad Jardín",
      "La Calzada / Luis Montoto"
    ]
  },
  "Macarena": {
    label: "Sevilla Capital - Macarena",
    isCapital: true,
    barrios: [
      "La Macarena / Parlamento",
      "Doctor Barraquer / León XIII",
      "El Cerezo",
      "Pio XII / Miraflores"
    ]
  },
  "Sevilla Este": {
    label: "Sevilla Capital - Sevilla Este",
    isCapital: true,
    barrios: [
      "Avenida de las Ciencias",
      "Las Gondolas / Entrepuentes",
      "Polígono Aeropuerto / Puerta Este",
      "Emilio Lemos / Alcosa"
    ]
  },
  "Bellavista - La Palmera": {
    label: "Sevilla Capital - Bellavista - La Palmera",
    isCapital: true,
    barrios: [
      "Reina Mercedes / Heliópolis",
      "Los Bermejales",
      "Bellavista Centro",
      "Jardines de Hércules"
    ]
  },
  "San Pablo - Santa Justa": {
    label: "Sevilla Capital - San Pablo - Santa Justa",
    isCapital: true,
    barrios: [
      "Santa Justa / Kansas City",
      "San Pablo A, B, C, D",
      "Huerta de Santa Teresa"
    ]
  },
  // Aljarafe / Pueblos
  "Mairena del Aljarafe": {
    label: "Mairena del Aljarafe",
    isCapital: false,
    barrios: [
      "Mairena Centro / Casco Antiguo",
      "Ciudad Expo / Metromar",
      "Cavaleri",
      "Simón Verde",
      "Lepanto / El Jardinillo",
      "Nuevo Bulevar"
    ]
  },
  "Tomares": {
    label: "Tomares",
    isCapital: false,
    barrios: [
      "Tomares Centro",
      "Santa Eufemia",
      "Villares Altos",
      "Las Almenas",
      "La Cartuja"
    ]
  },
  "Bormujos": {
    label: "Bormujos",
    isCapital: false,
    barrios: [
      "Bormujos Centro",
      "La Florida",
      "Zaudín (Urbanización)",
      "El Almendral"
    ]
  },
  "Dos Hermanas": {
    label: "Dos Hermanas",
    isCapital: false,
    barrios: [
      "Dos Hermanas Centro",
      "Montequinto / Arco Norte",
      "Condequinto (Urbanización)",
      "Entrenúcleos"
    ]
  }
};

export interface FlatZone {
  key: string;       // "Centro - Santa Cruz / Alfalfa"
  district: string;  // "Centro"
  barrio: string;    // "Santa Cruz / Alfalfa"
  label: string;     // "Sevilla Capital - Centro" or "Mairena del Aljarafe"
  isCapital: boolean;
}

// Helper utility to flatten the taxonomy into a single searchable array
export const getFlatZones = (): FlatZone[] => {
  const list: FlatZone[] = [];
  Object.entries(SEVILLA_TAXONOMY).forEach(([dist, data]) => {
    data.barrios.forEach((b) => {
      list.push({
        key: `${dist} - ${b}`,
        district: dist,
        barrio: b,
        label: data.label,
        isCapital: data.isCapital
      });
    });
  });
  return list;
};

interface ZoneSelectorPremiumProps {
  selectedZones: string[];
  onChange: (zones: string[]) => void;
}

export default function ZoneSelectorPremium({ selectedZones, onChange }: ZoneSelectorPremiumProps) {
  const [activeTab, setActiveTab] = useState<"tree" | "search" | "ai">("tree");
  const [searchTerm, setSearchTerm] = useState("");
  
  // Tree collapse state tracking by district key
  const [collapsedDistricts, setCollapsedDistricts] = useState<Record<string, boolean>>(() => {
    const states: Record<string, boolean> = {};
    Object.keys(SEVILLA_TAXONOMY).forEach(k => {
      // Keep Sevilla Capital districts expanded by default, collapse pueblos
      states[k] = !SEVILLA_TAXONOMY[k].isCapital;
    });
    return states;
  });

  // Copilot AI Chat states
  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<Array<{ sender: "user" | "paula", text: string, zones?: string[] }>>([
    {
      sender: "paula",
      text: "¡Hola Álvaro! Escribe en lenguaje natural qué zonas, calles o hitos de Sevilla busca tu comprador (ej: 'Busca algo cerca de Metromar en Mairena o en Triana cerca del río') y las marcaré automáticamente por ti."
    }
  ]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiProposedZones, setAiProposedZones] = useState<string[]>([]);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);

  // Flattened zones dictionary for search and AI comparison
  const flatZones = useMemo(() => getFlatZones(), []);

  const toggleDistrictCollapse = (district: string) => {
    setCollapsedDistricts(prev => ({
      ...prev,
      [district]: !prev[district]
    }));
  };

  // Toggle single neighborhood selection
  const handleZoneToggle = useCallback((zoneKey: string) => {
    if (selectedZones.includes(zoneKey)) {
      onChange(selectedZones.filter(z => z !== zoneKey));
    } else {
      onChange([...selectedZones, zoneKey]);
    }
  }, [selectedZones, onChange]);

  // Master checkbox toggle for entire district/pueblo
  const handleDistrictToggle = useCallback((districtKey: string, districtBarrios: string[]) => {
    const districtZoneKeys = districtBarrios.map(b => `${districtKey} - ${b}`);
    const allSelected = districtZoneKeys.every(zk => selectedZones.includes(zk));

    if (allSelected) {
      // Remove all
      onChange(selectedZones.filter(zk => !districtZoneKeys.includes(zk)));
    } else {
      // Add all missing ones
      const toAdd = districtZoneKeys.filter(zk => !selectedZones.includes(zk));
      onChange([...selectedZones, ...toAdd]);
    }
  }, [selectedZones, onChange]);

  // Fuzzy Search filter mapping
  const filteredFlatZones = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const term = searchTerm.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // strip accents
    
    return flatZones.filter(fz => {
      const matchText = `${fz.district} ${fz.barrio} ${fz.label}`.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return matchText.includes(term);
    });
  }, [searchTerm, flatZones]);

  // Call the server action / api route for Gemini natural language analysis
  const handleAiAnalyze = async () => {
    if (!chatMessage.trim() || aiLoading) return;

    const userText = chatMessage.trim();
    setChatMessage("");
    setChatHistory(prev => [...prev, { sender: "user", text: userText }]);
    setAiLoading(true);
    setAiFeedback(null);
    setAiProposedZones([]);

    try {
      // Safe POST call under dynamic server authentication check
      const response = await fetch("/api/ai/zones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: userText }),
      });

      if (!response.ok) {
        throw new Error("Error en la llamada a la IA.");
      }

      const result = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      const detected = result.detected_zones || [];
      const reasoning = result.reasoning || "He detectado estas zonas basándome en tus indicaciones.";

      setAiProposedZones(detected);
      setAiFeedback(reasoning);
      
      setChatHistory(prev => [
        ...prev, 
        { 
          sender: "paula", 
          text: reasoning,
          zones: detected
        }
      ]);
    } catch (err: any) {
      console.error("[ZoneSelectorPremium][AI] Error:", err.message);
      setChatHistory(prev => [
        ...prev, 
        { 
          sender: "paula", 
          text: `⚠️ Lo siento, Álvaro. Hubo un error al conectar con el servidor de inteligencia artificial: ${err.message}. Por favor, inténtalo de nuevo o selecciona manualmente en el árbol jerárquico.`
        }
      ]);
    } finally {
      setAiLoading(false);
    }
  };

  // Bulk apply AI suggested zones
  const handleApplyAiZones = (zones: string[]) => {
    if (!zones || zones.length === 0) return;
    
    // Union-merge to preserve existing selections and append new ones without duplicates
    const merged = Array.from(new Set([...selectedZones, ...zones]));
    onChange(merged);
    
    // Reset AI temporary states and show visual success feedback
    setAiProposedZones([]);
    setAiFeedback(null);
  };

  return (
    <div className="w-full flex flex-col bg-[#1E293B]/70 border border-white/5 backdrop-blur-md rounded-2xl overflow-hidden shadow-2xl">
      
      {/* ─── TAB NAVIGATOR ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 border-b border-white/10 bg-[#0F172A]/40 shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab("tree")}
          className={`py-3.5 flex items-center justify-center gap-2 text-xs font-bold transition-all border-b-2 ${
            activeTab === "tree"
              ? "text-[#FBBF24] border-[#FBBF24] bg-white/[0.02]"
              : "text-slate-400 border-transparent hover:text-slate-200 hover:bg-white/[0.01]"
          }`}
        >
          <FolderTree size={14} />
          Árbol de Zonas
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("search")}
          className={`py-3.5 flex items-center justify-center gap-2 text-xs font-bold transition-all border-b-2 ${
            activeTab === "search"
              ? "text-[#FBBF24] border-[#FBBF24] bg-white/[0.02]"
              : "text-slate-400 border-transparent hover:text-slate-200 hover:bg-white/[0.01]"
          }`}
        >
          <Search size={14} />
          Buscador Fuzzy
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("ai")}
          className={`py-3.5 flex items-center justify-center gap-2 text-xs font-bold transition-all border-b-2 ${
            activeTab === "ai"
              ? "text-[#FBBF24] border-[#FBBF24] bg-white/[0.02] shadow-[0_-8px_15px_rgba(251,191,36,0.06)_inset]"
              : "text-slate-400 border-transparent hover:text-slate-200 hover:bg-white/[0.01]"
          }`}
        >
          <Sparkles size={14} className="text-[#FBBF24] animate-pulse" />
          Copilot Paula IA
        </button>
      </div>

      {/* ─── SELECTED CHIPS COUNTER ────────────────────────────────────────── */}
      <div className="bg-[#0F172A]/20 px-5 py-3 border-b border-white/5 flex flex-wrap items-center gap-2 shrink-0">
        <span className="text-[10px] text-slate-400 uppercase font-black tracking-widest mr-1">
          {selectedZones.length === 0 ? "Sin zonas" : `${selectedZones.length} seleccionadas`}:
        </span>
        {selectedZones.length === 0 ? (
          <span className="text-xs text-slate-500 italic">Haz clic en barrios o usa el Copilot para añadirlos.</span>
        ) : (
          <div className="flex flex-wrap gap-1 max-h-[80px] overflow-y-auto w-full pr-2 custom-scrollbar">
            {selectedZones.map((zk) => {
              const [dist, barr] = zk.split(" - ");
              return (
                <span
                  key={zk}
                  className="bg-[#0F172A] hover:bg-red-500/10 text-slate-200 hover:text-red-400 text-[10px] px-2 py-0.5 rounded border border-white/10 flex items-center gap-1 transition-all"
                  onClick={() => handleZoneToggle(zk)}
                  title="Haz clic para quitar"
                >
                  <MapPinCheckIcon />
                  <span className="font-bold text-[#FBBF24]">{dist}:</span>
                  <span>{barr}</span>
                  <X size={10} className="ml-0.5 text-slate-500 hover:text-red-400" />
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── WORKSPACE VIEWS ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-5 min-h-[300px] max-h-[420px] custom-scrollbar">
        
        {/* VIEW A: TREE SELECT */}
        {activeTab === "tree" && (
          <div className="space-y-6">
            {/* Group 1: Sevilla Capital */}
            <div className="space-y-3">
              <h4 className="text-[10px] text-[#FBBF24] font-black uppercase tracking-wider flex items-center gap-2 border-b border-white/5 pb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#FBBF24]" />
                Sevilla Capital
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Object.entries(SEVILLA_TAXONOMY)
                  .filter(([_, data]) => data.isCapital)
                  .map(([distKey, data]) => (
                    <div key={distKey} className="bg-slate-950/20 border border-white/5 rounded-xl overflow-hidden transition-all">
                      {/* District Header */}
                      <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#0F172A]/50 border-b border-white/5">
                        <div className="flex items-center gap-2">
                          <input 
                            type="checkbox"
                            checked={data.barrios.map(b => `${distKey} - ${b}`).every(zk => selectedZones.includes(zk))}
                            onChange={() => handleDistrictToggle(distKey, data.barrios)}
                            className="w-3.5 h-3.5 rounded border-white/10 bg-[#0F172A] text-[#FBBF24] focus:ring-offset-0 focus:ring-[#FBBF24]"
                          />
                          <span className="text-xs font-bold text-white tracking-wide">{distKey}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleDistrictCollapse(distKey)}
                          className="text-slate-400 hover:text-white p-1 hover:bg-white/5 rounded transition-all"
                        >
                          {collapsedDistricts[distKey] ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </div>

                      {/* Neighborhoods List */}
                      {!collapsedDistricts[distKey] && (
                        <div className="p-3 space-y-2 max-h-[160px] overflow-y-auto custom-scrollbar">
                          {data.barrios.map((b) => {
                            const zk = `${distKey} - ${b}`;
                            const isSel = selectedZones.includes(zk);
                            return (
                              <label
                                key={zk}
                                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                                  isSel ? "bg-[#FBBF24]/5 border border-[#FBBF24]/10 text-white font-medium" : "text-slate-300 hover:bg-white/5 hover:text-white"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSel}
                                  onChange={() => handleZoneToggle(zk)}
                                  className="w-3.5 h-3.5 rounded border-white/10 bg-[#0F172A] text-[#FBBF24] focus:ring-offset-0 focus:ring-[#FBBF24]"
                                />
                                <span>{b}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>

            {/* Group 2: Provincia y Aljarafe */}
            <div className="space-y-3 pt-2">
              <h4 className="text-[10px] text-amber-500 font-black uppercase tracking-wider flex items-center gap-2 border-b border-white/5 pb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Aljarafe / Provincia
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Object.entries(SEVILLA_TAXONOMY)
                  .filter(([_, data]) => !data.isCapital)
                  .map(([distKey, data]) => (
                    <div key={distKey} className="bg-slate-950/20 border border-white/5 rounded-xl overflow-hidden transition-all">
                      {/* District Header */}
                      <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#0F172A]/50 border-b border-white/5">
                        <div className="flex items-center gap-2">
                          <input 
                            type="checkbox"
                            checked={data.barrios.map(b => `${distKey} - ${b}`).every(zk => selectedZones.includes(zk))}
                            onChange={() => handleDistrictToggle(distKey, data.barrios)}
                            className="w-3.5 h-3.5 rounded border-white/10 bg-[#0F172A] text-[#FBBF24] focus:ring-offset-0 focus:ring-[#FBBF24]"
                          />
                          <span className="text-xs font-bold text-white tracking-wide">{distKey}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleDistrictCollapse(distKey)}
                          className="text-slate-400 hover:text-white p-1 hover:bg-white/5 rounded transition-all"
                        >
                          {collapsedDistricts[distKey] ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </div>

                      {/* Neighborhoods List */}
                      {!collapsedDistricts[distKey] && (
                        <div className="p-3 space-y-2 max-h-[160px] overflow-y-auto custom-scrollbar">
                          {data.barrios.map((b) => {
                            const zk = `${distKey} - ${b}`;
                            const isSel = selectedZones.includes(zk);
                            return (
                              <label
                                key={zk}
                                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                                  isSel ? "bg-[#FBBF24]/5 border border-[#FBBF24]/10 text-white font-medium" : "text-slate-300 hover:bg-white/5 hover:text-white"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSel}
                                  onChange={() => handleZoneToggle(zk)}
                                  className="w-3.5 h-3.5 rounded border-white/10 bg-[#0F172A] text-[#FBBF24] focus:ring-offset-0 focus:ring-[#FBBF24]"
                                />
                                <span>{b}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* VIEW B: FUZZY SEARCH MATCH FINDER */}
        {activeTab === "search" && (
          <div className="space-y-4">
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Search size={14} />
              </span>
              <input
                type="text"
                placeholder="Escribe el nombre de un barrio, calle o municipio (ej. Triana, Ciudad Expo)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#0F172A] border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#FBBF24] transition-all"
              />
            </div>

            {!searchTerm.trim() ? (
              <div className="py-12 text-center text-slate-500">
                <HelpCircle className="mx-auto mb-2 text-slate-600 animate-pulse" size={32} />
                <p className="text-xs">Introduce texto arriba para buscar entre más de 100 subzonas de Sevilla.</p>
              </div>
            ) : filteredFlatZones.length === 0 ? (
              <div className="py-12 text-center text-slate-500">
                <p className="text-xs">No se encontraron subzonas coincidentes con "{searchTerm}".</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {filteredFlatZones.map((fz) => {
                  const isSel = selectedZones.includes(fz.key);
                  return (
                    <div
                      key={fz.key}
                      onClick={() => handleZoneToggle(fz.key)}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                        isSel 
                          ? "bg-[#FBBF24]/5 border-[#FBBF24]/30 text-white font-bold" 
                          : "bg-slate-900/30 border-white/5 text-slate-300 hover:border-white/15 hover:text-white"
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{fz.district}</span>
                        <span className="text-xs mt-0.5">{fz.barrio}</span>
                      </div>
                      <button
                        type="button"
                        className={`w-5 h-5 rounded-md flex items-center justify-center ${
                          isSel ? "bg-[#FBBF24] text-[#2C3E50]" : "bg-white/5 text-slate-500"
                        }`}
                      >
                        {isSel ? <Check size={12} strokeWidth={3} /> : <Plus size={12} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* VIEW C: AI ZONE COPILOT CONSOLE */}
        {activeTab === "ai" && (
          <div className="flex flex-col h-full space-y-4">
            
            {/* Timeline Chat Panel */}
            <div className="flex-1 bg-slate-950/40 border border-white/5 rounded-xl p-4 min-h-[160px] max-h-[220px] overflow-y-auto space-y-3 custom-scrollbar">
              {chatHistory.map((chat, idx) => (
                <div 
                  key={idx} 
                  className={`flex ${chat.sender === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs shadow-md ${
                    chat.sender === "user"
                      ? "bg-[#FBBF24] text-[#2C3E50] font-medium rounded-tr-none"
                      : "bg-[#1E293B] border border-white/5 text-slate-100 rounded-tl-none leading-relaxed"
                  }`}>
                    {chat.sender === "paula" && (
                      <div className="flex items-center gap-1.5 text-[9px] text-[#FBBF24] uppercase font-black tracking-wider mb-1">
                        <Sparkles size={10} />
                        Paula · Asesora Virtual
                      </div>
                    )}
                    <p className="whitespace-pre-line">{chat.text}</p>
                    
                    {/* Display proposed zones in chat bubble */}
                    {chat.zones && chat.zones.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-white/10 space-y-2">
                        <span className="text-[10px] text-slate-400 font-bold block">SUBZONAS COMPATIBLES:</span>
                        <div className="flex flex-wrap gap-1">
                          {chat.zones.map((z, zidx) => (
                            <span key={zidx} className="bg-[#0F172A] text-slate-200 text-[9px] px-2 py-0.5 rounded border border-white/5 font-semibold">
                              {z}
                            </span>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleApplyAiZones(chat.zones!)}
                          className="mt-2 w-full flex items-center justify-center gap-1.5 bg-[#FBBF24] text-[#2C3E50] font-black text-[10px] uppercase py-2 rounded-lg hover:bg-yellow-400 active:scale-95 transition-all shadow-md cursor-pointer"
                        >
                          <Check size={12} strokeWidth={2.5} />
                          Aplicar a la Demanda
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              
              {/* Typing loader */}
              {aiLoading && (
                <div className="flex justify-start">
                  <div className="bg-[#1E293B] border border-white/5 text-slate-400 rounded-2xl rounded-tl-none px-4 py-3 text-xs flex items-center gap-2.5">
                    <Loader2 size={14} className="animate-spin text-[#FBBF24]" />
                    <span>Paula está analizando geográficamente tu descripción...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Input Panel */}
            <div className="flex gap-2">
              <textarea
                rows={1}
                placeholder="Escribe preferencias de zonas en Sevilla..."
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleAiAnalyze();
                  }
                }}
                disabled={aiLoading}
                className="flex-1 bg-[#0F172A] border border-white/10 rounded-xl px-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#FBBF24] resize-none h-[42px] custom-scrollbar disabled:opacity-50"
              />
              <button
                type="button"
                onClick={handleAiAnalyze}
                disabled={aiLoading || !chatMessage.trim()}
                className="w-[42px] h-[42px] shrink-0 bg-[#FBBF24] hover:bg-yellow-400 text-[#2C3E50] rounded-xl flex items-center justify-center transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                title="Analizar con IA"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ICON HELPERS ────────────────────────────────────────────────────────
function MapPinCheckIcon() {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className="w-2.5 h-2.5 text-[#FBBF24]"
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <path d="m9 10 2 2 4-4" />
    </svg>
  );
}
