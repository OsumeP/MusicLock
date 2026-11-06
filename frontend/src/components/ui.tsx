/**
 * Componentes de formulario con el estilo de los mockups
 * (FrontEndMockups/musiclock_iniciar_sesi_n_derivaci_n_de_clave_maestra).
 */

import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react'

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string
  icon: string
  /** Contenido a la derecha de la etiqueta (p. ej. un enlace). */
  labelAside?: ReactNode
  error?: string
  hint?: ReactNode
}

const inputClass =
  'w-full rounded-lg bg-surface-container-lowest px-4 py-2.5 text-body-md text-on-surface shadow-inner outline-none ' +
  'ring-1 ring-border-subtle transition-colors placeholder:text-on-surface-variant/60 ' +
  'focus:bg-surface-raised focus:ring-primary-light aria-[invalid=true]:ring-security-danger'

function FieldShell({ id, label, icon, labelAside, error, hint, children }: Omit<FieldProps, 'type'> & { id: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        {/* El ícono va fuera del <label>: los Material Symbols son texto y ensuciarían el nombre accesible. */}
        <div className="flex items-center gap-1.5">
          <span aria-hidden className="material-symbols-outlined text-[16px] text-primary-light">{icon}</span>
          <label htmlFor={id} className="text-title-sm font-semibold text-on-surface">
            {label}
          </label>
        </div>
        {labelAside}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-body-sm text-security-danger">
          {error}
        </p>
      ) : (
        hint
      )}
    </div>
  )
}

export function TextField({ label, icon, labelAside, error, hint, ...input }: FieldProps) {
  const id = useId()
  return (
    <FieldShell id={id} label={label} icon={icon} labelAside={labelAside} error={error} hint={hint}>
      <input
        id={id}
        className={inputClass}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...input}
      />
    </FieldShell>
  )
}

export function PasswordField({ label, icon = 'lock', labelAside, error, hint, ...input }: Omit<FieldProps, 'icon'> & { icon?: string }) {
  const id = useId()
  const [visible, setVisible] = useState(false)
  return (
    <FieldShell id={id} label={label} icon={icon} labelAside={labelAside} error={error} hint={hint}>
      <div className="relative flex items-center">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          className={`${inputClass} pr-12 font-mono text-mono-crypto`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          {...input}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-3 text-on-surface-variant transition-colors hover:text-on-surface"
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        >
          <span aria-hidden className="material-symbols-outlined text-[20px]">{visible ? 'visibility_off' : 'visibility'}</span>
        </button>
      </div>
    </FieldShell>
  )
}

export function SubmitButton({ icon, busy, busyLabel, children, disabled }: { icon: string; busy: boolean; busyLabel: string; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-title-md font-semibold text-on-surface shadow-md transition-all hover:bg-primary-hover active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span aria-hidden className={`material-symbols-outlined text-[20px] ${busy ? 'animate-spin' : ''}`}>{busy ? 'progress_activity' : icon}</span>
      {busy ? busyLabel : children}
    </button>
  )
}

export function Alert({ tone, children }: { tone: 'error' | 'info' | 'warning'; children: ReactNode }) {
  const styles = {
    error: 'border-security-danger/40 bg-security-danger/10 text-security-danger',
    warning: 'border-security-warning/40 bg-security-warning/10 text-security-warning',
    info: 'border-border-blue bg-primary-container/40 text-primary-light',
  }[tone]
  const icon = { error: 'error', warning: 'warning', info: 'info' }[tone]
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex gap-2 rounded-lg border px-3 py-2.5 text-body-md ${styles}`}>
      <span aria-hidden className="material-symbols-outlined text-[18px]">{icon}</span>
      <div className="flex-1">{children}</div>
    </div>
  )
}
