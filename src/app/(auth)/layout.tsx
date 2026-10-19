import Image from 'next/image';

export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="flex min-h-screen">
      {/* Columna izquierda: fondo de edificios, logo arriba y formulario debajo. */}
      <div className="relative flex w-full flex-col lg:w-1/2">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-neutral-900 bg-cover bg-center"
          style={{ backgroundImage: "url('/fondo/edificios.jpg')" }}
        />
        <div aria-hidden="true" className="absolute inset-0 bg-black/50" />

        <div className="relative flex flex-1 flex-col items-center justify-start px-6 py-12 lg:pt-20">
          <Image
            src="/marca/minerva-logo-horizontal-blanco.png"
            alt="Minerva Consultores"
            width={490}
            height={132}
            className="h-16 w-auto lg:h-20"
            priority
          />
          <div className="mt-8 w-full max-w-md">
            <p className="mb-4 text-center text-base text-minerva-white/90">Sistema CRM</p>
            <div className="rounded-lg border border-minerva-border bg-minerva-white p-8 shadow-lg">
              {children}
            </div>
          </div>
        </div>

        <footer className="relative px-6 pb-6 text-xs text-minerva-white/80">
          Desarrollado e implementado por{' '}
          <a
            href="https://www.savlabscr.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-minerva-red"
          >
            savlabscr.com
          </a>
        </footer>
      </div>

      {/* Columna derecha: fondo del formulario. */}
      <div className="relative hidden w-1/2 lg:flex">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-black bg-cover bg-center"
          style={{ backgroundImage: "url('/fondo/fondo-form.jpg')" }}
        />
      </div>
    </div>
  );
}
