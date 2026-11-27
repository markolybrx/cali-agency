export const APP_VERSION = '0.8.0';
export const APP_VERSION_TAG = `v${APP_VERSION}`;
export const APP_VERSION_CODE = 800;

export interface ChangelogRelease {
  version: string;
  date: string;
  title: string;
  highlights: string[];
}

export const CHANGELOG: ChangelogRelease[] = [
  {
    version: 'v0.8.0',
    date: '2026-11-27',
    title: 'Part A: Project Hub Flow, IndexedDB + Local Sync, Editorial Reports & Bug Fixes',
    highlights: [
      'New Entry Flow: Login Gate (Google Sign-In or Offline Local Save) -> Onboarding (first-time) -> Project Selection Hub -> Scoped Project Dashboard.',
      'Fixed Phase 1 -> Phase 2 stall with atomic advanceToNextPhase() and permanently greyed-out Chat Action CTAs once approved or declined.',
      'Migrated projects, files, snapshots, and reports to IndexedDB (cali_agency_db) with live write-through to your chosen Android local folder.',
      'Added 1-Tap Reports Hub and Full-Screen Editorial Canvas Viewer for Phase Accomplishment Reports, Cali Sitreps, Blueprints, and Code.',
      'Upgraded Workspace Live Preview to automatically bundle multi-file local CSS and JS, plus Studio Pacing (Studio / Brisk / Turbo).',
      'Simplified appearance to Original Monolith only: Dark Mode default with a clean Light Mode toggle.'
    ]
  },
  {
    version: 'v0.7.0',
    date: '2026-11-27',
    title: 'Offline-First Sign-In, 3-Layer JARVIS Brain & Onboarding Fix',
    highlights: [
      'Fixed 4th-question onboarding hang, added Supabase Auth (Google + Email), and installed the 3-Layer JARVIS Brain.'
    ]
  },
  {
    version: 'v0.6.0',
    date: '2026-11-27',
    title: 'Reachable Chat FAB, Directory Chooser, PWA/APK Targets & Custom App Icon',
    highlights: [
      'Reachable Chat FAB, Local Directory Chooser, PWA/APK targets, custom app icon, and CI Maven mirror.'
    ]
  },
  {
    version: 'v0.5.0',
    date: '2026-11-26',
    title: 'Release Candidate Hardening: Snapshot Diff, Live Voice Tools & RC Diagnostics',
    highlights: [
      'Snapshot Diff Viewer, full Gemini Live 4-tool voice control, and On-Device RC Diagnostics Suite.'
    ]
  }
];
