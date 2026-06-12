import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Inicializar cliente Supabase para validar sesión del backend
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const ZONES_LLM_MODEL = process.env.ZONES_LLM_MODEL || 'gemini-2.5-flash';

// Taxonomía oficial disponible (para inyectar en el System Prompt)
const TAXONOMY_PROMPT = `
TAXONOMÍA OFICIAL DISPONIBLE (Distrito/Municipio - Barrio/Subzona):

Sevilla Capital:
- "Centro - Alfalfa"
- "Centro - El Arenal"
- "Centro - Encarnación-Regina"
- "Centro - Feria"
- "Centro - Museo"
- "Centro - San Bartolomé"
- "Centro - San Gil"
- "Centro - San Julián"
- "Centro - San Lorenzo"
- "Centro - San Vicente"
- "Centro - Santa Catalina"
- "Centro - Santa Cruz"
- "Macarena - Begoña-Santa Catalina"
- "Macarena - Campos de Soria"
- "Macarena - Cisneo Alto-Santa María de Gracia"
- "Macarena - Cruz Roja-Capuchinos"
- "Macarena - Doctor Barraquer-Grupo Renfe-Policlínico"
- "Macarena - El Carmen"
- "Macarena - El Cerezo"
- "Macarena - El Rocío"
- "Macarena - El Torrejón"
- "Macarena - Hermandades-La Carrasca"
- "Macarena - La Barzola"
- "Macarena - La Palmilla-Doctor Marañón"
- "Macarena - La Paz-Las Golondrinas"
- "Macarena - Las Avenidas"
- "Macarena - León XIII-Los Naranjos"
- "Macarena - Los Príncipes-La Fontanilla"
- "Macarena - Macarena Tres Huertas-Macarena Cinco"
- "Macarena - Pino Flores"
- "Macarena - Pío XII"
- "Macarena - Retiro Obrero"
- "Macarena - Santas Justa y Rufina-Parque Miraflores"
- "Macarena - Santa María de Ordas-San Nicolás"
- "Macarena - Villegas"
- "Macarena - Polígono Norte"
- "Nervión - Ciudad Jardín"
- "Nervión - Huerta del Pilar"
- "Nervión - La Buhaira"
- "Nervión - La Calzada"
- "Nervión - La Florida"
- "Nervión - Nervión"
- "Nervión - San Bernardo"
- "Nervión - San Roque"
- "Cerro-Amate - Amate"
- "Cerro-Amate - El Cerro"
- "Cerro-Amate - Juan XXIII"
- "Cerro-Amate - La Plata"
- "Cerro-Amate - Los Pájaros"
- "Cerro-Amate - Palmete"
- "Cerro-Amate - Rochelambert"
- "Cerro-Amate - Santa Aurelia-Cantábrico-Atlántico-La Romería"
- "Sur - Avenida de la Paz"
- "Sur - Felipe II-Los Diez Mandamientos"
- "Sur - Giralda Sur"
- "Sur - Huerta de la Salud"
- "Sur - La Oliva"
- "Sur - Las Letanías"
- "Sur - Polígono Sur"
- "Sur - Tabladilla-La Estrella"
- "Sur - Tiro de Línea-Santa Genoveva"
- "Triana - Barrio León"
- "Triana - El Tardón-El Carmen"
- "Triana - Triana Casco Antiguo"
- "Triana - Triana Este"
- "Triana - Triana Oeste"
- "Norte - Barriada Pino Montano"
- "Norte - Consolación"
- "Norte - El Gordillo"
- "Norte - Las Almenas"
- "Norte - San Jerónimo"
- "Norte - La Bachillera"
- "Norte - Los Carteros"
- "Norte - San Diego"
- "Norte - Los Arcos"
- "Norte - Las Naciones-Parque Atlántico-Las Dalias"
- "Norte - San Matías"
- "Norte - Aeropuerto Viejo"
- "Norte - Valdezorras"
- "San Pablo - Santa Justa - Árbol Gordo"
- "San Pablo - Santa Justa - El Fontanal-María Auxiliadora-Carretera de Carmona"
- "San Pablo - Santa Justa - Huerta de Santa Teresa"
- "San Pablo - Santa Justa - La Corza"
- "San Pablo - Santa Justa - Las Huertas"
- "San Pablo - Santa Justa - San Carlos-Tartessos"
- "San Pablo - Santa Justa - San José Obrero"
- "San Pablo - Santa Justa - San Pablo A y B"
- "San Pablo - Santa Justa - San Pablo C"
- "San Pablo - Santa Justa - San Pablo D y E"
- "San Pablo - Santa Justa - Santa Clara"
- "San Pablo - Santa Justa - Zodiaco"
- "Este-Alcosa-Torreblanca - Colores-Entreparques"
- "Este-Alcosa-Torreblanca - Palacio de Congresos-Urbadiez-Entrepuentes"
- "Este-Alcosa-Torreblanca - Parque Alcosa-Jardines del Edén"
- "Este-Alcosa-Torreblanca - Torreblanca"
- "Palmera-Bellavista - Barriada de Pineda"
- "Palmera-Bellavista - Bellavista"
- "Palmera-Bellavista - Elcano-Los Bermejales"
- "Palmera-Bellavista - Heliópolis"
- "Palmera-Bellavista - Pedro Salvador-Las Palmeritas-Guadaíra"
- "Palmera-Bellavista - Sector Sur-La Palmera-Reina Mercedes"
- "Los Remedios - Tablada"
- "Los Remedios - Los Remedios"

Dos Hermanas:
- "Dos Hermanas - Dos Hermanas Centro"
- "Dos Hermanas - Quinto (Montequinto)"
- "Dos Hermanas - Condequinto"
- "Dos Hermanas - Olivar de Quintos"
- "Dos Hermanas - Fuente del Rey"
- "Dos Hermanas - Marisma y Puntales Adriano"
- "Dos Hermanas - Entrenúcleos"
- "Dos Hermanas - Barrio de Los Remedios"
- "Dos Hermanas - La Motilla"

Comarca Metropolitana y Aljarafe:
- "Albaida del Aljarafe - Casco urbano de Albaida"
- "Albaida del Aljarafe - Urbanización San Sebastián"
- "Albaida del Aljarafe - Diseminados rurales"
- "Almensilla - Casco urbano consolidado"
- "Almensilla - Urbanización Santa Marina"
- "Almensilla - El Romeral"
- "Almensilla - Los Rosales"
- "Almensilla - Diseminados"
- "Benacazón - Casco urbano de Benacazón"
- "Benacazón - Urbanización El Mirador"
- "Benacazón - Urbanización Portaceli"
- "Benacazón - Diseminados"
- "Bollullos de la Mitación - Casco urbano"
- "Bollullos de la Mitación - Urbanización Cuatrovitas"
- "Bollullos de la Mitación - Urbanización La Juliana"
- "Bollullos de la Mitación - Urbanización Entrepinares"
- "Bollullos de la Mitación - Monasterio"
- "Bormujos - Casco urbano (Centro)"
- "Bormujos - Zona Avenida Juan Diego"
- "Bormujos - Aljamar"
- "Bormujos - Polígono Almargen"
- "Bormujos - Sector Metropol"
- "Bormujos - La Florida Sur"
- "Bormujos - Valencinilla del Hoyo"
- "Camas - Camas Centro"
- "Camas - Barriada de la Pañoleta"
- "Camas - El Carambolo"
- "Camas - Caño Ronco"
- "Camas - Coca de la Piñera"
- "Camas - Hato Verde"
- "Carrión de los Céspedes - Casco urbano consolidado"
- "Carrión de los Céspedes - Diseminados rústicos"
- "Castilleja de Guzmán - Casco urbano tradicional"
- "Castilleja de Guzmán - Urbanización Señorío de Guzmán"
- "Castilleja de Guzmán - Urbanización El Mirador"
- "Castilleja de la Cuesta - Casco urbano tradicional"
- "Castilleja de la Cuesta - Barriada de la Nueva Sevilla"
- "Castilleja de la Cuesta - Sector El Faro"
- "Castilleja de la Cuesta - Diseminados"
- "Castilleja del Campo - Casco urbano consolidado"
- "Castilleja del Campo - Diseminados agrarios"
- "Espartinas - Espartinas Pueblo"
- "Espartinas - Loreto"
- "Espartinas - Zona Colegio Europa"
- "Espartinas - Ramal de Espartinas"
- "Espartinas - El Majuelo"
- "Espartinas - El Señorío"
- "Espartinas - Azahares"
- "Espartinas - Los Ciruelos"
- "Espartinas - El Martillo"
- "Espartinas - Paraíso del Jardín"
- "Espartinas - Paternilla"
- "Espartinas - Puerta de Hierro"
- "Gelves - Casco urbano bajo"
- "Gelves - Marina de Gelves"
- "Gelves - Simón Verde (compartido)"
- "Gelves - Urbanización Gelves Club"
- "Gines - Casco urbano"
- "Gines - Barriada del Carmen"
- "Gines - El Manantial"
- "Gines - Gines Plaza"
- "Gines - Diseminados residenciales"
- "Huévar del Aljarafe - Casco urbano de Huévar"
- "Huévar del Aljarafe - Urbanización Guadial"
- "Huévar del Aljarafe - Diseminados industriales"
- "Mairena del Aljarafe - Mairena Centro"
- "Mairena del Aljarafe - Nuevo Bulevar"
- "Mairena del Aljarafe - Simón Verde"
- "Mairena del Aljarafe - Ciudad Aljarafe"
- "Mairena del Aljarafe - El Almendral"
- "Mairena del Aljarafe - La Prusiana"
- "Mairena del Aljarafe - Las Brisas I y II"
- "Mairena del Aljarafe - Hacienda Los Olivos"
- "Mairena del Aljarafe - Estacada del Marqués"
- "Mairena del Aljarafe - Ensanche Centro Histórico"
- "Olivares - Casco urbano señorial"
- "Olivares - Barriada de las Nieves"
- "Olivares - Diseminados agrícolas"
- "Palomares del Río - Casco urbano tradicional"
- "Palomares del Río - Urbanización La Estrella"
- "Palomares del Río - Urbanización El Ramal"
- "Palomares del Río - Diseminados"
- "Pilas - Casco urbano consolidado"
- "Pilas - Barriada de San José"
- "Pilas - Diseminados de olivar"
- "Salteras - Casco urbano"
- "Salteras - Urbanización Alero de Sevilla"
- "Salteras - Diseminados residenciales"
- "San Juan de Aznalfarache - Barrio Bajo"
- "San Juan de Aznalfarache - Barriada de Guadalajara"
- "San Juan de Aznalfarache - Monumento"
- "San Juan de Aznalfarache - Camarón"
- "San Juan de Aznalfarache - Andalucía"
- "San Juan de Aznalfarache - Montelar"
- "San Juan de Aznalfarache - Cornisa Azul"
- "San Juan de Aznalfarache - Valparaíso"
- "San Juan de Aznalfarache - Barrio Alto"
- "San Juan de Aznalfarache - Santa Isabel"
- "San Juan de Aznalfarache - Loreto"
- "Sanlúcar la Mayor - Casco urbano de Sanlúcar"
- "Sanlúcar la Mayor - Urbanización Los Soles"
- "Sanlúcar la Mayor - Las Torres"
- "Sanlúcar la Mayor - Diseminados"
- "Santiponce - Casco urbano"
- "Santiponce - Barriada de Itálica"
- "Santiponce - Sector monumental"
- "Santiponce - Diseminados"
- "Tomares - Tomares Centro"
- "Tomares - Montefuerte"
- "Tomares - Valdovina"
- "Tomares - Santa Eufemia"
- "Tomares - Las Siete Alanzadas"
- "Tomares - Sillero"
- "Tomares - La Venta Blanca"
- "Tomares - Esteban de Arones"
- "Tomares - Duchuelas"
- "Tomares - Zaudín Bajo"
- "Tomares - Zaudín Alto"
- "Umbrete - Casco urbano tradicional"
- "Umbrete - Urbanización Las Palmeras"
- "Umbrete - Diseminados de viñas"
- "Valencina de la Concepción - Casco urbano"
- "Valencina de la Concepción - Urbanización La Gloria"
- "Valencina de la Concepción - Torrijos"
- "Valencina de la Concepción - Diseminados rústicos"
- "Villanueva del Ariscal - Casco urbano tradicional"
- "Villanueva del Ariscal - Urbanización El Almendral"
- "Villanueva del Ariscal - Diseminados"

Eje Fluvial de la Vega y las Marismas:
- "Alcalá del Río - Casco urbano consolidado"
- "Alcalá del Río - El Viar"
- "Alcalá del Río - San Ignacio del Viar"
- "Alcalá del Río - Esquivel"
- "Alcolea del Río - Casco urbano de Alcolea"
- "Alcolea del Río - Diseminados rústicos"
- "Brenes - Casco urbano consolidado"
- "Brenes - Barriada de la Estación"
- "Brenes - Diseminados de regadío"
- "Burguillos - Casco urbano"
- "Burguillos - Urbanización Señorío de Burguillos"
- "Burguillos - Diseminados de dehesa baja"
- "Cantillana - Casco urbano"
- "Cantillana - La Montaña"
- "Cantillana - Los Pajares"
- "Cantillana - Diseminados de la Vega alta"
- "Coria del Río - Casco urbano"
- "Coria del Río - La Hermandad y Tixe"
- "Coria del Río - El Limonar"
- "Coria del Río - El Lucero"
- "Coria del Río - El Pozo"
- "Coria del Río - Plaza Mazaco"
- "Coria del Río - Barriada de las Alegrías"
- "La Algaba - Casco urbano tradicional"
- "La Algaba - Barriada del Aral"
- "La Algaba - El rincón de la Algaba"
- "La Algaba - Diseminados"
- "La Rinconada - La Rinconada (Pueblo)"
- "La Rinconada - San José de la Rinconada"
- "La Rinconada - Tarazona"
- "La Rinconada - La Jarilla"
- "La Rinconada - El Gordillo"
- "La Rinconada - Casavacas"
- "La Rinconada - El Majuelo"
- "La Rinconada - Tarazonilla"
- "La Rinconada - Los Abetos"
- "La Rinconada - El Castellón"
- "La Rinconada - Los Labrados"
- "La Rinconada - El Toril"
- "Lora del Río - Casco urbano de Lora"
- "Lora del Río - El Priorato"
- "Lora del Río - Setefilla"
- "Lora del Río - El Álamo"
- "Lora del Río - Diseminados rústicos de gran escala"
- "Peñaflor - Casco urbano tradicional"
- "Peñaflor - Vegas de Almenara"
- "Peñaflor - La Vereda (núcleo rústico de ocio)"
- "Peñaflor - Diseminados"
- "Tocina - Tocina (Pueblo)"
- "Tocina - Los Rosales (núcleo ferroviario)"
- "Tocina - La Playita"
- "Villaverde del Río - Casco urbano de Villaverde"
- "Villaverde del Río - Diseminados frutícolas de la Vega media"
- "Villanueva del Río y Minas - Casco urbano tradicional"
- "Villanueva del Río y Minas - Minas de la Reunión (historico enclave minero)"
- "Villanueva del Río y Minas - Diseminados"
- "Aznalcázar - Casco urbano señorial"
- "Aznalcázar - Las Minas Golf"
- "Aznalcázar - Diseminados forestales de Doñana"
- "El Cuervo de Sevilla - Casco urbano consolidado"
- "El Cuervo de Sevilla - Diseminados"
- "Isla Mayor - Isla Mayor (Villafranco)"
- "Isla Mayor - Poblado de Alfonso XIII"
- "La Puebla del Río - Casco urbano"
- "La Puebla del Río - Dehesa de Abajo"
- "La Puebla del Río - El Pintado"
- "La Puebla del Río - Diseminados marismeños"
- "Las Cabezas de San Juan - Casco urbano consolidado"
- "Las Cabezas de San Juan - San Leandro"
- "Las Cabezas de San Juan - Vetaherrada"
- "Las Cabezas de San Juan - Sacramento"
- "Las Cabezas de San Juan - Diseminados"
- "Lebrija - Casco urbano señorial"
- "Lebrija - El Viñazo"
- "Lebrija - Marismas de Lebrija"
- "Lebrija - Diseminados agrícolas de regadío"
- "Villamanrique de la Condesa - Casco urbano tradicional"
- "Villamanrique de la Condesa - Diseminados forestales y rocieros"

La Campiña de Sevilla:
- "Alcalá de Guadaíra - Centro"
- "Alcalá de Guadaíra - La Paz-Montecarmelo"
- "Alcalá de Guadaíra - Nueva Alcalá"
- "Alcalá de Guadaíra - Oromana"
- "Alcalá de Guadaíra - Torrequinto"
- "Alcalá de Guadaíra - Campoalegre"
- "Alcalá de Guadaíra - Zacatín"
- "Alcalá de Guadaíra - Altos de Oromana"
- "Alcalá de Guadaíra - Nueva Europa"
- "Alcalá de Guadaíra - Mirador del Guadaíra"
- "Alcalá de Guadaíra - Gandul"
- "Alcalá de Guadaíra - La Juncosa"
- "Alcalá de Guadaíra - Pinos del Nevero"
- "Alcalá de Guadaíra - La Galbana"
- "Alcalá de Guadaíra - Virgen del Águila"
- "Alcalá de Guadaíra - El Eucaliptal"
- "Arahal - Casco urbano señorial"
- "Arahal - Barriada de la Palmera"
- "Arahal - Diseminados rústicos"
- "Carmona - Casco histórico amurallado"
- "Carmona - Guadajoz"
- "Carmona - Urbanización Pino Grande"
- "Carmona - Las Monjas"
- "Carmona - Diseminados de gran escala"
- "Cañada Rosal - Casco urbano regular"
- "Cañada Rosal - Diseminados"
- "Écija - Casco monumental"
- "Écija - Villanueva del Rey"
- "Écija - El Villar"
- "Écija - Cerro Perea"
- "Écija - Diseminados de la campiña alta"
- "El Coronil - Casco urbano tradicional"
- "El Coronil - Diseminados agrarios"
- "El Palmar de Troya - Casco urbano consolidado"
- "El Palmar de Troya - sector del Palmar de Troya"
- "El Rubio - Casco urbano tradicional"
- "El Rubio - Diseminados agrarios"
- "El Viso del Alcor - Casco urbano consolidado"
- "El Viso del Alcor - El Huerto de la Alunada"
- "El Viso del Alcor - Diseminados"
- "Fuentes de Andalucía - Casco urbano barroco"
- "Fuentes de Andalucía - Diseminados de campiña"
- "Herrera - Casco urbano de Herrera"
- "Herrera - Las Lagunillas"
- "Herrera - Diseminados agrícolas"
- "La Campana - Casco urbano consolidado"
- "La Campana - Diseminados agrarios"
- "La Luisiana - La Luisiana (Centro)"
- "La Luisiana - El Campillo"
- "La Puebla de Cazalla - Casco urbano"
- "La Puebla de Cazalla - Barriada de la Fuenlonguilla"
- "La Puebla de Cazalla - Diseminados de campiña baja"
- "Lantejuela - Casco urbano tradicional"
- "Lantejuela - Diseminados agrarios"
- "Los Molares - Casco urbano"
- "Los Molares - El Castillo"
- "Los Molares - Diseminados de campiña media"
- "Los Palacios y Villafranca - Casco urbano denso"
- "Los Palacios y Villafranca - El Trobal"
- "Los Palacios y Villafranca - Maribáñez"
- "Los Palacios y Villafranca - Chapatales"
- "Mairena del Alcor - Casco urbano consolidado"
- "Mairena del Alcor - El Torreón"
- "Mairena del Alcor - Alconchel"
- "Mairena del Alcor - Diseminados residenciales"
- "Marchena - Casco histórico señorial"
- "Marchena - sector de la Alcazaba"
- "Marchena - Diseminados de campiña baja"
- "Marinaleda - Casco urbano"
- "Marinaleda - Matarredonda"
- "Marinaleda - Diseminados cooperativos"
- "Morón de la Frontera - Casco monumental"
- "Morón de la Frontera - Barriada del Pantano"
- "Morón de la Frontera - El Rancho"
- "Morón de la Frontera - Diseminados rústicos"
- "Osuna - Casco histórico monumental"
- "Osuna - El Puerto de la Encina"
- "Osuna - Diseminados agrarios"
- "Paradas - Casco urbano regular"
- "Paradas - Diseminados agrarios"
- "Utrera - Utrera Centro"
- "Utrera - Trajano"
- "Utrera - Pinzón"
- "Utrera - Guadalema de los Quintero"
- "Utrera - El Torbiscal"
- "Utrera - La Herradera"
- "Utrera - Casablanca"
- "Utrera - Casas Cerros"
- "Utrera - El Comodoro"
- "Utrera - La Aguardientera"
- "Utrera - Los Adrianes"
- "Utrera - El Recuero"
- "Utrera - La Juncosa"

Territorios de Frontera - Sierra Morena:
- "Alanís - Casco urbano medieval"
- "Alanís - Diseminados rústicos y forestales"
- "Almadén de la Plata - Casco urbano de Almadén"
- "Almadén de la Plata - Diseminados de dehesa"
- "Aznalcóllar - Casco urbano consolidado"
- "Aznalcóllar - zona minera"
- "Aznalcóllar - Diseminados forestales"
- "Castilblanco de los Arroyos - Casco urbano"
- "Castilblanco de los Arroyos - San Benito"
- "Castilblanco de los Arroyos - Diseminados del Camino de Santiago"
- "Cazalla de la Sierra - Casco urbano monumental"
- "Cazalla de la Sierra - Diseminados forestales de dehesa"
- "Constantina - Casco urbano señorial"
- "Constantina - Barriada de la Morería"
- "Constantina - Diseminados rústicos"
- "El Castillo de las Guardas - El Castillo (Pueblo)"
- "El Castillo de las Guardas - Arroyo de la Plata (Venta Abajo)"
- "El Castillo de las Guardas - Valdeflores"
- "El Castillo de las Guardas - Minas del Castillo (Fuente Pinar, Vistahermosa, La Mina)"
- "El Castillo de las Guardas - La Aulaga"
- "El Castillo de las Guardas - Archidona"
- "El Castillo de las Guardas - La Alcornocosa (Los Humeros)"
- "El Castillo de las Guardas - El Cañuelo"
- "El Castillo de las Guardas - El Peralejo (Peralejo Alto, Peralejo Bajo)"
- "El Castillo de las Guardas - Las Cañadillas"
- "El Castillo de las Guardas - Peroamigo"
- "El Castillo de las Guardas - Las Cortecillas"
- "El Garrobo - Casco urbano serrano"
- "El Garrobo - Diseminados cinegéticos"
- "El Madroño - Casco urbano de El Madroño"
- "El Madroño - El Pintado"
- "El Madroño - Villaguzmán"
- "El Madroño - El Alamo"
- "El Madroño - Diseminados"
- "El Pedroso - Casco urbano"
- "El Pedroso - Diseminados forestales de Sierra Morena central"
- "El Real de la Jara - Casco urbano serrano consolidado"
- "El Real de la Jara - Diseminados forestales"
- "El Ronquillo - Casco urbano consolidado"
- "El Ronquillo - El Romeral"
- "El Ronquillo - Diseminados rústicos de dehesa"
- "Gerena - Casco urbano tradicional"
- "Gerena - Diseminados residenciales"
- "Guadalcanal - Casco urbano tradicional serrano"
- "Guadalcanal - Diseminados rústicos de olivar"
- "Guillena - Casco urbano de Guillena"
- "Guillena - Las Pajanosas"
- "Guillena - Torre de la Reina"
- "La Puebla de los Infantes - Casco urbano de La Puebla"
- "La Puebla de los Infantes - Diseminados forestales del embalse de José Torán"
- "Las Navas de la Concepción - Casco urbano tradicional"
- "Las Navas de la Concepción - Diseminados de dehesa alta"
- "San Nicolás del Puerto - Casco urbano consolidado"
- "San Nicolás del Puerto - Cascadas del Huéznar"
- "San Nicolás del Puerto - Diseminados turísticos"

Territorios de Frontera - Sierra Sur:
- "Aguadulce - Casco urbano tradicional serrano"
- "Aguadulce - Diseminados rústicos"
- "Algámitas - Casco urbano de Algámitas"
- "Algámitas - Peñón de Algámitas"
- "Algámitas - Diseminados turísticos"
- "Badolatosa - Casco urbano de Badolatosa"
- "Badolatosa - Corcoya"
- "Badolatosa - Diseminados"
- "Casariche - Casco urbano consolidado"
- "Casariche - El Rigüelo"
- "Casariche - Diseminados agrarios"
- "Coripe - Casco urbano tradicional serrano"
- "Coripe - Diseminados forestales and de olivar"
- "El Saucejo - Casco urbano de El Saucejo"
- "El Saucejo - La Mezquitilla"
- "El Saucejo - Navarredonda"
- "El Saucejo - Diseminados agrícolas"
- "Estepa - Casco histórico"
- "Estepa - Barriada de los Remedios"
- "Estepa - Polígono industrial de mantecados"
- "Gilena - Casco urbano tradicional"
- "Gilena - Diseminados agrícolas"
- "La Roda de Andalucía - Casco urbano tradicional"
- "La Roda de Andalucía - Barriada de la Estación"
- "La Roda de Andalucía - Diseminados rústicos"
- "Lora de Estepa - Casco urbano de Lora de Estepa"
- "Lora de Estepa - Diseminados rústicos de olivar"
- "Los Corrales - Casco urbano tradicional serrano"
- "Los Corrales - Diseminados agrícolas"
- "Martín de la Jara - Casco urbano consolidado"
- "Martín de la Jara - sector de la Laguna del Gobierno"
- "Martín de la Jara - Diseminados"
- "Montellano - Casco urbano tradicional"
- "Montellano - Diseminados forestales"
- "Pedrera - Casco urbano de Pedrera"
- "Pedrera - Diseminados industriales y de olivar"
- "Pruna - Casco urbano consolidado"
- "Pruna - Castillo de Hierro"
- "Pruna - El Pilar Lejos"
- "Pruna - Diseminados"
- "Villanueva de San Juan - Casco urbano tradicional serrano"
- "Villanueva de San Juan - Diseminados agrícolas de campiña de sierra"
`;

