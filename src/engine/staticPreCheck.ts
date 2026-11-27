export interface PreCheckFile {
  path: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  content?: string;
}

export interface PreCheckResult {
  passed: boolean;
  issues: string[];
}

const STUB_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\/\/\s*\.\.\.\s*(rest|remaining|more|existing)/i, label: 'Contains truncation placeholder comment' },
  { re: /\/\*\s*TODO\b|\/\/\s*TODO\b/i, label: 'Contains unfinished TODO placeholder' },
  { re: /Application\s*\/?\s*Database\s+Initialized/i, label: 'Barebones "Database Initialized" stub screen detected' },
  { re: /Lorem\s+ipsum/i, label: 'Contains Lorem ipsum placeholder text' },
  { re: />\s*Coming\s+Soon\s*</i, label: 'Contains "Coming Soon" stub element' }
];

export function runStaticPreCheck(files: PreCheckFile[]): PreCheckResult {
  const issues: string[] = [];

  for (const f of files) {
    if (f.action === 'DELETE') continue;
    const content = typeof f.content === 'string' ? f.content : '';
    const lower = f.path.toLowerCase();

    if (!content.trim()) {
      issues.push(`${f.path}: File content is completely empty.`);
      continue;
    }

    // 1. Strict JSON validation
    if (lower.endsWith('.json') || lower.endsWith('.webmanifest')) {
      try {
        JSON.parse(content);
      } catch (err) {
        issues.push(`${f.path}: Invalid JSON (${(err as Error).message}).`);
      }
      continue;
    }

    // 2. Native OS popup ban
    if (/\.(js|ts|tsx|jsx|html)$/.test(lower)) {
      if (/\b(alert|confirm|prompt)\s*\(/.test(content)) {
        issues.push(`${f.path}: Uses forbidden native alert()/confirm()/prompt() dialog.`);
      }
    }

    // 3. Anti-Stub Placeholder Scan
    for (const pat of STUB_PATTERNS) {
      if (pat.re.test(content)) {
        issues.push(`${f.path}: ${pat.label}. Build complete, real functionality from blueprint_md.`);
      }
    }

    // 4. HTML Completeness & Interactive UI Gate (Prevents blank/2-line apps)
    if (lower.endsWith('.html')) {
      if (!content.includes('</html>') || !content.includes('</body>')) {
        issues.push(`${f.path}: Truncated HTML — missing closing </body> or </html> tag.`);
      }
      const nonEmptyLines = content.split('\n').filter((l) => l.trim().length > 0).length;
      const hasInteractiveUi = /<(button|input|form|nav|section|main|canvas|table)/i.test(content);
      if (lower.endsWith('index.html') && (nonEmptyLines < 22 || !hasInteractiveUi)) {
        issues.push(
          `${f.path}: Barebones HTML stub (${nonEmptyLines} lines). index.html must implement a complete, styled, interactive UI matching the blueprint.`
        );
      }
    }

    // 5. JS/TS Basic Brace & Stub Check
    if (/\.(js|ts|tsx|jsx)$/.test(lower) && !lower.includes('config')) {
      const nonEmpty = content.split('\n').filter((l) => l.trim().length > 0).length;
      if (nonEmpty < 6) {
        issues.push(`${f.path}: Stub module (${nonEmpty} lines). Implement real logic.`);
      }
    }
  }

  return { passed: issues.length === 0, issues };
}
