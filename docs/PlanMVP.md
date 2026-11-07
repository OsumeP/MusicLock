# Plan de Desarrollo — MVP de MusicLock

> **Objetivo del MVP:** demostrar, de punta a punta, que un usuario puede **subir un MP3 que se cifra en su navegador, almacenarlo en un servidor que no puede leerlo, y reproducirlo/descargarlo descifrándolo solo en su navegador, desde cualquier dispositivo**.
>
> Todo lo que no sea necesario para esa frase queda fuera del MVP (pasa al backlog).
>
> **Plazo:** 2 semanas (10 días hábiles) para presentar la versión al resto del equipo.

---

## 1. Alcance

### 1.1 Dentro del MVP

| # | Funcionalidad | Requerimientos que cubre |
|---|---|---|
| 1 | Registro (email, username, contraseña) | Cuentas FR-01, NFR Seg-01 |
| 2 | Login con JWT + refresh token + logout (blacklist) | Cuentas FR-02, FR-03, FR-04, NFR Seg-05 |
| 3 | Generación de **clave maestra** en el navegador, protegida con una clave derivada de la contraseña y guardada (envuelta) en el servidor | NFR Seg-02, Seg-04, Portabilidad-01 |
| 4 | **Cifrado AES-GCM en el navegador** y subida solo del archivo cifrado | Audio FR-01, FR-03, FR-04, NFR Seg-03 |
| 5 | Listado de "Mis archivos", edición de título/artista y eliminación | Interfaz FR-01 (parcial) |
| 6 | **Reproductor web**: descarga del cifrado → descifrado en memoria → reproducción | Audio FR-02, Accesos FR-14, NFR Tiempo-03 |
| 7 | Descarga del MP3 original (descifrado en memoria) | Audio FR-05 |
| 8 | Plan Free por defecto: cuota 500 MB, máx. 20 MB por archivo, solo MP3, validación antes de subir | Premium FR-01 (solo Free), FR-02, FR-05, BR-07..BR-11 |
| 9 | Indicador de almacenamiento usado / disponible | Interfaz FR-06 |
| 10 | Control de acceso: un usuario solo puede ver/descargar sus propios archivos | Privacidad NFR-01 |
| 11 | Usuarios bloqueados no pueden iniciar sesión ni usar la API | BR-06 |
| 12 | Landing page mínima + pantallas de login/registro | Actor "Usuario no registrado" |
| 13 | Todo levanta con `docker compose up` (frontend, backend, PostgreSQL, MinIO) | NFR Disponibilidad-02 |

### 1.2 "MVP+" (solo si sobra tiempo, en este orden)

1. **Favoritos** (tabla `favorite`, toggle de corazón) → Interfaz FR-02, Accesos FR-13.
2. **Reproducido recientemente** (insertar en `listening_history` al reproducir) → Interfaz FR-05, Estadísticas FR-01, FR-06.
3. **Playlists privadas básicas** → Accesos FR-08..FR-12.

### 1.3 Fuera del MVP (backlog)

Compartir con otros usuarios (intercambio de claves asimétricas, BR-21), contenido público + ACRCloud, comentarios (Composite), seguidores y notificaciones (Observer), álbumes y artistas, estadísticas y tendencias, upgrade/downgrade Premium y estado "Frozen", panel de administrador (salvo el admin de Django para bloquear usuarios), desencriptación programada, recuperación con seed phrase (BR-05), migración a Argon2id, cifrado por bloques para archivos > 20 MB, iteradores shuffle/loop.

> Las secciones de los mockups que no se implementan (Favoritos, Playlists, Compartido, Recientes, Tendencias, Admin) quedan visibles en el menú como **"Próximamente"**, para mostrar la visión completa sin implementarla.

---

## 2. Decisiones de diseño tomadas

Resumen de las decisiones que resuelven los problemas detectados en la documentación. El detalle está en las secciones siguientes.

