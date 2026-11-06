import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router'

import { authErrorMessage } from '../auth/errors'
import { useAuth } from '../auth/session'
import { AuthLayout } from '../components/AuthLayout'
import { Alert, PasswordField, SubmitButton, TextField } from '../components/ui'

interface LocationState {
  from?: string
  locked?: boolean
  email?: string
}

export function LoginPage() {
  const { session, login, logout } = useAuth()
  const state = (useLocation().state ?? {}) as LocationState
  const locked = session.status === 'locked'

  const [email, setEmail] = useState(state.email ?? (locked ? session.user.email : ''))
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (session.status === 'ready') {
    return <Navigate to={state.from ?? '/'} replace />
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(email.trim(), password)
    } catch (err) {
      setError(authErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Iniciar sesión"
      subtitle="Accede a tu bóveda cifrada de audio"
      footer={
        locked ? (
          <button type="button" onClick={() => void logout()} className="font-semibold text-primary-light hover:text-on-surface">
            ¿No eres tú? Usar otra cuenta
          </button>
        ) : (
          <>
            ¿No tienes una cuenta?{' '}
            <Link to="/registro" className="font-semibold text-primary-light hover:text-on-surface">
              Crear cuenta
            </Link>
          </>
        )
      }
    >
      {locked && (
        <Alert tone="info">Tu bóveda está bloqueada en este navegador. Ingresa tu contraseña para descifrarla de nuevo.</Alert>
      )}
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
          readOnly={locked}
        />
        <PasswordField
          label="Contraseña"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Introduce tu contraseña…"
          autoFocus={locked}
          hint={
            <p className="text-body-sm text-on-surface-variant">
              Tu contraseña nunca sale de este dispositivo: con ella se deriva la clave que abre tu bóveda.
            </p>
          }
        />
        <SubmitButton icon="login" busy={busy} busyLabel="Derivando clave maestra…" disabled={!email || !password}>
          {locked ? 'Desbloquear bóveda' : 'Iniciar sesión'}
        </SubmitButton>
      </form>
    </AuthLayout>
  )
}
