/**
 * Constantes centralizadas del negocio.
 * NUNCA hardcodear teléfonos, emails, URLs ni coeficientes en componentes.
 * Importar siempre desde este archivo.
 */

export const BUSINESS = {
  name: 'Álvaro',
  fullName: 'Tu Asesor | Álvaro',
  phone: '697223944',
  phoneIntl: '34697223944',
  email: 'tuasesoralvaro@gmail.com',
  whatsappUrl: (message: string) =>
    `https://wa.me/34697223944?text=${encodeURIComponent(message)}`,
  defaultWhatsappMessage: 'Hola Álvaro, me gustaría recibir más información.',
} as const;

export const COLORS = {
  primary: '#2C3E50',       // Azul Inmobiliario
  accent: '#FBBF24',        // Amarillo Acento
  whatsapp: '#25D366',
  whatsappHover: '#128C7E',
} as const;

/**
 * Coeficientes de plusvalía municipal (2024).
 * Actualizar anualmente según BOE.
 */
export const COEFICIENTES_PLUSVALIA_2024 = [
  { years: 1, coef: 0.15 },
  { years: 2, coef: 0.15 },
  { years: 3, coef: 0.16 },
  { years: 4, coef: 0.19 },
  { years: 5, coef: 0.23 },
  { years: 6, coef: 0.28 },
  { years: 7, coef: 0.35 },
  { years: 8, coef: 0.40 },
  { years: 9, coef: 0.45 },
  { years: 10, coef: 0.50 },
  { years: 11, coef: 0.55 },
  { years: 12, coef: 0.60 },
  { years: 13, coef: 0.65 },
  { years: 14, coef: 0.70 },
  { years: 15, coef: 0.75 },
  { years: 16, coef: 0.80 },
  { years: 17, coef: 0.85 },
  { years: 18, coef: 0.90 },
  { years: 19, coef: 0.95 },
  { years: 20, coef: 0.45 },
] as const;

export const MUNICIPIOS_SEVILLA = [
  'Sevilla', 'Dos Hermanas', 'Alcalá de Guadaíra', 'Utrera', 'Mairena del Aljarafe',
  'Écija', 'La Rinconada', 'Los Palacios y Villafranca', 'Coria del Río', 'Carmona',
  'Lebrija', 'Camas', 'Mairena del Alcor', 'Tomares', 'San Juan de Aznalfarache',
  'Bormujos', 'Marchena', 'Arahal', 'Lora del Río', 'Osuna',
] as const;

export const ITP_DATA: Record<string, number> = {
  'Andalucía': 0.07, 'Aragón': 0.08, 'Asturias': 0.08, 'Baleares': 0.08, 'Canarias': 0.065,
  'Cantabria': 0.10, 'Castilla - La Mancha': 0.09, 'Castilla y León': 0.08, 'Cataluña': 0.10,
  'Ceuta': 0.06, 'Comunidad de Madrid': 0.06, 'Comunidad Valenciana': 0.10, 'Extremadura': 0.08,
  'Galicia': 0.10, 'La Rioja': 0.07, 'Melilla': 0.06, 'Murcia': 0.08, 'Navarra': 0.06, 'País Vasco': 0.04,
};

export const IRPF_TRAMOS = [
  { limit: 12450, rate: 0.19 },
  { limit: 20200, rate: 0.24 },
  { limit: 35200, rate: 0.30 },
  { limit: 60000, rate: 0.37 },
  { limit: Infinity, rate: 0.45 },
] as const;

/**
 * Validaciones reutilizables
 */
export const VALIDATION = {
  phone: {
    regex: /^[0-9]{9,15}$/,
    message: 'Introduce un teléfono válido (9-15 dígitos)',
  },
  name: {
    minLength: 2,
    maxLength: 100,
    message: 'El nombre debe tener entre 2 y 100 caracteres',
  },
} as const;
