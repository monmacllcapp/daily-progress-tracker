/**
 * Tests for GitHub Projects Service
 *
 * Covers all exported functions with mocked fetch and env.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseMilestoneTable,
  parseHandoff,
  parseNorthStar,
  fetchBranches,
  fetchOpenPRs,
  fetchFileContent,
  fetchLatestCommit,
  fetchProjectStatus,
  GITHUB_ORG,
  type TrackedProject,
} from '../github-projects';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubEnv('VITE_GITHUB_PAT', 'test-token');
});

describe('parseMilestoneTable', () => {
  it('parses a valid milestone table with multiple rows', () => {
    const markdown = `
# Milestones

| Phase | Name | Status | Target |
|-------|------|--------|--------|
| M0 | Setup & Governance | COMPLETE | Done |
| M1 | Foundation | IN PROGRESS | Week 2 |
| M2 | Core Features | NOT STARTED | Week 4 |

Additional text after table
`;

    const result = parseMilestoneTable(markdown);

    expect(result).toEqual([
      { phase: 'M0', name: 'Setup & Governance', status: 'COMPLETE' },
      { phase: 'M1', name: 'Foundation', status: 'IN PROGRESS' },
      { phase: 'M2', name: 'Core Features', status: 'PLANNED' },
    ]);
  });

  it('returns empty array for empty input', () => {
    expect(parseMilestoneTable('')).toEqual([]);
  });

  it('returns empty array for invalid input with no table', () => {
    const markdown = 'Just some text\nNo table here\n';
    expect(parseMilestoneTable(markdown)).toEqual([]);
  });

  it('handles different status values', () => {
    const markdown = `
| Phase | Name | Status | Target |
|-------|------|--------|--------|
| M0 | Alpha | COMPLETE | Done |
| M1 | Beta | BLOCKED | TBD |
| M2 | Gamma | DEFERRED | Later |
`;

    const result = parseMilestoneTable(markdown);

    expect(result).toHaveLength(3);
    expect(result[0].status).toBe('COMPLETE');
    expect(result[1].status).toBe('BLOCKED');
    expect(result[2].status).toBe('DEFERRED');
  });
});

describe('parseHandoff', () => {
  it('parses valid HANDOFF.md content with all sections', () => {
    const markdown = `
# Session Handoff

## What Was Done
Implemented feature X and Y.
Fixed bug in Z.

## Current State
All tests passing.
Branch ready for PR.

## Next Step
Create PR and request review.

## Blockers
None at this time.
`;

    const result = parseHandoff(markdown);

    expect(result).toEqual({
      whatWasDone: 'Implemented feature X and Y.\nFixed bug in Z.',
      currentState: 'All tests passing.\nBranch ready for PR.',
      nextStep: 'Create PR and request review.',
      blockers: 'None at this time.',
    });
  });

  it('returns defaults for missing sections', () => {
    const markdown = `
## What Was Done
Only this section exists.
`;

    const result = parseHandoff(markdown);

    expect(result).toEqual({
      whatWasDone: 'Only this section exists.',
      currentState: '',
      nextStep: '',
      blockers: '',
    });
  });

  it('handles skeleton handoff (auto-generated)', () => {
    const markdown = `
## What Was Done
[Auto-generated checkpoint]

## Current State
No changes

## Next Step
Continue work

## Blockers
None
`;

    const result = parseHandoff(markdown);

    expect(result.whatWasDone).toBe('[Auto-generated checkpoint]');
    expect(result.currentState).toBe('No changes');
    expect(result.nextStep).toBe('Continue work');
    expect(result.blockers).toBe('None');
  });
});

describe('parseNorthStar', () => {
  it('extracts vision from first paragraph', () => {
    const md = '# North Star\n\nThis is the mission statement.\n\n## Out of Scope\n';
    const { vision } = parseNorthStar(md);
    expect(vision).toBe('This is the mission statement.');
  });

  it('returns null vision for markdown with only headings', () => {
    const md = '# North Star\n## Out of Scope\n';
    const { vision } = parseNorthStar(md);
    expect(vision).toBeNull();
  });

  it('parses Out of Scope table into entries', () => {
    const md = `# North Star
The vision here.

## Out of Scope

| Item | Rationale | Revisit |
|------|-----------|---------|
| Real-time sync | Too complex for MVP | V2 |
| Mobile app | Web-first | Post-launch |

## Other Section
`;
    const { vision, outOfScope } = parseNorthStar(md);
    expect(vision).toBe('The vision here.');
    expect(outOfScope).toHaveLength(2);
    expect(outOfScope[0]).toEqual({ id: '1', item: 'Real-time sync', rationale: 'Too complex for MVP', revisit: 'V2' });
    expect(outOfScope[1]).toEqual({ id: '2', item: 'Mobile app', rationale: 'Web-first', revisit: 'Post-launch' });
  });

  it('returns empty outOfScope when section is absent', () => {
    const md = '# North Star\nThe vision.\n';
    const { outOfScope } = parseNorthStar(md);
    expect(outOfScope).toEqual([]);
  });
});

describe('parseMilestoneTable - status normalization', () => {
  it('normalizes case-variant status values', () => {
    const md = `| Phase | Name | Status |
|-------|------|--------|
| M0 | Setup | done |
| M1 | Core | in progress |
| M2 | Future | planned |`;
    const result = parseMilestoneTable(md);
    expect(result[0].status).toBe('COMPLETE');
    expect(result[1].status).toBe('IN PROGRESS');
    expect(result[2].status).toBe('PLANNED');
  });

  it('passes through unknown status values unchanged', () => {
    const md = `| Phase | Name | Status |
|-------|------|--------|
| M0 | Setup | BLOCKED |
| M1 | Core | DEFERRED |`;
    const result = parseMilestoneTable(md);
    expect(result[0].status).toBe('BLOCKED');
    expect(result[1].status).toBe('DEFERRED');
  });
});

describe('fetchBranches', () => {
  it('fetches branch list and returns isHealthy=true when main+sandbox exist', async () => {
    const mockBranches = [
      { name: 'main', commit: { sha: 'abc123' } },
      { name: 'sandbox', commit: { sha: 'def456' } },
    ];

    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockBranches,
    } as Response);

    const result = await fetchBranches('test-repo');

    expect(result).toEqual({
      names: ['main', 'sandbox'],
      count: 2,
      isHealthy: true,
    });

    expect(fetch).toHaveBeenCalledWith(
      `https://api.github.com/repos/${GITHUB_ORG}/test-repo/branches`,
      expect.objectContaining({
        headers: expect.objectContaining({
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': 'Bearer test-token',
        }),
      })
    );
  });

  it('returns isHealthy=false when sandbox is missing', async () => {
    const mockBranches = [{ name: 'main', commit: { sha: 'abc123' } }];

    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockBranches,
    } as Response);

    const result = await fetchBranches('test-repo');

    expect(result).toEqual({
      names: ['main'],
      count: 1,
      isHealthy: false,
    });
  });

  it('returns isHealthy=true for 3+ branches when main+sandbox exist', async () => {
    const mockBranches = [
      { name: 'main', commit: { sha: 'abc123' } },
      { name: 'sandbox', commit: { sha: 'def456' } },
      { name: 'feature/b', commit: { sha: 'ghi789' } },
    ];

    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockBranches,
    } as Response);

    const result = await fetchBranches('test-repo');

    expect(result.isHealthy).toBe(true);
    expect(result.count).toBe(3);
  });

  it('throws error on failed fetch', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    } as Response);

    await expect(fetchBranches('test-repo')).rejects.toThrow('Failed to fetch branches: Not Found');
  });
});

describe('fetchOpenPRs', () => {
  it('fetches PR list and maps to PRInfo', async () => {
    const mockPRs = [
      {
        number: 42,
        title: 'Add feature X',
        head: { ref: 'feature/x' },
        base: { ref: 'main' },
        mergeable_state: 'clean',
        user: { login: 'dev1' },
        updated_at: '2026-02-13T10:00:00Z',
        html_url: 'https://github.com/monmacllcapp/test-repo/pull/42',
      },
      {
        number: 43,
        title: 'Fix bug Y',
        head: { ref: 'bugfix/y' },
        base: { ref: 'main' },
        mergeable_state: 'dirty',
        user: { login: 'dev2' },
        updated_at: '2026-02-13T11:00:00Z',
        html_url: 'https://github.com/monmacllcapp/test-repo/pull/43',
      },
    ];

    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockPRs,
    } as Response);

    const result = await fetchOpenPRs('test-repo');

    expect(result).toEqual([
      {
        number: 42,
        title: 'Add feature X',
        headRef: 'feature/x',
        baseRef: 'main',
        mergeable: 'CLEAN',
        author: 'dev1',
        updatedAt: '2026-02-13T10:00:00Z',
        url: 'https://github.com/monmacllcapp/test-repo/pull/42',
      },
      {
        number: 43,
        title: 'Fix bug Y',
        headRef: 'bugfix/y',
        baseRef: 'main',
        mergeable: 'DIRTY',
        author: 'dev2',
        updatedAt: '2026-02-13T11:00:00Z',
        url: 'https://github.com/monmacllcapp/test-repo/pull/43',
      },
    ]);
  });

  it('returns empty array for repos with no PRs', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    } as Response);

    const result = await fetchOpenPRs('test-repo');

    expect(result).toEqual([]);
  });

  it('handles missing mergeable_state as UNKNOWN', async () => {
    const mockPRs = [
      {
        number: 99,
        title: 'New PR',
        head: { ref: 'feature/z' },
        base: { ref: 'main' },
        user: { login: 'dev3' },
        updated_at: '2026-02-13T12:00:00Z',
        html_url: 'https://github.com/monmacllcapp/test-repo/pull/99',
      },
    ];

    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockPRs,
    } as Response);

    const result = await fetchOpenPRs('test-repo');

    expect(result[0].mergeable).toBe('UNKNOWN');
  });
});

describe('fetchFileContent', () => {
  it('fetches and decodes base64 content', async () => {
    const originalContent = 'Hello, World!';
    const base64Content = btoa(originalContent);

    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ content: base64Content }),
    } as Response);

    const result = await fetchFileContent('test-repo', 'README.md');

    expect(result).toBe(originalContent);
  });

  it('returns null for 404 response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    } as Response);

    const result = await fetchFileContent('test-repo', 'MISSING.md');

    expect(result).toBeNull();
  });

  it('returns null when content field is missing', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ type: 'dir' }),
    } as Response);

    const result = await fetchFileContent('test-repo', 'some-dir');

    expect(result).toBeNull();
  });

  it('throws error on other failed responses', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response);

    await expect(fetchFileContent('test-repo', 'README.md')).rejects.toThrow(
      'Failed to fetch file README.md: Internal Server Error'
    );
  });
});

describe('fetchLatestCommit', () => {
  it('fetches and maps commit data', async () => {
    const mockCommits = [
      {
        sha: 'abc123def456',
        commit: {
          message: 'feat: add new feature',
          author: {
            name: 'John Doe',
            date: '2026-02-13T10:30:00Z',
          },
        },
      },
    ];

    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockCommits,
    } as Response);

    const result = await fetchLatestCommit('test-repo');

    expect(result).toEqual({
      sha: 'abc123def456',
      message: 'feat: add new feature',
      date: '2026-02-13T10:30:00Z',
      author: 'John Doe',
    });
  });

  it('returns null for empty array response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    } as Response);

    const result = await fetchLatestCommit('test-repo');

    expect(result).toBeNull();
  });

  it('throws error on failed fetch', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    } as Response);

    await expect(fetchLatestCommit('test-repo')).rejects.toThrow('Failed to fetch commits: Forbidden');
  });
});

describe('fetchProjectStatus', () => {
  it('aggregates all data into ProjectStatus', async () => {
    const mockProject: TrackedProject = {
      repo: 'test-repo',
      displayName: 'Test Project',
      description: 'A test project',
    };

    const mockBranches = [
      { name: 'main', commit: { sha: 'abc' } },
      { name: 'sandbox', commit: { sha: 'def' } },
    ];

    const mockPRs = [
      {
        number: 10,
        title: 'Test PR',
        head: { ref: 'feature/test' },
        base: { ref: 'main' },
        mergeable_state: 'clean',
        user: { login: 'testuser' },
        updated_at: '2026-02-13T10:00:00Z',
        html_url: 'https://github.com/test/10',
      },
    ];

    const mockCommits = [
      {
        sha: 'commit123',
        commit: {
          message: 'Latest commit',
          author: { name: 'Author', date: '2026-02-13T09:00:00Z' },
        },
      },
    ];

    const northStarContent = btoa('# North Star\n\nThis is the vision.');
    const milestonesContent = btoa(`
| Phase | Name | Status | Target |
|-------|------|--------|--------|
| M1 | Alpha | COMPLETE | Done |
`);
    const handoffContent = btoa(`
## What Was Done
Built feature A.

## Current State
Tests passing.

## Next Step
Deploy.

## Blockers
None.
`);

    vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      const urlStr = url.toString();
      if (urlStr.includes('/branches')) {
        return { ok: true, json: async () => mockBranches, status: 200 } as Response;
      }
      if (urlStr.includes('/pulls')) {
        return { ok: true, json: async () => mockPRs, status: 200 } as Response;
      }
      if (urlStr.includes('/commits')) {
        return { ok: true, json: async () => mockCommits, status: 200 } as Response;
      }
      if (urlStr.includes('NORTH_STAR.md')) {
        return { ok: true, json: async () => ({ content: northStarContent }), status: 200 } as Response;
      }
      if (urlStr.includes('MILESTONES.md')) {
        return { ok: true, json: async () => ({ content: milestonesContent }), status: 200 } as Response;
      }
      if (urlStr.includes('HANDOFF.md')) {
        return { ok: true, json: async () => ({ content: handoffContent }), status: 200 } as Response;
      }
      return { ok: false, status: 404, statusText: 'Not Found' } as Response;
    });

    const result = await fetchProjectStatus(mockProject);

    expect(result.repo).toBe('test-repo');
    expect(result.displayName).toBe('Test Project');
    expect(result.description).toBe('A test project');
    expect(result.branches.count).toBe(2);
    expect(result.branches.isHealthy).toBe(true);
    expect(result.openPRs).toHaveLength(1);
    expect(result.openPRs[0].number).toBe(10);
    expect(result.milestones).toHaveLength(1);
    expect(result.milestones[0].phase).toBe('M1');
    expect(result.northStar).toBe('This is the vision.');
    expect(result.outOfScope).toEqual([]);
    expect(result.session?.whatWasDone).toBe('Built feature A.');
    expect(result.latestCommit?.sha).toBe('commit123');
    expect(result.error).toBeNull();
  });

  it('handles errors gracefully and returns error field', async () => {
    const mockProject: TrackedProject = {
      repo: 'failing-repo',
      displayName: 'Failing Project',
      description: 'Will fail',
    };

    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));

    const result = await fetchProjectStatus(mockProject);

    expect(result.error).toContain('Network error');
    expect(result.branches.count).toBe(0);
    expect(result.branches.isHealthy).toBe(false);
    expect(result.openPRs).toEqual([]);
    expect(result.milestones).toEqual([]);
    expect(result.progress).toEqual({ completed: 0, total: 0, percent: 0 });
    expect(result.northStar).toBeNull();
    expect(result.session).toBeNull();
    expect(result.latestCommit).toBeNull();
  });
});
