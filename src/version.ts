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
    title: 'Parts A & B: 24-Person Company, Deep Prompts, 4-Gate Planning, Suggestions & Coaching',
    highlights: [
      'Part B: Realistic 4-Tier 24-Person Company Org Hierarchy (CEO -> COO -> 4 Directors -> 4 Team Leads -> 15 Specialists) with interactive Org Chart.',
      'Part B: Rebuilt all 24 staff prompts to deep 7-part agency-agents standard (Identity, Mission, Guardrails, Deliverables, Escalation, Handoffs, Strict JSON).',
      'Part B: 4-Gate Elaborated Project Planning in Chat & Voice (Vision -> MVP & Pushback -> Architecture & UI Taste -> Full Blueprint Canvas).',
      'Part B: Employee Suggestion Board (Specialist -> Team Lead -> Director -> Cali -> CEO escalation with grey-out CTAs) and 1-on-1 Coaching / Squad Huddle Engine.',
      'Part A: Login Gate -> Onboarding -> Project Selection Hub -> Scoped Dashboard, IndexedDB + Live Local Folder Sync, Editorial Reports Hub, and Original Monolith Dark/Light Mode.'
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
