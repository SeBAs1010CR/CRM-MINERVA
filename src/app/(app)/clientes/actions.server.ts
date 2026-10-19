'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth/guards';
import { ClientType, IdentificationType } from '@/generated/prisma/enums';

export type ActionState = { error?: string; ok?: string };

/** Texto opcional: en el form vacío llega `''` o `null`; en la BD, `null`. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres.`)
    .transform((v) => (v === '' ? null : v))
    .nullable();

const clientSchema = z.object({
  // RF-015: para personas físicas es el nombre; para empresas, la razón social.
  name: z.string().trim().min(2, 'El nombre o razón social es obligatorio').max(191),
  // Los mensajes van en español a propósito: sin ellos Zod devuelve
  // "Invalid option: expected one of ..." y eso se le muestra al usuario.
  type: z.enum(ClientType, { message: 'Elegí un tipo de cliente válido.' }),
  identificationType: z
    .enum(IdentificationType, { message: 'Elegí un tipo de identificación válido.' })
    .nullable(),
  identificationNumber: optionalText(50),
  phone: optionalText(30),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(191)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .refine((v) => v === null || z.string().email().safeParse(v).success, {
      message: 'Correo inválido',
    }),
  website: optionalText(191),
  address: optionalText(255),
  country: optionalText(100),
  sector: optionalText(150),
  notes: optionalText(10_000),
});

function readClientForm(formData: FormData) {
  const text = (key: string) => (formData.get(key) as string | null) ?? '';
  return {
    name: text('name'),
    type: text('type'),
    identificationType: text('identificationType') || null,
    identificationNumber: text('identificationNumber'),
    phone: text('phone'),
    email: text('email'),
    website: text('website'),
    address: text('address'),
    country: text('country'),
    sector: text('sector'),
    notes: text('notes'),
  };
}

/**
 * Identificaciones que tienen sentido según si el cliente es persona o empresa.
 * Cargar "cédula jurídica" en una persona física es un error de captura que
 * termina duplicando clientes, así que se rechaza en vez de solo avisar.
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

async function validateIdentification(
  data: { type: ClientType; identificationType: IdentificationType | null; identificationNumber: string | null },
  exceptClientId?: string,
): Promise<string | null> {
  if (!data.identificationNumber) {
    return data.identificationType
      ? 'Dejás el tipo de identificación sin número: quitá el tipo o escribí el número.'
      : null;
  }
  if (!data.identificationType) {
    return 'Indicá el tipo de identificación si escribís un número.';
  }

  const allowed = IDENTIFICATIONS_BY_CLIENT_TYPE[data.type];
  if (!allowed.includes(data.identificationType)) {
    return 'Ese tipo de identificación no corresponde al tipo de cliente elegido.';
  }

  const duplicate = await prisma.client.findFirst({
    where: {
      identificationType: data.identificationType,
      identificationNumber: data.identificationNumber,
      ...(exceptClientId ? { id: { not: exceptClientId } } : {}),
    },
    select: { name: true },
  });
  return duplicate ? `Esa identificación ya está registrada en "${duplicate.name}".` : null;
}

/** RF-013/014/015/016/017/018: registrar un cliente. */
export async function createClientAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requirePermission('clients:write');

  const parsed = clientSchema.safeParse(readClientForm(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

  const identificationError = await validateIdentification(parsed.data);
  if (identificationError) return { error: identificationError };

  await prisma.client.create({ data: { ...parsed.data, createdById: actor.id } });

  revalidatePath('/clientes');
  return { ok: 'Cliente creado' };
}

/** RF-019: modificar la información de un cliente. */
export async function updateClientAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission('clients:write');

  const id = z.string().min(1).safeParse(formData.get('id'));
  if (!id.success) return { error: 'Cliente no identificado' };

  const parsed = clientSchema.safeParse(readClientForm(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

  const identificationError = await validateIdentification(parsed.data, id.data);
  if (identificationError) return { error: identificationError };

  const existing = await prisma.client.findUnique({ where: { id: id.data }, select: { id: true } });
  if (!existing) return { error: 'Cliente no encontrado' };

  await prisma.client.update({ where: { id: id.data }, data: parsed.data });

  revalidatePath('/clientes');
  revalidatePath(`/clientes/${id.data}`);
  return { ok: 'Cliente actualizado' };
}

const toggleSchema = z.object({
  id: z.string().min(1),
  isActive: z.enum(['true', 'false'], { message: 'Estado inválido.' }),
  confirm: z.string().optional(),
});

/**
 * RF-021: activar o desactivar un cliente.
 *
 * Desactivar deja al cliente fuera de los listados sin perder su historial, por
 * eso pide confirmación explícita. Reactivarlo es la operación de menor riesgo
 * y no la pide.
 */
export async function toggleClientActiveAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission('clients:write');

  const parsed = toggleSchema.safeParse({
    id: formData.get('id'),
    isActive: formData.get('isActive'),
    confirm: formData.get('confirm') ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

  const { id, isActive, confirm } = parsed.data;
  const nextActive = isActive === 'true';

  if (!nextActive && confirm !== 'on') {
    return { error: 'Tenés que confirmar la casilla.' };
  }

  const client = await prisma.client.findUnique({
    where: { id },
    select: { isActive: true },
  });
  if (!client) return { error: 'Cliente no encontrado' };

  if (client.isActive === nextActive) {
    return { error: 'El cliente ya está en ese estado.' };
  }

  await prisma.client.update({ where: { id }, data: { isActive: nextActive } });

  revalidatePath('/clientes');
  revalidatePath(`/clientes/${id}`);
  return { ok: nextActive ? 'Cliente reactivado' : 'Cliente desactivado' };
}