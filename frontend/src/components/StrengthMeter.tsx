/** Barra de fortaleza de la contraseña (puntuación de `checkPassword`). */
const STRENGTH = [
  { label: 'Muy débil', color: 'bg-security-danger' },
  { label: 'Débil', color: 'bg-security-danger' },
  { label: 'Aceptable', color: 'bg-security-warning' },
  { label: 'Fuerte', color: 'bg-accent-cyan' },
  { label: 'Muy fuerte', color: 'bg-accent-cyan' },
]

export function StrengthMeter({ score, visible }: { score: number; visible: boolean }) {
  if (!visible) return null
  return (
    <div className="flex items-center gap-3" aria-live="polite">
      <div className="flex flex-1 gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`h-1 flex-1 rounded-full ${i < score ? STRENGTH[score].color : 'bg-border-subtle'}`} />
        ))}
      </div>
      <span className="font-mono text-mono-label text-on-surface-variant">{STRENGTH[score].label}</span>
    </div>
  )
}
