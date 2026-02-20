/**
 * Tests for Stage Progress and Ship Gate functions
 *
 * Covers parseStageProgress and computeShipGate logic.
 */

import { describe, it, expect } from 'vitest';
import { parseStageProgress, computeShipGate } from '../github-projects';
import type { StageProgressInfo } from '../github-projects';

describe('parseStageProgress', () => {
  it('returns empty array for empty markdown', () => {
    const result = parseStageProgress('');
    expect(result).toEqual([]);
  });

  it('parses single MVP stage with correct counts', () => {
    const md = `
| Phase | Name | Status | Target | Stage |
|-------|------|--------|--------|-------|
| M0 | Setup | COMPLETE | Done | MVP |

## M0: Setup

- [x] Task A
- [x] Task B
- [ ] Task C
`;
    const result = parseStageProgress(md);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ stage: 'MVP', completed: 2, total: 3, percent: 67 });
  });

  it('aggregates multiple milestones into same stage', () => {
    const md = `
| Phase | Name | Status | Target | Stage |
|-------|------|--------|--------|-------|
| M0 | Setup | COMPLETE | Done | MVP |
| M1 | Core | COMPLETE | Week 1 | MVP |

## M0: Setup
- [x] Done item

## M1: Core
- [x] Done item
- [ ] Todo item
`;
    const result = parseStageProgress(md);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ stage: 'MVP', completed: 2, total: 3, percent: 67 });
  });

  it('parses multi-stage (MVP + V2 + V3) correctly', () => {
    const md = `
| Phase | Name | Status | Target | Stage |
|-------|------|--------|--------|-------|
| M0 | Setup | COMPLETE | Done | MVP |
| M1 | Core | COMPLETE | Week 1 | MVP |
| M6 | Intelligence | IN PROGRESS | Week 5 | V2 |
| M8 | Advanced | PLANNED | Week 10 | V3 |

## M0: Setup
- [x] A
- [x] B

## M1: Core
- [x] C
- [ ] D

## M6: Intelligence
- [x] E
- [ ] F
- [ ] G

## M8: Advanced
- [ ] H
`;
    const result = parseStageProgress(md);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ stage: 'MVP', completed: 3, total: 4, percent: 75 });
    expect(result[1]).toEqual({ stage: 'V2', completed: 1, total: 3, percent: 33 });
    expect(result[2]).toEqual({ stage: 'V3', completed: 0, total: 1, percent: 0 });
  });

  it('falls back to index-based mapping when no Stage column', () => {
    const md = `
| Phase | Name | Status | Target |
|-------|------|--------|--------|
| M0 | Setup | COMPLETE | Done |
| M6 | Intelligence | IN PROGRESS | Week 5 |

## M0: Setup
- [x] A
- [ ] B

## M6: Intelligence
- [ ] C
`;
    const result = parseStageProgress(md);
    expect(result).toHaveLength(2);
    expect(result[0].stage).toBe('MVP');  // M0 → MVP (index <= 5)
    expect(result[1].stage).toBe('V2');   // M6 → V2 (index 6-7)
  });

  it('handles milestone sections with no checklist items', () => {
    const md = `
| Phase | Name | Status | Target | Stage |
|-------|------|--------|--------|-------|
| M0 | Setup | COMPLETE | Done | MVP |

## M0: Setup

Some text but no checklist items.
`;
    const result = parseStageProgress(md);
    expect(result).toHaveLength(0); // 0 total → skipped
  });

  it('handles case-insensitive stage values', () => {
    const md = `
| Phase | Name | Status | Target | Stage |
|-------|------|--------|--------|-------|
| M0 | Setup | COMPLETE | Done | mvp |

## M0: Setup
- [x] Done
`;
    const result = parseStageProgress(md);
    expect(result).toHaveLength(1);
    expect(result[0].stage).toBe('MVP');
  });

  it('handles mixed complete/incomplete items within a stage', () => {
    const md = `
| Phase | Name | Status | Target | Stage |
|-------|------|--------|--------|-------|
| M0 | Setup | COMPLETE | Done | MVP |

## M0: Setup
- [x] A
- [ ] B
- [x] C
- [ ] D
- [x] E
`;
    const result = parseStageProgress(md);
    expect(result[0]).toEqual({ stage: 'MVP', completed: 3, total: 5, percent: 60 });
  });

  it('returns stages in order (MVP, V2, V3) regardless of markdown order', () => {
    const md = `
| Phase | Name | Status | Target | Stage |
|-------|------|--------|--------|-------|
| M8 | Advanced | PLANNED | Week 10 | V3 |
| M0 | Setup | COMPLETE | Done | MVP |
| M6 | Intel | IN PROGRESS | Week 5 | V2 |

## M8: Advanced
- [ ] H

## M0: Setup
- [x] A

## M6: Intelligence
- [x] E
- [ ] F
`;
    const result = parseStageProgress(md);
    expect(result[0].stage).toBe('MVP');
    expect(result[1].stage).toBe('V2');
    expect(result[2].stage).toBe('V3');
  });

  it('handles markdown with no headings gracefully', () => {
    const md = 'Just some random text without any structure.';
    const result = parseStageProgress(md);
    expect(result).toHaveLength(0);
  });

  it('counts case-insensitive [X] as completed', () => {
    const md = `
| Phase | Name | Status | Target | Stage |
|-------|------|--------|--------|-------|
| M0 | Setup | COMPLETE | Done | MVP |

## M0: Setup
- [X] Uppercase checked
- [x] Lowercase checked
- [ ] Not done
`;
    const result = parseStageProgress(md);
    expect(result[0]).toEqual({ stage: 'MVP', completed: 2, total: 3, percent: 67 });
  });
});

