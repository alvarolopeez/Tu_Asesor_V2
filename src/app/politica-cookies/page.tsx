import Link from 'next/link'

export default function PoliticaCookiesPage() {
  return (
    <main className="min-h-screen flex flex-col items-center pt-32 pb-24 px-4 bg-slate-50 relative overflow-x-hidden">
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-0 w-full h-full bg-[url('/assets/images/pattern.svg')] opacity-5"></div>
      </div>

      <div className="w-full max-w-4xl relative z-10 bg-white shadow-xl rounded-2xl p-8 md:p-12 text-slate-700 leading-relaxed">
        <h1 className="text-4xl font-bold text-[#2C3E50] mb-8 font-heading">Política de Cookies</h1>
        
        <p className="mb-6">
          En <strong>Tu asesor | Álvaro</strong> utilizamos cookies propias y de terceros para asegurar el correcto funcionamiento del sitio web, ofrecerle la mejor experiencia de usuario y realizar análisis estadísticos de uso.
        </p>

        <h2 className="text-2xl font-bold mt-8 mb-4 text-[#2C3E50] font-heading">1. ¿Qué son las cookies?</h2>
        <p className="mb-4">
          Una cookie es un fichero que se descarga en su ordenador al acceder a determinadas páginas web. Las cookies permiten a una página web, entre otras cosas, almacenar y recuperar información sobre los hábitos de navegación de un usuario o de su equipo y, dependiendo de la información que contengan y de la forma en que utilice su equipo, pueden utilizarse para reconocer al usuario.
        </p>

        <h2 className="text-2xl font-bold mt-8 mb-4 text-[#2C3E50] font-heading">2. ¿Qué tipos de cookies utiliza esta página web?</h2>
        <ul className="list-disc list-inside mb-6 space-y-2 ml-4">
          <li><strong>Cookies técnicas:</strong> Son aquellas necesarias para la navegación y el buen funcionamiento de nuestra página web. Permiten, por ejemplo, controlar el tráfico y la comunicación de datos, acceder a partes de acceso restringido, o utilizar elementos de seguridad.</li>
          <li><strong>Cookies de personalización:</strong> Son aquellas que permiten al usuario acceder al servicio con algunas características de carácter general predefinidas (idioma, tipo de navegador, etc.).</li>
          <li><strong>Cookies de análisis:</strong> Son aquellas que nos permiten cuantificar el número de usuarios y así realizar la medición y análisis estadístico de la utilización que hacen los usuarios de los servicios ofertados (por ejemplo, a través de Google Analytics).</li>
        </ul>

        <h2 className="text-2xl font-bold mt-8 mb-4 text-[#2C3E50] font-heading">3. Desactivación o eliminación de cookies</h2>
        <p className="mb-4">
          Puede usted permitir, bloquear o eliminar las cookies instaladas en su equipo mediante la configuración de las opciones del navegador instalado en su ordenador. Sin embargo, debe tener en cuenta que si elimina o bloquea las cookies, es posible que no pueda utilizar todas las funciones de nuestro sitio web.
        </p>
        <p className="mb-4">
          A continuación le ofrecemos enlaces en los que encontrará información sobre cómo configurar sus preferencias en los principales navegadores:
        </p>
        <ul className="list-disc list-inside mb-6 space-y-2 ml-4 text-blue-600">
          <li><a href="https://support.google.com/chrome/answer/95647?hl=es" target="_blank" rel="noopener noreferrer" className="hover:underline">Google Chrome</a></li>
          <li><a href="https://support.mozilla.org/es/kb/habilitar-y-deshabilitar-cookies-sitios-web-rastrear-preferencias" target="_blank" rel="noopener noreferrer" className="hover:underline">Mozilla Firefox</a></li>
          <li><a href="https://support.apple.com/es-es/guide/safari/sfri11471/mac" target="_blank" rel="noopener noreferrer" className="hover:underline">Safari</a></li>
        </ul>

        <div className="mt-12 pt-8 border-t border-slate-200">
          <Link href="/" className="text-blue-600 hover:underline font-bold">
            &larr; Volver a la página principal
          </Link>
        </div>
      </div>
    </main>
  )
}
