/**
 * GitHub Projects Service - Dev Intelligence Dashboard
 *
 * Fetches project health data across monmacllcapp repositories via GitHub REST API.
 * Aggregates branch status, open PRs, milestones, North Star, and latest session state.
 *
 * PRIVACY: Uses GitHub PAT from env var (VITE_GITHUB_PAT). If not set, makes unauthenticated
 * requests with rate limits.
 */

export const GITHUB_ORG = 'monmacllcapp';

export interface TrackedProject {
  repo: string;
  displayName: string;
  description: string;
}

export const TRACKED_PROJECTS: TrackedProject[] = [
  { repo: 'titan-trinity-core', displayName: 'Titan Trinity Core', description: 'Quantitative trading bot' },
  { repo: 'maple-docs', displayName: 'Maple Docs', description: 'PDF extraction pipeline' },
  { repo: 'maple-underwriter', displayName: 'Maple Underwriter', description: 'Real estate underwriting' },
  { repo: 'maple-360', displayName: 'Maple 360', description: 'Cloud storage + workflows' },
  { repo: 'maple-life-os', displayName: 'MAPLE Life OS', description: 'Life operating system' },
];

export interface BranchInfo {
  names: string[];
  count: number;
  isHealthy: boolean; // true if exactly 2 branches
}

export interface PRInfo {
  number: number;
  title: string;
  headRef: string;
  baseRef: string;
  mergeable: string; // 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN'
  author: string;
  updatedAt: string;
  url: string;
}

export interface MilestoneEntry {
  phase: string;
  name: string;
  status: string;
  stage?: ProjectStage;
}

export type ProjectStage = 'MVP' | 'V2' | 'V3' | 'V4';

export interface StageProgressInfo {
  stage: ProjectStage;
  completed: number;
  total: number;
  percent: number;
}

export type ShipGateStatus = 'building' | 'ship_it' | 'ship_and_build' | 'scope_creep';

export interface ShipGate {
  status: ShipGateStatus;
  currentStage: ProjectStage;
  stageProgress: StageProgressInfo[];
  alert?: string;
}

export interface CommitInfo {
  sha: string;
  message: string;
  date: string;
  author: string;
}

export interface SessionStatus {
  whatWasDone: string;
  currentState: string;
  nextStep: string;
  blockers: string;
}

export interface ProgressInfo {
  completed: number;
  total: number;
  percent: number; // 0-100
}

export interface ProjectStatus {
  repo: string;
  displayName: string;
  description: string;
  branches: BranchInfo;
  openPRs: PRInfo[];
  milestones: MilestoneEntry[];
  progress: ProgressInfo;
  stageProgress: StageProgressInfo[];
  shipGate: ShipGate | null;
  northStar: string | null;
  session: SessionStatus | null;
  latestCommit: CommitInfo | null;
  fetchedAt: Date;
  error: string | null;
}

/**
 * Get GitHub API headers with optional auth.
 * If VITE_GITHUB_PAT is set, includes Authorization header.
 */
