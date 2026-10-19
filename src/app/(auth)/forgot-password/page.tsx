'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { forgotPasswordAction, type ActionState } from '../actions.server';
import { Field, FormMessage, SubmitButton } from '@/components/form';

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState<ActionState, FormData>(forgotPasswordAction, {});

  return (
    <form action={action} className="space-y-5">
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold text-minerva-black">Recuperar contraseña</h2>
        <p className="text-sm text-minerva-muted">
          Ingresá tu correo electrónico y te enviamos un enlace para restablecerla.
        </p>
      </div>

      <Field
        label="Correo electrónico"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="usuario@minervaconsultores.com"
      />

      <FormMessage state={state} />

      <SubmitButton>{pending ? 'Enviando…' : 'Enviar enlace'}</SubmitButton>

      <p className="text-center text-sm">
        <Link href="/login" className="font-medium text-minerva-red hover:text-minerva-red-dark">
          Volver a iniciar sesión
        </Link>
      </p>
    </form>
  );
}
