import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { supabase } from "@/lib/supabase";
import type { Property } from "./properties/types";
import PropertiesTable from "./properties/PropertiesTable";
import PropertyFormModal from "./properties/PropertyFormModal";
import SmartMatchmakerModal from "./properties/SmartMatchmakerModal";

/**
 * Sección admin del catálogo de propiedades.
 *
 * Orquestador puro: mantiene la lista, decide qué modal está abierto y reacciona
 * a callbacks de los subcomponentes. Toda la lógica de UI y de formulario vive
 * en los subcomponentes bajo `./properties/`.
 *
 * @see PropertiesTable          — tabla + búsqueda + botón "Añadir"
 * @see PropertyFormModal        — modal CRUD (alta/edición), maneja form + uploads + slots
 * @see SmartMatchmakerModal     — modal de cruce con leads y disparo de campaña n8n
 */
export default function PropertiesManager() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);

  // Form modal:
  //   undefined → cerrado
  //   null      → creando una nueva propiedad
  //   Property  → editando esa propiedad
  const [formProperty, setFormProperty] = useState<Property | null | undefined>(undefined);

  // Matchmaker modal: la propiedad objetivo (null = cerrado).
  const [matchingProperty, setMatchingProperty] = useState<Property | null>(null);

  const fetchProperties = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProperties(data as Property[] || []);
    } catch (error) {
      console.error(error);
      toast.error("Error al cargar los inmuebles");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProperties();
  }, []);

  const deleteProperty = async (id: string) => {
    if (!confirm("¿Seguro que quieres borrar este inmueble permanentemente?")) return;
    try {
      const { error } = await supabase.from('properties').delete().eq('id', id);
      if (error) throw error;

      toast.success("Inmueble eliminado con éxito");
      fetchProperties();
    } catch (error) {
      console.error(error);
      toast.error("Error al eliminar el inmueble");
    }
  };

  return (
    <div className="space-y-6">
      <PropertiesTable
        properties={properties}
        loading={loading}
        onAddClick={() => setFormProperty(null)}
        onMatchClick={(prop) => setMatchingProperty(prop)}
        onEditClick={(prop) => setFormProperty(prop)}
        onDeleteClick={deleteProperty}
      />

      {formProperty !== undefined && (
        <PropertyFormModal
          editingProperty={formProperty}
          onClose={() => setFormProperty(undefined)}
          onSaved={(saved) => {
            setFormProperty(undefined);
            fetchProperties();
            // Auto-abrir el matchmaker para promover el inmueble recién guardado
            setMatchingProperty(saved);
          }}
        />
      )}

      {matchingProperty && (
        <SmartMatchmakerModal
          property={matchingProperty}
          onClose={() => setMatchingProperty(null)}
        />
      )}
    </div>
  );
}
