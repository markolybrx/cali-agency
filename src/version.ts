export const APP_VERSION = '0.4.1';
export const APP_VERSION_TAG = `v${APP_VERSION}`;
export const APP_VERSION_CODE = 401;

export interface ChangelogRelease {
  version: string;
  date: string;
  title: string;
  highlights: string[];
}

export const CHANGELOG: ChangelogRelease[] = [
  {
    version: 'v0.4.1',
    date: '2026-11-26',
    title: 'Claw3D-Style Interactive 3D Retro Virtual Office (Three.js)',
    highlights: [
      'Full interactive 3D Isometric Virtual Office built with procedural Three.js geometry (inspired by MIT-licensed Claw3D).',
      'Touch Orbit, Pinch-to-Zoom, and Pan controls plus quick camera presets (Isometric, Top-Down, Cali Suite, Follow Agent).',
      'Detailed 3D rooms: Cali Glass Executive Suite, 3×3 Wooden Workstations with glowing monitors, Conference Table, blinking Server/QA Racks, Kitchenette, and red-sofa Break Lounge.',
      '14 articulated 3D avatars with swinging walking limbs, typing arms, floating projected nameplates, live speech bubbles, and glowing 3D handoff packets.',
      'Instant 3D / 2D / Grid switcher in the Office header with zero GPU drain when on other tabs.'
    ]
  },
  {
    version: 'v0.4.0',
    date: '2026-11-26',
    title: 'Conversational Onboarding Gate, Persistent Centered Dock, Local Save & Inspector',
    highlights: [
      'Mandatory full-screen conversational Onboarding interview before accessing the dashboard, with accurate 0/4 progress.',
      'Replaced native OS <select> popups with a custom-coded searchable Monolith Model Picker modal.',
      'Enlarged floating bottom menu bar persistently visible with Home centered and close buttons removed from primary views.',
      'Native Local Save (@capacitor/filesystem), Full Backup/Restore, Chat-to-Blueprint Live Card, SVG PWA Icons, and Agent Latency/Token Inspector.'
    ]
  },
  {
    version: 'v0.3.0',
    date: '2026-11-26',
    title: 'UX Overhaul, AQ. Key & Model Selector, + Autonomous Loop Engine',
    highlights: [
      'Native AQ.xxxx Gemini API key auth + per-key model auto-detection, Prompt Studio read-only lock, and red Danger Zone modals.',
      'Zero-API Static Pre-Check Gate, Phase Snapshots & Rollback, Rolling Context Compactor, and Wake-Lock/Local Notifications.'
    ]
  },
  {
    version: 'v0.2.0',
    date: '2026-11-26',
    title: 'Cali Monolith HQ & 16-Bit Pixel Office',
    highlights: [
      'Verbatim 13-agent + Cali prompts bundled offline and real Token/RPM/RPD/Context telemetry.'
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
