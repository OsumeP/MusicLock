/**
 * Persistencia de la Master Key en IndexedDB (decisión D4, PlanMVP §4.4).
 *
 * IndexedDB puede guardar objetos `CryptoKey` tal cual (structured clone). Como
 * la Master Key de sesión es NO extraíble, lo que se guarda es una referencia que
 * el navegador sabe usar, pero sus bytes no se pueden leer desde JavaScript.
 *
 * - Se guarda junto al id del usuario: si en el mismo navegador entra otra
 *   cuenta, la clave guardada no se usa.
 * - Se borra en el logout y cuando la sesión expira.
 * - Si IndexedDB no está disponible (modo privado estricto, políticas), todo
 *   sigue funcionando: simplemente se pide la contraseña al recargar.
 */

const DB_NAME = 'musiclock'
const DB_VERSION = 1
const STORE = 'keys'
const MASTER_KEY_ID = 'master-key'

interface StoredMasterKey {
  userId: number
  key: CryptoKey
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB no disponible'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const request = run(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(request.result)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

export async function saveMasterKey(userId: number, key: CryptoKey): Promise<void> {
  if (key.extractable) {
    // Defensa en profundidad: nunca persistir una clave cuyos bytes se puedan exportar.
    throw new Error('Solo se puede persistir una Master Key no extraíble')
  }
  try {
    await withStore('readwrite', (store) => store.put({ userId, key } satisfies StoredMasterKey, MASTER_KEY_ID))
  } catch {
    // Sin IndexedDB la sesión sigue funcionando; solo se pedirá la contraseña al recargar.
  }
}

/** Devuelve la Master Key guardada para este usuario, o null. */
export async function loadMasterKey(userId: number): Promise<CryptoKey | null> {
  try {
    const stored = (await withStore('readonly', (store) => store.get(MASTER_KEY_ID))) as StoredMasterKey | undefined
    if (!stored || stored.userId !== userId || !(stored.key instanceof CryptoKey)) return null
    return stored.key
  } catch {
    return null
  }
}

export async function clearMasterKey(): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.delete(MASTER_KEY_ID))
  } catch {
    // nada que borrar
  }
}
