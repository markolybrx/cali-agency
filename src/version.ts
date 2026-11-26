export const APP_VERSION = '0.5.0';
export const APP_VERSION_TAG = `v${APP_VERSION}`;
export const APP_VERSION_CODE = 500;

export interface ChangelogRelease {
  version: string;
  date: string;
  title: string;
  highlights: string[];
}

export const CHANGELOG: ChangelogRelease[] = [
  {
    version: 'v0.5.0',
    date: '2026-11-26',
    title: 'Release Candidate Hardening: Snapshot Diff, Live Voice Tools & RC Diagnostics',
    highlights: [
      'Snapshot Diff Viewer in Workspace: compare any saved Phase Snapshot against current files with Added/Removed/Modified file badges and Unified or Split line-by-line diffs.',
      'Full Gemini Live Voice Tool-Calling: Cali can now execute get_agency_status, get_agent_report, control_loop (pause/resume), and resolve_approval while speaking, with live tool execution chips in the Voice Overlay.',
      'RC Diagnostics & Stress-Test Suite inside Telemetry: 1-tap verification of Static Pre-Check Gate, Rolling Context Compactor, 5-Key Pool Isolation, and Local Backup round-trip.',
      'Optional persistent debug.keystore support in GitHub Actions CI for seamless in-place APK upgrades.'
    ]
  },
  {
    version: 'v0.4.1',
    date: '2026-11-26',
    title: 'Claw3D-Style Interactive 3D Retro Virtual Office (Three.js)',
    highlights: [
      'Procedural Three.js 3D Isometric Office with orbit/pinch-zoom/pan, camera presets (Iso 3D, Top, Cali Suite, Follow), articulated 3D walking/typing avatars, and 3D/2D/Grid switcher.'
    ]
  },
  {
    version: 'v0.4.0',
    date: '2026-11-26',
    title: 'Conversational Onboarding Gate, Persistent Centered Dock, Local Save & Inspector',
    highlights: [
      'Mandatory full-screen conversational Onboarding interview with accurate 0/4 progress.',
      'Custom-coded searchable Model Picker, persistent enlarged centered-Home dock, Native Local Save, Full Backup/Restore, Chat-to-Blueprint Live Card, SVG PWA Icons, and Agent Latency Inspector.'
    ]
  },
  {
    version: 'v0.3.0',
    date: '2026-11-26',
    title: 'UX Overhaul, AQ. Key & Model Selector, + Autonomous Loop Engine',
    highlights: [
      'Native AQ.xxxx key auth, per-key model auto-detection, Prompt Studio read-only lock, Danger Zone modals, Static Pre-Check Gate, Phase Snapshots, and Rolling Context Compactor.'
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
