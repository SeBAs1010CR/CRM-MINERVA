'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import {
  setUserPasswordAction,
  toggleUserActiveAction,
  updateUserAction,
  type ActionState,
} from '../actions.server';
import {
  DangerCheck,
  Field,
  FormMessage,
  SelectField,
  SubmitButton,
} from '@/components/form';

export type RoleOption = { id: string; name: string };

type User = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  roleId: string;
  isActive: boolean;
};

function EditDataForm({
  user,
  roles,
  isSelf,
}: {
  user: User;
  roles: RoleOption[];
  isSelf: boolean;
}) {
  const [state, action] = useActionState<ActionState, FormData>(updateUserAction, {});

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="id" value={user.id} />
      {/* Un select deshabilitado no se envía: sin este hidden el submit mandaría
          roleId = null y la action fallaría con "expected string, received null". */}
      {isSelf && <input type="hidden" name="roleId" value={user.roleId} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" name="firstName" defaultValue={user.firstName} />
        <Field label="Apellido" name="lastName" defaultValue={user.lastName} />
      </div>
      <Field label="Correo electrónico" name="email" type="email" defaultValue={user.email} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Teléfono"
          name="phone"
          type="tel"
          required={false}
          defaultValue={user.phone ?? ''}
        />
        <SelectField
          label="Rol"
          name="roleId"
          defaultValue={user.roleId}
          disabled={isSelf}
          hint={isSelf ? 'No podés cambiar tu propio rol.' : undefined}
          options={roles.map((r) => ({ value: r.id, label: r.name }))}
        />
      </div>

      <FormMessage state={state} />

      <div className="w-48">
        <SubmitButton pendingText="Guardando…">Guardar cambios</SubmitButton>
      </div>
    </form>
  );
}

function PasswordForm({ user }: { user: User }) {
  const [state, action] = useActionState<ActionState, FormData>(setUserPasswordAction, {});

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={user.id} />
      <Field
        label="Nueva contraseña"
        name="password"
        type="password"
        autoComplete="new-password"
        placeholder="Mínimo 10 caracteres"
        hint="Se cerrarán todas las sesiones abiertas de este usuario."
      />

      <FormMessage state={state} />

      <div className="w-52">
        <SubmitButton pendingText="Restableciendo…">Restablecer contraseña</SubmitButton>
      </div>
    </form>
  );
}

function ActiveToggleForm({ user, isSelf }: { user: User; isSelf: boolean }) {
  const [state, action] = useActionState<ActionState, FormData>(toggleUserActiveAction, {});
  const deactivating = user.isActive;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={user.id} />
      <input type="hidden" name="isActive" value={String(!deactivating)} />

      <FormMessage state={state} />

      {deactivating ? (
        <DangerCheck
          label="Desactivar esta cuenta"
          description="El usuario no podrá volver a iniciar sesión y se cerrarán sus sesiones abiertas. No borra su información histórica."
        />
      ) : (
        <p className="text-sm text-minerva-muted">
          Esta cuenta está inactiva. Al reactivarla, el usuario vuelve a poder iniciar sesión.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className={deactivating ? 'w-52' : 'w-40'}>
          <SubmitButton pendingText={deactivating ? 'Desactivando…' : 'Reactivando…'}>
            {deactivating ? 'Desactivar usuario' : 'Reactivar usuario'}
          </SubmitButton>
        </div>
        {isSelf && (
          <p className="text-xs text-minerva-muted">No podés desactivar tu propia cuenta.</p>
        )}
      </div>
    </form>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-minerva-border bg-minerva-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-minerva-black">{title}</h2>
      <p className="mt-1 mb-5 text-sm text-minerva-muted">{description}</p>
      {children}
    </section>
  );
}

export function UserDetail({
  user,
  roles,
  isSelf,
}: {
  user: User;
  roles: RoleOption[];
  isSelf: boolean;
}) {
  return (
    <div className="space-y-6">
      <Section title="Datos del usuario" description="Nombre, correo, teléfono y rol.">
        <EditDataForm user={user} roles={roles} isSelf={isSelf} />
      </Section>

      {!isSelf && (
        <Section
          title="Contraseña"
          description="Restablecé la contraseña si el usuario la olvidó o si sospechás que quedó comprometida."
        >
          <PasswordForm user={user} />
        </Section>
      )}

      {!isSelf && (
        <Section
          title="Estado de la cuenta"
          description="Desactivar bloquea el acceso sin perder el historial de lo que hizo."
        >
          <ActiveToggleForm user={user} isSelf={isSelf} />
        </Section>
      )}

      <div>
        <Link
          href="/usuarios"
          className="text-sm font-medium text-minerva-red hover:text-minerva-red-dark"
        >
          Volver al listado
        </Link>
      </div>
    </div>
  );
}