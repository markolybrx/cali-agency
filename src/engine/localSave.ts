import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import JSZip from 'jszip';
import type { AgencyReport, MemoryItem, ProjectState, PromptEntry, UserProfile } from '../types/agency';
import { APP_VERSION } from '../version';

const DIR_PREF_KEY = 'cali_agency_local_folder_v1';

export function getLocalSaveFolder(): string {
  const saved = localStorage.getItem(DIR_PREF_KEY);
  const clean = (saved || 'CaliAgency').replace(/^\/+|\/+$/g, '');
  return clean || 'CaliAgency';
}

export function setLocalSaveFolder(folder: string): string {
  const clean = folder.trim().replace(/^\/+|\/+$/g, '') || 'CaliAgency';
  localStorage.setItem(DIR_PREF_KEY, clean);
  return clean;
}

export function slugifyProjectName(name: string): string {
  return (name || 'agency-project').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'agency-project';
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

export async function saveTextLocally(filename: string, text: string, mime = 'application/json'): Promise<string> {
  const baseFolder = getLocalSaveFolder();
  const fullRelPath = `${baseFolder}/${filename.replace(/^\/+/, '')}`;
  try {
    await Filesystem.writeFile({
      path: fullRelPath,
      data: text,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
      recursive: true
    });
    return `Saved to Documents/${fullRelPath}`;
  } catch {
    triggerBrowserDownload(new Blob([text], { type: mime }), filename.split('/').pop() || filename);
    return `Downloaded ${filename.split('/').pop() || filename}`;
  }
}

/**
 * Live Write-Through: writes an individual generated artifact directly to
 * Documents/<chosenFolder>/<project-slug>/<relPath> on Android.
 */
export async function writeProjectFileToLocalFolder(
  projectName: string,
  relPath: string,
  content: string
): Promise<{ ok: boolean; targetPath: string }> {
  const baseFolder = getLocalSaveFolder();
  const slug = slugifyProjectName(projectName);
  const cleanRel = relPath.replace(/^\/+/, '');
  const fullPath = `${baseFolder}/${slug}/${cleanRel}`;
  try {
    await Filesystem.writeFile({
      path: fullPath,
      data: content,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
      recursive: true
    });
    return { ok: true, targetPath: `Documents/${fullPath}` };
  } catch {
    return { ok: false, targetPath: `Documents/${fullPath}` };
  }
}

export async function writeReportToLocalFolder(
  projectName: string,
  report: AgencyReport
): Promise<{ ok: boolean; targetPath: string }> {
  const safeId = report.id.replace(/[^a-zA-Z0-9_-]/g, '');
  const md = `# ${report.title}\n\n- **Type:** ${report.badge}\n- **Author:** ${report.author}\n- **Date:** ${new Date(report.createdAt).toLocaleString()}\n\n${report.markdown}`;
  return writeProjectFileToLocalFolder(projectName, `reports/${safeId}.md`, md);
}

export async function syncAllProjectFilesToLocalFolder(
  project: ProjectState,
  reports: AgencyReport[] = []
): Promise<{ syncedFiles: number; syncedReports: number; folderPath: string; nativeOk: boolean }> {
  const baseFolder = getLocalSaveFolder();
  const slug = slugifyProjectName(project.project_name);
  const folderPath = `Documents/${baseFolder}/${slug}/`;
  let syncedFiles = 0;
  let syncedReports = 0;
  let nativeOk = false;

  const entries: Array<[string, string]> = [
    ['project-blueprint.md', project.blueprint_md || '# Project Blueprint'],
    ...Object.entries(project.files || {})
  ];

  for (const [p, content] of entries) {
    const res = await writeProjectFileToLocalFolder(project.project_name, p, content);
    if (res.ok) {
      nativeOk = true;
      syncedFiles += 1;
    }
  }

  for (const rep of reports) {
    const res = await writeReportToLocalFolder(project.project_name, rep);
    if (res.ok) {
      nativeOk = true;
      syncedReports += 1;
    }
  }

  return { syncedFiles, syncedReports, folderPath, nativeOk };
}

export async function saveZipLocally(project: ProjectState): Promise<string> {
  const zip = new JSZip();
  const folderName = slugifyProjectName(project.project_name);
  const root = zip.folder(folderName)!;
  root.file('project-blueprint.md', project.blueprint_md || '# Blueprint');
  root.file('project_state.json', JSON.stringify({ ...project, files: undefined, snapshots: undefined }, null, 2));
  for (const [filePath, content] of Object.entries(project.files)) {
    root.file(filePath.replace(/^\/+/, ''), content);
  }
  const filename = `${folderName}.zip`;
  const baseFolder = getLocalSaveFolder();

  try {
    const base64 = await zip.generateAsync({ type: 'base64' });
    await Filesystem.writeFile({
      path: `${baseFolder}/${filename}`,
      data: base64,
      directory: Directory.Documents,
      recursive: true
    });
    return `Saved to Documents/${baseFolder}/${filename}`;
  } catch {
    const blob = await zip.generateAsync({ type: 'blob' });
    triggerBrowserDownload(blob, filename);
    return `Downloaded ${filename}`;
  }
}

export interface FullAgencyBackup {
  backup_version: string;
  exported_at: string;
  profile: UserProfile;
  memories: MemoryItem[];
  projects: ProjectState[];
  prompts: PromptEntry[];
}

export async function exportFullStateBackup(data: Omit<FullAgencyBackup, 'backup_version' | 'exported_at'>): Promise<string> {
  const payload: FullAgencyBackup = {
    backup_version: APP_VERSION,
    exported_at: new Date().toISOString(),
    ...data
  };
  const stamp = new Date().toISOString().slice(0, 10);
  return saveTextLocally(`cali-agency-backup-${stamp}.json`, JSON.stringify(payload, null, 2));
}

export function parseFullStateBackup(rawJson: string): FullAgencyBackup {
  const parsed = JSON.parse(rawJson) as Partial<FullAgencyBackup>;
  if (!parsed || !Array.isArray(parsed.projects) || !Array.isArray(parsed.memories)) {
    throw new Error('Invalid Cali Agency backup file format.');
  }
  return parsed as FullAgencyBackup;
}

export function generatePwaIconsAndManifest(projectName: string, themeHex = '#8B5CF6'): Record<string, string> {
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
