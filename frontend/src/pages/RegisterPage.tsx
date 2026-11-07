import { useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router'

import { ApiError } from '../api/client'
import { authErrorMessage } from '../auth/errors'
import { checkPassword } from '../auth/password'
import { useAuth } from '../auth/session'
import { AuthLayout } from '../components/AuthLayout'
import { StrengthMeter } from '../components/StrengthMeter'
import { Alert, PasswordField, SubmitButton, TextField } from '../components/ui'

export function RegisterPage() {
  const { session, register } = useAuth()

  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const strength = useMemo(() => checkPassword(password, { email, username }), [password, email, username])

  if (session.status === 'ready') return <Navigate to="/inicio" replace />

  const passwordError = submitted && !strength.acceptable ? strength.problems[0] : undefined
  const confirmationError = submitted && confirmation !== password ? 'Las contraseñas no coinciden.' : undefined
  const canSubmit = strength.acceptable && confirmation === password && acknowledged && !!email && !!username

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    setFieldErrors({})
    try {
      await register(email.trim(), username.trim(), password)
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length > 0) {
        setFieldErrors(Object.fromEntries(Object.entries(err.fieldErrors).map(([k, v]) => [k, v[0]])))
      }
      setError(authErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Crear cuenta"
      subtitle="Tu bóveda se cifra en este navegador antes de salir de él"
      footer={
        <>
          ¿Ya tienes una cuenta?{' '}
          <Link to="/login" className="font-semibold text-primary-light hover:text-on-surface">
            Iniciar sesión
          </Link>
        </>
      }
    >
      {error && <Alert tone="error">{error}</Alert>}

      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <TextField
          label="Correo electrónico"
          icon="mail"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@correo.com"
          error={fieldErrors.email}
        />
        <TextField
          label="Nombre de usuario"
          icon="person"
          autoComplete="username"
          required
          maxLength={150}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="audiophile"
          error={fieldErrors.username}
        />
        <PasswordField
          label="Contraseña"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mínimo 12 caracteres"
          error={passwordError}
          hint={<StrengthMeter score={strength.score} visible={password.length > 0} />}
        />
        <PasswordField
          label="Confirmar contraseña"
          autoComplete="new-password"
          required
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          error={confirmationError}
        />

        <Alert tone="warning">
          <strong className="font-semibold">Sin recuperación de contraseña.</strong> Tu contraseña es la única llave de tu
          bóveda: ni MusicLock ni sus administradores pueden recuperarla. Si la olvidas, tus archivos serán irrecuperables.
        </Alert>
        <label className="flex items-start gap-2 text-body-md text-on-surface">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 size-4 accent-primary"
          />
          Entiendo que si olvido mi contraseña perderé el acceso a mis archivos.
        </label>
        {submitted && !acknowledged && (
          <p className="-mt-2 text-body-sm text-security-danger">Debes aceptar para continuar.</p>
        )}

        <SubmitButton icon="enhanced_encryption" busy={busy} busyLabel="Generando claves…">
          Crear cuenta cifrada
        </SubmitButton>
      </form>
    </AuthLayout>
  )
}