| # | Problema detectado | Decisión |
|---|---|---|
| D1 | Si el login envía la contraseña a Django, el servidor podría derivar la clave de cifrado (se rompe el Zero-Knowledge). | El navegador deriva **dos secretos** de la contraseña: `authKey` (se envía al servidor) y `KEK` (nunca sale del navegador). Ver §4.1. |
| D2 | Web Crypto no soporta Argon2id; la documentación mezcla Argon2id y PBKDF2. | **PBKDF2-SHA256, 600 000 iteraciones** (nativo de Web Crypto). Los parámetros (`kdf_params`) se guardan por usuario para migrar a Argon2id sin romper cuentas existentes. Lo permite NFR Seg-04. |
| D3 | Cifrar todo con la clave maestra dificulta cambiar la contraseña y compartir. | **Una clave aleatoria por archivo** (File Key), envuelta con la clave maestra. Ver §4.2. |
| D4 | La clave maestra en memoria se pierde al recargar la página. | Se guarda como `CryptoKey` **no extraíble** en IndexedDB y se borra en el logout. Si falta pero la sesión sigue activa → pantalla **"Desbloquear bóveda"** que pide la contraseña. Ver §4.4. |
| D5 | Al modelo relacional le faltan los límites por plan y el material criptográfico. | Nuevos campos en `user`, `plan` y `song`. Ver §5. |
| D6 | Los mockups muestran WAV/FLAC/AIFF/stems, pero BR-11 dice solo MP3. | Solo MP3 (validación en cliente y servidor). Al portar los mockups a React se ajustan los textos ("Stems", "FLAC 24-bit", etc.). |
| D7 | El CI esperaba `manage.py` y `requirements.txt` en la raíz. | **Ya aplicado:** `.github/workflows/testsTask.yml` ahora tiene un job `backend` (`working-directory: backend`, servicio PostgreSQL) y un job `frontend` (`npm ci`, tests, build). |
| D8 | Olvidar la contraseña = archivos irrecuperables. | MVP sin recuperación; **advertencia explícita y casilla de confirmación** en el registro. Seed phrase en el backlog. |
| D9 | Almacenamiento de blobs. | **MinIO** detrás de un puerto `BlobStorage`; un adaptador local alternativo para desarrollo y tests. Ver §3.2. Imagen: fork comunitario `pgsty/minio`, porque las oficiales ya no se publican (ver `desarrollo/dia-01.md`). |
| D10 | ¿Cifrar metadatos? | **Título y artista NO se cifran** (decisión del equipo). Sí se cifra el contenido de audio. El nombre del objeto en MinIO es un UUID, no el título. |

---

## 3. Arquitectura del MVP

```
┌──────────────────────────── Navegador ────────────────────────────┐
│ React + TS (Vite)                                                  │
│  ├─ crypto/  ← Web Crypto API: PBKDF2, HKDF, AES-GCM, wrap/unwrap  │
│  ├─ api/     ← cliente HTTP con JWT + refresh automático           │
│  └─ pages/   ← Landing, Login, Registro, Desbloquear, Mis Archivos │
└──────────── solo viajan: ciphertext + claves ENVUELTAS ───────────┘
                               │ HTTP(S) / JSON + multipart
┌──────────────────────────── Servidor ─────────────────────────────┐
│ Django + DRF + simplejwt                                           │
│  ├─ accounts/  (User, Plan, auth, material de claves)              │
│  └─ vault/     (Song, casos de uso: subir/listar/descargar/borrar) │
│        └─ BlobStorage (puerto) ─┬─ MinIOBlobStorage  (por defecto) │
│                                 └─ LocalBlobStorage  (dev / tests) │
└──────── PostgreSQL (metadatos) ──────── MinIO (blobs cifrados) ───┘
```

### 3.1 Patrones

Para el MVP se usa una versión **pragmática** de la arquitectura documentada:

- **Hexagonal:** apps de Django con `services.py` (casos de uso: `upload_song`, `delete_song`, …) separados de las vistas DRF (adaptadores de entrada). Un único puerto de salida real: `BlobStorage`. `CopyrightCheckerPort` se añade cuando llegue ACRCloud.
- **Proxy:** el endpoint de descarga actúa como proxy de acceso: valida autenticación, propiedad y estado de la cuenta antes de entregar el blob.
- El resto de patrones (Observer, Composite, Iterator, Event Bus) se incorpora junto con sus funcionalidades del backlog.

