'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { Currency } from '@/generated/prisma/enums';
import { requirePermission } from '@/lib/auth/guards';
import { prisma } from '@/lib/db';
import { normalizeDecimal } from '@/lib/money';
import { requireUser } from '@/lib/auth/guards';

export type SettingsState = { error?: string; ok?: string };

const empresaSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(191),
  legalName: z.string().trim().max(191),
  taxId: z.string().trim().max(50),
  address: z.string().trim().max(255),
  phone: z.string().trim().max(30),
  email: z
    .string()
    .trim()
    .max(191)
    .refine((v) => v === '' || z.string().email().safeParse(v).success, {
      message: 'El correo no tiene un formato válido',
    }),
  website: z.string().trim().max(191),
  logoUrl: z.string().trim().max(500),
  defaultTermsAndConditions: z.string().trim().max(20_000),
  defaultCurrency: z.enum([Currency.CRC, Currency.USD]),
  defaultTaxRate: z.string().trim().min(1, 'El impuesto por defecto es obligatorio'),
  quotationPrefix: z
    .string()
    .trim()
    .min(1, 'El prefijo del número es obligatorio')
    .max(10)
    .regex(/^[A-Za-z0-9_-]+$/, 'El prefijo solo admite letras, números, guion y guion bajo'),
});

/**
 * RF-097, RF-101 y RF-102: los datos de la empresa que salen en el membrete del
 * documento, más los valores por defecto con los que se prellenan las
 * cotizaciones nuevas (RF-079, RF-087, RF-089, RF-090).
 *
 * Usa `upsert` sobre el id fijo `singleton`: así, si la fila todavía no existe
 * (base nueva o seed nunca corrido), el primer guardado la crea.
 */
export async function saveCompanySettingsAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  await requirePermission('settings:manage');
  const actor = await requireUser();

  const parsed = empresaSchema.safeParse({
    name: formData.get('name') ?? '',
    legalName: formData.get('legalName') ?? '',
    taxId: formData.get('taxId') ?? '',
    address: formData.get('address') ?? '',
    phone: formData.get('phone') ?? '',
    email: formData.get('email') ?? '',
    website: formData.get('website') ?? '',
    logoUrl: formData.get('logoUrl') ?? '',
    defaultTermsAndConditions: formData.get('defaultTermsAndConditions') ?? '',
    defaultCurrency: formData.get('defaultCurrency') ?? Currency.CRC,
    defaultTaxRate: formData.get('defaultTaxRate') ?? '',
    quotationPrefix: formData.get('quotationPrefix') ?? '',
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

  const impuesto = normalizeDecimal(parsed.data.defaultTaxRate);
  if (impuesto === null || Number(impuesto) < 0 || Number(impuesto) > 100) {
    return { error: 'El impuesto por defecto debe ser un número entre 0 y 100.' };
  }

  const datos = {
    name: parsed.data.name,
    legalName: parsed.data.legalName || null,
    taxId: parsed.data.taxId || null,
    address: parsed.data.address || null,
    phone: parsed.data.phone || null,
    email: parsed.data.email || null,
    website: parsed.data.website || null,
    logoUrl: parsed.data.logoUrl || null,
    defaultTermsAndConditions: parsed.data.defaultTermsAndConditions || null,
    defaultCurrency: parsed.data.defaultCurrency,
    defaultTaxRate: impuesto,
    quotationPrefix: parsed.data.quotationPrefix.toUpperCase(),
  };

  await prisma.companySetting.upsert({ where: { id: 'singleton' }, update: datos, create: { id: 'singleton', ...datos } });

  // La página de configuración y el listado se releen; el documento se dibuja en
  // cada visita, así que no necesita revalidación propia.
  revalidatePath('/configuracion/empresa');
  revalidatePath('/cotizaciones');
  revalidatePath('/cotizaciones/nuevo');

  return { ok: `Datos guardados por ${actor.firstName}.` };
}