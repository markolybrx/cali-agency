export interface PreCheckResult {
  passed: boolean;
  issues: string[];
}

export function runStaticPreCheck(
  files: Array<{ path: string; action: 'CREATE' | 'UPDATE' | 'DELETE'; content?: string }>
): PreCheckResult {
  const issues: string[] = [];

  for (const file of files) {
    if (file.action === 'DELETE' || typeof file.content !== 'string') continue;
    const p = file.path.toLowerCase();
    const content = file.content;

    // 1. Validate JSON / manifest files
    if (p.endsWith('.json') || p.endsWith('.webmanifest')) {
      try {
        const parsed = JSON.parse(content) as Record<string, unknown>;
        if (p.endsWith('.webmanifest') || p.endsWith('manifest.json')) {
          if (!parsed.name && !parsed.short_name) {
            issues.push(`${file.path}: missing required "name" or "short_name" field`);
          }
          if (!parsed.display) {
            issues.push(`${file.path}: missing "display" field (expected "standalone")`);
          }
        }
      } catch (err) {
        issues.push(`${file.path}: invalid JSON (${(err as Error).message})`);
      }
    }

    // 2. Ban native blocking browser dialogs in JS/HTML/TS
    if (p.endsWith('.js') || p.endsWith('.ts') || p.endsWith('.tsx') || p.endsWith('.html')) {
      if (/\b(alert|confirm|prompt)\s*\(/.test(content)) {
        issues.push(`${file.path}: contains forbidden blocking dialog (alert/confirm/prompt)`);
      }
    }

    // 3. Basic JS syntax check for plain .js files
    if (p.endsWith('.js') && !content.includes('import ') && !content.includes('export ')) {
      try {
        // eslint-disable-next-line no-new-func
        new Function(content);
      } catch (err) {
        issues.push(`${file.path}: JavaScript syntax error (${(err as Error).message})`);
      }
    }

    // 4. HTML sanity check
    if (p.endsWith('.html')) {
      if (!content.toLowerCase().includes('</html>') && content.toLowerCase().includes('<html')) {
        issues.push(`${file.path}: unclosed <html> tag (possible truncation)`);
      }
    }
  }

  return { passed: issues.length === 0, issues };
}