### 3.2 Almacenamiento: MinIO con migración trivial

```python
# vault/storage.py
class BlobStorage(Protocol):
    def put(self, key: str, data: IO[bytes], size: int) -> None: ...
    def open(self, key: str) -> IO[bytes]: ...
    def delete(self, key: str) -> None: ...
```

- `MinIOBlobStorage`: usa `boto3` (API S3) con `endpoint_url` apuntando a MinIO. Es el adaptador **por defecto** en `docker compose`.
- `LocalBlobStorage`: guarda en una carpeta; se usa en los tests y en CI.
- Se elige con la variable de entorno `STORAGE_BACKEND=minio|local`. El dominio y las vistas nunca importan `boto3`.
- Clave del objeto: `users/{user_id}/songs/{song_uuid}.bin` (sin títulos ni nombres originales).
- En el MVP la descarga **pasa por Django** (streaming), para que ambos adaptadores se comporten igual y el control de acceso esté en un solo lugar. Las URLs prefirmadas de MinIO son una optimización posterior.
- El bucket se crea automáticamente al arrancar (servicio `minio-init` con `mc mb --ignore-existing`).

### 3.3 Estructura del repositorio

```
MusicLock/
├─ backend/                 # Django
│  ├─ manage.py
│  ├─ requirements.txt
│  ├─ config/               # settings, urls
│  ├─ accounts/
│  └─ vault/
├─ frontend/                # Vite + React + TS + Tailwind
│  └─ src/{crypto,api,pages,components,player}
├─ docker-compose.yml       # web, api, db, minio, minio-init
├─ .env.example
├─ docs/
└─ FrontEndMockups/
```

---

## 4. Diseño criptográfico

### 4.1 Derivación de claves (D1 + D2)

```
password ──PBKDF2-SHA256(salt, 600k)──► 256 bits ──HKDF-SHA256──┬─ info="auth" ─► authKey → se envía a Django
                                                                └─ info="kek"  ─► KEK     → nunca sale del navegador
```

- `salt`: 16 bytes aleatorios por usuario, generados en el registro.
- Django recibe `authKey` (en base64) en el campo "password" y lo hashea de nuevo con su hasher normal → nunca ve la contraseña real y aun así no guarda nada en texto plano (NFR Seg-01).
- Antes del login el cliente necesita el `salt`: `POST /api/auth/prelogin {email}` → `{salt, kdf_params}`. Para no revelar qué correos existen, si el correo no existe se devuelve un salt **determinista falso** (HMAC del email con una clave del servidor).
- `kdf_params` = `{"alg": "PBKDF2-SHA256", "iterations": 600000}`; permite cambiar el algoritmo más adelante. El cliente rechaza parámetros más débiles que estos.
- La contraseña se normaliza con NFKC antes de derivar, y cada cifrado AES-GCM lleva una etiqueta de contexto autenticada (AAD). Implementación y detalles en `desarrollo/dia-03.md`.

### 4.2 Jerarquía de claves (D3)

```
KEK (derivada)        ── envuelve (AES-GCM) ──►  Master Key  (AES-256 aleatoria, una por usuario)
Master Key            ── envuelve (AES-GCM) ──►  File Key    (AES-256 aleatoria, una por canción)
File Key              ── cifra    (AES-GCM) ──►  MP3
```

- Cada operación AES-GCM usa un **IV aleatorio de 12 bytes nuevo**; nunca se reutiliza un IV con la misma clave.
- Cambiar la contraseña = re-envolver solo la Master Key.
- Compartir (backlog) = envolver la File Key con la clave pública del destinatario, sin exponer la Master Key (BR-21).

### 4.3 Flujos

**Registro**
1. El cliente genera el `salt`, deriva `authKey` y `KEK`.
2. Genera la `MasterKey` y la envuelve con `KEK`.
3. Envía `{email, username, authKey, salt, kdf_params, wrapped_master_key, master_key_iv}`.

