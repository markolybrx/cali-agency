# Cali PWA Agency — Master Roadmap & Versioning Policy

**Current Version:** `v0.5.0` (Release Candidate)  
**Target Platform:** Standalone Android APK (Capacitor + React + TS + Vite + Tailwind + Three.js) & Web Preview (Vercel)  

## Versioning Policy (`vx.y.z`)
- **`x` (Major):** Bumped **only** upon explicit confirmation (e.g., `v1.0.0`).
- **`y` (Minor):** Increments per completed roadmap phase.
- **`z` (Patch):** Bug fixes & targeted upgrades within a phase.

## Completed Phases
- **`v0.1.0`** — Scaffold & Debug APK CI.
- **`v0.2.0`** — Cali Monolith HQ & 16-Bit Pixel Office.
- **`v0.3.0`** — Mobile UX Overhaul, `AQ.` Keys + Model Auto-Detect, & Autonomous Loop Engine.
- **`v0.4.0`** — Mandatory Conversational Onboarding Gate (`0/4` accurate progress), Custom Model Picker, Always-Visible Centered-Home Bottom Dock, Native Local Save, Full Backup/Restore, Chat-to-Blueprint Live Card, SVG PWA Icon Generator, and Agent Latency/Token Inspector.
- **`v0.4.1`** — Claw3D-Style Interactive Three.js 3D Retro Virtual Office with orbit/pinch-zoom/pan, camera presets, articulated 3D avatars, and 3D/2D/Grid switcher.
- **`v0.5.0` (Current — Release Candidate Hardening):**
  - **Snapshot Diff Viewer:** Compare any saved Phase Snapshot against the current workspace (Added, Removed, Modified files + Unified/Split line diffs).
  - **Full Gemini Live Voice Tool-Calling:** Cali can verbally execute `get_agency_status`, `get_agent_report`, `control_loop`, and `resolve_approval` with live tool-call badges in the Voice Overlay.
  - **On-Device RC Diagnostics & Stress-Test Suite:** One-tap verification of Static Pre-Check Gate, Rolling Context Compactor, 5-Key Pool Isolation, and Backup Serialization inside the Telemetry tab.
  - **Optional Persistent Debug Keystore Support** in `.github/workflows/main.yml` for seamless in-place APK upgrades.

## Reserved Milestone
- **`v1.0.0`** — Production Milestone (held until explicit confirmation after RC testing).