const SYSTEM_INSTRUCTION = `
Eres un Asistente Experto en Geografía Inmobiliaria de Sevilla para la plataforma "Tu Asesor".
Tu misión es interpretar la descripción de zonas, calles, monumentos o hitos que desea un comprador en Sevilla y su área metropolitana, y mapearlos con precisión absoluta a nuestra taxonomía oficial de barrios y pueblos.

${TAXONOMY_PROMPT}

INSTRUCCIONES DE RAZONAMIENTO SEMÁNTICO:
1. Si el usuario menciona una calle, monumento o punto emblemático, asócialo al barrio/subzona correspondiente. Ejemplos de mapeo semántico:
   - "calle Betis", "calle Pages del Corro" -> "Triana - Triana Casco Antiguo" o "Triana - El Tardón-El Carmen".
   - "Metromar", "Ciudad Expo", "parada de metro Ciudad Expo" -> "Mairena del Aljarafe - Ciudad Expo / Metromar".
   - "Ramón y Cajal", "facultades Viapol", "San Bernardo" -> "Nervión - Viapol / San Bernardo" o "Nervión - Ciudad Jardín".
   - "Asunción", "feria", "Parque de los Príncipes" -> "Los Remedios - Los Remedios Centro".
   - "Avenida de las Ciencias", "Las Góndolas", "Alcosa" -> "Este-Alcosa-Torreblanca - Parque Alcosa-Jardines del Edén" o "Este-Alcosa-Torreblanca - Colores-Entreparques".
   - "Zaudín" -> "Tomares - Zaudín Bajo" o "Tomares - Zaudín Alto".
   - "Entrenúcleos", "Montequinto", "Condequinto" -> "Dos Hermanas - Entrenúcleos", "Dos Hermanas - Quinto (Montequinto)" o "Dos Hermanas - Condequinto".
2. Asocia múltiples barrios si la descripción abarca diferentes puntos.
3. Si el usuario te pide explícitamente agregar o añadir una nueva zona o barrio al catálogo (ej. "añade la zona Gines - La Florida" o "agrega el barrio Camas - El Chorrillo"), debes retornar la zona propuesta en la propiedad "add_custom_zone" con el distrito y barrio bien separados.
4. Si no hay suficiente información o la zona queda totalmente fuera de Sevilla y Aljarafe, devuelve un array vacío en "detected_zones".
5. Cuando el usuario pregunte por zonas **por proximidad a un tipo de servicio o instalación** (hospital, clínica, colegio, escuela, universidad, estación de metro/cercanías/tren, parada de autobús, parque, centro comercial, polígono industrial, zona empresarial, etc.), actúa así:
   a) Identifica los POIs concretos de ese tipo que existen en Sevilla capital y su área metropolitana, apoyándote en búsqueda si es necesario.
   b) Para cada POI identificado, determina qué zonas de la TAXONOMÍA OFICIAL están geográficamente próximas.
   c) Devuelve en "detected_zones" ÚNICAMENTE zonas cuyo nombre coincida EXACTAMENTE con la lista de la taxonomía y que estén efectivamente cerca de esos POIs. Si un POI está cerca de una zona cuyo nombre no aparece literalmente en la TAXONOMÍA OFICIAL, omite esa zona — no aproximes ni reformules nombres.
   d) En "reasoning" explica qué POIs concretos has cruzado y por qué cada zona es próxima. Ejemplo: "Hospital Virgen Macarena → Macarena - Doctor Barraquer-Grupo Renfe-Policlínico; Hospital Virgen del Rocío → Palmera-Bellavista - Sector Sur-La Palmera-Reina Mercedes, Palmera-Bellavista - Heliópolis".
   e) Si hay varios POIs del mismo tipo, agrupa los resultados por POI en el reasoning.
   f) Si no encuentras POIs relevantes del tipo pedido dentro de la cobertura, devuelve "detected_zones": [] con un reasoning explicativo.

DEBES DEVOLVER EXCLUSIVAMENTE UN OBJETO JSON CON LA SIGUIENTE ESTRUCTURA:
{
  "detected_zones": [
    "Nombre Exacto de la Zona 1 (debe coincidir con la lista de Taxonomía)",
    "Nombre Exacto de la Zona 2"
  ],
  "reasoning": "Breve explicación de un párrafo en español de por qué has seleccionado estas zonas según las calles/hitos mencionados u orden recibida.",
  "add_custom_zone": {
    "district": "Nombre del Municipio/Distrito a agregar (ej: Gines)",
    "barrio": "Nombre del Barrio/Subzona a agregar (ej: Nuevo Barrio)"
  }
}
Note: "add_custom_zone" es opcional y solo debe incluirse si el usuario explícitamente te ordenó crear, añadir o registrar una zona que no existía.
`;

