import type { ProjectState } from '../types/agency';

export function buildCompactProjectContext(project: ProjectState, targetFiles: string[]): {
  target_contents: Record<string, string>;
  symbol_index: Record<string, string[]>;
  recent_handoffs: string[];
} {
  const target_contents: Record<string, string> = {};
  const symbol_index: Record<string, string[]> = {};
  const targetSet = new Set(targetFiles);

  for (const [path, content] of Object.entries(project.files)) {
    if (targetSet.has(path)) {
      target_contents[path] = content;
    } else {
      symbol_index[path] = extractSymbols(path, content);
    }
  }

  const allHandoffs: string[] = [];
  for (const phase of project.phases) {
    for (const t of phase.tasks) {
      if (t.handoff_notes && t.handoff_notes.length > 0) {
        allHandoffs.push(`${t.task_id}: ${t.handoff_notes.join('; ')}`);
      }
    }
  }

  return {
    target_contents,
    symbol_index,
    recent_handoffs: allHandoffs.slice(-6)
  };
}

function extractSymbols(path: string, content: string): string[] {
  const syms: string[] = [];
  const lower = path.toLowerCase();

  if (lower.endsWith('.js') || lower.endsWith('.ts') || lower.endsWith('.tsx')) {
    const matches = content.matchAll(/(?:export\s+)?(?:async\s+)?(?:function|const|class|interface|type)\s+([A-Za-z0-9_]+)/g);
    for (const m of matches) {
      if (m[1] && syms.length < 12) syms.push(m[1]);
    }
  } else if (lower.endsWith('.css')) {
    const vars = content.matchAll(/(--[a-zA-Z0-9-_]+)\s*:/g);
    for (const m of vars) {
      if (m[1] && syms.length < 12) syms.push(m[1]);
    }
  } else if (lower.endsWith('.html')) {
    const ids = content.matchAll(/id=["']([^"']+)["']/g);
    for (const m of ids) {
      if (m[1] && syms.length < 12) syms.push(`#${m[1]}`);
    }
  }
  return syms;
}
