import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Inicializar cliente Supabase para validar sesión del backend
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const LLM_MODEL = process.env.LLM_MODEL || 'gemini-1.5-flash';

// Taxonomía oficial disponible (para inyectar en el System Prompt)
const TAXONOMY_PROMPT = `
TAXONOMÍA OFICIAL DISPONIBLE (Distrito/Municipio - Barrio/Subzona):

Sevilla Capital:
- "Centro - Santa Cruz / Alfalfa"
- "Centro - Casco Antiguo / Arenal"
- "Centro - San Vicente / San Lorenzo"
- "Centro - Regina / Encarnación"
- "Centro - Puerta de Jerez / Prado"
- "Triana - Triana Casco Antiguo / Calle Betis"
- "Triana - Barrio León"
- "Triana - El Tardón"
- "Triana - Voluntad / Pagés del Corro"
- "Triana - Ronda de Triana"
- "Los Remedios - Los Remedios Centro / Asunción"
- "Los Remedios - Tablada"
- "Los Remedios - Parque de los Príncipes"
- "Nervión - Nervión Centro / Buhaira"
- "Nervión - Viapol / San Bernardo"
- "Nervión - Ramón y Cajal / Ciudad Jardín"
- "Nervión - La Calzada / Luis Montoto"
- "Macarena - La Macarena / Parlamento"
- "Macarena - Doctor Barraquer / León XIII"
- "Macarena - El Cerezo"
- "Macarena - Pio XII / Miraflores"
- "Sevilla Este - Avenida de las Ciencias"
- "Sevilla Este - Las Gondolas / Entrepuentes"
- "Sevilla Este - Polígono Aeropuerto / Puerta Este"
- "Sevilla Este - Emilio Lemos / Alcosa"
- "Bellavista - La Palmera - Reina Mercedes / Heliópolis"
- "Bellavista - La Palmera - Los Bermejales"
- "Bellavista - La Palmera - Bellavista Centro"
- "Bellavista - La Palmera - Jardines de Hércules"
- "San Pablo - Santa Justa - Santa Justa / Kansas City"
- "San Pablo - Santa Justa - San Pablo A, B, C, D"
- "San Pablo - Santa Justa - Huerta de Santa Teresa"

Pueblos del Aljarafe / Provincia:
- "Mairena del Aljarafe - Mairena Centro / Casco Antiguo"
- "Mairena del Aljarafe - Ciudad Expo / Metromar"
- "Mairena del Aljarafe - Cavaleri"
- "Mairena del Aljarafe - Simón Verde"
- "Mairena del Aljarafe - Lepanto / El Jardinillo"
- "Mairena del Aljarafe - Nuevo Bulevar"
- "Tomares - Tomares Centro"
- "Tomares - Santa Eufemia"
- "Tomares - Villares Altos"
- "Tomares - Las Almenas"
- "Tomares - La Cartuja"
- "Bormujos - Bormujos Centro"
- "Bormujos - La Florida"
- "Bormujos - Zaudín (Urbanización)"
- "Bormujos - El Almendral"
- "Dos Hermanas - Dos Hermanas Centro"
- "Dos Hermanas - Montequinto / Arco Norte"
- "Dos Hermanas - Condequinto (Urbanización)"
- "Dos Hermanas - Entrenúcleos"
- "Gines - Gines Centro / Casco Antiguo"
- "Gines - Las Brisas"
- "Gines - Urbanización El Prado"
- "Gines - Europa / La Florida"
- "Castilleja de la Cuesta - Castilleja Centro"
- "Castilleja de la Cuesta - Nueva Sevilla"
- "Castilleja de la Cuesta - El Faro / Real de la Alhambra"
- "San Juan de Aznalfarache - Barrio Bajo / Parada de Metro"
- "San Juan de Aznalfarache - Barrio Alto"
- "San Juan de Aznalfarache - Valparaíso / Real Club de Golf"
- "Espartinas - Espartinas Centro"
- "Espartinas - Cerro del Viento"
- "Espartinas - Urbanización El Retiro"
- "Espartinas - Las Solanas"
- "Alcalá de Guadaíra - Alcalá Centro"
- "Alcalá de Guadaíra - Campo de las Beatas"
- "Alcalá de Guadaíra - Silos / La Rinconada"
- "Alcalá de Guadaíra - La Nogalera"
- "La Rinconada - San José de la Rinconada Centro"
- "La Rinconada - La Rinconada Centro"
- "La Rinconada - El Mirador / La Paz"
- "Utrera - Utrera Centro"
- "Utrera - Consolación"
- "Utrera - La Mulata / Naranjal de Castillo"
- "Mairena del Alcor / El Viso - Mairena del Alcor Centro"
- "Mairena del Alcor / El Viso - El Viso del Alcor Centro"
- "Mairena del Alcor / El Viso - Urbanizaciones / Los Alcores"
`;

