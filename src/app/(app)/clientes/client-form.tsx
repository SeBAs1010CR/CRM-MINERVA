'use client';

import { useActionState, useState } from 'react';
import { createClientAction, updateClientAction, type ActionState } from './actions.server';
import { Field, FormMessage, SelectField, SubmitButton, TextareaField } from '@/components/form';
import { CLIENT_TYPE_LABELS, IDENTIFICATION_TYPE_LABELS, toOptions } from '@/lib/labels';
import { SECTORES, PAISES } from '@/lib/sectores';
import { ClientType, IdentificationType } from '@/generated/prisma/enums';

/**
 * Identificaciones con sentido para cada tipo de cliente.
 *
 * Se replica acá la misma regla que aplica el servidor: el select no debe
 * ofrecer una opción que la acción va a rechazar. El server igual la valida,
 * porque un cliente puede llamar la acción directamente.
 */
const IDENTIFICATIONS_BY_CLIENT_TYPE: Record<ClientType, IdentificationType[]> = {
  [ClientType.PERSONA_FISICA]: [
    IdentificationType.CEDULA_FISICA,
    IdentificationType.PASAPORTE,
    IdentificationType.DIMEX,
    IdentificationType.OTRO,
  ],
  [ClientType.EMPRESA]: [
    IdentificationType.CEDULA_JURIDICA,
    IdentificationType.NIT,
    IdentificationType.DIMEX,
    IdentificationType.OTRO,
  ],
};

export type ClientFormValues = {
  id: string;
  name: string;
  type: ClientType;
  identificationType: IdentificationType | null;
  identificationNumber: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  country: string | null;
  sector: string | null;
  notes: string | null;
};

export function ClientForm({ client }: { client?: ClientFormValues }) {
  const editing = Boolean(client);
  const [state, action] = useActionState<ActionState, FormData>(
    editing ? updateClientAction : createClientAction,
    {},
  );

  // RF-014: el tipo de cliente define qué identificaciones se ofrecen.
  const [type, setType] = useState<ClientType>(client?.type ?? ClientType.EMPRESA);

  return (
    <form action={action} className="space-y-6">
      {client?.id && <input type="hidden" name="id" value={client.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field
            label="Nombre o razón social"
            name="name"
            defaultValue={client?.name ?? ''}
            placeholder="Constructora Arenal S.A."
          />
        </div>

        <SelectField
          label="Tipo de cliente"
          name="type"
          value={type}
          onChange={(v) => setType(v as ClientType)}
          options={toOptions(CLIENT_TYPE_LABELS)}
          hint="Define qué tipo de identificación se acepta."
        />
        <SelectField
          label="Tipo de identificación"
          name="identificationType"
          defaultValue={client?.identificationType ?? ''}
          required={false}
          options={[
            { value: '', label: 'Sin identificación' },
            ...IDENTIFICATIONS_BY_CLIENT_TYPE[type].map((v) => ({
              value: v,
              label: IDENTIFICATION_TYPE_LABELS[v],
            })),
          ]}
        />

        <Field
          label="Número de identificación"
          name="identificationNumber"
          required={false}
          defaultValue={client?.identificationNumber ?? ''}
          placeholder="3-101-123456"
          hint="Si lo escribís, identifica al cliente de forma única."
        />
        <Field
          label="Sitio web"
          name="website"
          required={false}
          defaultValue={client?.website ?? ''}
          placeholder="sitio.cr"
        />

        <Field
          label="Teléfono"
          name="phone"
          type="tel"
          required={false}
          defaultValue={client?.phone ?? ''}
          placeholder="+506 8000 0000"
        />
        <Field
          label="Correo electrónico"
          name="email"
          type="email"
          required={false}
          defaultValue={client?.email ?? ''}
          placeholder="contacto@empresa.cr"
        />

        <div className="sm:col-span-2">
          <Field
            label="Dirección"
            name="address"
            required={false}
            defaultValue={client?.address ?? ''}
            placeholder="San José, Rohrmoser, Av. Central, km 4"
          />
        </div>

        <Field
          label="País"
          name="country"
          required={false}
          options={PAISES}
          defaultValue={client?.country ?? ''}
          placeholder="Costa Rica"
        />
        <Field
          label="Sector"
          name="sector"
          required={false}
          options={SECTORES}
          defaultValue={client?.sector ?? ''}
          placeholder="Salud"
          hint="Sugerencias según el catálogo; podés escribir otro."
        />

        <div className="sm:col-span-2">
          <TextareaField label="Notas" name="notes" rows={5} defaultValue={client?.notes ?? ''} />
          <p className="mt-1 text-xs text-minerva-muted">
            Contexto comercial libre: condiciones de pago, referencias, etc.
          </p>
        </div>
      </div>

      <FormMessage state={state} />

      <div className="w-52">
        <SubmitButton pendingText="Guardando…">
          {editing ? 'Guardar cambios' : 'Crear cliente'}
        </SubmitButton>
      </div>
    </form>
  );
}