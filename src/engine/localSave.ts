import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import JSZip from 'jszip';
import type { MemoryItem, ProjectState, PromptEntry, StorageDirectoryConfig, StorageRootId, UserProfile } from '../types/agency';
import { APP_VERSION } from '../version';

const STORAGE_DIR_KEY = 'cali_storage_dir_v060';

export function loadStorageConfig(): StorageDirectoryConfig {
  try {
    const raw = localStorage.getItem(STORAGE_DIR_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StorageDirectoryConfig>;
      return {
        root: parsed.root || 'DOCUMENTS',
        baseFolder: (parsed.baseFolder || 'CaliAgency').replace(/^\/+|\/+$/g, '') || 'CaliAgency',
        configured: Boolean(parsed.configured)
      };
    }
  } catch {
    // ignore
  }
  return { root: 'DOCUMENTS', baseFolder: 'CaliAgency', configured: false };
}

export function saveStorageConfig(cfg: StorageDirectoryConfig): StorageDirectoryConfig {
  const clean: StorageDirectoryConfig = {
    root: cfg.root,
    baseFolder: cfg.baseFolder.trim().replace(/^\/+|\/+$/g, '') || 'CaliAgency',
    configured: true
  };
  localStorage.setItem(STORAGE_DIR_KEY, JSON.stringify(clean));
  return clean;
}

function mapRootDir(root: StorageRootId): Directory {
  if (root === 'EXTERNAL') return Directory.ExternalStorage;
  if (root === 'DATA') return Directory.Data;
  return Directory.Documents;
}

export function getRootDisplayPrefix(root: StorageRootId): string {
  if (root === 'EXTERNAL') return '/storage/emulated/0';
  if (root === 'DATA') return 'AppData';
  return 'Documents';
}

export function slugifyProject(name: string): string {
  return (name || 'agency-project').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '') || 'agency-project';
}

export function getProjectLocalPath(projectName: string, cfg = loadStorageConfig()): string {
  return `${getRootDisplayPrefix(cfg.root)}/${cfg.baseFolder}/Projects/${slugifyProject(projectName)}`;
}

export function getDirectoryTreeSummary(cfg = loadStorageConfig()): { projects: string; cache: string; backups: string } {
  const prefix = `${getRootDisplayPrefix(cfg.root)}/${cfg.baseFolder}`;
  return {
    projects: `${prefix}/Projects`,
    cache: `${prefix}/Cache`,
    backups: `${prefix}/Backups`
  };
}

function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function initializeDirectoryTree(cfg: StorageDirectoryConfig): Promise<string> {
  const dir = mapRootDir(cfg.root);
  const subdirs = [`${cfg.baseFolder}/Projects`, `${cfg.baseFolder}/Cache`, `${cfg.baseFolder}/Backups`];
  try {
    for (const p of subdirs) {
      await Filesystem.mkdir({ path: p, directory: dir, recursive: true }).catch(() => {});
    }
    return `Directory ready: ${getRootDisplayPrefix(cfg.root)}/${cfg.baseFolder}`;
  } catch {
    return `Configured path: ${getRootDisplayPrefix(cfg.root)}/${cfg.baseFolder} (Web browser download mode)`;
  }
}

export async function saveTextLocally(
  filename: string,
  text: string,
  subfolder: 'Backups' | 'Cache' | 'Projects' = 'Backups',
  mime = 'application/json'
): Promise<string> {
  const cfg = loadStorageConfig();
  const relPath = `${cfg.baseFolder}/${subfolder}/${filename}`;
  try {
    await Filesystem.writeFile({
      path: relPath,
      data: text,
      directory: mapRootDir(cfg.root),
      encoding: Encoding.UTF8,
      recursive: true
    });
    return `Saved to ${getRootDisplayPrefix(cfg.root)}/${relPath}`;
  } catch {
    triggerBrowserDownload(new Blob([text], { type: mime }), filename);
    return `Downloaded ${filename}`;
  }
}

export async function syncProjectFolderLocally(project: ProjectState): Promise<string> {
  const cfg = loadStorageConfig();
  const slug = slugifyProject(project.project_name);
  const base = `${cfg.baseFolder}/Projects/${slug}`;
  const dir = mapRootDir(cfg.root);
  const allFiles: Record<string, string> = {
    'project-blueprint.md': project.blueprint_md || '# Project Blueprint',
    'project_state.json': JSON.stringify({ ...project, files: undefined, snapshots: undefined }, null, 2),
    ...project.files
  };

  try {
    let written = 0;
    for (const [rel, content] of Object.entries(allFiles)) {
      const cleanRel = rel.replace(/^\/+/, '');
      await Filesystem.writeFile({
        path: `${base}/${cleanRel}`,
        data: content,
        directory: dir,
        encoding: Encoding.UTF8,
        recursive: true
      });
      written += 1;
    }
    return `Synced ${written} files to ${getRootDisplayPrefix(cfg.root)}/${base}`;
  } catch {
    // Fallback on browser: save as ZIP
    return saveZipLocally(project);
  }
}

