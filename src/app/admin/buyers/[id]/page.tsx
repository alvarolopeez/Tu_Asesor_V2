import type { Metadata } from "next";
import BuyerProfileClient from "@/components/admin/profile/BuyerProfileClient";

// Brief #011 F3.1 (D12): perfil del comprador a página completa.
// Shell server mínimo: la protección de acceso es client-side vía
// AdminAuthGate (dentro de BuyerProfileClient) — proxy.ts no protege /admin.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Perfil de comprador | CRM",
  robots: { index: false, follow: false },
};

export default async function BuyerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BuyerProfileClient demandId={id} />;
}
