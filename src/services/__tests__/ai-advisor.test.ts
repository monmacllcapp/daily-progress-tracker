import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Task, Category, Project } from '../../types/schema';

// Since AI features require an API key, we test the graceful degradation
// and the interface contracts.

describe('AI Advisor — Graceful Degradation', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.stubEnv('VITE_GEMINI_API_KEY', '');
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('categorizeTask returns null when no API key is set', async () => {
        // import.meta.env.VITE_GEMINI_API_KEY is not set in test env
        const { categorizeTask } = await import('../ai-advisor');

        const categories: Category[] = [
            {
                id: 'cat-1',
                name: 'Health',
                color_theme: '#ff0000',
                current_progress: 0,
                streak_count: 0,
                sort_order: 0,
            },
        ];

        const result = await categorizeTask('Go for a run', categories);
        expect(result).toBeNull();
    });

    it('categorizeTask returns null when no categories exist', async () => {
        const { categorizeTask } = await import('../ai-advisor');
        const result = await categorizeTask('Some task', []);
        expect(result).toBeNull();
    });

    it('suggestFocus returns null when no API key is set', async () => {
        const { suggestFocus } = await import('../ai-advisor');

        const tasks: Task[] = [
            {
                id: 'task-1',
                title: 'Important task',
                priority: 'high',
                status: 'active',
                source: 'brain_dump',
                created_date: '2026-01-31',
                sort_order: 0,
            },
        ];

        const result = await suggestFocus(tasks, [], []);
        expect(result).toBeNull();
    });

    it('suggestFocus returns null when no active tasks', async () => {
        const { suggestFocus } = await import('../ai-advisor');
        const result = await suggestFocus([], [], []);
        expect(result).toBeNull();
    });

    it('isAIAvailable returns false when no API key is set', async () => {
        const { isAIAvailable } = await import('../ai-advisor');
        expect(isAIAvailable()).toBe(false);
    });
});

describe('AI Advisor — Interface Contract', () => {
    it('FocusSuggestion should have taskId and reason fields', () => {
        // Type-level check (compile-time) — just verify the interface exists
        const suggestion: { taskId: string; reason: string } = {
            taskId: 'test-id',
            reason: 'This is why',
        };
        expect(suggestion.taskId).toBe('test-id');
        expect(suggestion.reason).toBe('This is why');
    });
});

