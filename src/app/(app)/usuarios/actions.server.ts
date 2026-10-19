'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { destroyAllSessionsForUser } from '@/lib/auth/session';
import { requirePermission } from '@/lib/auth/guards';

export type ActionState = { error?: string; ok?: string };

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'El correo es obligatorio')
  .email('Correo inválido');

const passwordSchema = z
  .string()
  .min(10, 'La contraseña debe tener al menos 10 caracteres')
  .max(200, 'La contraseña es demasiado larga');

const roleSchema = z.string().trim().min(1, 'Elegí un rol.');

/**
 * Cuenta cuántos usuarios activos pertenecen a un rol administrador
 * (`isAdmin`). Si la operación que se está por hacer dejaría ese número en
 * cero, no se permite: sin ningún administrador activo no hay forma de volver
 * a entrar a administrar nada.
 */
async function countActiveAdmins(exceptUserId?: string): Promise<number> {
  return prisma.user.count({
    where: {
      isActive: true,
      role: { isAdmin: true },
      ...(exceptUserId ? { id: { not: exceptUserId } } : {}),
    },
  });
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

const createSchema = z.object({
  email: emailSchema,
  firstName: z.string().trim().min(1, 'El nombre es obligatorio').max(100),
  lastName: z.string().trim().min(1, 'El apellido es obligatorio').max(100),
  phone: z.string().trim().max(30).optional(),
  roleId: roleSchema,
  password: passwordSchema,
});

/** RF-006: crear un usuario y asociarlo a un rol (RF-009). */
export async function createUserAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requirePermission('users:manage');

  const parsed = createSchema.safeParse({
    email: formData.get('email'),
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    phone: formData.get('phone') || undefined,
    roleId: formData.get('roleId'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const { email, firstName, lastName, phone, roleId, password } = parsed.data;

  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role || !role.isActive) return { error: 'Elegí un rol válido.' };

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: 'Ya existe un usuario con ese correo.' };

  try {
    await prisma.user.create({
      data: {
        email,
        firstName,
        lastName,
        phone: phone ?? null,
        roleId: role.id,
        passwordHash: await hashPassword(password),
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { error: 'Ya existe un usuario con ese correo.' };
    throw err;
  }

  void actor;
  revalidatePath('/usuarios');
  return { ok: `Usuario ${firstName} ${lastName} creado. Entregale la contraseña temporal.` };
}

const updateSchema = z.object({
  id: z.string().min(1),
  email: emailSchema,
  firstName: z.string().trim().min(1, 'El nombre es obligatorio').max(100),
  lastName: z.string().trim().min(1, 'El apellido es obligatorio').max(100),
  phone: z.string().trim().max(30).optional(),
  // Opcional: si el select del rol viene deshabilitado no se envía y el campo
  // llega null. En ese caso se conserva el rol actual (ver abajo).
  roleId: roleSchema.optional(),
});

/** RF-007: modificar la información de un usuario. */
export async function updateUserAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requirePermission('users:manage');

  const parsed = updateSchema.safeParse({
    id: formData.get('id'),
    email: formData.get('email'),
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    phone: formData.get('phone') || undefined,
    roleId: formData.get('roleId') || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const { id, email, firstName, lastName, phone } = parsed.data;

  const target = await prisma.user.findUnique({
    where: { id },
    include: { role: true },
  });
  if (!target) return { error: 'Usuario no encontrado.' };

  // Sin roleId en el submit se mantiene el rol que ya tenía el usuario.
  const roleId = parsed.data.roleId ?? target.roleId;
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role || !role.isActive) return { error: 'Elegí un rol válido.' };

  // Quitarse el propio rol o desactivarse a uno mismo deja la cuenta
  // inmediatamente sin acceso a esta misma pantalla.
  if (id === actor.id && roleId !== target.roleId) {
    return { error: 'No podés cambiar tu propio rol. Pedí que lo haga otro administrador.' };
  }

  if (target.role.isAdmin && !role.isAdmin && (await countActiveAdmins(id)) === 0) {
    return { error: 'No podés dejar el sistema sin ningún administrador activo.' };
  }

  const emailTaken = await prisma.user.findFirst({ where: { email, NOT: { id } } });
  if (emailTaken) return { error: 'Ya existe otro usuario con ese correo.' };

  try {
    await prisma.user.update({
      where: { id },
      data: { email, firstName, lastName, phone: phone ?? null, roleId: role.id },
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { error: 'Ya existe otro usuario con ese correo.' };
    throw err;
  }

  revalidatePath('/usuarios');
  revalidatePath(`/usuarios/${id}`);
  return { ok: 'Usuario actualizado.' };
}

const setPasswordSchema = z.object({
  id: z.string().min(1),
  password: passwordSchema,
});

/**
 * El administrador fija una nueva contraseña. Cierra las sesiones abiertas del
 * usuario porque la anterior pudo haber quedado en manos de otra persona.
 */
export async function setUserPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission('users:manage');

  const parsed = setPasswordSchema.safeParse({
    id: formData.get('id'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const target = await prisma.user.findUnique({ where: { id: parsed.data.id } });
  if (!target) return { error: 'Usuario no encontrado.' };

  await prisma.user.update({
    where: { id: parsed.data.id },
    data: { passwordHash: await hashPassword(parsed.data.password) },
  });
  await destroyAllSessionsForUser(parsed.data.id);

  revalidatePath(`/usuarios/${parsed.data.id}`);
  return { ok: 'Contraseña restablecida. Se cerraron las sesiones de ese usuario.' };
}

const toggleSchema = z.object({
  id: z.string().min(1),
  isActive: z.enum(['true', 'false'], { message: 'Estado inválido.' }),
  // Opcional en el esquema: la casilla solo se pide al desactivar. Si la
  // exigiéramos siempre, reactivar quedaría imposible desde la UI.
  confirm: z.string().optional(),
});

/**
 * RF-008: activar o desactivar un usuario.
 *
 * Desactivar no solo bloquea el próximo login: cierra las sesiones que ya
 * tuviera abiertas, o el usuario seguiría trabajando con la cuenta en pie.
 */
export async function toggleUserActiveAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requirePermission('users:manage');

  const parsed = toggleSchema.safeParse({
    id: formData.get('id'),
    isActive: formData.get('isActive'),
    confirm: formData.get('confirm') ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const { id, isActive, confirm } = parsed.data;
  const nextActive = isActive === 'true';

  // Desactivar deja al usuario fuera y cierra sus sesiones; se pide una
  // confirmación explícita. Reactivarlo es la operación de menor riesgo, así
  // que no la exige.
  if (!nextActive && confirm !== 'on') {
    return { error: 'Tenés que confirmar la casilla.' };
  }

  const target = await prisma.user.findUnique({
    where: { id },
    include: { role: true },
  });
  if (!target) return { error: 'Usuario no encontrado.' };

  if (id === actor.id && !nextActive) {
    return { error: 'No podés desactivar tu propia cuenta.' };
  }

  if (!nextActive && target.role.isAdmin && target.isActive) {
    if ((await countActiveAdmins(id)) === 0) {
      return { error: 'No podés desactivar al último administrador activo.' };
    }
  }

  if (target.isActive === nextActive) {
    return { error: 'El usuario ya está en ese estado.' };
  }

  await prisma.user.update({ where: { id }, data: { isActive: nextActive } });

  if (!nextActive) {
    await destroyAllSessionsForUser(id);
  }

  revalidatePath('/usuarios');
  revalidatePath(`/usuarios/${id}`);
  return {
    ok: nextActive
      ? `Usuario ${target.firstName} reactivado.`
      : `Usuario ${target.firstName} desactivado y sus sesiones fueron cerradas.`,
  };
}