**Login (desde cualquier dispositivo)**
1. `prelogin` → `salt`, `kdf_params`.
2. Deriva `authKey` / `KEK`.
3. `POST /login` → JWT + `wrapped_master_key` + `master_key_iv`.
4. Desenvuelve la Master Key **como `CryptoKey` no extraíble** y la guarda (§4.4).

**Subida**
1. Validar en el cliente: MP3 (tipo y cabecera), tamaño ≤ límite del plan, espacio disponible.
2. Leer la duración con un `<audio>` temporal.
3. Generar File Key + IV, cifrar el archivo, envolver la File Key con la Master Key.
4. `POST /api/songs` multipart `{blob, title, artist, duration, original_size, file_iv, wrapped_file_key, wrapped_key_iv}`.
5. El servidor **revalida** tamaño y cuota, guarda en MinIO y actualiza `used_storage` en la misma transacción.

**Reproducción / descarga**
`GET /api/songs/{id}/blob` → desenvolver la File Key → descifrar en memoria → `Blob` (`audio/mpeg`) → `URL.createObjectURL` → `<audio>` o enlace de descarga. Se revoca la URL al cambiar de canción.

### 4.4 Persistencia de la sesión criptográfica (D4)

- La Master Key se importa con `extractable: false` y se guarda en IndexedDB (las `CryptoKey` se pueden guardar ahí sin exponer sus bytes).
- **Logout:** se borra de IndexedDB y se invalida el refresh token.
- **Recarga con sesión activa pero sin clave** (otra pestaña cerró sesión, datos borrados, etc.): se muestra "Desbloquear bóveda", que pide solo la contraseña y repite los pasos 1–4 del login.

### 4.5 Limitaciones conocidas (documentadas para la presentación)

- Título, artista, duración y tamaño son visibles para el servidor (decisión D10).
- Archivos de hasta 20 MB se cifran en un solo bloque en memoria; para los 100 MB de Premium hará falta cifrado por bloques.
- Sin recuperación de contraseña (D8).

---

## 5. Modelo de datos (D5)

**`plan`** — `plan_id`, **`code`** (`free`/`premium`), `name`, `monthly_price`, **`max_storage_bytes`**, **`max_file_size_bytes`**. Datos semilla (migración): Free = 500 MB / 20 MB, Premium = 5 GB / 100 MB.

**`user`** (extiende `AbstractUser`) — `username`, `email` (único), `password` (hash de `authKey`), `active_plan` (FK, por defecto Free), `used_storage` (`BigInteger`), **`kdf_salt`**, **`kdf_params`** (JSON), **`wrapped_master_key`**, **`master_key_iv`**, `is_active` (para bloquear usuarios, BR-06), `public_key` (nullable, para compartir en el futuro).

**`song`** — `song_id`, **`uuid`** (nombre del objeto en MinIO), `owner` (FK), `title`, **`artist`**, `duration`, `size` (`BigInteger`, bytes del cifrado), **`storage_key`**, **`file_iv`**, **`wrapped_file_key`**, **`wrapped_key_iv`**, `creation_date`. Se crean pero no se usan aún: `is_public` (default `False`, BR-19), `copyright`. La FK `album` se añadirá junto con el modelo `Album` (backlog; ver decisión I14 en `desarrollo/README.md`).

> `artist` se añade como texto libre en `song`: la tabla de álbumes/artistas es del backlog, pero el mockup "Mis Archivos" ya muestra la columna Artista.

Tablas `favorite`, `listening_history`, `playlist` y `playlist_song` se crean solo si entra el "MVP+".

---

## 6. API REST del MVP

