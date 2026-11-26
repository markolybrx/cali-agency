# Cali PWA Agency — Project Roadmap & Versioning Policy

## Semantic Versioning Policy (`vx.y.z`)
- **`x` (Major):** Bumped **only** upon explicit confirmation from Mark (e.g., `v1.0.0` release).
- **`y` (Minor):** Bumped per completed roadmap phase (`0.1.0`, `0.2.0`, `0.3.0`, `0.4.0`, `0.5.0`).
- **`z` (Patch):** Bumped for bug fixes and micro-tweaks within a phase.
- **Metadata Sync:** `.github/workflows/main.yml` automatically reads `version` from `package.json`, computes `versionCode = x*10000 + y*100 + z`, injects `versionName` + `versionCode` into `android/app/build.gradle`, and tags the APK artifact.

---

## Completed Phases
- **`v0.1.0` — Scaffold & Debug APK Pipeline:** Capacitor Android wrapper, 5-key pool foundation, Monolith shell, GitHub Actions debug APK build.
- **`v0.2.0` — Cali Monolith HQ & 16-Bit Pixel Office:** Sprite-animated virtual office, verbatim 13-agent prompts, real Token/RPM/RPD/Context telemetry, Live Preview, GitHub Ship, Demo Sprint.
- **`v0.3.0` — UX Overhaul, `AQ.` Key & Model Auto-Detection, + Autonomous Loop Engine (Current):**
  - Floating bottom thumb navigation bar (clean top header + clickable `v0.3.0` Changelog pill).
  - Dedicated **Changelog** page & `vx.y.z` APK metadata auto-sync.
  - Explicit **Save Settings** button (draft state, zero accidental overwrites).
  - **Prompt Studio** in vertical List View, read-only by default with explicit **Edit** toggle.
  - **Red Danger Zone** styling + Confirmation Modal on all delete/reset actions.
  - Taller dashboard **Mini-Office** (`240px–256px`) and removal of mock starter blueprints.
  - Native **`AQ.xxxx`** Gemini API key authentication (`x-goog-api-key` header only) + **auto-detected available model dropdown** per API key.
  - **Tap-to-Speak / Mute** toggle in Gemini Live voice mode.
  - **Zero-API Static Pre-Check Gate** (JSON/HTML/JS/dialog checks before Code Reviewer).
  - **Phase Snapshot & 1-Tap Rollback** in Workspace.
  - **Rolling Context Compactor** (symbol extraction to prevent `MAX_TOKENS` bloat).
  - **Android Local Notifications + Screen Wake-Lock** while production runs.

---

## Upcoming Phases
- **`v0.4.0` — Native Capacitor Filesystem & Background Polish:** Direct Android Downloads folder `.zip` save via `@capacitor/filesystem`, persistent Foreground Service notification channel, and offline prompt export/import.
- **`v0.5.0` — Release Candidate Hardening:** End-to-end multi-phase PWA stress testing, automated diff viewer between Phase Snapshots, and full voice tool-calling controls for Cali.
- **`v1.0.0` — Production Milestone:** Reserved until explicit confirmation from Mark.
