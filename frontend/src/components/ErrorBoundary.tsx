import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Última red de seguridad: si un error inesperado rompe el render, se muestra
 * un mensaje amable en lugar de una pantalla en blanco. Recargar es seguro: la
 * Master Key sigue en IndexedDB y nada se pierde en el servidor.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Error no controlado en la interfaz', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="grid min-h-screen place-items-center bg-surface-base px-4" role="alert">
        <div className="flex max-w-md flex-col items-center gap-4 text-center">
          <span aria-hidden className="material-symbols-outlined text-[56px] text-security-warning">error</span>
          <h1 className="font-display text-headline-md font-semibold">Algo salió mal</h1>
          <p className="text-body-md text-on-surface-variant">
            Ocurrió un error inesperado en la aplicación. Tus archivos están a salvo: recarga la página para continuar.
          </p>
          <button type="button" onClick={() => window.location.reload()} className="rounded-lg bg-primary px-5 py-2.5 text-title-sm font-semibold hover:bg-primary-hover">
            Recargar
          </button>
        </div>
      </main>
    )
  }
}
