// @vitest-environment node
import 'fake-indexeddb/auto'

import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'

import { clearMasterKey, loadMasterKey, saveMasterKey } from './keyStore'

async function nonExtractableKey() {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey'])
}

describe('keyStore (IndexedDB)', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory()
  })

  it('guarda y recupera la Master Key como CryptoKey utilizable y no extraíble', async () => {
    const key = await nonExtractableKey()
    await saveMasterKey(7, key)

    const loaded = await loadMasterKey(7)

    expect(loaded).toBeInstanceOf(CryptoKey)
    expect(loaded!.extractable).toBe(false)
    expect(loaded!.usages.sort()).toEqual(['unwrapKey', 'wrapKey'])
    await expect(crypto.subtle.exportKey('raw', loaded!)).rejects.toThrow()
  })

  it('no entrega la clave guardada a otro usuario del mismo navegador', async () => {
    await saveMasterKey(7, await nonExtractableKey())
    expect(await loadMasterKey(8)).toBeNull()
  })

  it('clearMasterKey la elimina', async () => {
    await saveMasterKey(7, await nonExtractableKey())
    await clearMasterKey()
    expect(await loadMasterKey(7)).toBeNull()
  })

  it('se niega a persistir una clave extraíble', async () => {
    const extractable = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['wrapKey'])
    await expect(saveMasterKey(7, extractable)).rejects.toThrow(/no extraíble/)
  })

  it('sin IndexedDB no falla: simplemente no hay clave guardada', async () => {
    // @ts-expect-error simulamos un navegador sin IndexedDB
    delete globalThis.indexedDB
    await expect(saveMasterKey(7, await nonExtractableKey())).resolves.toBeUndefined()
    await expect(loadMasterKey(7)).resolves.toBeNull()
    await expect(clearMasterKey()).resolves.toBeUndefined()
  })
})
