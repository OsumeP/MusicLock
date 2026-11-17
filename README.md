# MusicLock

Storage and playback of music with **browser encryption (Zero-Knowledge)**. The MP3s are encrypted with AES-GCM in your browser before being uploaded; the server (Django + PostgreSQL + MinIO) only stores bytes it cannot read, and the music is decrypted solely in the memory of your device.

**Stack:** React 19 + TypeScript + Tailwind v4 (Vite) · Django 5.2 + DRF + JWT · PostgreSQL 16 · MinIO (S3) · Docker.

## Installation (5 minutes)

**Requirements:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) running and Git. Nothing else: Python and Node live inside the containers.

```bash
git clone https://github.com/OsumeP/MusicLock.git
cd MusicLock
cp .env.example .env # in PowerShell: Copy-Item .env.example .env
docker compose up --build # the first time it takes a few minutes (downloads images)
 ```
When you're done, open **http://localhost:5173** → "Start for free" → create your account → upload an MP3 from "My Files".


| Address | What is it |
|---|---|
| http://localhost:5173 | The application (landing, registration, vault) |
| http://localhost:8000/api/health | Health of the API, the database, and storage |
| http://localhost:8000/admin/ | Django Admin (block accounts, view plans). Create an admin with `docker compose exec api python manage.py createsuperuser` |
| http://localhost:9001 | MinIO Console (username/password in `.env`): here it shows that the saved files are unreadable |
| http://localhost:5173/status | Status of all services |

### Useful commands

```bash docker compose up -d # lift in the background 
docker compose up -d # lift in the background
docker compose logs -f api # view backend logs
docker compose down # stop (keeps the data)
docker compose down -v # stop and DELETE all local data
docker compose exec api python manage.py test # backend tests (real PostgreSQL + MinIO)
cd frontend && npm install && npm test -- --run # frontend tests (requires Node 22)
```

### Frequent Problems

| Symptom | Solution |
|---|---|
| `DJANGO_SECRET_KEY is required` or short key warnings | Copy `.env.example` to `.env` again (the key must be ≥ 32 characters). | It seems there is no text provided for translation. Could you please provide the text you would like me to translate?
| Migration error / `InconsistentMigrationHistory` | Your local database is from an earlier version: `docker compose down -v` and bring it back up. It seems there is no text provided for translation. Could you please provide the text you would like me to translate?
| The frontend does not reflect code changes | Restart the container: `docker compose restart web`. If you added dependencies: `docker compose up -d --build -V web`. It seems there is no text provided for translation. Could you please provide the text you would like me to translate?
| `pull access denied for minio/minio` | MinIO stopped publishing images; the project uses the fork `pgsty/minio`. Update your copy of the repository. Update your copy of the repository. | | Port 5173, 8000, 9000, or 9001 is occupied | Close the application using it or change the port in `docker-compose.yml`.
| The port 5173, 8000, 9000, or 9001 is occupied | Close the application using it or change the port in `docker-compose.yml`. The port 5173, 8000, 9000, or 9001 is occupied | Close the application using it or change the port in `docker-compose.yml`. | I forgot the password to my test account | It cannot be recovered (by design, Zero-Knowledge).
| I forgot the password to my test account | It cannot be recovered (by design, Zero-Knowledge). Register another account.

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