const SYSTEM_INSTRUCTION = `
Eres un Asistente Experto en Geografía Inmobiliaria de Sevilla para la plataforma "Tu Asesor".
Tu misión es interpretar la descripción de zonas, calles, monumentos o hitos que desea un comprador en Sevilla y su área metropolitana, y mapearlos con precisión absoluta a nuestra taxonomía oficial de barrios y pueblos.

${TAXONOMY_PROMPT}

INSTRUCCIONES DE RAZONAMIENTO SEMÁNTICO:
1. Si el usuario menciona una calle, monumento o punto emblemático, asócialo al barrio/subzona correspondiente. Ejemplos de mapeo semántico:
   - "calle Betis", "calle Pages del Corro" -> "Triana - Triana Casco Antiguo / Calle Betis" o "Triana - Voluntad / Pagés del Corro".
   - "Metromar", "Ciudad Expo", "parada de metro Ciudad Expo" -> "Mairena del Aljarafe - Ciudad Expo / Metromar".
   - "Ramón y Cajal", "facultades Viapol", "San Bernardo" -> "Nervión - Viapol / San Bernardo" o "Nervión - Ramón y Cajal / Ciudad Jardín".
   - "Asunción", "feria", "Parque de los Príncipes" -> "Los Remedios - Los Remedios Centro / Asunción" o "Los Remedios - Parque de los Príncipes".
   - "Avenida de las Ciencias", "Las Góndolas", "Alcosa" -> "Sevilla Este - Avenida de las Ciencias", "Sevilla Este - Las Gondolas / Entrepuentes" o "Sevilla Este - Emilio Lemos / Alcosa".
   - "Zaudín" -> "Bormujos - Zaudín (Urbanización)".
   - "Entrenúcleos", "Montequinto", "Condequinto" -> "Dos Hermanas - Entrenúcleos", "Dos Hermanas - Montequinto / Arco Norte" o "Dos Hermanas - Condequinto (Urbanización)".
2. Asocia múltiples barrios si la descripción abarca diferentes puntos.
3. Si no hay suficiente información o la zona queda totalmente fuera de Sevilla y Aljarafe, devuelve un array vacío.

DEBES DEVOLVER EXCLUSIVAMENTE UN OBJETO JSON CON LA SIGUIENTE ESTRUCTURA:
{
  "detected_zones": [
    "Nombre Exacto de la Zona 1 (debe coincidir con la lista de Taxonomía)",
    "Nombre Exacto de la Zona 2"
  ],
  "reasoning": "Breve explicación de un párrafo en español de por qué has seleccionado estas zonas según las calles/hitos mencionados."
}
`;

export async function POST(req: Request) {
  try {
    // 1. Validar autenticación de administrador
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Falta cabecera de autorización' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Token no provisto' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      console.warn('[AI Zones] Intento de acceso no autorizado o sesión expirada');
      return NextResponse.json({ error: 'Sesión no válida o no autorizada' }, { status: 401 });
    }

    // 2. Extraer cuerpo de la petición
    const { text } = await req.json();
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'El campo "text" es obligatorio y debe ser una cadena.' }, { status: 400 });
    }

    // 3. Fallback defensivo si no hay clave de API de Gemini
    if (!GEMINI_API_KEY) {
      console.warn('[AI Zones] GEMINI_API_KEY no configurada. Ejecutando detector local por palabras clave.');
      return NextResponse.json(localKeywordDetector(text));
    }

    // 4. Llamada HTTP a la API de Google Gemini (Flash o Pro)
    const modelName = LLM_MODEL === 'gemini-1.5-flash' ? 'gemini-1.5-flash' : LLM_MODEL;
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;

    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: text }],
          },
        ],
        systemInstruction: {
          parts: [{ text: SYSTEM_INSTRUCTION }],
        },
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2,
          maxOutputTokens: 600,
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      console.error('[AI Zones] Gemini API devolvió error:', geminiResponse.status, errText);
      return NextResponse.json(localKeywordDetector(text)); // Fallback inteligente en caso de error del servicio
    }

    const data = await geminiResponse.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      console.error('[AI Zones] Respuesta vacía de candidatos de Gemini');
      return NextResponse.json(localKeywordDetector(text));
    }

    // Parsear respuesta estructurada
    try {
      const parsed = JSON.parse(content.trim());
      return NextResponse.json(parsed);
    } catch (parseErr) {
      console.error('[AI Zones] Error al parsear JSON devuelto por Gemini:', content);
      return NextResponse.json(localKeywordDetector(text));
    }

  } catch (error: any) {
    console.error('[AI Zones] Error interno en API de zonas:', error.message || error);
    return NextResponse.json({ error: 'Error interno del servidor al procesar las zonas' }, { status: 500 });
  }
}

