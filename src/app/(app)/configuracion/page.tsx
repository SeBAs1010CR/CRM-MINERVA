import Link from 'next/link';
import { requireUser, userHas } from '@/lib/auth/guards';
import { APP_VERSION } from '@/lib/version';

type SeccionConfig = {
  href: string;
  titulo: string;
  descripcion: string;
  visible: boolean;
};

/** Ruedita de configuración: agrupa los ajustes del sistema en un solo lugar. */
export default async function ConfiguracionPage() {
  const user = await requireUser();

  const secciones: SeccionConfig[] = [
    {
      href: '/configuracion/empresa',
      titulo: 'Datos de la empresa',
      descripcion: 'Membrete y valores por defecto de las cotizaciones.',
      visible: userHas(user, 'settings:manage'),
    },
    {
      href: '/configuracion/unidades',
      titulo: 'Unidades de medida',
      descripcion: 'Unidades con las que se venden productos y servicios.',
      visible: userHas(user, 'products:write'),
    },
    {
      href: '/configuracion/etapas',
      titulo: 'Etapas del pipeline',
      descripcion: 'Orden y nombres de las etapas de las oportunidades.',
      visible: userHas(user, 'stages:manage'),
    },
    {
      href: '/configuracion/tipos-actividad',
      titulo: 'Tipos de actividad',
      descripcion: 'Categorías para clasificar las actividades.',
      visible: userHas(user, 'activityTypes:manage'),
    },
    {
      href: '/usuarios/roles',
      titulo: 'Roles y permisos',
      descripcion: 'Perfiles de acceso y qué puede hacer cada uno.',
      visible: user.role.isAdmin,
    },
  ].filter((s) => s.visible);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-minerva-black">Configuración</h1>
        <p className="mt-1 text-sm text-minerva-muted">
          Ajustes generales del sistema. Solo ves las secciones que tu rol puede administrar.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {secciones.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="rounded-lg border border-minerva-border bg-minerva-white p-5 shadow-sm transition-colors hover:border-minerva-red"
          >
            <h2 className="text-base font-semibold text-minerva-black">{s.titulo}</h2>
            <p className="mt-1 text-sm text-minerva-muted">{s.descripcion}</p>
          </Link>
        ))}
      </div>

      {secciones.length === 0 && (
        <p className="rounded-md border border-minerva-border bg-minerva-white px-4 py-3 text-sm text-minerva-muted">
          Tu rol no tiene acceso a ninguna sección de configuración.
        </p>
      )}

      <p className="text-xs text-minerva-muted">Minerva CRM · Versión {APP_VERSION}</p>
    </div>
  );
}