function getHeaders(): HeadersInit {
  const headers: HeadersInit = {
    'Accept': 'application/vnd.github.v3+json',
  };

  const token = import.meta.env.VITE_GITHUB_PAT;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

/**
 * Fetch branches for a repo.
 * Healthy = exactly 2 branches (main + feature branch).
 */
export async function fetchBranches(repo: string): Promise<BranchInfo> {
  const url = `https://api.github.com/repos/${GITHUB_ORG}/${repo}/branches`;
  const response = await fetch(url, { headers: getHeaders() });

  if (!response.ok) {
    throw new Error(`Failed to fetch branches: ${response.statusText}`);
  }

  const branches = await response.json();
  const names = branches.map((b: { name: string }) => b.name);

  return {
    names,
    count: names.length,
    isHealthy: names.length === 2,
  };
}

/**
 * Fetch open PRs for a repo.
 */
export async function fetchOpenPRs(repo: string): Promise<PRInfo[]> {
  const url = `https://api.github.com/repos/${GITHUB_ORG}/${repo}/pulls?state=open`;
  const response = await fetch(url, { headers: getHeaders() });

  if (!response.ok) {
    throw new Error(`Failed to fetch PRs: ${response.statusText}`);
  }

  const prs = await response.json();

  return prs.map((pr: {
    number: number;
    title: string;
    head: { ref: string };
    base: { ref: string };
    mergeable_state?: string;
    user: { login: string };
    updated_at: string;
    html_url: string;
  }) => ({
    number: pr.number,
    title: pr.title,
    headRef: pr.head.ref,
    baseRef: pr.base.ref,
    mergeable: pr.mergeable_state?.toUpperCase() || 'UNKNOWN',
    author: pr.user.login,
    updatedAt: pr.updated_at,
    url: pr.html_url,
  }));
}

/**
 * Fetch file content from repo.
 * Returns null on 404 (file not found).
 */
export async function fetchFileContent(repo: string, path: string, ref = 'sandbox'): Promise<string | null> {
  const url = `https://api.github.com/repos/${GITHUB_ORG}/${repo}/contents/${path}?ref=${ref}`;
  const response = await fetch(url, { headers: getHeaders() });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch file ${path}: ${response.statusText}`);
  }

  const data = await response.json();

  if (!data.content) {
    return null;
  }

  // Decode base64 content (GitHub returns base64 with embedded newlines)
  return atob(data.content.replace(/\n/g, ''));
}

/**
 * Fetch latest commit for a repo.
 */
export async function fetchLatestCommit(repo: string): Promise<CommitInfo | null> {
  const url = `https://api.github.com/repos/${GITHUB_ORG}/${repo}/commits?sha=sandbox&per_page=1`;
  const response = await fetch(url, { headers: getHeaders() });

  if (!response.ok) {
    throw new Error(`Failed to fetch commits: ${response.statusText}`);
  }

  const commits = await response.json();

  if (commits.length === 0) {
    return null;
  }

  const commit = commits[0];

  return {
    sha: commit.sha,
    message: commit.commit.message,
    date: commit.commit.author.date,
    author: commit.commit.author.name,
  };
}

/**
 * Parse milestones from MILESTONES.md.
 * Handles two formats:
 * 1. Table: | Phase | Name | Status | ... or | Milestone | Status | Target | Description |
 * 2. Heading + checklist: ### Phase N: Name ✅/(Current)
 */
export function parseMilestoneTable(markdown: string): MilestoneEntry[] {
  const lines = markdown.split('\n');

  // Try table format first
  const tableEntries = parseTableFormat(lines);
  if (tableEntries.length > 0) return tableEntries;

  // Fall back to heading format
  return parseHeadingFormat(lines);
}

function parseTableFormat(lines: string[]): MilestoneEntry[] {
  const entries: MilestoneEntry[] = [];
  let inTable = false;
  let headerCols: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect any table header row (starts with | and contains at least 3 columns)
    if (!inTable && trimmed.startsWith('|') && !trimmed.startsWith('|---')) {
      const cols = trimmed.split('|').map(c => c.trim().toLowerCase()).filter(c => c);
      if (cols.length >= 3) {
        headerCols = cols;
        inTable = true;
        continue;
      }
    }

    if (trimmed.startsWith('|---')) continue;

    if (inTable && !trimmed.startsWith('|')) break;

    if (inTable && trimmed.startsWith('|')) {
      const cells = trimmed.split('|').map(c => c.trim()).filter(c => c);
      if (cells.length >= 2) {
        // Detect column mapping based on header
        const phaseIdx = headerCols.findIndex(h => h === 'phase' || h === 'milestone');
        const nameIdx = headerCols.findIndex(h => h === 'name' || h === 'description');
        const statusIdx = headerCols.findIndex(h => h === 'status');
        const stageIdx = headerCols.findIndex(h => h === 'stage');

        const phase = phaseIdx >= 0 ? cells[phaseIdx] || '' : cells[0] || '';
        const status = statusIdx >= 0 ? cells[statusIdx] || '' : cells[2] || '';
        const name = nameIdx >= 0 ? cells[nameIdx] || '' : cells[1] || '';

        // Clean status (remove emojis)
        const cleanStatus = status.replace(/[✅🚧⬜]/g, '').trim();

        const stageRaw = stageIdx >= 0 ? (cells[stageIdx] || '').trim().toUpperCase() : '';
        const stage = (['MVP', 'V2', 'V3', 'V4'].includes(stageRaw) ? stageRaw : undefined) as ProjectStage | undefined;

        entries.push({ phase, name, status: cleanStatus, stage });
      }
    }
  }
  return entries;
}

