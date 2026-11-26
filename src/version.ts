export const APP_VERSION = '0.3.0';
export const APP_VERSION_TAG = `v${APP_VERSION}`;
export const APP_VERSION_CODE = 300;

export interface ChangelogRelease {
  version: string;
  date: string;
  title: string;
  highlights: string[];
}

export const CHANGELOG: ChangelogRelease[] = [
  {
    version: 'v0.3.0',
    date: '2026-11-26',
    title: 'UX Overhaul, AQ. Key & Model Selector, + Autonomous Loop Engine',
    highlights: [
      'Floating bottom thumb menu bar replacing top header icon clutter + clickable version badge.',
      'Dedicated Changelog & Roadmap viewer with automated vx.y.z APK metadata sync in GitHub Actions.',
      'Native AQ.xxxx Gemini API key authentication (x-goog-api-key header) + auto-detected available model dropdown per key.',
      'Explicit Save Settings button (draft buffer prevents accidental overwrites).',
      'Prompt Studio redesigned as a vertical list view, read-only by default with an explicit Edit button.',
      'All Danger Zone actions (Reset Prompts, Delete Project, Forget Memory, Wipe Vault) highlighted red with confirmation modals.',
      'Taller dashboard Virtual Office preview (240px+) and removal of mock starter project plans.',
      'Tap-to-Speak / Mute microphone toggle inside Gemini Live voice mode.',
      'Zero-API Static Pre-Check Gate (JSON/HTML/JS/dialog validator before Code Reviewer).',
      'Phase Snapshot & 1-Tap Rollback in Workspace.',
      'Rolling Context Compactor (symbol extraction to prevent MAX_TOKENS bloat).',
      'Android Local Notifications + Screen Wake-Lock while production runs.'
    ]
  },
  {
    version: 'v0.2.0',
    date: '2026-11-26',
    title: 'Cali Monolith HQ & 16-Bit Pixel Office',
    highlights: [
      '16-bit pixel-art Virtual Office with walking, typing, and blinking chibi agents + packet handoffs.',
      '100% verbatim 13-agent + Cali prompts bundled offline.',
      'Real Token, Rolling 60s RPM, Daily RPD, and 1M Context Window telemetry.',
      'Full Monolith, Nocturne, and Alabaster themes across all drawers.',
      'In-app Live PWA Previewer with console hook to 09. Debugger and 1-tap GitHub Ship.'
    ]
  },
  {
    version: 'v0.1.0',
    date: '2026-11-26',
    title: 'Initial Android APK & 5-Key Agency Scaffold',
    highlights: [
      'Capacitor Android project with automated GitHub Actions debug APK build.',
      '5-key pool (KEY_CALI + K1-K4) with 60s 429 cooldown and recovery Watchdog.',
      'Cali 4-step Executive Onboarding and Gemini Live WebSocket client.'
    ]
  }
];