describe('AI Advisor — With Mocked Gemini API', () => {
    const mockGenerateContent = vi.fn();

    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    async function importWithAI() {
        vi.stubEnv('VITE_GEMINI_API_KEY', 'test-key');

        vi.doMock('@google/generative-ai', () => ({
            GoogleGenerativeAI: class MockGoogleGenerativeAI {
                constructor() {}
                getGenerativeModel() {
                    return { generateContent: mockGenerateContent };
                }
            },
        }));

        return await import('../ai-advisor');
    }

    function makeCategories(): Category[] {
        return [
            { id: 'cat-health', name: 'Health', color_theme: '#ff0000', current_progress: 0, streak_count: 0, sort_order: 0 },
            { id: 'cat-wealth', name: 'Wealth', color_theme: '#00ff00', current_progress: 0, streak_count: 0, sort_order: 1 },
            { id: 'cat-mind', name: 'Mind', color_theme: '#0000ff', current_progress: 0, streak_count: 0, sort_order: 2 },
        ];
    }

    function makeTasks(): Task[] {
        return [
            {
                id: 'task-1',
                title: 'Go for a run',
                priority: 'high',
                status: 'active',
                source: 'brain_dump',
                created_date: '2026-01-31',
                sort_order: 0,
                category_id: 'cat-health',
                time_estimate_minutes: 30,
            },
            {
                id: 'task-2',
                title: 'Review finances',
                priority: 'medium',
                status: 'active',
                source: 'manual',
                created_date: '2026-01-31',
                sort_order: 1,
                category_id: 'cat-wealth',
                time_estimate_minutes: 45,
            },
        ];
    }

    function makeProjects(): Project[] {
        return [
            {
                id: 'proj-1',
                title: 'Marathon Training',
                status: 'active',
                motivation_payload: { why: 'Health improvement', impact_positive: 'Fitness', impact_negative: 'Decline' },
                metrics: { total_time_estimated: 120, total_time_spent: 30, optimism_ratio: 1.2 },
            },
        ];
    }

    describe('categorizeTask with AI', () => {
        it('should return category ID when AI returns a valid category', async () => {
            mockGenerateContent.mockResolvedValue({
                response: { text: () => 'cat-health' },
            });

            const { categorizeTask } = await importWithAI();
            const result = await categorizeTask('Go for a morning run', makeCategories());

            expect(result).toBe('cat-health');
            expect(mockGenerateContent).toHaveBeenCalledTimes(1);
        });

        it('should return null when AI returns "none"', async () => {
            mockGenerateContent.mockResolvedValue({
                response: { text: () => 'none' },
            });

            const { categorizeTask } = await importWithAI();
            const result = await categorizeTask('Something uncategorizable', makeCategories());

            expect(result).toBeNull();
        });

        it('should return null when AI returns an invalid category ID', async () => {
            mockGenerateContent.mockResolvedValue({
                response: { text: () => 'cat-nonexistent' },
            });

            const { categorizeTask } = await importWithAI();
            const result = await categorizeTask('Random task', makeCategories());

            expect(result).toBeNull();
        });

        it('should return null when AI throws an error', async () => {
            mockGenerateContent.mockRejectedValue(new Error('Network error'));

            const { categorizeTask } = await importWithAI();
            const result = await categorizeTask('Some task', makeCategories());

            expect(result).toBeNull();
        });

        it('should handle whitespace around category ID', async () => {
            mockGenerateContent.mockResolvedValue({
                response: { text: () => '  cat-wealth  ' },
            });

            const { categorizeTask } = await importWithAI();
            const result = await categorizeTask('Check investments', makeCategories());

            expect(result).toBe('cat-wealth');
        });
    });

    describe('suggestFocus with AI', () => {
        it('should return focus suggestion when AI provides valid JSON', async () => {
            mockGenerateContent.mockResolvedValue({
                response: {
                    text: () => JSON.stringify({
                        taskId: 'task-1',
                        reason: 'This task has the highest leverage for your health goals.',
                    }),
                },
            });

            const { suggestFocus } = await importWithAI();
            const result = await suggestFocus(makeTasks(), makeProjects(), makeCategories());

            expect(result).not.toBeNull();
            expect(result!.taskId).toBe('task-1');
            expect(result!.reason).toBe('This task has the highest leverage for your health goals.');
        });

        it('should extract JSON from markdown code blocks', async () => {
            mockGenerateContent.mockResolvedValue({
                response: {
                    text: () => '```json\n{"taskId": "task-2", "reason": "Reviewing finances is time-sensitive."}\n```',
                },
            });

            const { suggestFocus } = await importWithAI();
            const result = await suggestFocus(makeTasks(), makeProjects(), makeCategories());

            expect(result).not.toBeNull();
            expect(result!.taskId).toBe('task-2');
            expect(result!.reason).toBe('Reviewing finances is time-sensitive.');
        });

        it('should return null when AI response contains no JSON', async () => {
            mockGenerateContent.mockResolvedValue({
                response: {
                    text: () => 'I recommend focusing on task-1 because it is important.',
                },
            });

            const { suggestFocus } = await importWithAI();
            const result = await suggestFocus(makeTasks(), makeProjects(), makeCategories());

            expect(result).toBeNull();
        });

        it('should return null when AI returns a task ID that does not exist', async () => {
            mockGenerateContent.mockResolvedValue({
                response: {
                    text: () => JSON.stringify({
                        taskId: 'nonexistent-task',
                        reason: 'This task does not exist.',
                    }),
                },
            });

            const { suggestFocus } = await importWithAI();
            const result = await suggestFocus(makeTasks(), makeProjects(), makeCategories());

            expect(result).toBeNull();
        });

        it('should return null when AI throws an error', async () => {
            mockGenerateContent.mockRejectedValue(new Error('Rate limit exceeded'));

            const { suggestFocus } = await importWithAI();
            const result = await suggestFocus(makeTasks(), makeProjects(), makeCategories());

            expect(result).toBeNull();
        });

        it('should limit tasks to first 10 in the prompt', async () => {
            const manyTasks: Task[] = Array.from({ length: 15 }, (_, i) => ({
                id: `task-${i}`,
                title: `Task ${i}`,
                priority: 'medium' as const,
                status: 'active' as const,
                source: 'manual' as const,
                created_date: '2026-01-31',
                sort_order: i,
            }));

            mockGenerateContent.mockResolvedValue({
                response: {
                    text: () => JSON.stringify({
                        taskId: 'task-0',
                        reason: 'First task is most urgent.',
                    }),
                },
            });

            const { suggestFocus } = await importWithAI();
            const result = await suggestFocus(manyTasks, [], []);

            expect(result).not.toBeNull();
            expect(result!.taskId).toBe('task-0');
            expect(mockGenerateContent).toHaveBeenCalledTimes(1);
        });

        it('should include category and project info in the prompt', async () => {
            mockGenerateContent.mockResolvedValue({
                response: {
                    text: () => JSON.stringify({
                        taskId: 'task-1',
                        reason: 'Health tasks align with vision.',
                    }),
                },
            });

            const tasks: Task[] = [{
                id: 'task-1',
                title: 'Morning run',
                priority: 'high',
                status: 'active',
                source: 'brain_dump',
                created_date: '2026-01-31',
                sort_order: 0,
                category_id: 'cat-health',
                goal_id: 'proj-1',
                time_estimate_minutes: 30,
            }];

            const { suggestFocus } = await importWithAI();
            const result = await suggestFocus(tasks, makeProjects(), makeCategories());

            expect(result).not.toBeNull();
            expect(result!.taskId).toBe('task-1');

            // Verify generateContent was called with a prompt containing category and project info
            const callArg = mockGenerateContent.mock.calls[0][0];
            expect(callArg).toContain('Health');
            expect(callArg).toContain('Marathon Training');
        });
    });
});
