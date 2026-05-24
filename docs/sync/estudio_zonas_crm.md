# 🏛️ ESTUDIO ARQUITECTÓNICO & PLAN DE IMPLEMENTACIÓN
## Gestión Granular de Zonas y Barrios en CRM ("La Trilogía de Álvaro")

**Destinatario:** Álvaro López Cuevas  
**De:** Director General y Coordinador del Equipo de IA ("Tu Asesor V2")  
**Fecha:** 24 de Mayo de 2026  
**Documento de Arquitectura:** `docs/sync/estudio_zonas_crm.md` (y persistido como Artefacto)

---

## 📌 1. Introducción y Visión General
Álvaro, tu propuesta de división detallada es brillante y apunta directamente al núcleo competitivo de un CRM de alta gama: **la precisión de segmentación inmobiliaria**. En el sector premium, un cliente no busca simplemente "en Sevilla Este" o "en Mairena"; busca de forma extremadamente específica en *"Avenida de las Ciencias"*, *"Polígono Aeropuerto"*, o en las urbanizaciones de *"Ciudad Expo"* o *"Cavaleri"*.

Para dar solución a este reto, proponemos la **"Trilogía de Álvaro"**, un selector de zonas multifacético que se integrará de forma impecable en el Drawer de Comprador y en el formulario de creación manual de demandas. Este selector ofrecerá tres modos de interacción complementarios en una interfaz unificada:

```
┌────────────────────────────────────────────────────────┐
│             SELECTOR DE ZONAS PREMIUM                  │
├────────────────────────────────────────────────────────┤
│  [ Modo A: Árbol ]   [ Modo B: Buscador ]  [ Modo C: Copilot IA ] │
├────────────────────────────────────────────────────────┤
│  Vista interactiva según la modalidad elegida          │
└────────────────────────────────────────────────────────┘
```

---

## 🗺️ 2. Taxonomía Estructurada de Sevilla y Aljarafe (Sevilla DB-Taxonomy)
Para alimentar nuestro diccionario local de búsqueda granular, hemos definido una taxonomía de dos niveles (**Distrito/Municipio ➔ Barrio/Subzona**) que abarca más de 100 subzonas clave para el sector inmobiliario en Sevilla y su área metropolitana:

### 🏙️ Sevilla Capital (Distritos y sus Barrios)
1. **Distrito Centro**
   * *Santa Cruz / Alfalfa*
   * *Casco Antiguo / Arenal*
   * *San Vicente / San Lorenzo*
   * *Regina / Encarnación*
   * *Puerta de Jerez / Prado*
2. **Distrito Triana**
   * *Triana Casco Antiguo / Calle Betis*
   * *Barrio León*
   * *El Tardón*
   * *Voluntad / Pagés del Corro*
   * *Ronda de Triana*
3. **Distrito Los Remedios**
   * *Los Remedios Centro / Asunción*
   * *Tablada*
   * *Parque de los Príncipes*
4. **Distrito Nervión**
   * *Nervión Centro / Buhaira*
   * *Viapol / San Bernardo*
   * *Ramón y Cajal / Ciudad Jardín*
   * *La Calzada / Luis Montoto*
5. **Distrito Macarena**
   * *La Macarena / Parlamento*
   * *Doctor Barraquer / León XIII*
   * *El Cerezo*
   * *Pio XII / Miraflores*
6. **Distrito Sevilla Este**
   * *Avenida de las Ciencias*
   * *Las Gondolas / Entrepuentes*
   * *Polígono Aeropuerto / Puerta Este*
   * *Emilio Lemos / Alcosa*
7. **Distrito Bellavista - La Palmera**
   * *Reina Mercedes / Heliópolis*
   * *Los Bermejales*
   * *Bellavista Centro*
   * *Jardines de Hércules*
8. **Distrito San Pablo - Santa Justa**
   * *Santa Justa / Kansas City*
   * *San Pablo A, B, C, D*
   * *Huerta de Santa Teresa*

### 🏡 Pueblos Principales del Aljarafe y Área Metropolitana
9. **Mairena del Aljarafe**
   * *Mairena Centro / Casco Antiguo*
   * *Ciudad Expo / Metromar*
   * *Cavaleri*
   * *Simón Verde*
   * *Lepanto / El Jardinillo*
   * *Nuevo Bulevar*
10. **Tomares**
    * *Tomares Centro*
    * *Santa Eufemia*
    * *Villares Altos*
    * *Las Almenas*
    * *La Cartuja*