function parseHeadingFormat(lines: string[]): MilestoneEntry[] {
  const entries: MilestoneEntry[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Match: ### Phase N: Name ✅  or  ### Phase N: Name (Current)
    const match = trimmed.match(/^###\s+(.+?):\s+(.+?)(?:\s+(✅|\(Current\)))?$/);
    if (match) {
      const phase = match[1];
      const name = match[2].replace(/[✅🚧⬜]/g, '').trim();
      const indicator = match[3] || '';

      let status = 'PLANNED';
      if (indicator === '✅' || name.includes('✅')) status = 'COMPLETE';
      else if (indicator === '(Current)' || name.includes('(Current)')) {
        status = 'IN PROGRESS';
      }

      // Clean (Current) from name if it ended up there
      const cleanName = name.replace('(Current)', '').trim();

      entries.push({ phase, name: cleanName, status });
    }
  }
  return entries;
}

/**
 * Parse progress from MILESTONES.md by counting [x] vs [ ] checklist items.
 * Falls back to milestone phase status if no checklists found.
 */
export function parseProgress(markdown: string, milestones: MilestoneEntry[]): ProgressInfo {
  const checked = (markdown.match(/- \[x\]/gi) || []).length;
  const unchecked = (markdown.match(/- \[ \]/g) || []).length;
  const total = checked + unchecked;

  // If we found checklist items, use them
  if (total > 0) {
    return { completed: checked, total, percent: Math.round((checked / total) * 100) };
  }

  // Fall back to milestone phase status counts
  if (milestones.length > 0) {
    const done = milestones.filter(m => m.status === 'COMPLETE').length;
    return { completed: done, total: milestones.length, percent: Math.round((done / milestones.length) * 100) };
  }

  return { completed: 0, total: 0, percent: 0 };
}

/**
 * Parse per-stage progress from MILESTONES.md.
 * Uses Stage column from overview table when available, falls back to index-based mapping.
 */
export function parseStageProgress(markdown: string): StageProgressInfo[] {
  const lines = markdown.split('\n');

  // First, parse the overview table to get milestone → stage mapping
  const milestones = parseTableFormat(lines);
  const stageMap = new Map<string, ProjectStage>();

  for (let i = 0; i < milestones.length; i++) {
    const m = milestones[i];
    const phase = m.phase.trim();
    if (m.stage) {
      stageMap.set(phase, m.stage);
    } else {
      // Fallback: extract milestone number, M0-M5=MVP, M6-M7=V2, M8+=V3
      const match = phase.match(/M(\d+)/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num <= 5) stageMap.set(phase, 'MVP');
        else if (num <= 7) stageMap.set(phase, 'V2');
        else stageMap.set(phase, 'V3');
      }
    }
  }

  // Split markdown by ## headings to get per-milestone sections
  const stageCounts = new Map<ProjectStage, { completed: number; total: number }>();

  let currentPhase: string | null = null;
  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(M\d+)[\s:]/);
    if (headingMatch) {
      currentPhase = headingMatch[1];
      continue;
    }

    if (currentPhase) {
      const stage = stageMap.get(currentPhase);
      if (!stage) continue;

      if (!stageCounts.has(stage)) {
        stageCounts.set(stage, { completed: 0, total: 0 });
      }

      const counts = stageCounts.get(stage)!;

      if (/- \[x\]/i.test(line)) {
        counts.completed++;
        counts.total++;
      } else if (/- \[ \]/.test(line)) {
        counts.total++;
      }
    }
  }

  // Convert to array, sorted by stage order
  const stageOrder: ProjectStage[] = ['MVP', 'V2', 'V3', 'V4'];
  const result: StageProgressInfo[] = [];

  for (const stage of stageOrder) {
    const counts = stageCounts.get(stage);
    if (counts && counts.total > 0) {
      result.push({
        stage,
        completed: counts.completed,
        total: counts.total,
        percent: Math.round((counts.completed / counts.total) * 100),
      });
    }
  }

  return result;
}

/**
 * Compute ship-gate status from stage progress.
 * Detects scope creep (later-stage work before current stage complete)
 * and ship readiness (current stage 100%).
 */
export function computeShipGate(stages: StageProgressInfo[]): ShipGate {
  const validStages = stages.filter(s => s.total > 0);

  if (validStages.length === 0) {
    return { status: 'building', currentStage: 'MVP', stageProgress: stages };
  }

  // Find lowest incomplete stage
  const currentIdx = validStages.findIndex(s => s.percent < 100);

  // All stages complete
  if (currentIdx === -1) {
    const lastStage = validStages[validStages.length - 1];
    return {
      status: 'ship_it',
      currentStage: lastStage.stage,
      stageProgress: stages,
      alert: `All stages complete — ship ${lastStage.stage}!`,
    };
  }

  const current = validStages[currentIdx];

  // Check if any later stage has completions
  const laterStagesWithWork = validStages.slice(currentIdx + 1).filter(s => s.completed > 0);

  // If there are completed stages before the first incomplete one
  if (currentIdx > 0) {
    const lastCompleted = validStages[currentIdx - 1];
    // Active work on current or later stages → ship + build
    if (current.completed > 0 || laterStagesWithWork.length > 0) {
      return {
        status: 'ship_and_build',
        currentStage: lastCompleted.stage,
        stageProgress: stages,
        alert: `${lastCompleted.stage} ready to ship — ${current.stage} in progress`,
      };
    }
    // No later work started → just ship
    return {
      status: 'ship_it',
      currentStage: lastCompleted.stage,
      stageProgress: stages,
      alert: `${lastCompleted.stage} is ready — ship it!`,
    };
  }

  // First stage is incomplete — check for scope creep
  if (laterStagesWithWork.length > 0) {
    return {
      status: 'scope_creep',
      currentStage: current.stage,
      stageProgress: stages,
      alert: `Scope creep: ${laterStagesWithWork[0].stage} work started but ${current.stage} is only ${current.percent}%`,
    };
  }

  return {
    status: 'building',
    currentStage: current.stage,
    stageProgress: stages,
  };
}

