import Link from 'next/link'

export default function AvisoLegalPage() {
  return (
    <main className="min-h-screen flex flex-col items-center pt-32 pb-24 px-4 bg-[#0f172a] text-white relative overflow-x-hidden">
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-0 w-full h-full bg-[url('/assets/images/pattern.svg')] opacity-5"></div>
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#FBBF24]/10 rounded-full mix-blend-screen filter blur-3xl opacity-30 z-0"></div>
        <div className="absolute bottom-10 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full mix-blend-screen filter blur-3xl opacity-20 z-0"></div>
      </div>

      <div className="w-full max-w-4xl relative z-10 glass-effect bg-[#1E293B]/70 border border-white/5 backdrop-blur-md rounded-2xl p-8 md:p-12 text-slate-300 leading-relaxed shadow-2xl">
        <h1 className="text-4xl font-bold text-white mb-8 font-heading border-b border-white/10 pb-4">Aviso Legal</h1>
        
        <h2 className="text-2xl font-bold mt-8 mb-4 text-[#FBBF24] font-heading">1. Datos del Responsable</h2>
        <p className="mb-4">
          En cumplimiento con el deber de información recogido en artículo 10 de la Ley 34/2002, de 11 de julio, de Servicios de la Sociedad de la Información y del Comercio Electrónico (LSSI-CE), a continuación se reflejan los siguientes datos:
        </p>
        <ul className="list-disc list-inside mb-6 space-y-2 ml-4">
          <li><strong>Titular:</strong> Álvaro López Cuevas</li>
          <li><strong>Nombre comercial:</strong> Tu asesor | Álvaro</li>
          <li><strong>NIF/CIF:</strong> 49124003G</li>
          <li><strong>Correo electrónico:</strong> tuasesoralvaro@gmail.com</li>
          <li><strong>Teléfono de contacto:</strong> 697223944</li>
          <li><strong>Sitio web:</strong> tuasesoralvaro.com</li>
        </ul>

        <h2 className="text-2xl font-bold mt-8 mb-4 text-[#FBBF24] font-heading">2. Objeto del Sitio Web</h2>
        <p className="mb-4">
          El presente sitio web tiene como objeto la prestación de servicios de asesoramiento inmobiliario, la promoción de inmuebles para su venta o alquiler, el uso de herramientas tecnológicas avanzadas e Inteligencia Artificial para la estimación de valor y cálculo de gastos, y la publicación de información relacionada con el sector inmobiliario a través de su blog.
        </p>

        <h2 className="text-2xl font-bold mt-8 mb-4 text-[#FBBF24] font-heading">3. Condiciones de Uso y Herramientas Tecnológicas</h2>
        <p className="mb-4">
          El acceso y/o uso de este portal atribuye la condición de USUARIO, que acepta, desde dicho acceso y/o uso, las Condiciones Generales de Uso aquí reflejadas.
        </p>
        <p className="mb-4">
          <strong>Uso de IA y Calculadoras:</strong> Las herramientas de valoración, calculadoras de rentabilidad y plusvalía disponibles en el sitio web se ofrecen con carácter puramente informativo y orientativo. Los resultados generados por nuestra Inteligencia Artificial se basan en algoritmos propios y datos de mercado, pero no constituyen una tasación oficial ni una oferta vinculante. El titular no asume responsabilidad alguna sobre las decisiones tomadas en base a dichas estimaciones.
        </p>

        <h2 className="text-2xl font-bold mt-8 mb-4 text-[#FBBF24] font-heading">4. Propiedad Intelectual e Industrial</h2>
        <p className="mb-4">
          El titular, por sí mismo o como cesionario, es titular de todos los derechos de propiedad intelectual e industrial de su página web, así como de los elementos contenidos en la misma (imágenes, sonido, audio, vídeo, software o textos; marcas o logotipos, combinaciones de colores, estructura y diseño). Queda expresamente prohibida la reproducción, la distribución y la comunicación pública, incluida su modalidad de puesta a disposición, de la totalidad o parte de los contenidos de esta página web, con fines comerciales, en cualquier soporte y por cualquier medio técnico, sin la autorización del titular.
        </p>

        <h2 className="text-2xl font-bold mt-8 mb-4 text-[#FBBF24] font-heading">5. Exclusión de Garantías y Responsabilidad</h2>
        <p className="mb-4">
          El titular no se hace responsable, en ningún caso, de los daños y perjuicios de cualquier naturaleza que pudieran ocasionar: errores u omisiones en los contenidos, falta de disponibilidad del portal, la transmisión de virus o programas maliciosos en los contenidos, ni de la precisión absoluta de los cálculos realizados por las herramientas de valoración integradas, a pesar de haber adoptado todas las medidas tecnológicas necesarias para evitarlo.
        </p>

        <h2 className="text-2xl font-bold mt-8 mb-4 text-[#FBBF24] font-heading">6. Legislación Aplicable y Jurisdicción</h2>
        <p className="mb-4">
          La relación entre el titular y el USUARIO se regirá por la normativa española vigente y cualquier controversia se someterá a los Juzgados y tribunales de la ciudad de Sevilla.
        </p>

        <div className="mt-12 pt-8 border-t border-white/10">
          <Link href="/" className="text-[#FBBF24] hover:text-yellow-400 hover:underline font-bold">
            &larr; Volver a la página principal
          </Link>
        </div>
      </div>
    </main>
  )
}