11. **Bormujos**
    * *Bormujos Centro*
    * *La Florida*
    * *Zaudín (Urbanización)*
    * *El Almendral*
12. **Dos Hermanas**
    * *Dos Hermanas Centro*
    * *Montequinto / Arco Norte*
    * *Condequinto (Urbanización)*
    * *Entrenúcleos*

---

## 🗄️ 3. Plan de Base de Datos y Mapeo de Sincronización

### A. Estrategia de Almacenamiento
Para garantizar la **retrocompatibilidad** total y no corromper los flujos y registros existentes, proponemos una estrategia híbrida inteligente:
1. **La columna `preferred_zones` en `buyers_demands` (y en `leads.preferences.preferred_zones`) seguirá siendo un array de textos (`text[]`).**
2. **Nomenclatura Normalizada (Mapeo de Nivel 2):** Al seleccionar un barrio específico (ej. *Ciudad Expo* en *Mairena del Aljarafe*), se guardará en base de datos con el formato unificado `"Municipio - Barrio"` o `"Distrito - Barrio"`. Ejemplos:
   - `"Mairena del Aljarafe - Ciudad Expo"`
   - `"Tomares - Tomares Centro"`
   - `"Nervión - Viapol / San Bernardo"`
   - `"Centro - Santa Cruz / Alfalfa"`

Esto ofrece enormes ventajas:
* Mantiene la sencillez de una sola columna `text[]` sin requerir tablas relacionales complejas de muchos-a-muchos (`buyer_zones`), lo cual simplifica enormemente las consultas en frontend y backend de Supabase.
* Permite hacer búsquedas exactas e híbridas. Si Álvaro filtra propiedades en "Nervión", el sistema sabrá por inclusión si coincide con cualquier subzona que comience con `"Nervión - "`.

### B. Impacto y Refinamiento del Matching Automático de Viviendas
El algoritmo de coincidencia (Matchmaker) se optimiza de la siguiente manera:
1. **Concordancia Geográfica de Polígonos:** Si el comprador dibujó un polígono, el inmueble con su coordenada física `[lat, lng]` se contrasta mediante Ray Casting contra el polígono. Esto es independiente de los textos.
2. **Concordancia Semántica por Barrios:** Si el comprador se registró mediante texto o se configuró manualmente y tiene subzonas definidas en `preferred_zones`:
   - El inmueble, al ser guardado en `PropertiesManager.tsx`, ahora tendrá un campo de texto obligatorio `subzone` estructurado con la misma taxonomía (ej: `"Mairena del Aljarafe - Ciudad Expo"`).
   - La consulta de emparejamiento buscará la coincidencia exacta: `preferred_zones` del comprador contiene la `subzone` del inmueble.
   - **Búsqueda Inteligente Heredada:** Si el comprador tiene seleccionada la macrozona `"Nervión"` en bruto, y el inmueble pertenece a `"Nervión - Viapol / San Bernardo"`, el motor de matching aplicará un comodín de comparación o un mapeo interno para declarar un match exitoso de nivel 1.

---

## 💎 4. Especificaciones del Diseño Visual (UI/UX)
Para mantener la coherencia con el diseño visual **Premium Dark Glassmorphism** de Tu Asesor V2, el selector se implementará en una ventana modal o sección de Drawer con las siguientes especificaciones:

* **Estructura de Contenedor:** Fondo glassmórfico de alta densidad (`bg-[#1E293B]/80 border border-white/10 backdrop-blur-xl rounded-2xl shadow-2xl p-6`).
* **Barra de Pestañas Interactivas:**
  - Iconos sutiles de Lucide React: `FolderTree` para Modo A, `Search` para Modo B, y `Sparkles` con un resplandor dorado para el Modo C (AI).
  - Pestaña activa con transición de escala y resalte en amarillo ámbar (`text-[#FBBF24] border-b-2 border-[#FBBF24]`).
* **Animaciones de Transición:** Cambio de pestañas y despliegue del árbol jerárquico controlados por `framer-motion` o transiciones CSS de Tailwind (`transition-all duration-300 ease-in-out`), evitando saltos visuales secos.

---

## 🤖 5. Especificación Técnica de "AI Zone Copilot" (Modo C)

El **AI Zone Copilot** es una característica revolucionaria y de altísima fidelidad. Integrará un minichat inmersivo en el selector donde Álvaro escribe en lenguaje natural y la IA extrae instantáneamente las zonas.

