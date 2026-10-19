'use server';

import { z } from 'zod';
import { prisma } from '@/lib/db';
import { createSession } from '@/lib/auth/session';
import { dummyVerify, hashPassword, verifyPassword } from '@/lib/auth/password';
import { sendMail } from '@/lib/email';

export type ActionState = { error?: string; ok?: string };

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Correo inválido'),
  password: z.string().min(1, 'Ingresá tu contraseña'),
});

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse({ email: formData.get('email'), password: formData.get('password') });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) { await dummyVerify(); return { error: 'Correo o contraseña incorrectos' }; }
  if (!user.isActive) return { error: 'Tu usuario está desactivado. Contactá al administrador.' };
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) { await dummyVerify(); return { error: 'Correo o contraseña incorrectos' }; }
  await createSession(user.id);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return { ok: 'Inicio de sesión exitoso' };
}

const forgotSchema = z.object({ email: z.string().trim().toLowerCase().email('Correo inválido') });

export async function forgotPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = forgotSchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Correo inválido' };
  const generic = { ok: 'Si el correo está registrado, te enviamos un enlace para restablecer la contraseña.' };
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user || !user.isActive) return generic;
  const { createHash, randomBytes } = await import('node:crypto');
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await prisma.passwordResetToken.create({ data: { tokenHash: createHash('sha256').update(token).digest('hex'), userId: user.id, expiresAt } });
  const baseUrl = process.env.APP_URL ?? 'http://localhost:3000';
  const link = `${baseUrl}/reset-password?token=${token}`;
  await sendMail({ to: user.email, subject: 'Restablecer contraseña — CRM Minerva', text: `Hola ${user.firstName},\n\n${link}\n\nVence en 1 hora. Si no fuiste vos, ignorá este mensaje.` });
  return generic;
}

const resetSchema = z.object({
  token: z.string().min(20),
  newPassword: z.string().min(10).max(200),
  confirmPassword: z.string().min(1),
}).refine((d) => d.newPassword === d.confirmPassword, { message: 'Las contraseñas no coinciden', path: ['confirmPassword'] });

export async function resetPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = resetSchema.safeParse({ token: formData.get('token'), newPassword: formData.get('newPassword'), confirmPassword: formData.get('confirmPassword') });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  const { createHash } = await import('node:crypto');
  const tokenHash = createHash('sha256').update(parsed.data.token).digest('hex');
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash }, include: { user: true } });
  if (!record || record.usedAt || record.expiresAt < new Date()) return { error: 'El enlace es inválido o ya venció. Pedí uno nuevo.' };
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash: await hashPassword(parsed.data.newPassword) } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.session.deleteMany({ where: { userId: record.userId } }),
  ]);
  return { ok: 'Contraseña restablecida. Ya podés iniciar sesión.' };
}
