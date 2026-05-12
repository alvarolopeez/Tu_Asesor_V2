import type { NextConfig } from "next";

/**
 * FIX APLICADO (Code Review):
 * - Configurado remotePatterns para optimización de imágenes externas
 *   (SuccessStoriesCarousel usa imágenes de i.ibb.co)
 * - Esto permite quitar el prop 'unoptimized' de next/image
 *   para aprovechar la optimización automática de Next.js
 */
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'i.ibb.co',
      },
    ],
  },
  // NOTA: Next.js 16 ya no soporta "eslint" en next.config.ts
  // Si necesitas ignorar ESLint en builds, hazlo desde el script de CI/CD
};

export default nextConfig;
