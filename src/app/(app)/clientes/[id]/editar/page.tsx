import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requirePermissionOrRedirect } from '@/lib/auth/guards';
import { ClientForm } from '../../client-form';

/** RF-019: modificar la información de un cliente. */
export default async function EditarClientePage({ params }: PageProps<'/clientes/[id]/editar'>) {
  await requirePermissionOrRedirect('clients:write');
  const { id } = await params;

  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href={`/clientes/${client.id}`}
          className="text-sm font-medium text-minerva-red hover:text-minerva-red-dark"
        >
          ← {client.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-minerva-black">Editar cliente</h1>
      </div>

      <div className="rounded-lg border border-minerva-border bg-minerva-white p-6 shadow-sm">
        <ClientForm
          client={{
            id: client.id,
            name: client.name,
            type: client.type,
            identificationType: client.identificationType,
            identificationNumber: client.identificationNumber,
            phone: client.phone,
            email: client.email,
            website: client.website,
            address: client.address,
            country: client.country,
            sector: client.sector,
            notes: client.notes,
          }}
        />
      </div>
    </div>
  );
}