describe('computeShipGate', () => {
  it('returns building for empty stages', () => {
    const result = computeShipGate([]);
    expect(result.status).toBe('building');
    expect(result.currentStage).toBe('MVP');
  });

  it('returns building when current stage is incomplete with no later work', () => {
    const stages: StageProgressInfo[] = [
      { stage: 'MVP', completed: 5, total: 10, percent: 50 },
    ];
    const result = computeShipGate(stages);
    expect(result.status).toBe('building');
    expect(result.currentStage).toBe('MVP');
    expect(result.alert).toBeUndefined();
  });

  it('returns ship_it when MVP is 100% and no V2 work', () => {
    const stages: StageProgressInfo[] = [
      { stage: 'MVP', completed: 10, total: 10, percent: 100 },
      { stage: 'V2', completed: 0, total: 5, percent: 0 },
    ];
    const result = computeShipGate(stages);
    expect(result.status).toBe('ship_it');
    expect(result.currentStage).toBe('MVP');
    expect(result.alert).toContain('ship');
  });

  it('returns ship_and_build when MVP 100% and V2 in progress', () => {
    const stages: StageProgressInfo[] = [
      { stage: 'MVP', completed: 10, total: 10, percent: 100 },
      { stage: 'V2', completed: 3, total: 8, percent: 38 },
    ];
    const result = computeShipGate(stages);
    expect(result.status).toBe('ship_and_build');
    expect(result.currentStage).toBe('MVP');
    expect(result.alert).toContain('V2');
  });

  it('returns scope_creep when MVP incomplete but V2 has completions', () => {
    const stages: StageProgressInfo[] = [
      { stage: 'MVP', completed: 8, total: 10, percent: 80 },
      { stage: 'V2', completed: 3, total: 8, percent: 38 },
    ];
    const result = computeShipGate(stages);
    expect(result.status).toBe('scope_creep');
    expect(result.currentStage).toBe('MVP');
    expect(result.alert).toContain('Scope creep');
    expect(result.alert).toContain('80%');
  });

  it('returns ship_it when single stage at 100%', () => {
    const stages: StageProgressInfo[] = [
      { stage: 'MVP', completed: 10, total: 10, percent: 100 },
    ];
    const result = computeShipGate(stages);
    expect(result.status).toBe('ship_it');
  });

  it('returns ship_it when all stages at 100%', () => {
    const stages: StageProgressInfo[] = [
      { stage: 'MVP', completed: 10, total: 10, percent: 100 },
      { stage: 'V2', completed: 5, total: 5, percent: 100 },
      { stage: 'V3', completed: 3, total: 3, percent: 100 },
    ];
    const result = computeShipGate(stages);
    expect(result.status).toBe('ship_it');
    expect(result.currentStage).toBe('V3');
  });

  it('returns ship_and_build for MVP+V2 done, V3 in progress', () => {
    const stages: StageProgressInfo[] = [
      { stage: 'MVP', completed: 10, total: 10, percent: 100 },
      { stage: 'V2', completed: 5, total: 5, percent: 100 },
      { stage: 'V3', completed: 1, total: 3, percent: 33 },
    ];
    const result = computeShipGate(stages);
    expect(result.status).toBe('ship_and_build');
    expect(result.currentStage).toBe('V2');
  });

  it('skips zero-total stages in status computation', () => {
    const stages: StageProgressInfo[] = [
      { stage: 'MVP', completed: 10, total: 10, percent: 100 },
      { stage: 'V2', completed: 0, total: 0, percent: 0 },
    ];
    const result = computeShipGate(stages);
    // V2 has 0 total so should be filtered out → ship_it
    expect(result.status).toBe('ship_it');
  });

  it('detects scope creep across non-adjacent stages', () => {
    const stages: StageProgressInfo[] = [
      { stage: 'MVP', completed: 7, total: 10, percent: 70 },
      { stage: 'V2', completed: 0, total: 5, percent: 0 },
      { stage: 'V3', completed: 2, total: 3, percent: 67 },
    ];
    const result = computeShipGate(stages);
    expect(result.status).toBe('scope_creep');
    expect(result.alert).toContain('V3');
  });
});
