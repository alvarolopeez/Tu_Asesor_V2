import type { Metadata } from "next";
import EncargoProfileClient from "@/components/admin/profile/EncargoProfileClient";

// Brief #011 F3.3 (D12): encargo a página completa.
// Shell server mínimo: la protección de acceso es client-side vía
// AdminAuthGate (dentro de EncargoProfileClient) — proxy.ts no protege /admin.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Expediente de encargo | CRM",
  robots: { index: false, follow: false },
};

export default async function EncargoProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EncargoProfileClient encargoId={id} />;
}
