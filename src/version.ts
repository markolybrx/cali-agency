export const APP_VERSION = '0.9.0';
export const APP_VERSION_TAG = `v${APP_VERSION}`;
export const APP_VERSION_CODE = 900;

export interface ChangelogRelease {
  version: string;
  date: string;
  title: string;
  highlights: string[];
}

export const CHANGELOG: ChangelogRelease[] = [
  {
    version: 'v0.9.0',
    date: '2026-11-27',
    title: 'Encrypted Vault, Code Quality Overhaul, Agent Brains, Web Study & 28 On-Demand Contractors',
    highlights: [
      'Part C: Consolidated 282 overlapping roles into 28 On-Demand Visiting Contractors across 8 divisions—each with a distinct, deep agency-agents-grade domain prompt (zero generic templates).',
      'Part C: Added Visiting Contractor Marketplace with division filters, Full-Canvas prompt inspection, per-project summoning, and Cali auto-recommendations during 4-Gate planning.',
      'Part C: Added compile-specialists.mjs Termux importer to compile your local agency-agents-main repo directly into public/specialists-catalog.json.',
      'Part B: Individual Agent Brains (IndexedDB + Encrypted Vault) & Off-Hours Idle Web Study powered by Gemini Google Search Grounding.',
      'Part A: Local-First AES-256-GCM Encrypted Vault (cali-vault.enc.json), full blueprint_md injection, Anti-Stub Pre-Check Gate, and Per-Role Model Routing.'
    ]
  },
  {
    version: 'v0.8.2',
    date: '2026-11-27',
    title: 'Full 24-Staff 3D & 16-Bit Office + Roster Copy Sync',
    highlights: [
      'All 24 staff members spawned in 3D/16-Bit Office and legacy 13-agent copy removed.'
    ]
  },
  {
    version: 'v0.8.1',
    date: '2026-11-27',
    title: 'Live Preview ServiceWorker & Storage Sandbox Fix',
    highlights: [
      'Fixed ServiceWorker SecurityError inside Workspace Live Preview iframes.'
    ]
  },
  {
    version: 'v0.8.0',
    date: '2026-11-27',
    title: '24-Person Autonomous Software Company, 8-Room Office, Editorial Reports & Blast Alerts',
    highlights: [
      'Login -> Project Hub -> Scoped Dashboard, IndexedDB + Local Sync, Editorial Reports, 8-Room Office, and Emergency Blast Alerts.'
    ]
  }
];