/**
 * Parse HANDOFF.md sections.
 * Look for ## headings and extract text below each until next heading.
 */
export function parseHandoff(markdown: string): SessionStatus {
  const sections: Record<string, string> = {};
  const lines = markdown.split('\n');

  let currentSection: string | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    // New section heading
    if (line.startsWith('## ')) {
      // Save previous section
      if (currentSection) {
        sections[currentSection] = currentContent.join('\n').trim();
      }

      // Start new section
      currentSection = line.substring(3).trim();
      currentContent = [];
    } else if (currentSection) {
      // Add line to current section
      currentContent.push(line);
    }
  }

  // Save last section
  if (currentSection) {
    sections[currentSection] = currentContent.join('\n').trim();
  }

  return {
    whatWasDone: sections['What Was Done'] || '',
    currentState: sections['Current State'] || '',
    nextStep: sections['Next Step'] || '',
    blockers: sections['Blockers'] || '',
  };
}

/**
 * Fetch full project status for a tracked project.
 * Aggregates branches, PRs, milestones, North Star, session, and latest commit.
 */
export async function fetchProjectStatus(project: TrackedProject): Promise<ProjectStatus> {
  const errors: string[] = [];

  // Fetch all data in parallel — each call wrapped individually so partial data still shows
  const [branchesResult, prsResult, commitResult, northStarResult, milestonesResult, handoffResult] =
    await Promise.allSettled([
      fetchBranches(project.repo),
      fetchOpenPRs(project.repo),
      fetchLatestCommit(project.repo),
      fetchFileContent(project.repo, 'docs/NORTH_STAR.md'),
      fetchFileContent(project.repo, 'docs/MILESTONES.md'),
      fetchFileContent(project.repo, '.agent/HANDOFF.md'),
    ]);

  const branches = branchesResult.status === 'fulfilled'
    ? branchesResult.value
    : (errors.push(`Branches: ${branchesResult.reason}`), { names: [], count: 0, isHealthy: false });

  const openPRs = prsResult.status === 'fulfilled'
    ? prsResult.value
    : (errors.push(`PRs: ${prsResult.reason}`), []);

  const latestCommit = commitResult.status === 'fulfilled'
    ? commitResult.value
    : (errors.push(`Commits: ${commitResult.reason}`), null);

  const northStarMd = northStarResult.status === 'fulfilled' ? northStarResult.value : null;
  const milestonesMd = milestonesResult.status === 'fulfilled' ? milestonesResult.value : null;
  const handoffMd = handoffResult.status === 'fulfilled' ? handoffResult.value : null;

  // Parse North Star (extract first meaningful paragraph)
  let northStar: string | null = null;
  if (northStarMd) {
    const lines = northStarMd.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        northStar = trimmed;
        break;
      }
    }
  }

  // Parse milestones
  const milestones = milestonesMd ? parseMilestoneTable(milestonesMd) : [];

  // Parse progress from checklist items or milestone statuses
  const progress = milestonesMd
    ? parseProgress(milestonesMd, milestones)
    : { completed: 0, total: 0, percent: 0 };

  // Parse stage progress and compute ship gate
  const stageProgress = milestonesMd ? parseStageProgress(milestonesMd) : [];
  const shipGate = stageProgress.length > 0 ? computeShipGate(stageProgress) : null;

  // Parse handoff
  const session = handoffMd ? parseHandoff(handoffMd) : null;

  return {
    repo: project.repo,
    displayName: project.displayName,
    description: project.description,
    branches,
    openPRs,
    milestones,
    progress,
    stageProgress,
    shipGate,
    northStar,
    session,
    latestCommit,
    fetchedAt: new Date(),
    error: errors.length > 0 ? errors.join('; ') : null,
  };
}
