import { prisma } from '@/lib/db';
import { requirePermissionOrRedirect } from '@/lib/auth/guards';
import { EmpresaForm, type EmpresaValues } from './empresa-form';

/** RF-097, RF-101: configuración de la empresa. Solo ADMIN. */
export default async function EmpresaPage() {
  await requirePermissionOrRedirect('settings:manage');

  const empresa = await prisma.companySetting.findUnique({ where: { id: 'singleton' } });

  const valores: EmpresaValues = {
    name: empresa?.name ?? '',
    legalName: empresa?.legalName ?? '',
    taxId: empresa?.taxId ?? '',
    address: empresa?.address ?? '',
    phone: empresa?.phone ?? '',
    email: empresa?.email ?? '',
    website: empresa?.website ?? '',
    logoUrl: empresa?.logoUrl ?? '',
    defaultTermsAndConditions: empresa?.defaultTermsAndConditions ?? '',
    defaultCurrency: empresa?.defaultCurrency ?? 'CRC',
    defaultTaxRate: empresa?.defaultTaxRate.toFixed(2) ?? '13.00',
    quotationPrefix: empresa?.quotationPrefix ?? 'COT',
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-minerva-black">Datos de la empresa</h1>
        <p className="mt-1 text-sm text-minerva-muted">
          Membrete de la cotización impresa y valores con los que se prellenan las cotizaciones
          nuevas.
        </p>
      </div>

      {!empresa && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Aún no existe la fila de configuración: al guardar se crea con estos valores.
        </p>
      )}

      <div className="rounded-lg border border-minerva-border bg-minerva-white p-6 shadow-sm">
        <EmpresaForm valores={valores} />
      </div>
    </div>
  );
}