export async function saveZipLocally(project: ProjectState): Promise<string> {
  const cfg = loadStorageConfig();
  const zip = new JSZip();
  const slug = slugifyProject(project.project_name);
  const root = zip.folder(slug)!;
  root.file('project-blueprint.md', project.blueprint_md || '# Blueprint');
  root.file('project_state.json', JSON.stringify({ ...project, files: undefined, snapshots: undefined }, null, 2));
  for (const [filePath, content] of Object.entries(project.files)) {
    root.file(filePath.replace(/^\/+/, ''), content);
  }
  const filename = `${slug}.zip`;
  const relPath = `${cfg.baseFolder}/Projects/${filename}`;

  try {
    const base64 = await zip.generateAsync({ type: 'base64' });
    await Filesystem.writeFile({
      path: relPath,
      data: base64,
      directory: mapRootDir(cfg.root),
      recursive: true
    });
    return `Saved to ${getRootDisplayPrefix(cfg.root)}/${relPath}`;
  } catch {
    const blob = await zip.generateAsync({ type: 'blob' });
    triggerBrowserDownload(blob, filename);
    return `Downloaded ${filename}`;
  }
}

export interface FullAgencyBackup {
  backup_version: string;
  exported_at: string;
  storage_config?: StorageDirectoryConfig;
  profile: UserProfile;
  memories: MemoryItem[];
  projects: ProjectState[];
  prompts: PromptEntry[];
}

export async function exportFullStateBackup(data: Omit<FullAgencyBackup, 'backup_version' | 'exported_at'>): Promise<string> {
  const cfg = loadStorageConfig();
  const payload: FullAgencyBackup = {
    backup_version: APP_VERSION,
    exported_at: new Date().toISOString(),
    storage_config: cfg,
    ...data
  };
  const stamp = new Date().toISOString().slice(0, 10);
  // Also write a lightweight cache copy
  await saveTextLocally('cali-memory-cache.json', JSON.stringify({ profile: data.profile, memories: data.memories }, null, 2), 'Cache').catch(() => {});
  return saveTextLocally(`cali-agency-backup-${stamp}.json`, JSON.stringify(payload, null, 2), 'Backups');
}

export function parseFullStateBackup(rawJson: string): FullAgencyBackup {
  const parsed = JSON.parse(rawJson) as Partial<FullAgencyBackup>;
  if (!parsed || !Array.isArray(parsed.projects) || !Array.isArray(parsed.memories)) {
    throw new Error('Invalid Cali Agency backup file format.');
  }
  return parsed as FullAgencyBackup;
}

export function generatePwaIconsAndManifest(projectName: string, themeHex = '#6C4CD1'): Record<string, string> {
  const cleanName = projectName.trim() || 'Agency PWA';
  const initials = cleanName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('') || 'CA';

  const makeSvg = (size: number) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.22)}" fill="#121215"/>
  <rect x="${Math.round(size * 0.08)}" y="${Math.round(size * 0.08)}" width="${Math.round(size * 0.84)}" height="${Math.round(size * 0.84)}" rx="${Math.round(size * 0.18)}" fill="${themeHex}"/>
  <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#FFFFFF" font-family="Poppins, system-ui, sans-serif" font-weight="700" font-size="${Math.round(size * 0.38)}">${initials}</text>
</svg>`;

  const manifest = {
    name: cleanName,
    short_name: cleanName.slice(0, 12),
    start_url: './index.html',
    display: 'standalone',
    background_color: '#121215',
    theme_color: themeHex,
    icons: [
      { src: './icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any maskable' },
      { src: './icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' }
    ]
  };

  return {
    'icons/icon-192.svg': makeSvg(192),
    'icons/icon-512.svg': makeSvg(512),
    'manifest.webmanifest': JSON.stringify(manifest, null, 2)
  };
}

export function generateAndroidApkScaffold(projectName: string): Record<string, string> {
  const slug = slugifyProject(projectName);
  const appId = `app.cali.${slug.replace(/[^a-z0-9]/g, '') || 'generated'}`;
  return {
    'capacitor.config.ts': `import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: '${appId}',
  appName: '${projectName.replace(/'/g, '')}',
  webDir: 'dist',
  server: { androidScheme: 'https' }
};

export default config;
`,
    '.github/workflows/main.yml': `name: Build Android APK

on:
  push:
    branches: [main, master]
  workflow_dispatch:

jobs:
  build-android-apk:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - uses: actions/setup-java@v5
        with: { distribution: 'temurin', java-version: '17' }
      - name: Accept Android SDK Licenses
        run: yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --licenses > /dev/null 2>&1 || true
      - run: npm install
      - run: npm run build
      - name: Add & Sync Capacitor Android
        run: |
          if [ ! -d "android" ]; then npx cap add android; fi
          npx cap sync android
      - name: Build Debug APK
        working-directory: android
        run: chmod +x gradlew && ./gradlew assembleDebug
      - uses: actions/upload-artifact@v4
        with:
          name: ${slug}-debug-apk
          path: android/app/build/outputs/apk/debug/app-debug.apk
`
  };
}
