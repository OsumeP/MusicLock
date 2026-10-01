```text
.
├── docs/
│   └── Specifications.pdf  # System specifications, user stories, and policies
└── README.md
```

## Documentation (`/docs`)

The `/docs` directory contains project documentation, specification files, and reference material for **MusicLock**.

### Files

* **`Specifications.pdf`**: Contains the detailed system requirements and specifications, including:

  * **User Stories & User Story Mapping**: Comprehensive coverage of user journeys, functional workflows, and feature prioritization for core system modules.
  * **Functional Requirements**: Detailed User Stories and Acceptance Criteria covering audio management and encryption, access management, statistics and analysis, social features, community engagement, copyright protection, account management, etc.
  * **Non-Functional Requirements**: Technical standards for Security & Zero-Knowledge Confidentiality, Performance (sub-second write / sub-2-second read latency targets), Availability (99.9% uptime SLA), Docker containerization, and backend scalability with storage quota enforcement (Free vs. Premium).
  * **System Integrity & Architecture**: Copyright verification via ACRCloud API integration, local browser decryption standards, cross-device authentication/key derivation, and responsible AI usage guidelines.

📄 You can consult the full specifications in the [Specification Document (PDF)](./docs/Specifications.pdf).
