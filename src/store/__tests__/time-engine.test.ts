import { describe, it, expect } from 'vitest';
import {
    calculateProjectMetrics,
    checkDrift,
    calculatePulseRatio,
    detectDrift,
    calculateLeverageScore,
    sortByLeverage,
} from '../time-engine';
import type { SubTask, Project } from '../../types/schema';

function makeSubTask(overrides: Partial<SubTask> = {}): SubTask {
    return {
        id: crypto.randomUUID(),
        project_id: 'proj-1',
        title: 'Test subtask',
        time_estimate_minutes: 60,
        time_actual_minutes: 0,
        is_completed: false,
        sort_order: 0,
        ...overrides,
    };
}

function makeProject(overrides: Partial<Project> = {}): Project {
    return {
        id: 'proj-1',
        title: 'Test project',
        status: 'active',
        motivation_payload: { why: '', impact_positive: '', impact_negative: '' },
        metrics: { total_time_estimated: 0, total_time_spent: 0, optimism_ratio: 1 },
        ...overrides,
    };
}

describe('calculateProjectMetrics', () => {
    it('should return zero metrics for empty subtasks', () => {
        const result = calculateProjectMetrics([]);
        expect(result.total_time_estimated).toBe(0);
        expect(result.total_time_spent).toBe(0);
        expect(result.optimism_ratio).toBe(1);
    });

    it('should sum time estimates and actuals', () => {
        const subtasks = [
            makeSubTask({ time_estimate_minutes: 30, time_actual_minutes: 25 }),
            makeSubTask({ time_estimate_minutes: 60, time_actual_minutes: 70 }),
        ];
        const result = calculateProjectMetrics(subtasks);
        expect(result.total_time_estimated).toBe(90);
        expect(result.total_time_spent).toBe(95);
    });

    it('should calculate optimism ratio correctly', () => {
        const subtasks = [
            makeSubTask({ time_estimate_minutes: 30, time_actual_minutes: 60 }),
        ];
        const result = calculateProjectMetrics(subtasks);
        expect(result.optimism_ratio).toBe(0.5); // estimated 30, spent 60 = 2x optimistic
    });

    it('should return 1.0 ratio when no time spent yet', () => {
        const subtasks = [
            makeSubTask({ time_estimate_minutes: 30, time_actual_minutes: 0 }),
        ];
        const result = calculateProjectMetrics(subtasks);
        expect(result.optimism_ratio).toBe(1);
    });
});

describe('checkDrift', () => {
    it('should detect drift when actual exceeds estimate', () => {
        expect(checkDrift(65, 60)).toBe(true);
    });

    it('should not detect drift when on track', () => {
        expect(checkDrift(30, 60)).toBe(false);
    });

    it('should not detect drift when exactly on estimate', () => {
        expect(checkDrift(60, 60)).toBe(false);
    });
});

describe('calculatePulseRatio', () => {
    it('should return 0 for zero estimate', () => {
        expect(calculatePulseRatio(30, 0)).toBe(0);
    });

    it('should return correct percentage', () => {
        expect(calculatePulseRatio(30, 60)).toBe(50);
    });

    it('should cap at 100%', () => {
        expect(calculatePulseRatio(120, 60)).toBe(100);
    });
});

describe('detectDrift', () => {
    it('should return tasks drifting > 20%', () => {
        const subtasks = [
            makeSubTask({ time_estimate_minutes: 60, time_actual_minutes: 80 }), // 33% drift
            makeSubTask({ time_estimate_minutes: 60, time_actual_minutes: 65 }), // 8% drift (OK)
            makeSubTask({ time_estimate_minutes: 30, time_actual_minutes: 45 }), // 50% drift
        ];
        const drifting = detectDrift(subtasks);
        expect(drifting).toHaveLength(2);
    });

    it('should ignore tasks with zero estimate', () => {
        const subtasks = [
            makeSubTask({ time_estimate_minutes: 0, time_actual_minutes: 30 }),
        ];
        expect(detectDrift(subtasks)).toHaveLength(0);
    });
});

describe('calculateLeverageScore', () => {
    it('should give vision-linked projects higher score', () => {
        const projectWithVision = makeProject({ linked_vision_id: 'v1' });
        const projectWithout = makeProject({});
        const subtasks = [makeSubTask({ is_completed: false })];

        const withScore = calculateLeverageScore(projectWithVision, subtasks);
        const withoutScore = calculateLeverageScore(projectWithout, subtasks);

        expect(withScore).toBeGreaterThan(withoutScore);
    });

    it('should give category-linked projects higher score', () => {
        const projectWithCategory = makeProject({ category_id: 'c1' });
        const projectWithout = makeProject({});
        const subtasks = [makeSubTask({ is_completed: false })];

        const withScore = calculateLeverageScore(projectWithCategory, subtasks);
        const withoutScore = calculateLeverageScore(projectWithout, subtasks);

        expect(withScore).toBeGreaterThan(withoutScore);
    });

    it('should return 0 for fully completed projects', () => {
        const project = makeProject({});
        const subtasks = [makeSubTask({ is_completed: true })];

        expect(calculateLeverageScore(project, subtasks)).toBe(0);
    });
});

describe('sortByLeverage', () => {
    it('should sort projects by leverage score descending', () => {
        const projHigh = makeProject({ id: 'high', linked_vision_id: 'v1', category_id: 'c1' });
        const projLow = makeProject({ id: 'low' });
        const subtasks = [
            makeSubTask({ project_id: 'high', is_completed: false }),
            makeSubTask({ project_id: 'low', is_completed: false }),
        ];

        const sorted = sortByLeverage([projLow, projHigh], subtasks);
        expect(sorted[0].id).toBe('high');
    });
});