```
+-------------------------------------------------------------+
|  ✨ AI ZONE COPILOT                                        |
|  Escribe qué zonas busca tu cliente (calles, hitos, etc.)    |
|  [ Busco en Tomares cerca de Metromar o zona Ciudad Expo. ] |
|                                             [Analizar Zonas] |
+-------------------------------------------------------------+
|  Zonas detectadas automáticamente:                           |
|  [x] Mairena del Aljarafe - Ciudad Expo                     |
|  [x] Tomares - Tomares Centro                               |
|                                         [Aplicar Selección] |
+-------------------------------------------------------------+
```

### A. Flujo de Datos
1. El usuario introduce texto libre en la consola de Copilot.
2. Al hacer clic en "Analizar", el frontend realiza un `POST` a `/api/ai/zones` enviando el texto.
3. El endpoint invoca a la API de **Gemini** (a través de Firebase AI Logic o SDK oficial) utilizando **Structured Outputs (JSON Schema)** para garantizar que la respuesta sea 100% predecible y no contenga prosa explicativa.
4. Gemini recibe en su System Prompt la taxonomía completa de Sevilla y Aljarafe y realiza un razonamiento semántico avanzado.
5. El endpoint retorna un array JSON con las subzonas exactas identificadas.
6. El frontend actualiza reactivamente el estado de checkboxes de la interfaz y los chips de zonas de forma visualmente mágica con un destello ámbar de transición.

### B. Prompt del Sistema para Gemini
```
Eres un Asistente Experto en Geografía Inmobiliaria de Sevilla para la plataforma "Tu Asesor".
Tu misión es interpretar la descripción de zonas, calles, monumentos o hitos que desea un comprador en Sevilla y su área metropolitana, y mapearlos con precisión absoluta a nuestra taxonomía oficial de barrios y pueblos.

TAXONOMÍA OFICIAL DISPONIBLE:
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

INSTRUCCIONES DE RAZONAMIENTO SEMÁNTICO:
1. Si el usuario menciona una calle o monumento, asócialo al barrio correspondiente. Ejemplo: "calle Betis" -> "Triana - Triana Casco Antiguo / Calle Betis". "Metromar" o "Ciudad Expo" -> "Mairena del Aljarafe - Ciudad Expo / Metromar". "Ramón y Cajal" -> "Nervión - Ramón y Cajal / Ciudad Jardín". "Viapol" -> "Nervión - Viapol / San Bernardo". "Asunción" -> "Los Remedios - Los Remedios Centro / Asunción".
2. Asocia múltiples barrios si la descripción abarca diferentes puntos.
3. Si no hay suficiente información o la zona queda totalmente fuera de Sevilla y Aljarafe, devuelve un array vacío.

DEBES DEVOLVER EXCLUSIVAMENTE UN OBJETO JSON CON LA SIGUIENTE ESTRUCTURA:
{
  "detected_zones": [
    "Nombre Exacto de la Zona 1",
    "Nombre Exacto de la Zona 2"
  ],
  "reasoning": "Breve explicación de un párrafo en español de por qué has seleccionado estas zonas según las calles/hitos mencionados."
}
```

### C. Configuración de Structured Output en API `/api/ai/zones`
```typescript
// Next.js Route Handler - src/app/api/ai/zones/route.ts
import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/generative-ai'; // O integración con Firebase AI Logic

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(req: Request) {
  try {
    const { text } = await req.json();
    if (!text) {
      return NextResponse.json({ error: 'Texto requerido' }, { status: 400 });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
    
    const systemPrompt = `...[System Prompt superior con la taxonomía y JSON Schema]...`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        // Opcional: inyectar el responseSchema exacto
      },
      systemInstruction: systemPrompt
    });

    const responseText = result.response.text();
    const data = JSON.parse(responseText);

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error en AI Zone Copilot:', error);
    return NextResponse.json({ error: 'Error procesando la solicitud' }, { status: 500 });
  }
}
```

---

## 🤖 6. Prompts de Delegación para los Subagentes
Para materializar esta espectacular funcionalidad sin errores y de manera coordinada, delego las siguientes directrices precisas a los especialistas de IA:

