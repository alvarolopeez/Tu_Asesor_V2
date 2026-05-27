import * as z from "zod";

/**
 * Schema Zod de validación del formulario de propiedad (alta/edición).
 *
 * @see PropertyFormValues — tipo inferido del schema, lo que `react-hook-form` recibe.
 */
export const propertySchema = z.object({
  title: z.string().min(3, "El título debe tener al menos 3 caracteres"),
  description: z.string().optional(),
  price: z.number().min(0, "El precio no puede ser negativo"),
  status: z.enum(['active', 'sold', 'rented', 'draft']).default('draft'),
  propertyType: z.enum(['Piso', 'Casa', 'Parcela', 'Indiferente']).default('Piso'),
  rooms: z.number().min(0, "Mínimo 0 habitaciones").default(1),
  baths: z.number().min(0, "Mínimo 0 baños").default(1),
  sqm: z.number().min(0, "Mínimo 0 metros cuadrados").default(0),
  address: z.string().min(3, "La dirección exacta es obligatoria"),
  latitude: z.number({ message: "La latitud debe ser un número" }).min(-90).max(90),
  longitude: z.number({ message: "La longitud debe ser un número" }).min(-180).max(180),
  is_visitable_online: z.boolean().default(false),
});

export type PropertyFormValues = z.infer<typeof propertySchema>;

/**
 * Forma de una propiedad tal y como se persiste en la tabla `properties` de Supabase.
 * Espejo del row real (con `features` como JSON columna).
 */
export interface Property {
  id: string;
  title: string;
  price: number;
  status: string;
  created_at: string;
  description?: string;
  images?: string[];
  features?: {
    propertyType?: string;
    rooms?: number;
    baths?: number;
    sqm?: number;
    address?: string;
    latitude?: number;
    longitude?: number;
    is_visitable_online?: boolean;
    visitable_slots?: {
      days: string[];
      slots: string[];
      schedule?: Record<string, string[]>;
    };
    video_url?: string;
    plan_url?: string;
  };
}

export const AVAILABLE_DAYS = [
  { key: "Lunes", label: "Lunes" },
  { key: "Martes", label: "Martes" },
  { key: "Miércoles", label: "Miércoles" },
  { key: "Jueves", label: "Jueves" },
  { key: "Viernes", label: "Viernes" },
  { key: "Sábado", label: "Sábado" }
] as const;

export const AVAILABLE_HOURS = [
  "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30",
  "18:00", "18:30", "19:00", "19:30", "20:00"
] as const;
