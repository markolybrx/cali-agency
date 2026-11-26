export const APP_VERSION = '0.6.0';
export const APP_VERSION_TAG = `v${APP_VERSION}`;
export const APP_VERSION_CODE = 600;

export interface ChangelogRelease {
  version: string;
  date: string;
  title: string;
  highlights: string[];
}

export const CHANGELOG: ChangelogRelease[] = [
  {
    version: 'v0.6.0',
    date: '2026-11-26',
    title: 'Reachable Chat FAB, Local Directory Chooser & PWA/APK Target Modes',
    highlights: [
      'Moved Chat Cali from the top header down to a thumb-reachable Floating Action Button (FAB) above the bottom dock.',
      'Added Local Storage Directory Chooser: Cali asks you to select your root folder (Documents / External / App Data) and base path for /Projects/, /Cache/, and /Backups/.',
      'Added real Projects folder pathing + 1-tap Sync Project Folder to save individual project files locally into <root>/<base>/Projects/<project-slug>/.',
      'Added Project Target selector: build either a Web PWA or an Android APK (automatically scaffolds Capacitor + GitHub Actions main.yml CI).',
      'Added direct .md file upload inside the Blueprint Importer and custom Cali Monolith violet Android app icon.'
    ]
  },
  {
    version: 'v0.5.0',
    date: '2026-11-26',
    title: 'Release Candidate Hardening: Snapshot Diff, Live Voice Tools & RC Diagnostics',
    highlights: [
      'Snapshot Diff Viewer (Unified/Split), Full Gemini Live 4-Tool Voice Control, and On-Device RC Diagnostics Suite.'
    ]
  },
  {
    version: 'v0.4.1',
    date: '2026-11-26',
    title: 'Claw3D-Style Interactive 3D Retro Virtual Office (Three.js)',
    highlights: [
      'Procedural Three.js 3D Isometric Office with touch orbit/zoom/pan, camera presets, and articulated 3D avatars.'
    ]
  },
  {
    version: 'v0.4.0',
    date: '2026-11-26',
    title: 'Conversational Onboarding Gate, Persistent Centered Dock & Local Save',
    highlights: [
      'Mandatory conversational onboarding, custom Model Picker, persistent centered-Home dock, and Agent Latency Inspector.'
    ]
  }
];
