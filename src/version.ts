export const APP_VERSION = '0.4.0';
export const APP_VERSION_TAG = `v${APP_VERSION}`;
export const APP_VERSION_CODE = 400;

export interface ChangelogRelease {
  version: string;
  date: string;
  title: string;
  highlights: string[];
}

export const CHANGELOG: ChangelogRelease[] = [
  {
    version: 'v0.4.0',
    date: '2026-11-26',
    title: 'Conversational Onboarding Gate, Persistent Centered Dock, Local Save & Inspector',
    highlights: [
      'Mandatory full-screen conversational Onboarding interview before accessing the dashboard, with accurate 0/4 progress that only fills as topics are answered.',
      'Replaced all native OS <select> popups with a 100% custom-coded searchable Monolith Model Picker modal.',
      'Enlarged floating bottom menu bar kept persistently visible on every screen, with Home centered as default and close (✕) buttons removed from primary menu views.',
      'Native Local Save via @capacitor/filesystem (Documents/CaliAgency/) with seamless browser fallback for .zip workspaces and backups.',
      'Full Local State Backup & Restore (.cali-backup.json) protecting projects, memories, and prompts across APK updates.',
      'Chat-to-Blueprint Live Card: inspect, edit, and launch Cali-drafted blueprints directly from Chat.',
      'Built-in SVG App Icon & manifest.webmanifest generator inside Workspace.',
      'Per-Agent Latency & Token Inspector when tapping any sprite in the 16-bit Pixel Office.'
    ]
  },
  {
    version: 'v0.3.0',
    date: '2026-11-26',
    title: 'UX Overhaul, AQ. Key & Model Selector, + Autonomous Loop Engine',
    highlights: [
      'Floating bottom thumb menu bar + clickable version Changelog drawer.',
      'Native AQ.xxxx Gemini API key authentication + auto-detected available model dropdown per key.',
      'Explicit Save Settings button, Prompt Studio read-only list view, and red Danger Zone confirmation modals.',
      'Zero-API Static Pre-Check Gate, Phase Snapshots & Rollback, Rolling Context Compactor, and Wake-Lock/Local Notifications.'
    ]
  },
  {
    version: 'v0.2.0',
    date: '2026-11-26',
    title: 'Cali Monolith HQ & 16-Bit Pixel Office',
    highlights: [
      '16-bit pixel-art Virtual Office with walking, typing, and blinking chibi agents + packet handoffs.',
      '100% verbatim 13-agent + Cali prompts bundled offline and real Token/RPM/RPD/Context telemetry.'
    ]
  },
  {
    version: 'v0.1.0',
    date: '2026-11-26',
    title: 'Initial Android APK & 5-Key Agency Scaffold',
    highlights: [
      'Capacitor Android project with automated GitHub Actions debug APK build and 5-key pool.'
    ]
  }
];
