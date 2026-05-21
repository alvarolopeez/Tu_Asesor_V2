import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Comprar Inmueble en Sevilla | Tu Asesor Álvaro",
  description:
    "Encuentra pisos, casas y parcelas en venta en Sevilla y alrededores. Reserva tu visita online con un solo clic. Asesoramiento inmobiliario personalizado y gratuito.",
  openGraph: {
    title: "Comprar Inmueble en Sevilla | Tu Asesor Álvaro",
    description:
      "Explora propiedades exclusivas en Sevilla. Agenda una visita directamente desde la web.",
    type: "website",
    locale: "es_ES",
  },
  alternates: {
    canonical: "/comprar",
  },
};

export default function ComprarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
