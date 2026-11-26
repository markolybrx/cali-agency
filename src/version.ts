export const APP_VERSION = '0.7.0';
export const APP_VERSION_TAG = `v${APP_VERSION}`;
export const APP_VERSION_CODE = 700;

export interface ChangelogRelease {
  version: string;
  date: string;
  title: string;
  highlights: string[];
}

export const CHANGELOG: ChangelogRelease[] = [
  {
    version: 'v0.7.0',
    date: '2026-11-27',
    title: 'Offline-First Sign-In, 3-Layer JARVIS Brain & Onboarding Fix',
    highlights: [
      'Fixed 4th-question onboarding hang with auto-scroll, live "Cali is thinking..." indicator, guaranteed unlock after 4 turns, and a Continue to Dashboard button.',
      'Added Sign In (Sync Cali Brain) & Restore Backup directly on the first-launch Onboarding screen so you never repeat onboarding across installs.',
      'Offline-First Supabase Auth (Google OAuth + Email/Password) with automatic local cache so projects, files, and 3D Office work with zero internet.',
      '3-Layer JARVIS Brain: Layer 1 Shared Collective Brain (PII-scrubbed + BOSS approval queue), Layer 2 RLS-isolated Private Vault, and Layer 3 Local Device Keys.',
      'Bundled supabase/cali_brain_schema.sql and reusable src/engine/caliBrain.ts SDK for all future Cali apps.'
    ]
  },
  {
    version: 'v0.6.0',
    date: '2026-11-27',
    title: 'Reachable Chat FAB, Directory Chooser, PWA/APK Targets & Custom App Icon',
    highlights: [
      'Reachable floating Chat Cali button, Local Directory Chooser modal, PWA/APK build targets, custom Android icon, and CI Google Maven mirror + Gradle cache.'
    ]
  },
  {
    version: 'v0.5.0',
    date: '2026-11-26',
    title: 'Release Candidate Hardening: Snapshot Diff, Live Voice Tools & RC Diagnostics',
    highlights: [
      'Snapshot Diff Viewer (Unified & Split), full Gemini Live 4-tool voice control, and On-Device RC Diagnostics Suite.'
    ]
  },
  {
    version: 'v0.4.1',
    date: '2026-11-26',
    title: 'Claw3D-Style Interactive 3D Retro Virtual Office (Three.js)',
    highlights: [
      'Procedural Three.js 3D Isometric Office with touch orbit/pinch-zoom/pan, camera presets, articulated 3D avatars, and 3D/2D/Grid switcher.'
    ]
  },
  {
    version: 'v0.4.0',
    date: '2026-11-26',
    title: 'Conversational Onboarding Gate, Persistent Centered Dock, Local Save & Inspector',
    highlights: [
      'Mandatory conversational Onboarding, custom Model Picker, persistent enlarged centered-Home dock, Native Local Save, Full Backup/Restore, and Agent Latency Inspector.'
    ]
  },
  {
    version: 'v0.3.0',
    date: '2026-11-26',
    title: 'UX Overhaul, AQ. Key & Model Selector, + Autonomous Loop Engine',
    highlights: [
      'Native AQ.xxxx key auth, per-key model auto-detection, Prompt Studio read-only lock, Danger Zone modals, Static Pre-Check Gate, and Rolling Context Compactor.'
    ]
  }
];
