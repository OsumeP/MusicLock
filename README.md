# MusicLock

.
├── docs/
│   ├── Specifications.pdf  # System specifications, user stories, and policies
│   └── Workshop2Part1.pdf  # Design artifacts, system domain, CRC cards, models, and mockups
└── README.md
```

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
