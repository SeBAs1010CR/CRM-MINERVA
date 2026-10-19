/**
 * Pantalla de carga instantánea para las rutas del panel. Next.js la muestra
 * en cuanto se navega a otra página, así no se ve el cambio brusco entre
 * pantallas mientras el servidor prepara el contenido.
 */
export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-4"
    >
      <span
        aria-hidden="true"
        className="h-10 w-10 animate-spin rounded-full border-4 border-minerva-border border-t-minerva-red"
      />
      <p className="text-sm font-medium text-minerva-muted">Cargando…</p>
      <span className="sr-only">Cargando contenido</span>
    </div>
  );
}
