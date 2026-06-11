import type { Metadata } from "next";
import SellerProfileClient from "@/components/admin/profile/SellerProfileClient";

// Brief #011 F3.2 (D12): perfil del vendedor a página completa.
// Shell server mínimo: la protección de acceso es client-side vía
// AdminAuthGate (dentro de SellerProfileClient) — proxy.ts no protege /admin.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Perfil de vendedor | CRM",
  robots: { index: false, follow: false },
};

export default async function SellerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SellerProfileClient leadId={id} />;
}