### 🌐 A. Prompts para el Agente Web (UI/UX)
> **Rol:** Web Frontend Developer  
> **Objetivo:** Diseñar y programar los tres componentes visuales del selector granular de zonas (`ZonalSelectorPremium.tsx`) bajo la estética Premium Dark Glassmorphism.  
> **Directrices Técnicas:**
> 1. Crea la interfaz en `src/components/admin/sections/ZoneSelectorPremium.tsx`. El componente debe recibir las props `selectedZones: string[]`, `onChange: (zones: string[]) => void` y ser importable en modales y drawers.
> 2. **Modo A (Tree Select):** Implementa un árbol interactivo colapsable utilizando el estado reactivo de React. Mapea la taxonomía en un objeto JSON anidado. Los distritos/municipios deben expandirse y colapsarse con flechas de rotación suave y contar con un checkbox maestro (seleccionar distrito selecciona todos sus sub-barrios) y checkboxes individuales de barrio.
> 3. **Modo B (Fuzzy Match Finder):** Implementa un input de búsqueda con filtrado reactivo del diccionario aplanado de más de 100 subzonas. A medida que el usuario escribe, destaca con letras amarillas (`text-[#FBBF24]`) la subcadena coincidente y permite añadir el barrio con un clic.
> 4. **Modo C (AI Zone Copilot):** Diseña un minichat inmersivo de cristal templado. Incluye un textarea con placeholder sugerente, un botón con icono de destello (`Sparkles`) y un estado de carga animado tipo "shimmer" o spinner de alta gama. Al recibir la respuesta del API `/api/ai/zones`, muestra la justificación semántica en un bocadillo de chat elegante y renderiza la lista de zonas propuestas con checkboxes marcados por defecto para que Álvaro las valide y las aplique con un clic.
> 5. Utiliza `framer-motion` para animar las transiciones de pestañas y las expansiones de los árboles de distritos.

### 💼 B. Prompts para el Agente CRM (Integration & Sinking)
> **Rol:** CRM Developer  
> **Objetivo:** Integrar el componente `ZoneSelectorPremium.tsx` en el panel de control de administración, en particular en el formulario de creación manual de demandas y en el Drawer de edición en caliente del perfil de comprador.  
> **Directrices Técnicas:**
> 1. Modifica `src/components/admin/sections/BuyersManager.tsx` para integrar el nuevo selector en sustitución de la selección clásica por texto plano en el modal de creación y en el Drawer lateral de perfil.
> 2. Asegura que el flujo de **Edición en Caliente** se mantenga impecable: al añadir o remover zonas con el selector desde el Drawer, actualiza en tiempo real la base de datos de Supabase llamando a la mutación correspondiente con control dinámico.
> 3. Implementa lógica de mapeo defensiva: cuando se reciba de base de datos un array que contenga zonas antiguas (ej. `"Nervión"`, `"Mairena del Aljarafe"`), el componente selector debe marcarlas en el nivel macro (Modo A) o presentarlas en una sección de "Zonas Heredadas" sin romper el renderizado.
> 4. Actualiza el diseño financiero reactivo para que no colisione con el nuevo selector.

### ⚙️ C. Prompts para el Agente de Automatización y Seguridad
> **Rol:** Backend, Integrations & Security Specialist  
> **Objetivo:** Desarrollar el endpoint API `/api/ai/zones`, escribir el prompt definitivo de Gemini, asegurar el tipado de TypeScript y certificar las políticas RLS.  
> **Directrices Técnicas:**
> 1. Crea el manejador de ruta en `src/app/api/ai/zones/route.ts`.
> 2. Utiliza el SDK oficial de Google Generative AI o Firebase AI Logic para invocar al modelo `gemini-1.5-pro` o `gemini-1.5-flash`.
> 3. Configura el prompt del sistema tal y como se detalla en el estudio de arquitectura para asegurar un razonamiento espacial de calles e hitos geográficos de Sevilla (ej. Avenida de la Constitución, Nervión Plaza, Gran Plaza, Metromar, Zaudín, etc.).
> 4. Endurece el endpoint: restringe el acceso validando que la petición provenga de una sesión de administrador autenticada en Supabase (`supabase.auth.getSession()`), devolviendo un error 401 si no está autenticado.
> 5. Define las interfaces TypeScript en `src/types/index.ts` para tipar la taxonomía y la respuesta estructurada de la IA, evitando por completo el uso de tipos `any`.

---

## 📈 Conclusión y Siguientes Pasos
Álvaro, la implementación de la **Trilogía de Zonas y Barrios** y el **AI Zone Copilot** no sólo elevará a **Tu Asesor V2** a la cúspide de la innovación en software inmobiliario, sino que optimizará drásticamente tu operatividad diaria, permitiéndote segmentar demandas con precisión quirúrgica y emparejar de forma mágica las viviendas adecuadas.

Estamos preparados para dar orden de ejecución inmediata a los subagentes en cuanto nos des el visto bueno. ¡El futuro de la gestión inmobiliaria inteligente está aquí!

---
*Estudio persistido de forma segura en `docs/sync/estudio_zonas_crm.md` y registrado en la bitácora del Director General.*
