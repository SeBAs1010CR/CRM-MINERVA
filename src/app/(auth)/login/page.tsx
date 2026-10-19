'use client';

import Link from 'next/link';
import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { loginAction, type ActionState } from '../actions.server';
import { FormMessage, SubmitButton, Field } from '@/components/form';

export default function LoginPage() {
  const router = useRouter();
  const [state, action, pending] = useActionState<ActionState, FormData>(loginAction, {});

  // Mostramos el mensaje de éxito un instante antes de entrar al panel.
  useEffect(() => {
    if (!state.ok) return;
    const t = setTimeout(() => router.push('/dashboard'), 900);
    return () => clearTimeout(t);
  }, [state.ok, router]);

  return (
    <form action={action} className="space-y-5">
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold text-minerva-black">Iniciar sesión</h2>
        <p className="text-sm text-minerva-muted">
          Ingresá con tu correo y contraseña para continuar.
        </p>
      </div>

      <div className="space-y-4">
        <Field
          label="Correo electrónico"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="usuario@minervaconsultores.com"
        />
        <Field
          label="Contraseña"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
        />
      </div>

      <div className="flex justify-end">
        <Link
          href="/forgot-password"
          className="text-sm font-medium text-minerva-red hover:text-minerva-red-dark"
        >
          ¿Olvidaste tu contraseña?
        </Link>
      </div>

      <FormMessage state={state} />

      <SubmitButton>{pending ? 'Ingresando…' : 'Ingresar'}</SubmitButton>

      <p className="text-center text-xs text-minerva-muted">
        Acceso restringido a usuarios autorizados de <strong className="text-minerva-black">Minerva</strong>.
      </p>
    </form>
  );
}
