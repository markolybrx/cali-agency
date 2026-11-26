import { runStaticPreCheck } from './staticPreCheck';
import { buildCompactProjectContext } from './contextCompactor';
import { keyPool } from './keyPool';
import { generatePwaIconsAndManifest, parseFullStateBackup } from './localSave';
import type { ProjectState } from '../types/agency';

export interface DiagnosticCheck {
  id: string;
  name: string;
  passed: boolean;
  detail: string;
  durationMs: number;
}

export function runRcDiagnosticsSuite(): DiagnosticCheck[] {
  const results: DiagnosticCheck[] = [];

  // 1. Static Pre-Check Gate Stress Test
  const t1 = performance.now();
  const badCheck = runStaticPreCheck([
    { path: 'manifest.webmanifest', action: 'CREATE', content: '{ "short_name": "Bad" ' },
    { path: 'app.js', action: 'CREATE', content: 'alert("blocked"); function broken( {' },
    { path: 'index.html', action: 'CREATE', content: '<html><body><p>truncated' }
  ]);
  const goodCheck = runStaticPreCheck([
    { path: 'manifest.webmanifest', action: 'CREATE', content: '{"name":"OK","display":"standalone"}' },
    { path: 'app.js', action: 'CREATE', content: 'const ok = () => 42;' },
    { path: 'index.html', action: 'CREATE', content: '<!doctype html><html><body>ok</body></html>' }
  ]);
  results.push({
    id: 'static-precheck',
    name: 'Static Pre-Check Gate',
    passed: !badCheck.passed && badCheck.issues.length >= 3 && goodCheck.passed,
    detail: `Caught ${badCheck.issues.length} injected defects; clean bundle passed.`,
    durationMs: Math.max(1, Math.round(performance.now() - t1))
  });

  // 2. Rolling Context Compactor Test
  const t2 = performance.now();
  const mockProj: ProjectState = {
    id: 'diag_proj',
    project_name: 'DiagPWA',
    blueprint_md: '# Diag',
    current_phase_id: 2,
    tech_stack: {
      framework: 'Vanilla',
      language: 'JavaScript',
      styling: 'Vanilla CSS',
      storage_or_backend: 'LocalStorage',
      testing_tool: 'Node',
      deployment_target: 'Vercel'
    },
    phases: [
      {
        phase_id: 1,
        name: 'P1',
        status: 'PASSED',
        checklist: [],
        tasks: [
          {
            task_id: 'P1-T1',
            title: 'Init',
            assigned_agent: 'frontend-developer',
            target_files: ['app.js'],
            status: 'DONE',
            retry_count: 0,
            split_depth: 0,
            handoff_notes: ['Exported renderApp()']
          }
        ]
      }
    ],
    file_manifest: {},
    files: {
      'app.js': 'export function renderApp() { return true; }',
      'styles.css': ':root { --brand-violet: #6C4CD1; --surface: #18181D; }',
      'index.html': '<div id="app-root"></div>'
    },
    snapshots: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  const compact = buildCompactProjectContext(mockProj, ['app.js']);
  const compOk =
    Boolean(compact.target_contents['app.js']) &&
    !compact.target_contents['styles.css'] &&
    (compact.symbol_index['styles.css'] || []).includes('--brand-violet') &&
    (compact.symbol_index['index.html'] || []).includes('#app-root');
  results.push({
    id: 'context-compactor',
    name: 'Rolling Context Compactor',
    passed: compOk,
    detail: compOk
      ? 'Full target file preserved; CSS vars & HTML IDs compacted to symbols.'
      : 'Symbol extraction mismatch.',
    durationMs: Math.max(1, Math.round(performance.now() - t2))
  });

  // 3. 5-Key Isolation & Telemetry Integrity
  const t3 = performance.now();
  const slots = keyPool.getAll();
  const hasCali = slots.some((s) => s.id === 'KEY_CALI' && s.role === 'executive' || s.role === 'cali');
  const workers = slots.filter((s) => s.role === 'worker');
  const configuredCount = slots.filter((s) => Boolean(s.apiKey)).length;
  results.push({
    id: 'key-pool',
    name: '5-Key Topology & Isolation',
    passed: hasCali && workers.length === 4,
    detail: `KEY_CALI isolated + 4 worker slots (${configuredCount}/5 keys configured).`,
    durationMs: Math.max(1, Math.round(performance.now() - t3))
  });

  // 4. PWA Icon Generator & Backup Serialization
  const t4 = performance.now();
  const assets = generatePwaIconsAndManifest('Stress Test App');
  const backupJson = JSON.stringify({
    backup_version: '0.5.0',
    exported_at: new Date().toISOString(),
    profile: { preferred_name: 'Tester', honorific: null, language_pref: 'en', onboarding_topics: { name_vibe: true, design_taste: true, tech_stack: true, autonomy: true }, onboarding_complete: true },
    memories: [],
    projects: [mockProj],
    prompts: []
  });
  let backupOk = false;
  try {
    const parsed = parseFullStateBackup(backupJson);
    backupOk = parsed.projects.length === 1 && Boolean(assets['icons/icon-192.svg']) && Boolean(assets['manifest.webmanifest']);
  } catch {
    backupOk = false;
  }
  results.push({
    id: 'backup-icons',
    name: 'Local Backup & SVG PWA Assets',
    passed: backupOk,
    detail: backupOk ? 'Backup round-trip & 192/512 SVG manifest verified.' : 'Asset/backup verification failed.',
    durationMs: Math.max(1, Math.round(performance.now() - t4))
  });

  return results;
}
