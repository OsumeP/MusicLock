import { useId, useState } from 'react'

import type { DailyPlays } from '../api/stats'

const weekday = new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric' })
const longDate = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })

/** "2026-11-06" como fecha local (sin desplazamiento por zona horaria). */
function parseDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const plural = (n: number) => `${n} ${n === 1 ? 'reproducción' : 'reproducciones'}`

/**
 * Reproducciones por día (una sola serie → sin leyenda; el título de la tarjeta la
 * nombra). Columnas finas (≤ 24 px) de un solo tono que crecen desde la línea base,
 * extremo redondeado de 4 px y 2 px de aire entre columnas. Toda la franja de cada
 * día es el área de hover/foco y muestra su tooltip; el valor máximo lleva etiqueta
 * directa. "Ver como tabla" da los mismos datos sin depender del gráfico.
 */
export function DailyPlaysChart({ daily }: { daily: DailyPlays[] }) {
  const tableId = useId()
  const [active, setActive] = useState<number | null>(null)
  const [asTable, setAsTable] = useState(false)
  const max = Math.max(0, ...daily.map((d) => d.plays))
  const maxIndex = max > 0 ? daily.map((d) => d.plays).lastIndexOf(max) : -1
  const dense = daily.length > 7
  const showLabel = (i: number) => !dense || i === daily.length - 1 || (daily.length - 1 - i) % 7 === 0

  return (
    <div className="flex flex-col gap-3">
      {asTable ? (
        <table id={tableId} className="w-full text-left text-body-sm">
          <caption className="sr-only">Reproducciones por día</caption>
          <thead>
            <tr className="font-mono text-mono-label uppercase tracking-wider text-on-surface-variant">
              <th scope="col" className="py-1 font-medium">Día</th>
              <th scope="col" className="py-1 text-right font-medium">Reproducciones</th>
            </tr>
          </thead>
          <tbody>
            {daily.map((d) => (
              <tr key={d.date} className="border-t border-border-subtle/60">
                <td className="py-1 text-on-surface first-letter:uppercase">{longDate.format(parseDay(d.date))}</td>
                <td className="py-1 text-right font-mono text-on-surface">{d.plays}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative">
          {/* Solo línea base (recesiva); el máximo lleva etiqueta directa sobre su columna. */}
          <div className="relative h-40 border-b border-border-subtle">
            <ol className="absolute inset-x-0 bottom-0 top-5 flex items-end" aria-label="Reproducciones por día">
              {daily.map((d, i) => {
                const label = `${longDate.format(parseDay(d.date))}: ${plural(d.plays)}`
                return (
                  <li
                    key={d.date}
                    tabIndex={0}
                    aria-label={label}
                    onPointerEnter={() => setActive(i)}
                    onPointerLeave={() => setActive((current) => (current === i ? null : current))}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive((current) => (current === i ? null : current))}
                    className="relative flex h-full flex-1 cursor-default items-end justify-center px-px outline-none focus-visible:bg-surface-container-high/50"
                  >
                    {d.plays > 0 && (
                      <span
                        aria-hidden
                        className={`block w-full max-w-6 rounded-t-[4px] bg-accent-cyan transition-opacity ${active !== null && active !== i ? 'opacity-50' : ''}`}
                        style={{ height: `${(d.plays / max) * 100}%` }}
                      />
                    )}
                    {active === i && (
                      // Tooltip anclado encima de la columna (por dentro de los bordes del gráfico).
                      <div
                        role="status"
                        className={`pointer-events-none absolute z-10 whitespace-nowrap rounded-lg bg-surface-raised px-3 py-2 text-body-sm shadow-lg ring-1 ring-border-subtle ${
                          i < daily.length * 0.2 ? 'left-0' : i > daily.length * 0.8 ? 'right-0' : 'left-1/2 -translate-x-1/2'
                        }`}
                        style={{ bottom: `calc(${(d.plays / Math.max(max, 1)) * 100}% + 8px)` }}
                      >
                        <strong className="block text-title-sm text-on-surface">{plural(d.plays)}</strong>
                        <span className="block text-on-surface-variant first-letter:uppercase">{longDate.format(parseDay(d.date))}</span>
                      </div>
                    )}
                    {i === maxIndex && active === null && (
                      <span aria-hidden className="absolute font-mono text-[11px] font-semibold text-on-surface" style={{ bottom: `calc(${(d.plays / max) * 100}% + 2px)` }}>
                        {d.plays}
                      </span>
                    )}
                  </li>
                )
              })}
            </ol>
          </div>
          <div aria-hidden className="flex pt-1.5">
            {daily.map((d, i) => (
              <span key={d.date} className="flex-1 text-center font-mono text-[10px] text-on-surface-variant">
                {showLabel(i) ? (dense ? parseDay(d.date).getDate() : weekday.format(parseDay(d.date))) : ''}
              </span>
            ))}
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setAsTable((v) => !v)}
        aria-expanded={asTable}
        aria-controls={asTable ? tableId : undefined}
        className="self-end text-body-sm text-primary-light hover:text-on-surface"
      >
        {asTable ? 'Ver como gráfico' : 'Ver como tabla'}
      </button>
    </div>
  )
}
