import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requirePermissionOrRedirect, userHas } from '@/lib/auth/guards';
import { Button } from '@/components/form';
import {
  ACTIVITY_STATUS_LABELS,
  CLIENT_TYPE_LABELS,
  IDENTIFICATION_TYPE_LABELS,
  OPPORTUNITY_STATUS_LABELS,
  QUOTATION_STATUS_LABELS,
} from '@/lib/labels';
import { formatDate, formatDateTime, formatMoney } from '@/lib/utils';
import { ClientStatusToggle } from './client-status';

/** RF-020/022/023/024: ficha completa e historial del cliente. */
export default async function ClientePage({ params }: PageProps<'/clientes/[id]'>) {
  const actor = await requirePermissionOrRedirect('clients:read');
  const { id } = await params;

  const cliente = await prisma.client.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, firstName: true, lastName: true } },
      contacts: {
        orderBy: [{ isPrimary: 'desc' }, { lastName: 'asc' }],
        take: 25,
      },
      opportunities: {
        orderBy: { updatedAt: 'desc' },
        take: 25,
        include: { stage: { select: { name: true } }, owner: { select: { firstName: true, lastName: true } } },
      },
      quotations: {
        orderBy: { createdAt: 'desc' },
        take: 25,
      },
      activities: {
        orderBy: { scheduledAt: 'desc' },
        take: 25,
        include: {
          type: { select: { name: true } },
          assignee: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });

  if (!cliente) notFound();

  const puedeEditar = userHas(actor, 'clients:write');
  // RF-066/068: el alta de actividades se hace desde la ficha del cliente, con
  // la asociación ya resuelta.
  const puedeRegistrarActividad = userHas(actor, 'activities:write');
  // RF-080: el alta de cotizaciones también se hace desde la ficha del cliente,
  // con la asociación ya resuelta.
  const puedeCotizar = userHas(actor, 'quotations:write');
  const totalOportunidades = cliente.opportunities.reduce((s, o) => s + Number(o.amount), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/clientes" className="text-sm font-medium text-minerva-red hover:text-minerva-red-dark">
            ← Clientes
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-minerva-black">{cliente.name}</h1>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                cliente.isActive ? 'bg-neutral-900 text-minerva-white' : 'bg-neutral-200 text-neutral-600'
              }`}
            >
              {cliente.isActive ? 'Activo' : 'Inactivo'}
            </span>
          </div>
          <p className="mt-1 text-sm text-minerva-muted">
            {CLIENT_TYPE_LABELS[cliente.type]}
            {cliente.identificationNumber && ` · ${cliente.identificationNumber}`}
          </p>
        </div>
        {puedeEditar && (
          <Link href={`/clientes/${cliente.id}/editar`}>
            <Button variant="primary">Editar</Button>
          </Link>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-lg border border-minerva-border bg-minerva-white p-6 shadow-sm lg:col-span-2">
          <h2 className="text-base font-semibold text-minerva-black">Información</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <Dato label="Identificación">
              {cliente.identificationType
                ? `${IDENTIFICATION_TYPE_LABELS[cliente.identificationType]} ${cliente.identificationNumber ?? ''}`
                : '—'}
            </Dato>
            <Dato label="Teléfono">{cliente.phone ?? '—'}</Dato>
            <Dato label="Correo">{cliente.email ?? '—'}</Dato>
            <Dato label="Sitio web">{cliente.website ?? '—'}</Dato>
            <Dato label="País">{cliente.country ?? '—'}</Dato>
            <Dato label="Sector">{cliente.sector ?? '—'}</Dato>
            <Dato label="Dirección" ancho>
              {cliente.address ?? '—'}
            </Dato>
            <Dato label="Registrado">{formatDate(cliente.createdAt)}</Dato>
            <Dato label="Actualizado">{formatDate(cliente.updatedAt)}</Dato>
          </dl>

          {cliente.notes && (
            <div className="mt-5 border-t border-minerva-border pt-4">
              <h3 className="text-sm font-medium text-neutral-800">Notas</h3>
              <p className="mt-1 whitespace-pre-line text-sm text-neutral-700">{cliente.notes}</p>
            </div>
          )}
        </section>

        <div className="space-y-6">
          <section className="rounded-lg border border-minerva-border bg-minerva-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-minerva-black">Resumen</h2>
            <dl className="mt-4 space-y-3">
              <Resumen valor={String(cliente.contacts.length)} etiqueta="Contactos" />
              <Resumen valor={String(cliente.opportunities.length)} etiqueta="Oportunidades" />
              <Resumen valor={String(cliente.quotations.length)} etiqueta="Cotizaciones" />
              <Resumen valor={String(cliente.activities.length)} etiqueta="Actividades" />
              {totalOportunidades > 0 && (
                <Resumen valor={formatMoney(totalOportunidades)} etiqueta="Monto en oportunidades" />
              )}
            </dl>
          </section>

          {puedeEditar && (
            <section className="rounded-lg border border-minerva-border bg-minerva-white p-6 shadow-sm">
              <h2 className="text-base font-semibold text-minerva-black">Estado</h2>
              <p className="mt-1 mb-4 text-sm text-minerva-muted">
                Desactivar no borra nada: el historial queda intacto.
              </p>
              <ClientStatusToggle client={{ id: cliente.id, isActive: cliente.isActive }} />
            </section>
          )}
        </div>
      </div>

      <section className="rounded-lg border border-minerva-border bg-minerva-white shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-minerva-border px-6 py-4">
          <h2 className="text-base font-semibold text-minerva-black">
            Contactos{' '}
            <span className="text-sm font-normal text-minerva-muted">{cliente.contacts.length}</span>
          </h2>
          {puedeEditar && cliente.isActive && (
            <Link
              href={`/contactos/nuevo?cliente=${cliente.id}`}
              className="text-sm font-medium text-minerva-red hover:text-minerva-red-dark"
            >
              + Agregar contacto
            </Link>
          )}
        </header>
        {cliente.contacts.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-minerva-muted">
            Este cliente todavía no tiene contactos.
          </p>
        ) : (
          <ul className="divide-y divide-minerva-border">
            {cliente.contacts.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-6 py-3">
                <div>
                  <span className="font-medium text-minerva-black">
                    {c.firstName} {c.lastName}
                    {c.isPrimary && (
                      <span className="ml-2 rounded bg-minerva-red px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-minerva-white">
                        Principal
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-minerva-muted">{c.position ?? '—'}</span>
                </div>
                <div className="text-right text-sm text-neutral-700">
                  <span className="block">{c.email ?? '—'}</span>
                  <span className="block text-xs text-minerva-muted">{c.phone ?? '—'}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-minerva-border bg-minerva-white shadow-sm">
        <header className="flex items-center justify-between border-b border-minerva-border px-6 py-4">
          <h2 className="text-base font-semibold text-minerva-black">Oportunidades</h2>
          <span className="text-xs text-minerva-muted">{cliente.opportunities.length}</span>
        </header>
        {cliente.opportunities.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-minerva-muted">Sin oportunidades.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-minerva-border bg-neutral-50 text-xs uppercase tracking-wide text-minerva-muted">
                <tr>
                  <th className="px-6 py-3 font-medium">Oportunidad</th>
                  <th className="px-6 py-3 font-medium">Etapa</th>
                  <th className="px-6 py-3 font-medium">Estado</th>
                  <th className="px-6 py-3 font-medium">Responsable</th>
                  <th className="px-6 py-3 text-right font-medium">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-minerva-border">
                {cliente.opportunities.map((o) => (
                  <tr key={o.id}>
                    <td className="px-6 py-3 font-medium text-minerva-black">{o.name}</td>
                    <td className="px-6 py-3 text-neutral-700">{o.stage.name}</td>
                    <td className="px-6 py-3 text-neutral-700">{OPPORTUNITY_STATUS_LABELS[o.status]}</td>
                    <td className="px-6 py-3 text-neutral-700">
                      {o.owner.firstName} {o.owner.lastName}
                    </td>
                    <td className="px-6 py-3 text-right text-neutral-700">
                      {formatMoney(Number(o.amount), o.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-minerva-border bg-minerva-white shadow-sm">
        <header className="flex items-center justify-between border-b border-minerva-border px-6 py-4">
          <h2 className="text-base font-semibold text-minerva-black">Cotizaciones</h2>
          <span className="text-xs text-minerva-muted">{cliente.quotations.length}</span>
        </header>
        {cliente.quotations.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-minerva-muted">Sin cotizaciones.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-minerva-border bg-neutral-50 text-xs uppercase tracking-wide text-minerva-muted">
                <tr>
                  <th className="px-6 py-3 font-medium">Número</th>
                  <th className="px-6 py-3 font-medium">Estado</th>
                  <th className="px-6 py-3 font-medium">Válida hasta</th>
                  <th className="px-6 py-3 font-medium">Emitida</th>
                  <th className="px-6 py-3 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-minerva-border">
                {cliente.quotations.map((q) => (
                  <tr key={q.id}>
                    <td className="px-6 py-3 font-medium text-minerva-black">{q.number}</td>
                    <td className="px-6 py-3 text-neutral-700">{QUOTATION_STATUS_LABELS[q.status]}</td>
                    <td className="px-6 py-3 text-neutral-700">
                      {q.validUntil ? formatDate(q.validUntil) : '—'}
                    </td>
                    <td className="px-6 py-3 text-neutral-700">{formatDate(q.createdAt)}</td>
                    <td className="px-6 py-3 text-right text-neutral-700">
                      {formatMoney(Number(q.total), q.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-minerva-border bg-minerva-white shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-minerva-border px-6 py-4">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-minerva-black">Cotizaciones</h2>
            <span className="text-xs text-minerva-muted">{cliente.quotations.length}</span>
          </div>
          {puedeCotizar && (
            <Link href={`/cotizaciones/nuevo?cliente=${cliente.id}`}>
              <Button className="px-3 py-1.5 text-xs">Nueva cotización</Button>
            </Link>
          )}
        </header>
        {cliente.quotations.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-minerva-muted">Sin cotizaciones.</p>
        ) : (
          <ul className="divide-y divide-minerva-border">
            {cliente.quotations.map((q) => (
              <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 px-6 py-3">
                <div>
                  <Link
                    href={`/cotizaciones/${q.id}`}
                    className="font-medium text-minerva-black hover:text-minerva-red"
                  >
                    {q.number}
                  </Link>
                  <span className="block text-xs text-minerva-muted">
                    Creada el {formatDate(q.createdAt)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="block text-sm text-neutral-700">
                    {formatMoney(Number(q.total), q.currency)}
                  </span>
                  <span className="block text-xs text-minerva-muted">
                    {QUOTATION_STATUS_LABELS[q.status]}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-minerva-border bg-minerva-white shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-minerva-border px-6 py-4">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-minerva-black">Actividades</h2>
            <span className="text-xs text-minerva-muted">{cliente.activities.length}</span>
          </div>
          {puedeRegistrarActividad && (
            <Link href={`/actividades/nuevo?cliente=${cliente.id}`}>
              <Button className="px-3 py-1.5 text-xs">Registrar actividad</Button>
            </Link>
          )}
        </header>
        {cliente.activities.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-minerva-muted">Sin actividades.</p>
        ) : (
          <ul className="divide-y divide-minerva-border">
            {cliente.activities.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-6 py-3">
                <div>
                  <Link
                    href={`/actividades/${a.id}`}
                    className="font-medium text-minerva-black hover:text-minerva-red"
                  >
                    {a.title}
                  </Link>
                  <span className="block text-xs text-minerva-muted">
                    {a.type.name} · {a.assignee.firstName} {a.assignee.lastName}
                  </span>
                </div>
                <div className="text-right">
                  <span className="block text-sm text-neutral-700">{ACTIVITY_STATUS_LABELS[a.status]}</span>
                  <span className="block text-xs text-minerva-muted">{formatDateTime(a.scheduledAt)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Dato({ label, children, ancho = false }: { label: string; children: React.ReactNode; ancho?: boolean }) {
  return (
    <div className={ancho ? 'sm:col-span-2' : undefined}>
      <dt className="text-xs font-medium uppercase tracking-wide text-minerva-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-minerva-black">{children}</dd>
    </div>
  );
}

function Resumen({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-sm text-minerva-muted">{etiqueta}</dt>
      <dd className="text-sm font-semibold text-minerva-black">{valor}</dd>
    </div>
  );
}