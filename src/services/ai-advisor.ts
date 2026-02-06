import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Task, Category, Project } from '../types/schema';

let genAI: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI | null {
    if (genAI) return genAI;
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) return null;
    genAI = new GoogleGenerativeAI(apiKey);
    return genAI;
}

/**
 * AI Task Categorization
 *
 * Given a task title and the user's category list, suggests which category
 * the task belongs to. Returns the category_id or null if AI is unavailable.
 */
export async function categorizeTask(
    taskTitle: string,
    categories: Category[]
): Promise<string | null> {
    const ai = getGenAI();
    if (!ai || categories.length === 0) return null;

    try {
        const model = ai.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const categoryList = categories.map(c => `- "${c.name}" (id: ${c.id})`).join('\n');

        const prompt = `You are a life planning assistant. Categorize this task into one of the user's life categories.

Task: "${taskTitle}"

Available categories:
${categoryList}

Respond with ONLY the category id (the string in parentheses after "id:"). If no category is a good fit, respond with "none".`;

        const result = await model.generateContent(prompt);
        const text = result.response.text().trim();

        if (text === 'none') return null;

        // Verify the returned ID matches an actual category
        const match = categories.find(c => c.id === text);
        return match ? match.id : null;
    } catch (err) {
        console.warn('[AI Advisor] Categorization failed:', err);
        return null;
    }
}

/**
 * AI Leverage Advisor
 *
 * Analyzes the user's active tasks and projects, then suggests
 * what to focus on next based on vision alignment and urgency.
 */
export interface FocusSuggestion {
    taskId: string;
    reason: string;
}

export async function suggestFocus(
    activeTasks: Task[],
    projects: Project[],
    categories: Category[]
): Promise<FocusSuggestion | null> {
    const ai = getGenAI();
    if (!ai || activeTasks.length === 0) return null;

    try {
        const model = ai.getGenerativeModel({ model: 'gemini-2.0-flash' });

        const taskDescriptions = activeTasks.slice(0, 10).map(t => {
            const cat = categories.find(c => c.id === t.category_id);
            const proj = projects.find(p => p.id === t.goal_id);
            return `- [${t.id}] "${t.title}" (priority: ${t.priority}, category: ${cat?.name || 'none'}, project: ${proj?.title || 'standalone'}, estimate: ${t.time_estimate_minutes || '?'}min)`;
        }).join('\n');

        const prompt = `You are a personal productivity advisor using the RPM framework (Result, Purpose, Massive Action).

Here are the user's active tasks:
${taskDescriptions}

Based on leverage (highest impact, vision-aligned, urgency), recommend ONE task to focus on right now.

Respond as JSON:
{"taskId": "<task id>", "reason": "<one sentence explaining why this has the most leverage>"}`;

        const result = await model.generateContent(prompt);
        const text = result.response.text().trim();

        // Extract JSON from response (handle markdown code blocks)
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return null;

        const parsed = JSON.parse(jsonMatch[0]);

        // Verify the task ID exists
        const match = activeTasks.find(t => t.id === parsed.taskId);
        if (!match) return null;

        return { taskId: parsed.taskId, reason: parsed.reason };
    } catch (err) {
        console.warn('[AI Advisor] Focus suggestion failed:', err);
        return null;
    }
}

/**
 * Checks if AI features are available (API key configured)
 */
export function isAIAvailable(): boolean {
    return !!import.meta.env.VITE_GEMINI_API_KEY;
}
