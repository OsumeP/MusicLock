import { describe, expect, it } from 'vitest'

import { checkPassword } from './password'

describe('checkPassword', () => {
  it('acepta una frase larga y variada como muy fuerte', () => {
    const result = checkPassword('Mi gato toca el Piano 2026!')
    expect(result.acceptable).toBe(true)
    expect(result.score).toBe(4)
  })

  it('rechaza contraseñas cortas', () => {
    const result = checkPassword('Corta1!')
    expect(result.acceptable).toBe(false)
    expect(result.problems[0]).toMatch(/12 caracteres/)
  })

  it('rechaza contraseñas comunes aunque tengan 12 caracteres', () => {
    expect(checkPassword('Password1234').acceptable).toBe(false)
    expect(checkPassword('aaaaaaaaaaaaaaaa').acceptable).toBe(false)
  })

  it('rechaza contraseñas que contienen el usuario o el correo', () => {
    expect(checkPassword('audiophile-secreto-99', { username: 'audiophile' }).acceptable).toBe(false)
    expect(checkPassword('juanito-es-genial-1', { email: 'juanito@unal.edu.co' }).acceptable).toBe(false)
  })

  it('el puntaje sube con la longitud y la variedad', () => {
    const scores = ['solominusculas', 'MinusMayus1234', 'Mezcla de Todo 2026!!'].map((p) => checkPassword(p).score)
    expect(scores[0]).toBeLessThan(scores[1])
    expect(scores[1]).toBeLessThan(scores[2])
  })
})
