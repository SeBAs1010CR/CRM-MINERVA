import { requireUser, userHas } from '@/lib/auth/guards';
import { AppShell, type NavItem } from '@/components/app-shell';
import { APP_VERSION } from '@/lib/version';

export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const user = await requireUser();

  const items: NavItem[] = [{ href: '/dashboard', label: 'Panel' }];
  if (userHas(user, 'clients:read')) {
    items.push({ href: '/clientes', label: 'Clientes' });
  }
  if (userHas(user, 'contacts:read')) {
    items.push({ href: '/contactos', label: 'Contactos' });
  }
  if (userHas(user, 'products:read')) {
    items.push({ href: '/productos', label: 'Productos' });
  }
  if (userHas(user, 'opportunities:read')) {
    items.push(
      { href: '/oportunidades', label: 'Oportunidades' },
      { href: '/pipeline', label: 'Pipeline' },
    );
  }
  if (userHas(user, 'activities:read')) {
    items.push({ href: '/actividades', label: 'Actividades' });
  }
  if (userHas(user, 'quotations:read')) {
    items.push({ href: '/cotizaciones', label: 'Cotizaciones' });
  }
  if (userHas(user, 'reports:read')) {
    items.push({ href: '/reportes', label: 'Reportes' });
  }
  if (userHas(user, 'users:manage')) {
    items.push({ href: '/usuarios', label: 'Usuarios' });
  }
  items.push({ href: '/perfil', label: 'Mi perfil' });

  // La ruedita de configuración agrupa los ajustes del sistema; se muestra si
  // el usuario tiene permiso sobre al menos una de sus secciones.
  const mostrarConfiguracion =
    userHas(user, 'settings:manage') ||
    userHas(user, 'products:write') ||
    userHas(user, 'stages:manage') ||
    userHas(user, 'activityTypes:manage') ||
    user.role.isAdmin;

  return (
    <AppShell
      items={items}
      userName={`${user.firstName} ${user.lastName}`}
      userRole={user.role.name}
      mostrarConfiguracion={mostrarConfiguracion}
      version={APP_VERSION}
    >
      {children}
    </AppShell>
  );
}