---
name: Cryptographic Audio Cloud
colors:
  surface: '#0f131c'
  surface-dim: '#0f131c'
  surface-bright: '#353943'
  surface-container-lowest: '#0a0e17'
  surface-container-low: '#181b25'
  surface-container: '#1c1f29'
  surface-container-high: '#262a34'
  surface-container-highest: '#31353f'
  on-surface: '#dfe2ef'
  on-surface-variant: '#c2c6d2'
  inverse-surface: '#dfe2ef'
  inverse-on-surface: '#2c303a'
  outline: '#8c919c'
  outline-variant: '#424751'
  surface-tint: '#a7c8ff'
  primary: '#a7c8ff'
  on-primary: '#003060'
  primary-container: '#025098'
  on-primary-container: '#a0c4ff'
  inverse-primary: '#215fa7'
  secondary: '#65d5f1'
  on-secondary: '#003640'
  secondary-container: '#159eb8'
  on-secondary-container: '#002e38'
  tertiary: '#d0bcff'
  on-tertiary: '#3c0091'
  tertiary-container: '#5f27c8'
  on-tertiary-container: '#cdb8ff'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d5e3ff'
  primary-fixed-dim: '#a7c8ff'
  on-primary-fixed: '#001b3b'
  on-primary-fixed-variant: '#004788'
  secondary-fixed: '#acedff'
  secondary-fixed-dim: '#65d5f1'
  on-secondary-fixed: '#001f26'
  on-secondary-fixed-variant: '#004e5c'
  tertiary-fixed: '#e9ddff'
  tertiary-fixed-dim: '#d0bcff'
  on-tertiary-fixed: '#23005c'
  on-tertiary-fixed-variant: '#5516be'
  background: '#0f131c'
  on-background: '#dfe2ef'
  surface-variant: '#31353f'
typography:
  display-lg:
    fontFamily: Space Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.03em
  display-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Space Grotesk
    fontSize: 20px
    fontWeight: '500'
    lineHeight: 28px
  title-md:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  title-sm:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  mono-crypto:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.04em
  mono-label:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.08em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.25rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-tablet: 1.5rem
  margin-desktop: 2rem
  space-xxs: 0.125rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
  space-2xl: 3rem
  space-3xl: 4rem
---

## Brand & Style

This design system defines an uncompromising, privacy-first audio platform marrying the polished media immersion of Spotify and Apple Music with the verifiable cryptographic transparency of Proton Drive. The target audience encompasses security-conscious audiophiles, independent audio creators guarding unreleased stems, and sovereign-data advocates. 

The aesthetic style is **Cryptographic Dark Modernism**: an architecture anchored by pitch-black, obsidian-tinted surfaces (`#030712`, `#0B0F17`) combined with focused cryptographic signaling via deep sovereign blue and electric cyan (`#025098`, `#0a9bb5`), deep security violet, and ultraviolet accents. Surfaces favor low-reflection matte materials, hair-line translucent borders, and focused monochromatic typography that yield center stage to cryptographic validation states and rich album artwork. Every security guarantee (AES-GCM 256-bit client encryption, Argon2id key derivation, ephemeral RAM decryption) is visually communicated as a tangible, high-assurance mechanical status rather than an abstract badge.

## Colors

The palette establishes an absolute visual hierarchy tailored for low-light listening sessions and cryptographic status legibility:

- **Primary (`#025098`) & Bright Blue (`#0a9bb5`)**: Signifies confirmed cryptographic integrity, successful zero-knowledge verification, local RAM decryption streams, and primary audio playback controls.
- **Secondary (`#0a9bb5`)**: Designated for client-side pipeline interactions, network transit stages, Web Crypto API telemetry, and access role indicators (e.g., read-only versus keyholder privileges).
- **Tertiary (`#8B5CF6`)**: Used for master key derivation checkpoints (Argon2id/PBKDF2), private identity profiles, and sovereign cryptographic sharing tokens.
- **Neutral Palette (`#030712` to `#1F2937`)**: Deep obsidian and zinc-tinted dark layers create depth without OLED smearing. Pure white (`#F9FAFB`) is strictly reserved for high-prominence headers and active playback titles, while secondary data values rely on slate neutrals (`#9CA3AF`, `#6B7280`) to eliminate eye fatigue.
- **Functional Semantics**: Danger (`#EF4444`) enforces irreversible key revocation and ACRCloud copyright flags. Warning (`#F59E0B`) indicates unbuffered memory streams or approaching quota limits.

## Typography

Typography balances architectural precision with high-density technical telemetry:

- **Display & Headings (`Space Grotesk`)**: Provides an authoritative, engineered character with sharp geometric junctions. Used for major sections, album hero titles, storage statistics, and security checkpoint banners.
- **Interface & Body (`Hanken Grotesk`)**: Delivers neutral, highly legible sans-serif readability across tracks, artist metadata, user lists, and long-form permission narratives.
- **Cryptographic & Telemetry (`JetBrains Mono`)**: Handles all security tokens, hash values, cipher indicators (`AES-GCM-256`, `Argon2id`), bitrate metrics, and audio time codes. Monospaced clarity prevents layout jumping during live streaming and memory decoding counters.

## Layout & Spacing

The layout is built upon an asymmetrical fluid application shell partitioned into three primary zones:

1. **Collapsible Tactical Rail (Sidebar)**: Fixed 260px desktop width housing navigation tiers, real-time vault status, and the zero-knowledge storage quota meter. Collapses to an icon-only rail (72px) on medium screens and transforms into an off-canvas drawer on mobile devices.
2. **Dynamic Canvas**: A fluid central area with a strict 12-column responsive grid (16px gutters mobile, 24px desktop) bounded by max-width constraints on editorial content while allowing full-width grid presentation for track collections and waveform inspectors.
3. **Persistent Audio Dock**: A dedicated 84px bottom bar pinned to the viewport. It orchestrates playback controls, track identity, volume dials, and live RAM decryption diagnostics without occluding grid interactions.

