# MusicLock

Almacenamiento y reproducción de música con **cifrado en el navegador (Zero-Knowledge)**. Los MP3 se cifran con AES-GCM en tu navegador antes de subirse; el servidor (Django + PostgreSQL + MinIO) solo guarda bytes que no puede leer, y la música se descifra únicamente en la memoria de tu dispositivo.

**Stack:** React 19 + TypeScript + Tailwind v4 (Vite) · Django 5.2 + DRF + JWT · PostgreSQL 16 · MinIO (S3) · Docker.

## Instalación (5 minutos)

**Requisitos:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) en ejecución y Git. Nada más: Python y Node viven dentro de los contenedores.

```bash
git clone https://github.com/OsumeP/MusicLock.git
cd MusicLock
cp .env.example .env            # en PowerShell: Copy-Item .env.example .env
docker compose up --build       # la primera vez tarda unos minutos (descarga imágenes)
```

Cuando termine, abre **http://localhost:5173** → "Comenzar gratis" → crea tu cuenta → sube un MP3 desde "Mis Archivos".

| Dirección | Qué es |
|---|---|
| http://localhost:5173 | La aplicación (landing, registro, bóveda) |
| http://localhost:8000/api/health | Salud de la API, la base de datos y el almacenamiento |
| http://localhost:8000/admin/ | Admin de Django (bloquear cuentas, ver planes). Crea un admin con `docker compose exec api python manage.py createsuperuser` |
| http://localhost:9001 | Consola de MinIO (usuario/clave en `.env`): aquí se ve que los archivos guardados son ilegibles |
| http://localhost:5173/estado | Estado de todos los servicios |

### Comandos útiles

```bash
docker compose up -d                      # levantar en segundo plano
docker compose logs -f api                # ver logs del backend
docker compose down                       # detener (conserva los datos)
docker compose down -v                    # detener y BORRAR todos los datos locales
docker compose exec api python manage.py test      # tests del backend (PostgreSQL + MinIO reales)
cd frontend && npm install && npm test -- --run    # tests del frontend (requiere Node 22)
```

### Problemas frecuentes

| Síntoma | Solución |
|---|---|
| `DJANGO_SECRET_KEY es obligatorio` o avisos de clave corta | Vuelve a copiar `.env.example` a `.env` (la clave debe tener ≥ 32 caracteres). |
| Error de migraciones / `InconsistentMigrationHistory` | Tu base de datos local es de una versión anterior: `docker compose down -v` y vuelve a levantar. |
| El frontend no refleja cambios del código | Reinicia el contenedor: `docker compose restart web`. Si agregaste dependencias: `docker compose up -d --build -V web`. |
| `pull access denied for minio/minio` | MinIO dejó de publicar imágenes; el proyecto usa el fork `pgsty/minio`. Actualiza tu copia del repositorio. |
| El puerto 5173, 8000, 9000 o 9001 está ocupado | Cierra la aplicación que lo usa o cambia el puerto en `docker-compose.yml`. |
| Olvidé la contraseña de mi cuenta de prueba | No se puede recuperar (por diseño, Zero-Knowledge). Registra otra cuenta. |

## Documentación

- **Plan del MVP** (alcance, decisiones de diseño, criptografía, API, guion de demo): [`docs/PlanMVP.md`](docs/PlanMVP.md)
- **Estado del desarrollo** (estructura de archivos, decisiones de implementación, deuda técnica): [`docs/desarrollo/README.md`](docs/desarrollo/README.md)
- **Bitácora por día:** [`docs/desarrollo/`](docs/desarrollo/) (`dia-01.md` … ) · cuentas y archivos de prueba: [`datos-de-prueba.md`](docs/desarrollo/datos-de-prueba.md)
- **Requerimientos, actores, patrones** (versión markdown de los PDFs): [`docs/Claude/`](docs/Claude/)

## Documentos originales del proyecto

.
├── docs/
│   ├── Specifications.pdf  # System specifications, user stories, and policies
│   └── Workshop2Part1.pdf  # Design artifacts, system domain, CRC cards, models, and mockups
└── README.md

## Documentation (`/docs`)

The `/docs` directory contains project documentation, specification files, system modeling, and reference material for MusicLock[cite: 1, 2].

### Files

* **`Specifications.pdf`**: 
  Contains detailed system requirements and specifications, including:
  * **User Stories & User Story Mapping**: Comprehensive coverage of user journeys, functional workflows, and feature prioritization for core system modules[cite: 1].
  * **Functional Requirements**: Detailed User Stories and Acceptance Criteria covering social features (following users, viewing public playlists, adding tracks), community engagement (commenting system with edit/delete actions and timestamps), and account management[cite: 1].
  * **Non-Functional Requirements**: Technical standards for Security & Zero-Knowledge Confidentiality, Performance (sub-second write / sub-2-second read latency targets), Availability (99.9% uptime SLA), Docker containerization, and backend scalability with storage quota enforcement (Free vs. Premium)[cite: 1].
  * **System Integrity & Architecture**: Copyright verification via ACRCloud API integration, local browser decryption standards, cross-device authentication/key derivation, and responsible AI usage guidelines[cite: 1].

  You can consult the full specifications in the [Specification Document (PDF)](./docs/Specifications.pdf)[cite: 1].

* **`Workshop2Part1.pdf`**:
  Contains the design artifacts, system domain analysis, and visual UI modeling for MusicLock, including:
  * **System Domain & Business Rules**: Description of platform boundaries, client-side encryption workflows (AES-GCM via Web Crypto API, Argon2id key derivation), ACRCloud copyright verification, and strict operational business rules for Free vs. Premium tiers[cite: 4, 6, 7].
  * **Actor Characterization**: Specifications for Standard Users, Premium Users, System Administrators, ACRCloud External System, and Non-Registered Users[cite: 4, 5, 6].
  * **CRC Cards**: Class-Responsibility-Collaborator specifications for core domain entities (`User`, `Album`, `Song`, `Playlist`, and `Comment`)[cite: 6, 8, 9, 10, 11].
  * **System Models**: Complete Class Diagram mapping domain relationships and actions, alongside the Relational Database Model (E/R Model)[cite: 12, 13].
  * **UI Mockups & Visual Identity**: Dark-mode color palette definitions and wireframe layouts for the Landing Page, Login Screen, and Workspace dashboards (Inicio, Mis Archivos, Favoritos, Playlists, Compartido conmigo, Recientes, Tendencias, Admin/Planes)[cite: 12, 14, 15, 17, 19, 20, 22, 23, 24, 25, 26, 27, 29].

  You can consult the full design artifacts in the [Workshop 2 Part 1 Document (PDF)](./docs/Workshop2Part1.pdf)[cite: 2].