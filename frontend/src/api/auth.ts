/**
 * Endpoints de autenticación (PlanMVP §6). La API usa snake_case; aquí se
 * traduce a camelCase para el resto del frontend.
 */

import type { KdfParams, VaultRegistration } from '../crypto'
import { apiRequest } from './client'

export interface Plan {
  code: 'free' | 'premium'
  name: string
  maxStorageBytes: number
  maxFileSizeBytes: number
}

export interface User {
  id: number
  email: string
  username: string
  plan: Plan
  usedStorage: number
  storageAvailable: number
}

export interface SessionResponse {
  access: string
  refresh: string
  user: User
  wrappedMasterKey: string
  masterKeyIv: string
}

// --- Formato de la API ------------------------------------------------------------

interface UserDto {
  id: number
  email: string
  username: string
  plan: { code: Plan['code']; name: string; max_storage_bytes: number; max_file_size_bytes: number }
  used_storage: number
  storage_available: number
}

interface SessionDto {
  access: string
  refresh: string
  user: UserDto
  vault: { wrapped_master_key: string; master_key_iv: string }
}

function toUser(dto: UserDto): User {
  return {
    id: dto.id,
    email: dto.email,
    username: dto.username,
    plan: {
      code: dto.plan.code,
      name: dto.plan.name,
      maxStorageBytes: dto.plan.max_storage_bytes,
      maxFileSizeBytes: dto.plan.max_file_size_bytes,
    },
    usedStorage: dto.used_storage,
    storageAvailable: dto.storage_available,
  }
}

function toSession(dto: SessionDto): SessionResponse {
  return {
    access: dto.access,
    refresh: dto.refresh,
    user: toUser(dto.user),
    wrappedMasterKey: dto.vault.wrapped_master_key,
    masterKeyIv: dto.vault.master_key_iv,
  }
}

// --- Llamadas ---------------------------------------------------------------------

export async function prelogin(email: string): Promise<{ kdfSalt: string; kdfParams: KdfParams }> {
  const dto = await apiRequest<{ kdf_salt: string; kdf_params: KdfParams }>('/auth/prelogin', {
    json: { email },
    auth: false,
  })
  return { kdfSalt: dto.kdf_salt, kdfParams: dto.kdf_params }
}

export async function register(email: string, username: string, vault: VaultRegistration): Promise<SessionResponse> {
  const dto = await apiRequest<SessionDto>('/auth/register', {
    json: {
      email,
      username,
      auth_key: vault.authKey,
      kdf_salt: vault.kdfSalt,
      kdf_params: vault.kdfParams,
      wrapped_master_key: vault.wrappedMasterKey,
      master_key_iv: vault.masterKeyIv,
    },
    auth: false,
  })
  return toSession(dto)
}

export async function login(email: string, authKey: string): Promise<SessionResponse> {
  const dto = await apiRequest<SessionDto>('/auth/login', { json: { email, auth_key: authKey }, auth: false })
  return toSession(dto)
}

export function logout(refresh: string): Promise<void> {
  return apiRequest<void>('/auth/logout', { json: { refresh }, auth: false })
}

export async function fetchMe(signal?: AbortSignal): Promise<User> {
  return toUser(await apiRequest<UserDto>('/me', { signal }))
}

// --- Cambio de contraseña (día 14) --------------------------------------------------
// Ambas exigen el authKey actual; si no coincide responden 400 con code "invalid_password".

export interface KeyMaterial {
  kdfSalt: string
  kdfParams: KdfParams
  wrappedMasterKey: string
  masterKeyIv: string
}

/** Paso 1: Master Key envuelta (y su salt) a cambio del authKey de la contraseña actual. */
export async function fetchKeyMaterial(authKey: string): Promise<KeyMaterial> {
  const dto = await apiRequest<{ kdf_salt: string; kdf_params: KdfParams; wrapped_master_key: string; master_key_iv: string }>(
    '/me/vault',
    { json: { auth_key: authKey } },
  )
  return { kdfSalt: dto.kdf_salt, kdfParams: dto.kdf_params, wrappedMasterKey: dto.wrapped_master_key, masterKeyIv: dto.master_key_iv }
}

/** Paso 2: guarda el material de la nueva contraseña. Devuelve una sesión nueva; las demás se cierran. */
export async function changePassword(currentAuthKey: string, vault: VaultRegistration): Promise<SessionResponse> {
  const dto = await apiRequest<SessionDto>('/me/password', {
    json: {
      current_auth_key: currentAuthKey,
      new_auth_key: vault.authKey,
      kdf_salt: vault.kdfSalt,
      kdf_params: vault.kdfParams,
      wrapped_master_key: vault.wrappedMasterKey,
      master_key_iv: vault.masterKeyIv,
    },
  })
  return toSession(dto)
}
