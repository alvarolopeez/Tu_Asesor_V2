import Link from 'next/link'

export default function PoliticaPrivacidadPage() {
  return (
    <main className="min-h-screen flex flex-col items-center pt-32 pb-24 px-4 bg-slate-50 relative overflow-x-hidden">
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-0 w-full h-full bg-[url('/assets/images/pattern.svg')] opacity-5"></div>
      </div>

      <div className="w-full max-w-4xl relative z-10 bg-white shadow-xl rounded-2xl p-8 md:p-12 text-slate-700 leading-relaxed">
        <h1 className="text-4xl font-bold text-[#2C3E50] mb-8 font-heading">Política de Privacidad</h1>
        
        <p className="mb-6">
          En <strong>Tu asesor | Álvaro</strong>, la privacidad y seguridad de sus datos personales son una prioridad. Esta Política de Privacidad describe cómo recopilamos, utilizamos y protegemos la información de los usuarios que acceden a nuestro sitio web o utilizan nuestras herramientas (calculadoras, valoradores de inmuebles, formularios de contacto).
        </p>

        <h2 className="text-2xl font-bold mt-8 mb-4 text-[#2C3E50] font-heading">1. Responsable del Tratamiento</h2>
        <ul className="list-disc list-inside mb-6 space-y-2 ml-4">
          <li><strong>Titular:</strong> Álvaro López Cuevas</li>
          <li><strong>NIF/CIF:</strong> 49124003G</li>
          <li><strong>Correo electrónico:</strong> tuasesoralvaro@gmail.com</li>
          <li><strong>Teléfono:</strong> 697223944</li>
        </ul>

        <h2 className="text-2xl font-bold mt-8 mb-4 text-[#2C3E50] font-heading">2. Información Recopilada y Finalidad</h2>
        <p className="mb-4">
          Recopilamos datos personales a través de los formularios de contacto, calculadoras de plusvalía, rentabilidad y valoradores de IA. Los datos recogidos (como nombre, teléfono, email, características del inmueble) se utilizan con las siguientes finalidades:
        </p>
        <ul className="list-disc list-inside mb-6 space-y-2 ml-4">
          <li>Prestar los servicios de asesoramiento inmobiliario solicitados.</li>
          <li>Generar informes de valoración, rentabilidad y plusvalía automatizados mediante nuestras herramientas tecnológicas y enviarlos al usuario.</li>
          <li>Contactar al usuario por vía telefónica, email o WhatsApp para resolver dudas o hacer seguimiento de su solicitud.</li>
          <li>Mejorar los algoritmos de valoración analizando los datos del mercado de forma agregada y anónima.</li>
        </ul>

        <h2 className="text-2xl font-bold mt-8 mb-4 text-[#2C3E50] font-heading">3. Legitimación para el Tratamiento</h2>
        <p className="mb-4">
          La base legal para el tratamiento de sus datos es el <strong>consentimiento expreso</strong> que otorga al aceptar esta Política de Privacidad antes de enviar cualquier formulario, así como la necesidad de llevar a cabo medidas precontractuales o contractuales a petición suya.
        </p>

        <h2 className="text-2xl font-bold mt-8 mb-4 text-[#2C3E50] font-heading">4. Conservación y Comunicación de Datos</h2>
        <p className="mb-4">
          Los datos proporcionados se conservarán mientras se mantenga la relación comercial o durante los años necesarios para cumplir con las obligaciones legales. <strong>Sus datos no se cederán a terceros</strong> salvo en los casos en que exista una obligación legal o sea estrictamente necesario para la prestación del servicio (por ejemplo, servicios de alojamiento web o bases de datos como Supabase). No tenemos ninguna vinculación con otras agencias u oficinas físicas.
        </p>

        <h2 className="text-2xl font-bold mt-8 mb-4 text-[#2C3E50] font-heading">5. Derechos del Usuario</h2>
        <p className="mb-4">
          El usuario tiene derecho a obtener confirmación sobre si estamos tratando sus datos personales, por tanto tiene derecho a acceder a sus datos personales, rectificar los datos inexactos o solicitar su supresión cuando los datos ya no sean necesarios. Para ejercer estos derechos, puede enviar un correo electrónico a <strong>tuasesoralvaro@gmail.com</strong> adjuntando una copia de su DNI.
        </p>

        <div className="mt-12 pt-8 border-t border-slate-200">
          <Link href="/" className="text-blue-600 hover:underline font-bold">
            &larr; Volver a la página principal
          </Link>
        </div>
      </div>
    </main>
  )
}
