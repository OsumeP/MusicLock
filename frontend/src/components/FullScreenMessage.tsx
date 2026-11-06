export function FullScreenMessage({ icon, message }: { icon: string; message: string }) {
  return (
    <main className="grid min-h-screen place-items-center px-4" role="status">
      <div className="flex flex-col items-center gap-3 text-on-surface-variant">
        <span aria-hidden className="material-symbols-outlined animate-pulse text-[40px] text-primary-light">{icon}</span>
        <p className="font-mono text-mono-crypto">{message}</p>
      </div>
    </main>
  )
}
