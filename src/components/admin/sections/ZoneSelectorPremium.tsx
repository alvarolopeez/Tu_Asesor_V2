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
  // Sevilla Capital (11 Distritos Oficiales completos)
  "Centro": {
    label: "Sevilla Capital - Centro",
    isCapital: true,
    barrios: [
      "Alfalfa",
      "El Arenal",
      "Encarnación-Regina",
      "Feria",
      "Museo",
      "San Bartolomé",
      "San Gil",
      "San Julián",
      "San Lorenzo",
      "San Vicente",
      "Santa Catalina",
      "Santa Cruz"
    ]
  },
  "Macarena": {
    label: "Sevilla Capital - Macarena",
    isCapital: true,
    barrios: [
      "Begoña-Santa Catalina",
      "Campos de Soria",
      "Cisneo Alto-Santa María de Gracia",
      "Cruz Roja-Capuchinos",
      "Doctor Barraquer-Grupo Renfe-Policlínico",
      "El Carmen",
      "El Cerezo",
      "El Rocío",
      "El Torrejón",
      "Hermandades-La Carrasca",
      "La Barzola",
      "La Palmilla-Doctor Marañón",
      "La Paz-Las Golondrinas",
      "Las Avenidas",
      "León XIII-Los Naranjos",
      "Los Príncipes-La Fontanilla",
      "Macarena Tres Huertas-Macarena Cinco",
      "Pino Flores",
      "Pío XII",
      "Retiro Obrero",
      "Santas Justa y Rufina-Parque Miraflores",
      "Santa María de Ordas-San Nicolás",
      "Villegas",
      "Polígono Norte"
    ]
  },
  "Nervión": {
    label: "Sevilla Capital - Nervión",
    isCapital: true,
    barrios: [
      "Ciudad Jardín",
      "Huerta del Pilar",
      "La Buhaira",
      "La Calzada",
      "La Florida",
      "Nervión",
      "San Bernardo",
      "San Roque"
    ]
  },
  "Cerro-Amate": {
    label: "Sevilla Capital - Cerro-Amate",
    isCapital: true,
    barrios: [
      "Amate",
      "El Cerro",
      "Juan XXIII",
      "La Plata",
      "Los Pájaros",
      "Palmete",
      "Rochelambert",
      "Santa Aurelia-Cantábrico-Atlántico-La Romería"
    ]
  },
  "Sur": {
    label: "Sevilla Capital - Sur",
    isCapital: true,
    barrios: [
      "Avenida de la Paz",
      "Felipe II-Los Diez Mandamientos",
      "Giralda Sur",
      "Huerta de la Salud",
      "La Oliva",
      "Las Letanías",
      "Polígono Sur",
      "Tabladilla-La Estrella",
      "Tiro de Línea-Santa Genoveva"
    ]
  },
  "Triana": {
    label: "Sevilla Capital - Triana",
    isCapital: true,
    barrios: [
      "Barrio León",
      "El Tardón-El Carmen",
      "Triana Casco Antiguo",
      "Triana Este",
      "Triana Oeste"
    ]
  },
  "Norte": {
    label: "Sevilla Capital - Norte",
    isCapital: true,
    barrios: [
      "Barriada Pino Montano",
      "Consolación",
      "El Gordillo",
      "Las Almenas",
      "San Jerónimo",
      "La Bachillera",
      "Los Carteros",
      "San Diego",
      "Los Arcos",
      "Las Naciones-Parque Atlántico-Las Dalias",
      "San Matías",
      "Aeropuerto Viejo",
      "Valdezorras"
    ]
  },
  "San Pablo - Santa Justa": {
    label: "Sevilla Capital - San Pablo - Santa Justa",
    isCapital: true,
    barrios: [
      "Árbol Gordo",
      "El Fontanal-María Auxiliadora-Carretera de Carmona",
      "Huerta de Santa Teresa",
      "La Corza",
      "Las Huertas",
      "San Carlos-Tartessos",
      "San José Obrero",
      "San Pablo A y B",
      "San Pablo C",
      "San Pablo D y E",
      "Santa Clara",
      "Zodiaco"
    ]
  },
  "Este-Alcosa-Torreblanca": {
    label: "Sevilla Capital - Este-Alcosa-Torreblanca",
    isCapital: true,
    barrios: [
      "Colores-Entreparques",
      "Palacio de Congresos-Urbadiez-Entrepuentes",
      "Parque Alcosa-Jardines del Edén",
      "Torreblanca"
    ]
  },
  "Palmera-Bellavista": {
    label: "Sevilla Capital - Palmera-Bellavista",
    isCapital: true,
    barrios: [
      "Barriada de Pineda",
      "Bellavista",
      "Elcano-Los Bermejales",
      "Heliópolis",
      "Pedro Salvador-Las Palmeritas-Guadaíra",
      "Sector Sur-La Palmera-Reina Mercedes"
    ]
  },
  "Los Remedios": {
    label: "Sevilla Capital - Los Remedios",
    isCapital: true,
    barrios: [
      "Tablada",
      "Los Remedios"
    ]
  },
  // Dos Hermanas
  "Dos Hermanas": {
    label: "Dos Hermanas",
    isCapital: false,
    barrios: [
      "Dos Hermanas Centro",
      "Quinto (Montequinto)",
      "Condequinto",
      "Olivar de Quintos",
      "Fuente del Rey",
      "Marisma y Puntales Adriano",
      "Entrenúcleos",
      "Barrio de Los Remedios",
      "La Motilla"
    ]
  },
  // Comarca Metropolitana y Aljarafe
  "Albaida del Aljarafe": {
    label: "Albaida del Aljarafe",
    isCapital: false,
    barrios: ["Casco urbano de Albaida", "Urbanización San Sebastián", "Diseminados rurales"]
  },
  "Almensilla": {
    label: "Almensilla",
    isCapital: false,
    barrios: ["Casco urbano consolidado", "Urbanización Santa Marina", "El Romeral", "Los Rosales", "Diseminados"]
  },
  "Benacazón": {
    label: "Benacazón",
    isCapital: false,
    barrios: ["Casco urbano de Benacazón", "Urbanización El Mirador", "Urbanización Portaceli", "Diseminados"]
  },
  "Bollullos de la Mitación": {
    label: "Bollullos de la Mitación",
    isCapital: false,
    barrios: ["Casco urbano", "Urbanización Cuatrovitas", "Urbanización La Juliana", "Urbanización Entrepinares", "Monasterio"]
  },
  "Bormujos": {
    label: "Bormujos",
    isCapital: false,
    barrios: ["Casco urbano (Centro)", "Zona Avenida Juan Diego", "Aljamar", "Polígono Almargen", "Sector Metropol", "La Florida Sur", "Valencinilla del Hoyo"]
  },
  "Camas": {
    label: "Camas",
    isCapital: false,
    barrios: ["Camas Centro", "Barriada de la Pañoleta", "El Carambolo", "Caño Ronco", "Coca de la Piñera", "Hato Verde"]
  },
  "Carrión de los Céspedes": {
    label: "Carrión de los Céspedes",
    isCapital: false,
    barrios: ["Casco urbano consolidado", "Diseminados rústicos"]
  },
  "Castilleja de Guzmán": {
    label: "Castilleja de Guzmán",
    isCapital: false,
    barrios: ["Casco urbano tradicional", "Urbanización Señorío de Guzmán", "Urbanización El Mirador"]
  },
  "Castilleja de la Cuesta": {
    label: "Castilleja de la Cuesta",
    isCapital: false,
    barrios: ["Casco urbano tradicional", "Barriada de la Nueva Sevilla", "Sector El Faro", "Diseminados"]
  },
  "Castilleja del Campo": {
    label: "Castilleja del Campo",
    isCapital: false,
    barrios: ["Casco urbano consolidado", "Diseminados agrarios"]
  },
  "Espartinas": {
    label: "Espartinas",
    isCapital: false,
    barrios: ["Espartinas Pueblo", "Loreto", "Zona Colegio Europa", "Ramal de Espartinas", "El Majuelo", "El Señorío", "Azahares", "Los Ciruelos", "El Martillo", "Paraíso del Jardín", "Paternilla", "Puerta de Hierro"]
  },
  "Gelves": {
    label: "Gelves",
    isCapital: false,
    barrios: ["Casco urbano bajo", "Marina de Gelves", "Simón Verde (compartido)", "Urbanización Gelves Club"]
  },
  "Gines": {
    label: "Gines",
    isCapital: false,
    barrios: ["Casco urbano", "Barriada del Carmen", "El Manantial", "Gines Plaza", "Diseminados residenciales"]
  },
  "Huévar del Aljarafe": {
    label: "Huévar del Aljarafe",
    isCapital: false,
    barrios: ["Casco urbano de Huévar", "Urbanización Guadial", "Diseminados industriales"]
  },
  "Mairena del Aljarafe": {
    label: "Mairena del Aljarafe",
    isCapital: false,
    barrios: ["Mairena Centro", "Nuevo Bulevar", "Simón Verde", "Ciudad Aljarafe", "El Almendral", "La Prusiana", "Las Brisas I y II", "Hacienda Los Olivos", "Estacada del Marqués", "Ensanche Centro Histórico"]
  },
  "Olivares": {
    label: "Olivares",
    isCapital: false,
    barrios: ["Casco urbano señorial", "Barriada de las Nieves", "Diseminados agrícolas"]
  },
  "Palomares del Río": {
    label: "Palomares del Río",
    isCapital: false,
    barrios: ["Casco urbano tradicional", "Urbanización La Estrella", "Urbanización El Ramal", "Diseminados"]
  },
  "Pilas": {
    label: "Pilas",
    isCapital: false,
    barrios: ["Casco urbano consolidado", "Barriada de San José", "Diseminados de olivar"]
  },
  "Salteras": {
    label: "Salteras",
    isCapital: false,
    barrios: ["Casco urbano", "Urbanización Alero de Sevilla", "Diseminados residenciales"]
  },
  "San Juan de Aznalfarache": {
    label: "San Juan de Aznalfarache",
    isCapital: false,
    barrios: ["Barrio Bajo", "Barriada de Guadalajara", "Monumento", "Camarón", "Andalucía", "Montelar", "Cornisa Azul", "Valparaíso", "Barrio Alto", "Santa Isabel", "Loreto"]
  },
  "Sanlúcar la Mayor": {
    label: "Sanlúcar la Mayor",
    isCapital: false,
    barrios: ["Casco urbano de Sanlúcar", "Urbanización Los Soles", "Las Torres", "Diseminados"]
  },
  "Santiponce": {
    label: "Santiponce",
    isCapital: false,
    barrios: ["Casco urbano", "Barriada de Itálica", "Sector monumental", "Diseminados"]
  },
  "Tomares": {
    label: "Tomares",
    isCapital: false,
    barrios: ["Tomares Centro", "Montefuerte", "Valdovina", "Santa Eufemia", "Las Siete Alanzadas", "Sillero", "La Venta Blanca", "Esteban de Arones", "Duchuelas", "Zaudín Bajo", "Zaudín Alto"]
  },
  "Umbrete": {
    label: "Umbrete",
    isCapital: false,
    barrios: ["Casco urbano tradicional", "Urbanización Las Palmeras", "Diseminados de viñas"]
  },
  "Valencina de la Concepción": {
    label: "Valencina de la Concepción",
    isCapital: false,
    barrios: ["Casco urbano", "Urbanización La Gloria", "Torrijos", "Diseminados rústicos"]
  },
  "Villanueva del Ariscal": {
    label: "Villanueva del Ariscal",
    isCapital: false,
    barrios: ["Casco urbano tradicional", "Urbanización El Almendral", "Diseminados"]
  },
  // Eje Fluvial de la Vega y las Marismas
  "Alcalá del Río": {
    label: "Alcalá del Río",
    isCapital: false,
    barrios: ["Casco urbano consolidado", "El Viar", "San Ignacio del Viar", "Esquivel"]
  },
  "Alcolea del Río": {
    label: "Alcolea del Río",
    isCapital: false,
    barrios: ["Casco urbano de Alcolea", "Diseminados rústicos"]
  },
  "Brenes": {
    label: "Brenes",
    isCapital: false,
    barrios: ["Casco urbano consolidado", "Barriada de la Estación", "Diseminados de regadío"]
  },
  "Burguillos": {
    label: "Burguillos",
    isCapital: false,
    barrios: ["Casco urbano", "Urbanización Señorío de Burguillos", "Diseminados de dehesa baja"]
  },
  "Cantillana": {
    label: "Cantillana",
    isCapital: false,
    barrios: ["Casco urbano", "La Montaña", "Los Pajares", "Diseminados de la Vega alta"]
  },
  "Coria del Río": {
    label: "Coria del Río",
    isCapital: false,
    barrios: ["Casco urbano", "La Hermandad y Tixe", "El Limonar", "El Lucero", "El Pozo", "Plaza Mazaco", "Barriada de las Alegrías"]
  },
  "La Algaba": {
    label: "La Algaba",
    isCapital: false,
    barrios: ["Casco urbano tradicional", "Barriada del Aral", "El rincón de la Algaba", "Diseminados"]
  },
  "La Rinconada": {
    label: "La Rinconada",
    isCapital: false,
    barrios: ["La Rinconada (Pueblo)", "San José de la Rinconada", "Tarazona", "La Jarilla", "El Gordillo", "Casavacas", "El Majuelo", "Tarazonilla", "Los Abetos", "El Castellón", "Los Labrados", "El Toril"]
  },
  "Lora del Río": {
    label: "Lora del Río",
    isCapital: false,
    barrios: ["Casco urbano de Lora", "El Priorato", "Setefilla", "El Álamo", "Diseminados rústicos de gran escala"]
  },
  "Peñaflor": {
    label: "Peñaflor",
    isCapital: false,
    barrios: ["Casco urbano tradicional", "Vegas de Almenara", "La Vereda (núcleo rústico de ocio)", "Diseminados"]
  },
  "Tocina": {
    label: "Tocina",
    isCapital: false,
    barrios: ["Tocina (Pueblo)", "Los Rosales (núcleo ferroviario)", "La Playita"]
  },
  "Villaverde del Río": {
    label: "Villaverde del Río",
    isCapital: false,
    barrios: ["Casco urbano de Villaverde", "Diseminados frutícolas de la Vega media"]
  },
  "Villanueva del Río y Minas": {
    label: "Villanueva del Río y Minas",
    isCapital: false,
    barrios: ["Casco urbano tradicional", "Minas de la Reunión (historico enclave minero)", "Diseminados"]
  },
  "Aznalcázar": {
    label: "Aznalcázar",
    isCapital: false,
    barrios: ["Casco urbano señorial", "Las Minas Golf", "Diseminados forestales de Doñana"]
  },
  "El Cuervo de Sevilla": {
    label: "El Cuervo de Sevilla",
    isCapital: false,
    barrios: ["Casco urbano consolidado", "Diseminados"]
  },
  "Isla Mayor": {
    label: "Isla Mayor",
    isCapital: false,
    barrios: ["Isla Mayor (Villafranco)", "Poblado de Alfonso XIII"]
  },
  "La Puebla del Río": {
    label: "La Puebla del Río",
    isCapital: false,
    barrios: ["Casco urbano", "Dehesa de Abajo", "El Pintado", "Diseminados marismeños"]
  },
  "Las Cabezas de San Juan": {
    label: "Las Cabezas de San Juan",
    isCapital: false,
    barrios: ["Casco urbano consolidado", "San Leandro", "Vetaherrada", "Sacramento", "Diseminados"]
  },
  "Lebrija": {
    label: "Lebrija",
    isCapital: false,
    barrios: ["Casco urbano señorial", "El Viñazo", "Marismas de Lebrija", "Diseminados agrícolas de regadío"]
  },
  "Villamanrique de la Condesa": {
    label: "Villamanrique de la Condesa",
    isCapital: false,
    barrios: ["Casco urbano tradicional", "Diseminados forestales y rocieros"]
  },
  // La Campiña de Sevilla
  "Alcalá de Guadaíra": {
    label: "Alcalá de Guadaíra",
    isCapital: false,
    barrios: ["Centro", "La Paz-Montecarmelo", "Nueva Alcalá", "Oromana", "Torrequinto", "Campoalegre", "Zacatín", "Altos de Oromana", "Nueva Europa", "Mirador del Guadaíra", "Gandul", "La Juncosa", "Pinos del Nevero", "La Galbana", "Virgen del Águila", "El Eucaliptal"]
  },
  "Arahal": {
    label: "Arahal",
    isCapital: false,
    barrios: ["Casco urbano señorial", "Barriada de la Palmera", "Diseminados rústicos"]
  },
  "Carmona": {
    label: "Carmona",
    isCapital: false,
    barrios: ["Casco histórico amurallado", "Guadajoz", "Urbanización Pino Grande", "Las Monjas", "Diseminados de gran escala"]
  },
  "Cañada Rosal": {
    label: "Cañada Rosal",
    isCapital: false,
    barrios: ["Casco urbano regular", "Diseminados"]
  },
  "Écija": {
    label: "Écija",
    isCapital: false,
    barrios: ["Casco monumental", "Villanueva del Rey", "El Villar", "Cerro Perea", "Diseminados de la campiña alta"]
  },
  "El Coronil": {
    label: "El Coronil",
    isCapital: false,
    barrios: ["Casco urbano tradicional", "Diseminados agrarios"]
  },
  "El Palmar de Troya": {
    label: "El Palmar de Troya",
    isCapital: false,
    barrios: ["Casco urbano consolidado", "sector del Palmar de Troya"]
  },
  "El Rubio": {
    label: "El Rubio",
    isCapital: false,
    barrios: ["Casco urbano tradicional", "Diseminados agrarios"]
  },
  "El Viso del Alcor": {
    label: "El Viso del Alcor",
    isCapital: false,
    barrios: ["Casco urbano consolidado", "El Huerto de la Alunada", "Diseminados"]
  },
  "Fuentes de Andalucía": {
    label: "Fuentes de Andalucía",
    isCapital: false,
    barrios: ["Casco urbano barroco", "Diseminados de campiña"]
  },
  "Herrera": {
    label: "Herrera",
    isCapital: false,
    barrios: ["Casco urbano de Herrera", "Las Lagunillas", "Diseminados agrícolas"]
  },
  "La Campana": {
    label: "La Campana",
    isCapital: false,
    barrios: ["Casco urbano consolidado", "Diseminados agrarios"]
  },
  "La Luisiana": {
    label: "La Luisiana",
    isCapital: false,
    barrios: ["La Luisiana (Centro)", "El Campillo"]
  },
  "La Puebla de Cazalla": {
    label: "La Puebla de Cazalla",
    isCapital: false,
    barrios: ["Casco urbano", "Barriada de la Fuenlonguilla", "Diseminados de campiña baja"]
  },
  "Lantejuela": {
    label: "Lantejuela",
    isCapital: false,
    barrios: ["Casco urbano tradicional", "Diseminados agrarios"]
  },
  "Los Molares": {
    label: "Los Molares",
    isCapital: false,
    barrios: ["Casco urbano", "El Castillo", "Diseminados de campiña media"]
  },
  "Los Palacios y Villafranca": {
    label: "Los Palacios y Villafranca",
    isCapital: false,
    barrios: ["Casco urbano denso", "El Trobal", "Maribáñez", "Chapatales"]
  },
  "Mairena del Alcor": {
    label: "Mairena del Alcor",
    isCapital: false,
    barrios: ["Casco urbano consolidado", "El Torreón", "Alconchel", "Diseminados residenciales"]
  },
  "Marchena": {
    label: "Marchena",
    isCapital: false,
    barrios: ["Casco histórico señorial", "sector de la Alcazaba", "Diseminados de campiña baja"]
  },
  "Marinaleda": {
    label: "Marinaleda",
    isCapital: false,
    barrios: ["Casco urbano", "Matarredonda", "Diseminados cooperativos"]
  },
  "Morón de la Frontera": {
    label: "Morón de la Frontera",
    isCapital: false,
    barrios: ["Casco monumental", "Barriada del Pantano", "El Rancho", "Diseminados rústicos"]
  },
  "Osuna": {
    label: "Osuna",
    isCapital: false,
    barrios: ["Casco histórico monumental", "El Puerto de la Encina", "Diseminados agrarios"]
  },
  "Paradas": {
    label: "Paradas",
    isCapital: false,
    barrios: ["Casco urbano regular", "Diseminados agrarios"]
  },
  "Utrera": {
    label: "Utrera",
    isCapital: false,
    barrios: ["Utrera Centro", "Trajano", "Pinzón", "Guadalema de los Quintero", "El Torbiscal", "La Herradera", "Casablanca", "Casas Cerros", "El Comodoro", "La Aguardientera", "Los Adrianes", "El Recuero", "La Juncosa"]
  },
  // Territorios de Frontera - Sierra Morena
  "Alanís": {
    label: "Alanís",
    isCapital: false,
    barrios: ["Casco urbano medieval", "Diseminados rústicos y forestales"]
  },
  "Almadén de la Plata": {
    label: "Almadén de la Plata",
    isCapital: false,
    barrios: ["Casco urbano de Almadén", "Diseminados de dehesa"]
  },
  "Aznalcóllar": {
    label: "Aznalcóllar",
    isCapital: false,
    barrios: ["Casco urbano consolidado", "zona minera", "Diseminados forestales"]
  },
  "Castilblanco de los Arroyos": {
    label: "Castilblanco de los Arroyos",
    isCapital: false,
    barrios: ["Casco urbano", "San Benito", "Diseminados del Camino de Santiago"]
  },
  "Cazalla de la Sierra": {
    label: "Cazalla de la Sierra",
    isCapital: false,
    barrios: ["Casco urbano monumental", "Diseminados forestales de dehesa"]
  },
  "Constantina": {
    label: "Constantina",
    isCapital: false,
    barrios: ["Casco urbano señorial", "Barriada de la Morería", "Diseminados rústicos"]
  },
  "El Castillo de las Guardas": {
    label: "El Castillo (Pueblo)",
    isCapital: false,
    barrios: ["Arroyo de la Plata (Venta Abajo)", "Valdeflores", "Minas del Castillo (Fuente Pinar, Vistahermosa, La Mina)", "La Aulaga", "Archidona", "La Alcornocosa (Los Humeros)", "El Cañuelo", "El Peralejo (Peralejo Alto, Peralejo Bajo)", "Las Cañadillas", "Peroamigo", "Las Cortecillas"]
  },
  "El Garrobo": {
    label: "El Garrobo",
    isCapital: false,
    barrios: ["Casco urbano serrano", "Diseminados cinegéticos"]
  },
  "El Madroño": {
    label: "El Madroño",
    isCapital: false,
    barrios: ["Casco urbano de El Madroño", "El Pintado", "Villaguzmán", "El Alamo", "Diseminados"]
  },
  "El Pedroso": {
    label: "El Pedroso",
    isCapital: false,
    barrios: ["Casco urbano", "Diseminados forestales de Sierra Morena central"]
  },
  "El Real de la Jara": {
    label: "El Real de la Jara",
    isCapital: false,
    barrios: ["Casco urbano serrano consolidado", "Diseminados forestales"]
  },
  "El Ronquillo": {
    label: "El Ronquillo",
    isCapital: false,
    barrios: ["Casco urbano consolidado", "El Romeral", "Diseminados rústicos de dehesa"]
  },
  "Gerena": {
    label: "Gerena",
    isCapital: false,
    barrios: ["Casco urbano tradicional", "Diseminados residenciales"]
  },
  "Guadalcanal": {
    label: "Guadalcanal",
    isCapital: false,
    barrios: ["Casco urbano tradicional serrano", "Diseminados rústicos de olivar"]
  },
  "Guillena": {
    label: "Guillena",
    isCapital: false,
    barrios: ["Casco urbano de Guillena", "Las Pajanosas", "Torre de la Reina"]
  },
  "La Puebla de los Infantes": {
    label: "La Puebla de los Infantes",
    isCapital: false,
    barrios: ["Casco urbano de La Puebla", "Diseminados forestales del embalse de José Torán"]
  },
  "Las Navas de la Concepción": {
    label: "Las Navas de la Concepción",
    isCapital: false,
    barrios: ["Casco urbano tradicional", "Diseminados de dehesa alta"]
  },
  "San Nicolás del Puerto": {
    label: "San Nicolás del Puerto",
    isCapital: false,
    barrios: ["Casco urbano consolidado", "Cascadas del Huéznar", "Diseminados turísticos"]
  },
  // Territorios de Frontera - Sierra Sur
  "Aguadulce": {
    label: "Aguadulce",
    isCapital: false,
    barrios: ["Casco urbano tradicional serrano", "Diseminados rústicos"]
  },
  "Algámitas": {
    label: "Algámitas",
    isCapital: false,
    barrios: ["Casco urbano de Algámitas", "Peñón de Algámitas", "Diseminados turísticos"]
  },
  "Badolatosa": {
    label: "Badolatosa",
    isCapital: false,
    barrios: ["Casco urbano de Badolatosa", "Corcoya", "Diseminados"]
  },
  "Casariche": {
    label: "Casariche",
    isCapital: false,
    barrios: ["Casco urbano consolidado", "El Rigüelo", "Diseminados agrarios"]
  },
  "Coripe": {
    label: "Coripe",
    isCapital: false,
    barrios: ["Casco urbano tradicional serrano", "Diseminados forestales and de olivar"]
  },
  "El Saucejo": {
    label: "El Saucejo",
    isCapital: false,
    barrios: ["Casco urbano de El Saucejo", "La Mezquitilla", "Navarredonda", "Diseminados agrícolas"]
  },
  "Estepa": {
    label: "Estepa",
    isCapital: false,
    barrios: ["Casco histórico", "Barriada de los Remedios", "Polígono industrial de mantecados"]
  },
  "Gilena": {
    label: "Gilena",
    isCapital: false,
    barrios: ["Casco urbano tradicional", "Diseminados agrícolas"]
  },
  "La Roda de Andalucía": {
    label: "La Roda de Andalucía",
    isCapital: false,
    barrios: ["Casco urbano tradicional", "Barriada de la Estación", "Diseminados rústicos"]
  },
  "Lora de Estepa": {
    label: "Lora de Estepa",
    isCapital: false,
    barrios: ["Casco urbano de Lora de Estepa", "Diseminados rústicos de olivar"]
  },
  "Los Corrales": {
    label: "Los Corrales",
    isCapital: false,
    barrios: ["Casco urbano tradicional serrano", "Diseminados agrícolas"]
  },
  "Martín de la Jara": {
    label: "Martín de la Jara",
    isCapital: false,
    barrios: ["Casco urbano consolidado", "sector de la Laguna del Gobierno", "Diseminados"]
  },
  "Montellano": {
    label: "Montellano",
    isCapital: false,
    barrios: ["Casco urbano tradicional", "Diseminados forestales"]
  },
  "Pedrera": {
    label: "Pedrera",
    isCapital: false,
    barrios: ["Casco urbano de Pedrera", "Diseminados industriales y de olivar"]
  },
  "Pruna": {
    label: "Pruna",
    isCapital: false,
    barrios: ["Casco urbano consolidado", "Castillo de Hierro", "El Pilar Lejos", "Diseminados"]
  },
  "Villanueva de San Juan": {
    label: "Villanueva de San Juan",
    isCapital: false,
    barrios: ["Casco urbano tradicional serrano", "Diseminados agrícolas de campiña de sierra"]
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
export const getFlatZones = (taxonomy: Record<string, SevillaTaxonomyData>): FlatZone[] => {
  const list: FlatZone[] = [];
  Object.entries(taxonomy).forEach(([dist, data]) => {
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
  // Load initial taxonomy, merging with local storage custom zones
  const [customTaxonomy, setCustomTaxonomy] = useState<Record<string, SevillaTaxonomyData>>(() => {
    const tax = { ...SEVILLA_TAXONOMY };
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("crm_custom_zones");
        if (stored) {
          const parsed = JSON.parse(stored) as Record<string, string[]>;
          Object.entries(parsed).forEach(([dist, barrios]) => {
            if (tax[dist]) {
              const merged = Array.from(new Set([...tax[dist].barrios, ...barrios]));
              tax[dist] = { ...tax[dist], barrios: merged };
            } else {
              tax[dist] = {
                label: dist.toLowerCase().includes("sevilla") ? `Sevilla Capital - ${dist}` : dist,
                isCapital: dist.toLowerCase().includes("sevilla"),
                barrios: barrios
              };
            }
          });
        }
      } catch (e) {
        console.error("Error loading custom zones:", e);
      }
    }
    return tax;
  });

  const [activeTab, setActiveTab] = useState<"tree" | "search" | "ai">("tree");
  const [searchTerm, setSearchTerm] = useState("");
  
  // Tree collapse state tracking by district key
  const [collapsedDistricts, setCollapsedDistricts] = useState<Record<string, boolean>>(() => {
    const states: Record<string, boolean> = {};
    Object.keys(customTaxonomy).forEach(k => {
      // Keep Sevilla Capital districts expanded by default, collapse pueblos
      states[k] = !customTaxonomy[k].isCapital;
    });
    return states;
  });

  // Copilot AI Chat states
  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<Array<{ sender: "user" | "paula", text: string, zones?: string[] }>>([
    {
      sender: "paula",
      text: "¡Hola Álvaro! Escribe en lenguaje natural qué zonas, calles o hitos de Sevilla busca tu comprador (ej: 'Busca algo cerca de Metromar en Mairena o en Triana cerca del río') y las marcaré automáticamente por ti.\n\n💡 ¡NUEVO! También puedes pedirme registrar una nueva zona directamente diciendo por ejemplo: 'Añade la zona Camas - Nuevo Barrio' y la incorporaré al instante a tu catálogo."
    }
  ]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiProposedZones, setAiProposedZones] = useState<string[]>([]);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);

  // Flattened zones dictionary for search and AI comparison
  const flatZones = useMemo(() => getFlatZones(customTaxonomy), [customTaxonomy]);

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
      // Get the Supabase access token for API authorization
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      // Safe POST call under dynamic server authentication check
      const response = await fetch("/api/ai/zones", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token || ''}`
        },
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

      // Si la respuesta nos indica registrar una nueva zona de forma dinámica
      if (result.add_custom_zone) {
        const { district, barrio } = result.add_custom_zone;
        if (district && barrio) {
          setCustomTaxonomy(prev => {
            const next = { ...prev };
            if (next[district]) {
              if (!next[district].barrios.includes(barrio)) {
                next[district] = {
                  ...next[district],
                  barrios: [...next[district].barrios, barrio]
                };
              }
            } else {
              next[district] = {
                label: district.toLowerCase().includes("sevilla") ? `Sevilla Capital - ${district}` : district,
                isCapital: district.toLowerCase().includes("sevilla"),
                barrios: [barrio]
              };
            }
            
            // Guardar en localStorage para persistencia local en el CRM
            if (typeof window !== "undefined") {
              const localParsed: Record<string, string[]> = {};
              Object.entries(next).forEach(([k, d]) => {
                const originalBarrios = SEVILLA_TAXONOMY[k]?.barrios || [];
                const custom = d.barrios.filter(b => !originalBarrios.includes(b));
                if (custom.length > 0 || !SEVILLA_TAXONOMY[k]) {
                  localParsed[k] = custom.length > 0 ? custom : d.barrios;
                }
              });
              localStorage.setItem("crm_custom_zones", JSON.stringify(localParsed));
            }
            
            return next;
          });

          // Registrar selección automática de la nueva zona creada
          const newZoneKey = `${district} - ${barrio}`;
          if (!selectedZones.includes(newZoneKey)) {
            onChange([...selectedZones, newZoneKey]);
          }
        }
      }
      
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
                {Object.entries(customTaxonomy)
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
                {Object.entries(customTaxonomy)
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
