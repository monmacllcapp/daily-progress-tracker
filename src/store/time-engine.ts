import type { SubTask, Project, ProjectMetrics } from '../types/schema';

/**
 * The "Time Wisdom" Engine
 * Handles time aggregation and metric calculation.
 */

export const calculateProjectMetrics = (subtasks: SubTask[]): ProjectMetrics => {
    const total_time_estimated = subtasks.reduce((acc, task) => acc + (task.time_estimate_minutes || 0), 0);
    const total_time_spent = subtasks.reduce((acc, task) => acc + (task.time_actual_minutes || 0), 0);

    // Optimism Ratio:
    // If we estimated 60m and spent 60m, ratio is 1.0 (Good).
    // If we estimated 30m and spent 60m, we were "Optimistic" (Underestimated). Ratio 0.5?
    // User spec: "optimism_ratio: float".
    // Let's define it as: Estimate / Actual.
    // 30 / 60 = 0.5 (We were 2x optimistic, i.e., we thought it would take half the time).
    // 60 / 30 = 2.0 (We were pessimistic/conservative).

    let optimism_ratio = 1;
    if (total_time_spent > 0) {
        optimism_ratio = total_time_estimated / total_time_spent;
    } else if (total_time_estimated > 0) {
        // No time spent yet, but we have estimates. Ratio is technically infinite or undefined.
        // Let's default to 1 until we start tracking.
        optimism_ratio = 1;
    }

    return {
        total_time_estimated,
        total_time_spent,
        optimism_ratio: parseFloat(optimism_ratio.toFixed(2)),
    };
};

/**
 * Checks if a task or project is drifting (Actual > Estimate).
 * @param actual minutes spent
 * @param estimated minutes estimated
 * @returns true if drifting
 */
export const checkDrift = (actual: number, estimated: number): boolean => {
    return actual > estimated;
};

/**
 * Calculates the segments for the "Pulse Bar".
 * Returns an array of percentages or widths relative to the total estimated time.
 * Note: If actual > estimate, the bar overflows.
 */
export const calculatePulseRatio = (actual: number, estimated: number): number => {
    if (estimated === 0) return 0;
    return Math.min(100, (actual / estimated) * 100);
};

/**
 * Enhanced Drift Detection
 * Returns tasks that are drifting > 20% over estimate
 */
export const detectDrift = (subtasks: SubTask[]): SubTask[] => {
    return subtasks.filter(task => {
        if (task.time_estimate_minutes === 0) return false;
        const drift = task.time_actual_minutes - task.time_estimate_minutes;
        const driftPercent = (drift / task.time_estimate_minutes) * 100;
        return driftPercent > 20;
    });
};

/**
 * AI Leverage Score Calculator
 * Determines which projects have the highest impact
 * Formula: (Vision Link Weight) * (Category Importance) * (Time Urgency)
 */
export const calculateLeverageScore = (project: Project, subtasks: SubTask[]): number => {
    // Vision-linked projects get 1.5x multiplier
    const visionWeight = project.linked_vision_id ? 1.5 : 1.0;

    // Category-linked projects get 1.3x multiplier
    const categoryWeight = project.category_id ? 1.3 : 1.0;

    // Time urgency: projects with incomplete tasks get higher scores
    const incompleteTasks = subtasks.filter(st => !st.is_completed).length;
    const totalTasks = subtasks.length || 1;
    const urgencyWeight = incompleteTasks / totalTasks;

    return visionWeight * categoryWeight * urgencyWeight;
};

/**
 * Sorts projects by leverage score (highest first)
 */
export const sortByLeverage = (projects: Project[], allSubtasks: SubTask[]): Project[] => {
    return [...projects].sort((a, b) => {
        const aSubtasks = allSubtasks.filter(st => st.project_id === a.id);
        const bSubtasks = allSubtasks.filter(st => st.project_id === b.id);

        const aScore = calculateLeverageScore(a, aSubtasks);
        const bScore = calculateLeverageScore(b, bSubtasks);

        return bScore - aScore;
    });
};

