# 🏛️ MASTER ARCHITECTURE - Tu Asesor V2
*Archivo de referencia global para todos los agentes de IA que trabajan en este proyecto.*

## Proyecto
CRM Inmobiliario y Portal Web Público "Tu Asesor".
Stack Tecnológico: Next.js 14/15 (App Router), Tailwind CSS, Supabase (Auth, BD, Storage), Lucide React.

## 📜 Reglas Globales (Léelas siempre antes de actuar)
1. **Entorno de Trabajo (Google Antigravity)**: Tienes acceso directo a los archivos locales del usuario. Analiza el código con tus herramientas antes de modificar nada a ciegas.
2. **Git/Commits**: Tienes **PROHIBIDO** hacer `git commit` o `git push`. Esa tarea es responsabilidad exclusiva de Álvaro (el humano). Tú solo modificas el código.
3. **Base de Datos (Supabase)**: Tienes total libertad para modificar los esquemas en Supabase, los tipos de TypeScript o los ficheros de consultas si es estrictamente necesario para cumplir tu objetivo. Sin embargo, **DEBES** registrar tu cambio en el archivo del buzón correspondiente (dentro de `docs/sync/`) para que el resto del equipo sea consciente.
4. **Diseño Visual**: Tonos oscuros premium, glassmorphism (`backdrop-blur`), bordes tenues (`border-white/5`), contrastes en amarillo (`#FBBF24`). Nunca uses diseños simples o genéricos.
5. **Comunicación Inter-Agentes**: Revisa habitualmente tu buzón en `docs/sync/` por si otro agente te ha dejado alguna solicitud.

## 🤖 Responsabilidades del Equipo
- **Director / Arquitecto**: Decisiones estructurales, coordinación de agentes, prompts y esquemas globales.
- **Agente Web**: Todo lo relacionado con el front-end público (Landing page, SEO, UI/UX de clientes).
- **Agente CRM**: Toda la lógica privada del administrador (`/admin`), paneles de gestión y seguridad.
- **Agente Automatización (IA/N8N)**: Chatbots, flujos externos, webhooks, WhatsApp.
- **Agente Supervisor**: Revisa, audita el código en busca de bugs/malas prácticas y deja sus informes en `SYNC_SUPERVISOR.md`.