// Parser defensivo en cascada (mismo patrón que generateNewsPost.ts):
// 1. strip fences ```json...```; 2. JSON.parse directo; 3. recorte primer{..último}; 4. null.
// ⚠️ google_search tool (grounding) NO es compatible con responseMimeType:application/json.
function parseDraftJson(raw: string): Record<string, unknown> | null {
  let jsonStr = (raw || '').trim();
  const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fence) jsonStr = fence[1];
  try {
    return JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    const start = jsonStr.indexOf('{');
    const end = jsonStr.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(jsonStr.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

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

    // 4. Llamada HTTP a la API de Google Gemini con grounding de búsqueda
    // ⚠️ google_search NO es compatible con responseMimeType:application/json → se usa parseDraftJson
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${ZONES_LLM_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

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
        tools: [{ google_search: {} }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 800,
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      console.error('[AI Zones] Gemini API devolvió error:', geminiResponse.status, errText);
      return NextResponse.json(localKeywordDetector(text));
    }

    const data = await geminiResponse.json();
    // Con grounding, el texto puede venir repartido en varios parts
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const content = parts.map((p: { text?: string }) => p.text ?? '').join('');

    if (!content) {
      console.error('[AI Zones] Respuesta vacía de candidatos de Gemini');
      return NextResponse.json(localKeywordDetector(text));
    }

    // Parser defensivo: strip fences → JSON.parse → rescate → fallback local
    const parsed = parseDraftJson(content);
    if (!parsed) {
      console.error('[AI Zones] JSON no parseable de Gemini, fallback local:', content.slice(0, 300));
      return NextResponse.json(localKeywordDetector(text));
    }
    return NextResponse.json(parsed);

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

  // A. Interceptar orden de agregar zona
  const addRegex = /(?:añade|agrega|crea|registrar|registra)\s+(?:la\s+zona|el\s+barrio|la\s+localidad)?\s*([A-Za-zÀ-ÿ\s]+)\s*-\s*([A-Za-zÀ-ÿ\s\/\(\)\-\.\,]+)/i;
  const match = text.match(addRegex);
  if (match) {
    const district = match[1].trim();
    const barrio = match[2].trim();
    return {
      detected_zones: [`${district} - ${barrio}`],
      reasoning: `¡Por supuesto, Álvaro! He detectado tu orden de agregar una nueva zona. Se ha registrado la zona "${district} - ${barrio}" en la taxonomía local de forma dinámica para este comprador.`,
      add_custom_zone: {
        district,
        barrio
      }
    };
  }

  // Mapeos rápidos de keywords a subzonas oficiales
  const mapping: { keywords: string[]; zoneId: string; reason: string }[] = [
    {
      keywords: ['santa cruz', 'alfalfa', 'judería', 'giralda'],
      zoneId: 'Centro - Santa Cruz',
      reason: 'barrio histórico de Santa Cruz o la Alfalfa'
    },
    {
      keywords: ['arenal', 'casco antiguo', 'museo', 'plaza de armas'],
      zoneId: 'Centro - El Arenal',
      reason: 'entorno del Casco Antiguo / Arenal'
    },
    {
      keywords: ['san vicente', 'san lorenzo', 'alameda', 'hercules'],
      zoneId: 'Centro - San Vicente',
      reason: 'zonas de San Vicente y San Lorenzo'
    },
    {
      keywords: ['regina', 'encarnacion', 'setas', 'feria'],
      zoneId: 'Centro - Encarnación-Regina',
      reason: 'barrios colindantes a las Setas de la Encarnación o Regina'
    },
    {
      keywords: ['betis', 'triana casco', 'altozano', 'pureza'],
      zoneId: 'Triana - Triana Casco Antiguo',
      reason: 'corazón de Triana o la calle Betis'
    },
    {
      keywords: ['barrio leon', 'san gonzalo'],
      zoneId: 'Triana - Barrio León',
      reason: 'el emblemático Barrio León'
    },
    {
      keywords: ['remedios centro', 'república argentina', 'asuncion', 'asunción'],
      zoneId: 'Los Remedios - Los Remedios Centro',
      reason: 'eje comercial de la calle Asunción en Los Remedios'
    },
    {
      keywords: ['buhaira', 'nervion centro', 'nervión centro', 'eduardo dato'],
      zoneId: 'Nervión - Nervión Centro',
      reason: 'zona residencial de la Buhaira y Nervión Centro'
    },
    {
      keywords: ['viapol', 'san bernardo', 'ramon y cajal'],
      zoneId: 'Nervión - San Bernardo',
      reason: 'entorno universitario de Viapol o el barrio de San Bernardo'
    },
    {
      keywords: ['luis montoto', 'calzada', 'cruz campo'],
      zoneId: 'Nervión - La Calzada',
      reason: 'Avenida Luis Montoto o La Calzada'
    },
    {
      keywords: ['macarena parlament', 'parlamento', 'resolana'],
      zoneId: 'Macarena - Begoña-Santa Catalina',
      reason: 'zona histórica de la Macarena / Parlamento'
    },
    {
      keywords: ['ciencias', 'avenida de las ciencias', 'sevilla este'],
      zoneId: 'Este-Alcosa-Torreblanca - Colores-Entreparques',
      reason: 'eje principal de la Avenida de las Ciencias en Sevilla Este'
    },
    {
      keywords: ['las gondolas', 'las góndolas', 'entrepuentes'],
      zoneId: 'Este-Alcosa-Torreblanca - Palacio de Congresos-Urbadiez-Entrepuentes',
      reason: 'urbanizaciones Las Góndolas / Entrepuentes'
    },
    {
      keywords: ['alcosa', 'emilio lemos'],
      zoneId: 'Este-Alcosa-Torreblanca - Parque Alcosa-Jardines del Edén',
      reason: 'Avenida Emilio Lemos o Parque Alcosa'
    },
    {
      keywords: ['bermejales'],
      zoneId: 'Palmera-Bellavista - Elcano-Los Bermejales',
      reason: 'los Bermejales'
    },
    {
      keywords: ['reina mercedes', 'heliopolis', 'heliópolis'],
      zoneId: 'Palmera-Bellavista - Sector Sur-La Palmera-Reina Mercedes',
      reason: 'campus de Reina Mercedes o el barrio de Heliópolis'
    },
    {
      keywords: ['kansas city', 'santa justa'],
      zoneId: 'San Pablo - Santa Justa - Santa Justa / Kansas City',
      reason: 'entorno de la Estación de Santa Justa o la Avenida Kansas City'
    },
    // Aljarafe / Provincia
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
      zoneId: 'Tomares - Zaudín Bajo',
      reason: 'exclusiva urbanización de golf Zaudín'
    },
    {
      keywords: ['montequinto', 'monte quinto'],
      zoneId: 'Dos Hermanas - Quinto (Montequinto)',
      reason: 'distrito de Montequinto'
    },
    {
      keywords: ['entrenucleos', 'entrenúcleos'],
      zoneId: 'Dos Hermanas - Entrenúcleos',
      reason: 'zona vanguardista de Entrenúcleos'
    },
    {
      keywords: ['gines', 'casco antiguo gines', 'el prado gines', 'las brisas gines'],
      zoneId: 'Gines - Casco urbano',
      reason: 'municipio de Gines o sus urbanizaciones'
    },
    {
      keywords: ['castilleja', 'nueva sevilla', 'el faro castilleja'],
      zoneId: 'Castilleja de la Cuesta - Casco urbano tradicional',
      reason: 'municipio de Castilleja de la Cuesta'
    },
    {
      keywords: ['san juan de aznalfarache', 'san juan bajo', 'san juan alto', 'valparaiso san juan', 'valparaíso san juan'],
      zoneId: 'San Juan de Aznalfarache - Barrio Alto',
      reason: 'municipio de San Juan de Aznalfarache'
    },
    {
      keywords: ['espartinas', 'cerro del viento espartinas', 'el retiro espartinas'],
      zoneId: 'Espartinas - Espartinas Pueblo',
      reason: 'municipio de Espartinas'
    },
    {
      keywords: ['alcala de guadaira', 'alcalá de guadaira', 'alcala de guadaíra', 'alcalá de guadaíra', 'silos alcala', 'campo de las beatas'],
      zoneId: 'Alcalá de Guadaíra - Centro',
      reason: 'municipio de Alcalá de Guadaíra'
    },
    {
      keywords: ['rinconada', 'san jose de la rinconada', 'san josé de la rinconada'],
      zoneId: 'La Rinconada - San José de la Rinconada',
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
    },
    {
      keywords: ['camas', 'pañoleta', 'carambolo'],
      zoneId: 'Camas - Camas Centro',
      reason: 'municipio de Camas'
    },
    {
      keywords: ['gelves', 'simon verde gelves'],
      zoneId: 'Gelves - Casco urbano bajo',
      reason: 'municipio de Gelves'
    },
    {
      keywords: ['sanlucar la mayor', 'sanlúcar la mayor'],
      zoneId: 'Sanlúcar la Mayor - Casco urbano de Sanlúcar',
      reason: 'municipio de Sanlúcar la Mayor'
    },
    {
      keywords: ['santiponce', 'italica', 'itálica'],
      zoneId: 'Santiponce - Casco urbano',
      reason: 'municipio de Santiponce e Itálica'
    },
    {
      keywords: ['valencina'],
      zoneId: 'Valencina de la Concepción - Casco urbano',
      reason: 'municipio de Valencina de la Concepción'
    },
    {
      keywords: ['coria del rio', 'coria del río', 'hermandad coria'],
      zoneId: 'Coria del Río - Casco urbano',
      reason: 'municipio de Coria del Río'
    },
    {
      keywords: ['algaba', 'aral algaba'],
      zoneId: 'La Algaba - Casco urbano tradicional',
      reason: 'municipio de La Algaba'
    },
    {
      keywords: ['carmona', 'monjas carmona'],
      zoneId: 'Carmona - Casco histórico amurallado',
      reason: 'municipio de Carmona'
    },
    {
      keywords: ['ecija', 'écija'],
      zoneId: 'Écija - Casco monumental',
      reason: 'municipio de Écija'
    },
    {
      keywords: ['los palacios', 'villafranca', 'palacios y villafranca'],
      zoneId: 'Los Palacios y Villafranca - Casco urbano denso',
      reason: 'municipio de Los Palacios y Villafranca'
    },
    {
      keywords: ['moron', 'morón'],
      zoneId: 'Morón de la Frontera - Casco monumental',
      reason: 'municipio de Morón de la Frontera'
    },
    {
      keywords: ['osuna'],
      zoneId: 'Osuna - Casco histórico monumental',
      reason: 'municipio de Osuna'
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
