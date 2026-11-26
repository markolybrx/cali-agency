# Cali PWA Agency — Master Roadmap & Versioning Policy

**Current Version:** `v0.6.0` (Pre-Release Polish & Local Directory Architecture)  
**Target Platform:** Standalone Android APK (Capacitor + React + TS + Vite + Tailwind + Three.js) & Web Preview (Vercel)  

## Versioning Policy (`vx.y.z`)
- **`x` (Major):** Bumped **only** upon explicit confirmation (e.g., `v1.0.0`).
- **`y` (Minor):** Increments per completed roadmap phase.
- **`z` (Patch):** Bug fixes & targeted upgrades within a phase.

## Completed Phases
- **`v0.1.0`** — Scaffold & Debug APK CI.
- **`v0.2.0`** — Cali Monolith HQ & 16-Bit Pixel Office.
- **`v0.3.0`** — Mobile UX Overhaul, `AQ.` Keys + Model Auto-Detect, & Autonomous Loop Engine.
- **`v0.4.0`** — Mandatory Conversational Onboarding Gate (`0/4` progress), Custom Model Picker, Persistent Centered-Home Dock, Native Local Save, Full Backup/Restore, Chat-to-Blueprint Live Card, SVG Icons, Agent Inspector.
- **`v0.4.1`** — Claw3D-Style Interactive Three.js 3D Retro Virtual Office.
- **`v0.5.0`** — Snapshot Diff Viewer, Full Gemini Live 4-Tool Voice Control, RC Diagnostics Suite.
- **`v0.6.0` (Current — Pre-Release Polish & Local Storage Architecture):**
  - **Reachable Cali Chat FAB:** Moved Chat from the top header down to a thumb-friendly floating action button positioned cleanly above the bottom dock.
  - **User-Selectable Local Storage Directory:** Cali prompts you to choose your root directory (`Documents`, `External`, or `App Data`) and base folder (default `CaliAgency`), automatically structuring `/Projects/<slug>/`, `/Cache/`, and `/Backups/`.
  - **Projects Folder Local Pathing & 1-Tap Folder Sync:** Mirror every generated project file directly into its own local folder on-device, plus save Cali's cache & memory backups into the same directory tree.
  - **PWA or Android APK Project Target:** Choose between **Web PWA** or **Android APK (GitHub CI)** when starting any project—APK mode automatically scaffolds `capacitor.config.ts` and `.github/workflows/main.yml` ready to ship to GitHub Actions.
  - **Direct `.md` Blueprint File Picker** & **Custom Cali Monolith Violet Android Launcher Icon**.

## Reserved Milestone
- **`v1.0.0`** — Production Milestone (held until your explicit confirmation).
