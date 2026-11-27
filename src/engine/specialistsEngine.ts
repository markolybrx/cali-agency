import { CONSOLIDATED_CONTRACTORS, type VisitingContractor } from '../data/specialistsCatalog';
import type { ProjectState } from '../types/agency';

let runtimeCatalog: VisitingContractor[] = [...CONSOLIDATED_CONTRACTORS];
let catalogLoadedFromPublic = false;

/**
 * Loads optional public/specialists-catalog.json compiled from local agency-agents-main
 * and merges it cleanly over the 28 built-in deep contractor prompts.
 */
export async function hydrateSpecialistsCatalog(): Promise<VisitingContractor[]> {
  if (catalogLoadedFromPublic) return runtimeCatalog;
  catalogLoadedFromPublic = true;
  try {
    const res = await fetch('./specialists-catalog.json');
    if (!res.ok) return runtimeCatalog;
    const parsed = (await res.json()) as { contractors?: Partial<VisitingContractor>[] };
    if (!Array.isArray(parsed.contractors)) return runtimeCatalog;

    const byId = new Map<string, VisitingContractor>();
    for (const base of CONSOLIDATED_CONTRACTORS) byId.set(base.id, base);

    for (const item of parsed.contractors) {
      if (!item || !item.id) continue;
      const existing = byId.get(item.id);
      if (existing) {
        byId.set(item.id, {
          ...existing,
          systemPrompt: item.systemPrompt && item.systemPrompt.length > 120 ? item.systemPrompt : existing.systemPrompt,
          mergedFrom: Array.isArray(item.mergedFrom) && item.mergedFrom.length ? item.mergedFrom : existing.mergedFrom
        });
      } else if (item.name && item.title && item.systemPrompt) {
        byId.set(item.id, {
          id: item.id,
          name: item.name,
          title: item.title,
          division: item.division || 'Specialized Engineering',
          thinkingLevel: item.thinkingLevel || 'medium',
          shirt: item.shirt || '#8B5CF6',
          mergedFrom: Array.isArray(item.mergedFrom) ? item.mergedFrom : [],
          keywords: Array.isArray(item.keywords) ? item.keywords : [],
          summary: item.summary || item.title,
          studyTopics: Array.isArray(item.studyTopics) ? item.studyTopics : [],
          systemPrompt: item.systemPrompt
        });
      }
    }

    runtimeCatalog = Array.from(byId.values());
  } catch {
    // keep built-in 28 deep prompts
  }
  return runtimeCatalog;
}

export function getAllVisitingContractors(): VisitingContractor[] {
  return runtimeCatalog;
}

export function getVisitingContractorById(id: string): VisitingContractor | undefined {
  return runtimeCatalog.find((c) => c.id === id);
}

export function getSummonedContractorsForProject(project: ProjectState | null): VisitingContractor[] {
  if (!project || !Array.isArray(project.summoned_contractors)) return [];
  return project.summoned_contractors
    .map((id) => getVisitingContractorById(id))
    .filter((c): c is VisitingContractor => Boolean(c));
}

export function recommendContractorsForIdea(ideaText: string, limit = 3): VisitingContractor[] {
  const lower = ideaText.toLowerCase();
  const scored = runtimeCatalog
    .map((c) => {
      let score = 0;
      for (const kw of c.keywords) {
        if (lower.includes(kw.toLowerCase())) score += 2;
      }
      if (lower.includes(c.title.toLowerCase())) score += 3;
      return { contractor: c, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((x) => x.contractor);
}

export function getCompactContractorDirectoryForCali(): Array<{
  id: string;
  title: string;
  division: string;
  keywords: string[];
}> {
  return runtimeCatalog.map((c) => ({
    id: c.id,
    title: c.title,
    division: c.division,
    keywords: c.keywords.slice(0, 6)
  }));
}