| Método | Endpoint | Descripción |
|---|---|---|
| POST | `/api/auth/prelogin` | `salt` y `kdf_params` del email (falsos y deterministas si no existe) |
| POST | `/api/auth/register` | Crea el usuario + material de claves |
| POST | `/api/auth/login` | JWT (access + refresh) + Master Key envuelta |
| POST | `/api/auth/refresh` | Renueva el access token (rotación + blacklist) |
| POST | `/api/auth/logout` | Blacklist del refresh token |
| GET | `/api/me` | Perfil, plan, almacenamiento usado/disponible, límites |
| GET | `/api/songs` | Canciones del usuario (paginadas, búsqueda por título/artista) |
| POST | `/api/songs` | Subida multipart del cifrado + metadatos |
| GET | `/api/songs/{id}/blob` | Descarga del cifrado (solo el propietario; si no lo es → 404) |
| PATCH | `/api/songs/{id}` | Editar título / artista |
| DELETE | `/api/songs/{id}` | Elimina el blob y libera la cuota |
| PUT / DELETE | `/api/songs/{id}/favorite` | MVP+ (día 11): marcar / desmarcar favorita (idempotente). `GET /api/songs?favorites=1` lista solo favoritas |
| POST | `/api/songs/{id}/plays` | MVP+ (día 12): registra una reproducción (la llama el reproductor al empezar a sonar) |
| GET / DELETE | `/api/history` | MVP+ (día 12): historial paginado (`?distinct=1`: última reproducción de cada canción) / borrar todo el historial |
| GET / POST | `/api/playlists` | MVP+ (día 13): playlists propias con totales (`?song=` → `contains_song`) / crear |
| GET / PATCH / DELETE | `/api/playlists/{id}` | MVP+ (día 13): detalle con canciones en orden / renombrar / borrar (no borra canciones) |
| PUT / DELETE / PATCH | `/api/playlists/{id}/songs/{song_id}` | MVP+ (día 13): añadir al final / quitar / mover a `position` |

---

## 7. Plan de trabajo — 2 semanas

> Pensado para que lo ejecute una persona; cada bloque es independiente, así que se puede repartir (backend / criptografía / UI) si se suma más gente.

### Semana 1 — Fundaciones, autenticación y subida cifrada

| Día | Tareas | Entregable verificable |
|---|---|---|
| 1 | `docker-compose.yml` (web, api, db, minio, minio-init), `.env.example`; proyecto Django + DRF + simplejwt + CORS; Vite + React + TS + Tailwind con los tokens de `FrontEndMockups/cryptographic_audio_cloud/DESIGN.md`. | `docker compose up` → React muestra la respuesta de `/api/health`; la consola de MinIO tiene el bucket. CI en verde. |
| 2 | Modelos `Plan`, `User`, `Song` + migraciones + datos semilla; admin de Django; puerto `BlobStorage` con los dos adaptadores y sus tests. | Tests de almacenamiento en verde con `local` y con MinIO. |
| 3 | Módulo `frontend/src/crypto/` (PBKDF2, HKDF, generar/envolver/desenvolver claves, cifrar/descifrar archivo) con tests en Vitest. | Test: cifrar → descifrar devuelve bytes idénticos; una clave equivocada falla. |
| 4 | Endpoints de auth (`prelogin`, `register`, `login`, `refresh`, `logout`, `me`) + tests; pantallas Login/Registro (mockup "Iniciar sesión"), contexto de sesión, interceptor de refresh, rutas protegidas. | Registrarse en un navegador e iniciar sesión en otro. |
| 5 | Persistencia en IndexedDB + pantalla "Desbloquear bóveda"; endpoint `POST /api/songs` con validación de cuota/tamaño/MP3; flujo de subida cifrada en el cliente. | Subir un MP3; en MinIO el objeto es ilegible. |

### Semana 2 — Bóveda, reproductor y demo

| Día | Tareas | Entregable verificable |
|---|---|---|
| 6 | Layout base (sidebar + topbar + barra del reproductor) desde los mockups; pantalla "Mis Archivos": tabla, búsqueda, modal de subida con progreso, indicador de cuota. | Navegación completa con datos reales. |
| 7 | Reproductor: play/pausa, seek, volumen, anterior/siguiente sobre la lista; descifrado en memoria. | Reproducir sin cortes, también tras recargar la página. |
| 8 | Descarga del original, editar título/artista, eliminar (libera cuota); test "el usuario B no accede al archivo de A". | El SHA-256 del original y del archivo descargado coinciden. |
| 9 | Dashboard "Inicio" simplificado (recientes + cuota), landing page, secciones "Próximamente", manejo de errores, README de instalación. MVP+ si hay tiempo (favoritos). | El guion de demo (§8) pasa completo. |
| 10 | Margen para imprevistos; ensayo de la demo en una máquina limpia; diapositivas o resumen para el equipo. | Presentación lista. |

