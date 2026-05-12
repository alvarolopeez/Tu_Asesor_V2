"use client";

import { usePathname } from "next/navigation";
import Header from "@/components/Header";
import FloatingWhatsApp from "@/components/FloatingWhatsApp";

export default function LayoutWrapper({
  children,
  footer
}: {
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/admin");

  if (isAdmin) {
    return <>{children}</>;
  }

  return (
    <>
      <Header />
      <FloatingWhatsApp />
      <main className="flex-grow">{children}</main>
      {footer}
    </>
  );
}
