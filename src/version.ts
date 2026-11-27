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
    title: '24-Person Autonomous Software Company, 8-Room Office, Editorial Reports & Blast Alerts',
    highlights: [
      'New Entry Flow: Login Gate (Google Sign-In or Offline Local Save) -> Onboarding -> Project Selection Hub -> Scoped Dashboard.',
      'Realistic 4-Tier 24-Person Org Hierarchy (CEO -> COO -> 4 Directors -> 4 Team Leads -> 15 Specialists) with deep 7-part agency-agents prompts.',
      '4-Gate Elaborated Project Planning (Text + Voice), Employee Suggestion Board (full escalation chain), and 1-on-1 Coaching Pods / Squad Huddles.',
      'Among Us-style Emergency & Boardroom Blast Alert (callable by CEO or automatically by Cali on critical bugs) with hard production pause & auto-resume.',
      'Expanded 8-Room 3D & 16-Bit Office preserving existing art while adding Red Emergency Button, Coaching Pod, Suggestion Wall, Pantry, Arcade, and Zen Room.',
      'IndexedDB + Live Local Folder Sync, atomic Phase 1 -> Phase 2 fix, grey-out Chat CTAs, Editorial Reports Hub, Canvas Viewer, and Original Monolith Dark/Light Mode.'
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