### Semana 3 — MVP+ (extensión aprobada el 2026-11-06)

> El MVP (§1.1) quedó completo el día 10. El equipo dispone de una semana más y decidió ejecutar el MVP+ (§1.2) y añadir el **cambio de contraseña**. Sin despliegue por ahora; compartir sigue en el backlog.

| Día | Tareas | Entregable verificable |
|---|---|---|
| 11 | **Favoritos**: modelo `Favorite` (único por usuario y canción), `PUT`/`DELETE /api/songs/{id}/favorite`, `is_favorite` en el listado y filtro `?favorites=1`; corazón en "Mis Archivos" y pantalla `/favoritos`. | Marcar una canción, recargar y que siga marcada; Beto no puede marcar las de Ana (404). |
| 12 | **Reproducido recientemente**: modelo `ListeningHistory`, `POST /api/songs/{id}/plays` (al empezar a sonar), `GET /api/history`; pantalla `/recientes` y sección "Recientes" de Inicio con datos reales. | Reproducir 3 canciones y verlas en orden en Inicio y `/recientes`. |
| 13 | **Playlists privadas**: modelos `Playlist` y `PlaylistSong` (con posición), CRUD + añadir/quitar canciones (ajena = 404); pantallas de lista y detalle; "Añadir a playlist" desde "Mis Archivos". | Crear una playlist, añadir 3 canciones, quitar 1, borrarla; borrar una canción la quita de sus playlists. |
| 14 | **Reproducir playlists con Iterator** (`Sequential`, `Shuffle`, `Loop`; Patrones §3.1) y botones aleatorio/repetir. **Cambio de contraseña**: re-envolver la Master Key con la nueva KEK, exigir el `authKey` actual e invalidar las otras sesiones. | Reproducir una playlist en aleatorio; tras cambiar la contraseña la anterior no sirve y las canciones suenan sin volver a cifrarse. |
| 15 | Margen; guion de demo ampliado en entorno limpio; documentación y resumen para el equipo. | El guion ampliado pasa completo. |

---

## 8. Guion de demo / criterios de aceptación

1. `docker compose up` en una máquina limpia levanta todo.
2. Registrar a **Ana**; mostrar en PostgreSQL que no hay contraseña ni clave maestra en claro.
3. Ana sube `cancion.mp3` → en la consola de MinIO el objeto se llama `…/{uuid}.bin` y al descargarlo directamente **no** es un MP3 válido (sin cabecera ID3/MPEG; `ffprobe blob.bin` → "Invalid data"). Ojo: `file` puede dar falsos positivos con bytes aleatorios (p. ej. "OpenPGP Public Key"); usar `ffprobe` o `xxd`.
4. Ana reproduce la canción en el reproductor web sin cortes; descarga el original y su SHA-256 coincide con el del archivo inicial.
5. Ana recarga la página y sigue reproduciendo; inicia sesión desde **otro navegador** y reproduce la misma canción (portabilidad de claves).
6. Registrar a **Beto**; `GET /api/songs/{id_de_Ana}/blob` con el token de Beto → **404**.
7. Subir un archivo de 25 MB o un `.wav` → rechazado con un mensaje claro (en el cliente y también si se salta el cliente con `curl`).
8. Logout → el refresh token deja de funcionar y la clave desaparece de IndexedDB.
9. Bloquear a Ana desde el admin de Django → no puede iniciar sesión.

---

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| Errores sutiles de criptografía (IV reutilizado, claves extraíbles) | Módulo `crypto/` aislado y con tests; IV aleatorio por operación; `extractable: false`; revisión de código antes de la demo. |
| Dispersión en funcionalidades sociales/estadísticas | Este documento define el alcance; todo lo demás va al backlog del PO. |
| Configuración de MinIO/CORS consume tiempo | Descargas a través de Django (sin URLs prefirmadas); adaptador local como respaldo cambiando `STORAGE_BACKEND`. |
| Plazo de 2 semanas ajustado | El día 10 es margen; el MVP+ solo entra si el guion de demo ya pasa. |