Vertical cadence strictly abides by an 8px base rhythm (`space-sm` = 8px, `space-md` = 16px, `space-lg` = 24px), preserving mathematical alignment between cryptographic status pills and audio list rows.

## Elevation & Depth

Visual hierarchy does not use diffuse paper shadows; instead, it uses a **Tonal Stratification and Phosphor Edge Glow** model suited for pitch-black environments:

- **Level 0 (Canvas Floor - `#030712`)**: The foundational viewport layer. Dark, noise-free, and recessionary.
- **Level 1 (Card & Module Layer - `#0B0F17`)**: Track tables, storage widgets, and dashboard partitions. Defined by a hairline border (`rgba(255, 255, 255, 0.07)`) with no drop shadow.
- **Level 2 (Interactive Flyouts & Floating Bars - `#111827`)**: Audio dock and sticky column headers. Features an ultra-subtle 1px top border (`rgba(255, 255, 255, 0.12)`) and a black drop blur (`0 12px 32px rgba(0, 0, 0, 0.65)`).
- **Level 3 (Cryptographic Overlays & Key Modals - `#0F172A`)**: Client-side encryption pipelines, ACRCloud copyright modals, and master key entry dialogs. Accented with a deep blue perimeter backlight (`0 0 24px rgba(2, 80, 152, 0.12)`) and a 1px boundary (`rgba(10, 155, 181, 0.3)`).
- **Security Glow Accents**: When Web Crypto API operations run in real time (e.g. streaming audio chunks decrypted in RAM), the containing container receives an active phosphor pulse via `box-shadow: inset 0 0 12px rgba(2, 80, 152, 0.08)`.

## Shapes

The geometric framework balances contemporary consumer music software with secure enterprise hardware:

- **Primary Structure**: Controlled `roundedness: 2` (base 8px / `0.5rem`). Standard cards, track row hover plates, input text boxes, and table containers standardise on 8px to ensure structured, industrial rhythm.
- **Badges and Controls (`rounded-lg` / 16px to Pill)**: Cryptographic telemetry tags (`[AES-GCM]`, `[RAM-STREAM]`, `[MASTER-KEY]`), search filters, and audio scrubber handles adopt pill radii (`9999px`) to create an immediate ergonomic contrast against square content modules.
- **Artwork & Media Containers**: Song cover thumbnails and album sleeves use fixed 6px radii to prevent corner clipping of dense metadata or high-contrast record jackets.

## Components

### 1. Buttons
- **Primary Action (Playback / Upload / Encrypt)**: High-contrast primary fill (`#025098`) with rich light typography (`#F9FAFB`, weight 600). Hover state introduces bright blue illumination (`#0a9bb5`) and a faint blue halo.
- **Cryptographic Action (Derive Key / Revoke Token)**: Ghost container with a 1px cyan/violet boundary, monospace typography (`JetBrains Mono`), and translucent background fill on hover (`rgba(10, 155, 181, 0.1)`).
- **Destructive (Revoke Access / Wipe Local Key)**: Matte crimson border (`#EF4444`) with low-saturation crimson text, shifting to full crimson fill on confirmed focus.

### 2. Cryptographic Security Badges
- **Local Decryption Indicator**: Pill container with a pulsating blue LED dot, styled with a faint primary background (`#025098` at 40% opacity) and bright blue monospaced typography reading `🔒 RAM Decrypt: AES-GCM`.
- **Copyright Check State**: Dual state indicator. Verified: Cyan border with `ACRCloud: Clean` label. Flagged: Ember-orange background with cautionary alert icon and license verification button.

### 3. Track List & Audio Grid Rows
- **List Architecture**: 56px height rows with columns for index/status icon, track cover + title/artist group, album title, local encryption status badge, play count, duration, and access context menu.
- **Row States**: Default row is transparent. Hover transitions to surface-raised (`#0B0F17`) with a 1px translucent left edge highlight. Active playing track highlights the track title in `#0a9bb5` with a three-bar animated blue equalizer in place of the track index number.

### 4. Input Fields & Key Entry
- **Standard Input**: Obsidian surface (`#0B0F17`), 1px muted slate border (`#1F2937`), and off-white typography. Focus shifts border to primary (`#025098`) with zero offset ring.
- **Master Key / Passphrase Field**: Monospace text masking with character count telemetry and a live Argon2id derivation workload meter embedded within the input container.

### 5. Drag-and-Drop Pipeline Simulator (Upload)
- **Dropzone Area**: Perforated dual-color border (alternating primary blue and cyan dash marks). Center area hosts step-by-step progress nodes: 
  `[1. ACRCloud Scan]` → `[2. AES-GCM 256 Chunking]` → `[3. Zero-Knowledge Transit]`.
- **Pipeline Progress Bar**: Multi-stage progress indicator with real-time throughput metrics (e.g. `18.4 MB/s Encrypted`) rendered in monospaced labels.

### 6. Storage Quota Gauge
- High-precision segmented bar container: Used storage rendered in solid `#025098`, encrypted cache overhead rendered in `#0a9bb5`, and unallocated storage in dark `#1F2937`. Includes a monospaced read-out (`350 MB / 500 MB`) with an instant upgrade action trigger.

### 7. Persistent Audio Player Bar
- Three-section horizontal split: Left section features 48px album artwork, title, artist, and cryptographic privacy pill. Center section contains transport controls (shuffle, previous, play/pause circle, next, repeat) and scrubber timeline with loaded/decrypted buffer ranges. Right section houses live RAM memory consumption metrics, volume slider, and sharing role indicators.