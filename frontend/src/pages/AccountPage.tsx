import { useMemo, useState, type FormEvent } from 'react'

import { authErrorMessage } from '../auth/errors'
import { checkPassword } from '../auth/password'
import { useAuth } from '../auth/session'
import { StrengthMeter } from '../components/StrengthMeter'
import { Alert, PasswordField, SubmitButton } from '../components/ui'
import { formatBytes } from '../lib/format'

/**
 * "Mi cuenta": datos de la cuenta y cambio de contraseña (día 14).
 *
 * Cambiar la contraseña re-envuelve la Master Key con la nueva KEK en este
 * navegador; las canciones no se vuelven a cifrar y las demás sesiones se cierran.
 */
export function AccountPage() {
  const { session, changePassword } = useAuth()
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const user = session.status === 'ready' ? session.user : null
  const strength = useMemo(
    () => checkPassword(password, { email: user?.email, username: user?.username }),
    [password, user?.email, user?.username],
  )
  if (!user) return null

  const sameAsCurrent = password.length > 0 && password === current
  const passwordError = submitted
    ? !strength.acceptable
      ? strength.problems[0]
      : sameAsCurrent
        ? 'Debe ser distinta de la contraseña actual.'
        : undefined
    : undefined
  const confirmationError = submitted && confirmation !== password ? 'Las contraseñas no coinciden.' : undefined
  const currentError = submitted && !current ? 'Escribe tu contraseña actual.' : undefined
  const canSubmit = !!current && strength.acceptable && !sameAsCurrent && confirmation === password

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    setDone(false)
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      await changePassword(current, password)
      setCurrent('')
      setPassword('')
      setConfirmation('')
      setSubmitted(false)
      setDone(true)
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-headline-lg font-semibold">Mi cuenta</h1>
        <p className="text-body-md text-on-surface-variant">Tu perfil y la contraseña que protege tu bóveda.</p>
      </header>

      <section aria-labelledby="perfil" className="rounded-xl bg-surface-card p-6 ring-1 ring-border-subtle">
        <h2 id="perfil" className="mb-4 text-title-md font-semibold">Perfil</h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          {[
            ['Usuario', user.username],
            ['Correo', user.email],
            ['Plan', `${user.plan.name} · ${formatBytes(user.plan.maxStorageBytes)} · hasta ${formatBytes(user.plan.maxFileSizeBytes)} por archivo`],
            ['Almacenamiento usado', `${formatBytes(user.usedStorage)} de ${formatBytes(user.plan.maxStorageBytes)}`],
          ].map(([term, value]) => (
            <div key={term} className="flex min-w-0 flex-col gap-0.5">
              <dt className="font-mono text-mono-label uppercase tracking-wider text-on-surface-variant">{term}</dt>
              <dd className="break-words text-body-md text-on-surface">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="cambiar-contrasena" className="flex flex-col gap-4 rounded-xl bg-surface-card p-6 ring-1 ring-border-subtle">
        <div className="flex flex-col gap-1">
          <h2 id="cambiar-contrasena" className="text-title-md font-semibold">Cambiar contraseña</h2>
          <p className="text-body-md text-on-surface-variant">
            Tu Master Key se vuelve a envolver con la nueva contraseña en este navegador: tus canciones no se vuelven a cifrar ni
            a subir. Se cerrará la sesión en tus otros dispositivos.
          </p>
        </div>

        {done && <Alert tone="info">Contraseña cambiada. Usa la nueva para iniciar sesión; las demás sesiones se cerraron.</Alert>}
        {error && <Alert tone="error">{error}</Alert>}

        <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
          <PasswordField
            label="Contraseña actual"
            icon="key"
            autoComplete="current-password"
            required
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            error={currentError}
          />
          <PasswordField
            label="Nueva contraseña"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 12 caracteres"
            error={passwordError}
            hint={<StrengthMeter score={strength.score} visible={password.length > 0} />}
          />
          <PasswordField
            label="Confirmar nueva contraseña"
            autoComplete="new-password"
            required
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            error={confirmationError}
          />
          <Alert tone="warning">
            <strong className="font-semibold">Sin recuperación de contraseña.</strong> Si olvidas la nueva contraseña, tus archivos
            serán irrecuperables.
          </Alert>
          <SubmitButton icon="key" busy={busy} busyLabel="Re-envolviendo la Master Key…">
            Cambiar contraseña
          </SubmitButton>
        </form>
      </section>
    </div>
  )
}