// Detector local de palabras clave para fallback inteligente de alta fidelidad
function localKeywordDetector(text: string) {
  const lower = text.toLowerCase();
  const detected: string[] = [];
  const reasons: string[] = [];

  // Mapeos rápidos de keywords a subzonas oficiales
  const mapping: { keywords: string[]; zoneId: string; reason: string }[] = [
    {
      keywords: ['santa cruz', 'alfalfa', 'judería', 'giralda'],
      zoneId: 'Centro - Santa Cruz / Alfalfa',
      reason: 'barrio histórico de Santa Cruz o la Alfalfa'
    },
    {
      keywords: ['arenal', 'casco antiguo', 'museo', 'plaza de armas'],
      zoneId: 'Centro - Casco Antiguo / Arenal',
      reason: 'entorno del Casco Antiguo / Arenal'
    },
    {
      keywords: ['san vicente', 'san lorenzo', 'alameda', 'hercules'],
      zoneId: 'Centro - San Vicente / San Lorenzo',
      reason: 'zonas de San Vicente y San Lorenzo'
    },
    {
      keywords: ['regina', 'encarnacion', 'setas', 'feria'],
      zoneId: 'Centro - Regina / Encarnación',
      reason: 'barrios colindantes a las Setas de la Encarnación o Regina'
    },
    {
      keywords: ['betis', 'triana casco', 'altozano', 'pureza'],
      zoneId: 'Triana - Triana Casco Antiguo / Calle Betis',
      reason: 'corazón de Triana o la calle Betis'
    },
    {
      keywords: ['barrio leon', 'san gonzalo'],
      zoneId: 'Triana - Barrio León',
      reason: 'el emblemático Barrio León'
    },
    {
      keywords: ['ronda triana', 'ronda de triana'],
      zoneId: 'Triana - Ronda de Triana',
      reason: 'Avenida Ronda de Triana'
    },
    {
      keywords: ['asuncion', 'asunción', 'remedios centro', 'república argentina'],
      zoneId: 'Los Remedios - Los Remedios Centro / Asunción',
      reason: 'eje comercial de la calle Asunción en Los Remedios'
    },
    {
      keywords: ['parque de los principes', 'parque de los príncipes'],
      zoneId: 'Los Remedios - Parque de los Príncipes',
      reason: 'inmediaciones del Parque de los Príncipes'
    },
    {
      keywords: ['buhaira', 'nervion centro', 'nervión centro', 'eduardo dato'],
      zoneId: 'Nervión - Nervión Centro / Buhaira',
      reason: 'zona residencial de la Buhaira y Nervión Centro'
    },
    {
      keywords: ['viapol', 'san bernardo', 'ramon y cajal'],
      zoneId: 'Nervión - Viapol / San Bernardo',
      reason: 'entorno universitario de Viapol o el barrio de San Bernardo'
    },
    {
      keywords: ['luis montoto', 'calzada', 'cruz campo'],
      zoneId: 'Nervión - La Calzada / Luis Montoto',
      reason: 'Avenida Luis Montoto o La Calzada'
    },
    {
      keywords: ['macarena parlament', 'parlamento', 'resolana'],
      zoneId: 'Macarena - La Macarena / Parlamento',
      reason: 'zona histórica de la Macarena / Parlamento'
    },
    {
      keywords: ['ciencias', 'avenida de las ciencias', 'sevilla este'],
      zoneId: 'Sevilla Este - Avenida de las Ciencias',
      reason: 'eje principal de la Avenida de las Ciencias en Sevilla Este'
    },
    {
      keywords: ['las gondolas', 'las góndolas', 'entrepuentes'],
      zoneId: 'Sevilla Este - Las Gondolas / Entrepuentes',
      reason: 'urbanizaciones Las Góndolas / Entrepuentes'
    },
    {
      keywords: ['alcosa', 'emilio lemos'],
      zoneId: 'Sevilla Este - Emilio Lemos / Alcosa',
      reason: 'Avenida Emilio Lemos o Parque Alcosa'
    },
    {
      keywords: ['bermejales'],
      zoneId: 'Bellavista - La Palmera - Los Bermejales',
      reason: 'los Bermejales'
    },
    {
      keywords: ['reina mercedes', 'heliopolis', 'heliópolis'],
      zoneId: 'Bellavista - La Palmera - Reina Mercedes / Heliópolis',
      reason: 'campus de Reina Mercedes o el barrio de Heliópolis'
    },
    {
      keywords: ['kansas city', 'santa justa'],
      zoneId: 'San Pablo - Santa Justa - Santa Justa / Kansas City',
      reason: 'entorno de la Estación de Santa Justa o la Avenida Kansas City'
    },
    // Aljarafe
    {
      keywords: ['ciudad expo', 'metromar', 'metro mairena'],
      zoneId: 'Mairena del Aljarafe - Ciudad Expo / Metromar',
      reason: 'urbanización Ciudad Expo o Centro Comercial Metromar'
    },
    {
      keywords: ['cavaleri'],
      zoneId: 'Mairena del Aljarafe - Cavaleri',
      reason: 'barrio de Cavaleri en Mairena'
    },
    {
      keywords: ['simon verde', 'simón verde'],
      zoneId: 'Mairena del Aljarafe - Simón Verde',
      reason: 'prestigiosa urbanización de Simón Verde'
    },
    {
      keywords: ['bulevar mairena', 'nuevo bulevar'],
      zoneId: 'Mairena del Aljarafe - Nuevo Bulevar',
      reason: 'zona en expansión del Nuevo Bulevar'
    },
    {
      keywords: ['tomares centro', 'ayuntamiento tomares'],
      zoneId: 'Tomares - Tomares Centro',
      reason: 'casco urbano de Tomares Centro'
    },
    {
      keywords: ['santa eufemia'],
      zoneId: 'Tomares - Santa Eufemia',
      reason: 'urbanización Santa Eufemia en Tomares'
    },
    {
      keywords: ['zaudin', 'zaudín'],
      zoneId: 'Bormujos - Zaudín (Urbanización)',
      reason: 'exclusiva urbanización de golf Zaudín'
    },
    {
      keywords: ['montequinto', 'monte quinto'],
      zoneId: 'Dos Hermanas - Montequinto / Arco Norte',
      reason: 'distrito de Montequinto'
    },
    {
      keywords: ['entrenucleos', 'entrenúcleos'],
      zoneId: 'Dos Hermanas - Entrenúcleos',
      reason: 'zona vanguardista de Entrenúcleos'
    },
    {
      keywords: ['gines', 'casco antiguo gines', 'el prado gines', 'las brisas gines'],
      zoneId: 'Gines - Gines Centro / Casco Antiguo',
      reason: 'municipio de Gines o sus urbanizaciones'
    },
    {
      keywords: ['castilleja', 'nueva sevilla', 'el faro castilleja'],
      zoneId: 'Castilleja de la Cuesta - Castilleja Centro',
      reason: 'municipio de Castilleja de la Cuesta'
    },
    {
      keywords: ['san juan de aznalfarache', 'san juan bajo', 'san juan alto', 'valparaiso san juan', 'valparaíso san juan'],
      zoneId: 'San Juan de Aznalfarache - Barrio Alto',
      reason: 'municipio de San Juan de Aznalfarache'
    },
    {
      keywords: ['espartinas', 'cerro del viento espartinas', 'el retiro espartinas'],
      zoneId: 'Espartinas - Espartinas Centro',
      reason: 'municipio de Espartinas'
    },
    {
      keywords: ['alcala de guadaira', 'alcalá de guadaira', 'alcala de guadaíra', 'alcalá de guadaíra', 'silos alcala', 'campo de las beatas'],
      zoneId: 'Alcalá de Guadaíra - Alcalá Centro',
      reason: 'municipio de Alcalá de Guadaíra'
    },
    {
      keywords: ['rinconada', 'san jose de la rinconada', 'san josé de la rinconada'],
      zoneId: 'La Rinconada - San José de la Rinconada Centro',
      reason: 'municipio de La Rinconada'
    },
    {
      keywords: ['utrera', 'consolacion utrera', 'la mulata utrera'],
      zoneId: 'Utrera - Utrera Centro',
      reason: 'municipio de Utrera'
    },
    {
      keywords: ['mairena del alcor', 'el viso del alcor', 'los alcores'],
      zoneId: 'Mairena del Alcor / El Viso - Mairena del Alcor Centro',
      reason: 'zona de Los Alcores (Mairena o El Viso)'
    }
  ];

  mapping.forEach(item => {
    const matched = item.keywords.some(kw => lower.includes(kw));
    if (matched) {
      detected.push(item.zoneId);
      reasons.push(item.reason);
    }
  });

  return {
    detected_zones: detected,
    reasoning: reasons.length > 0 
      ? `He analizado tu mensaje y he detectado coincidencia semántica con ${reasons.join(', ')}.`
      : "No he podido detectar palabras clave geográficas claras en el texto. He activado la búsqueda libre en el selector manual para que asocies las zonas directamente."
  };
}
