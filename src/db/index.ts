import { createRxDatabase, addRxPlugin } from 'rxdb';
import type { RxDatabase, RxCollection } from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { createClient } from '@supabase/supabase-js';
import type { DailyJournal, Task, Project, SubTask, VisionBoard, Category, Stressor, StressorMilestone, CalendarEvent, Email, PomodoroSession, Habit, HabitCompletion } from '../types/schema';

// Add migration plugin
addRxPlugin(RxDBMigrationSchemaPlugin);

// -- RxDB Schema Definitions --

const taskSchema = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        title: { type: 'string' },
        description: { type: 'string' },
        category_id: { type: 'string' },
        goal_id: { type: 'string' },
        time_estimate_minutes: { type: 'integer' },
        priority: { type: 'string' }, // low | medium | high | urgent
        status: { type: 'string' },   // active | completed | dismissed | deferred
        source: { type: 'string' },   // morning_flow | brain_dump | rpm_wizard | email | calendar | manual
        created_date: { type: 'string' },
        due_date: { type: 'string' },
        rolled_from_date: { type: 'string' },
        completed_date: { type: 'string' },
        defer_reason: { type: 'string' },
        sort_order: { type: 'integer' },
        tags: { type: 'array', items: { type: 'string' } },
        created_at: { type: 'string' },
        updated_at: { type: 'string' }
    },
    required: ['id', 'title', 'status', 'source', 'created_date', 'category_id'],
    indexes: ['status', 'created_date', 'category_id']
};

const projectSchema = {
    version: 2,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        title: { type: 'string' },
        status: { type: 'string' },
        motivation_payload: { type: 'object' },
        metrics: { type: 'object' },
        linked_vision_id: { type: 'string' },
        category_id: { type: 'string' },
        due_date: { type: 'string' },
        calendar_event_id: { type: 'string' },
        priority: { type: 'string' },
        updated_at: { type: 'string' }
    },
    required: ['id', 'title', 'status']
};

const subTaskSchema = {
    version: 1,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        project_id: { type: 'string' },
        title: { type: 'string' },
        time_estimate_minutes: { type: 'integer' },
        time_actual_minutes: { type: 'integer' },
        is_completed: { type: 'boolean' },
        sort_order: { type: 'integer' },
        completed_date: { type: 'string' },
        updated_at: { type: 'string' }
    },
    required: ['id', 'project_id', 'title']
};

const dailyJournalSchema = {
    version: 1,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        date: { type: 'string' },
        gratitude: { type: 'array', items: { type: 'string' } },
        non_negotiables: { type: 'array', items: { type: 'string' } },
        stressors: { type: 'array', items: { type: 'string' } },
        habits: { type: 'object' },
        created_at: { type: 'string' },
        updated_at: { type: 'string' }
    },
    required: ['id', 'date']
};

const visionBoardSchema = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        user_id: { type: 'string' },
        declaration: { type: 'string' },
        rpm_purpose: { type: 'string' },
        pain_payload: { type: 'string' },
        pleasure_payload: { type: 'string' },
        visual_anchor: { type: 'string' },
        created_at: { type: 'string' },
        updated_at: { type: 'string' }
    },
    required: ['id', 'declaration', 'rpm_purpose']
};

const categoriesSchema = {
    version: 2,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        user_id: { type: 'string' },
        name: { type: 'string' },
        color_theme: { type: 'string' },
        icon: { type: 'string' },
        current_progress: { type: 'number' },
        streak_count: { type: 'integer' },
        last_active_date: { type: 'string' },
        sort_order: { type: 'integer' },
        created_at: { type: 'string' },
        updated_at: { type: 'string' }
    },
    required: ['id', 'name', 'color_theme']
};

const stressorSchema = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        user_id: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        time_estimate_minutes: { type: 'number' },
        is_today: { type: 'boolean' },
        created_at: { type: 'string' },
        updated_at: { type: 'string' }
    },
    required: ['id', 'title', 'time_estimate_minutes']
};

const stressorMilestoneSchema = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        stressor_id: { type: 'string' },
        title: { type: 'string' },
        is_completed: { type: 'boolean' },
        sort_order: { type: 'number' },
        created_at: { type: 'string' },
        updated_at: { type: 'string' }
    },
    required: ['id', 'stressor_id', 'title']
};

const calendarEventSchema = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        google_event_id: { type: 'string' },
        summary: { type: 'string' },
        description: { type: 'string' },
        start_time: { type: 'string' },
        end_time: { type: 'string' },
        all_day: { type: 'boolean' },
        linked_task_id: { type: 'string' },
        source: { type: 'string' }, // google | app
        color: { type: 'string' },
        is_focus_block: { type: 'boolean' },
        created_at: { type: 'string' },
        updated_at: { type: 'string' }
    },
    required: ['id', 'summary', 'start_time', 'end_time', 'source', 'linked_task_id', 'google_event_id'],
    indexes: ['start_time', 'linked_task_id', 'google_event_id']
};

const emailSchema = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        gmail_id: { type: 'string' },
        thread_id: { type: 'string' },
        from: { type: 'string' },
        subject: { type: 'string' },
        snippet: { type: 'string' },
        tier: { type: 'string' },   // urgent | important | promotions | unsubscribe
        tier_override: { type: 'string' },
        status: { type: 'string' }, // unread | read | drafted | replied | archived
        ai_draft: { type: 'string' },
        received_at: { type: 'string' },
        labels: { type: 'array', items: { type: 'string' } },
        created_at: { type: 'string' },
        updated_at: { type: 'string' }
    },
    required: ['id', 'gmail_id', 'from', 'subject', 'tier', 'status', 'received_at'],
    indexes: ['tier', 'status', 'received_at']
};

const pomodoroSessionSchema = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        task_id: { type: 'string' },
        category_id: { type: 'string' },
        type: { type: 'string' },          // focus | short_break | long_break
        duration_minutes: { type: 'integer' },
        started_at: { type: 'string' },
        completed_at: { type: 'string' },
        status: { type: 'string' },        // completed | abandoned
        created_at: { type: 'string' },
        updated_at: { type: 'string' }
    },
    required: ['id', 'type', 'duration_minutes', 'started_at', 'status'],
    indexes: ['started_at', 'status']
};

const habitSchema = {
    version: 1,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        name: { type: 'string' },
        icon: { type: 'string' },
        color: { type: 'string' },
        category_id: { type: 'string' },
        frequency: { type: 'string' },     // daily | weekdays | weekends
        sort_order: { type: 'integer' },
        is_archived: { type: 'boolean' },
        created_at: { type: 'string' },
        updated_at: { type: 'string' }
    },
    required: ['id', 'name', 'frequency'],
};

const habitCompletionSchema = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        habit_id: { type: 'string' },
        date: { type: 'string' },          // YYYY-MM-DD
        completed_at: { type: 'string' }
    },
    required: ['id', 'habit_id', 'date', 'completed_at'],
    indexes: ['habit_id', 'date']
};

// -- Database Type Definition --

export type TitanDatabaseCollections = {
    tasks: RxCollection<Task>;
    projects: RxCollection<Project>;
    sub_tasks: RxCollection<SubTask>;
    daily_journal: RxCollection<DailyJournal>;
    vision_board: RxCollection<VisionBoard>;
    categories: RxCollection<Category>;
    stressors: RxCollection<Stressor>;
    stressor_milestones: RxCollection<StressorMilestone>;
    calendar_events: RxCollection<CalendarEvent>;
    emails: RxCollection<Email>;
    pomodoro_sessions: RxCollection<PomodoroSession>;
    habits: RxCollection<Habit>;
    habit_completions: RxCollection<HabitCompletion>;
};

export type TitanDatabase = RxDatabase<TitanDatabaseCollections>;

// -- Replication Logic --

async function startReplication(db: TitanDatabase, url: string, key: string) {
    const supabase = createClient(url, key);
    const tables = ['tasks', 'projects', 'sub_tasks', 'daily_journal', 'vision_board', 'categories', 'stressors', 'stressor_milestones', 'calendar_events', 'emails', 'pomodoro_sessions', 'habits', 'habit_completions'];

    for (const table of tables) {
        // @ts-expect-error - dynamic access
        const collection = db[table];
        if (!collection) continue;

        try {
            const { replicateRxCollection } = await import('rxdb/plugins/replication');
            await replicateRxCollection({
                collection,
                replicationIdentifier: `sync-${table}`,
                pull: {
                    async handler(checkpointOrNull: unknown, batchSize: number) {
                        const checkpoint = (checkpointOrNull ? checkpointOrNull : { updated_at: new Date(0).toISOString() }) as { updated_at: string };

                        const { data, error } = await supabase
                            .from(table)
                            .select('*')
                            .gt('updated_at', checkpoint.updated_at)
                            .limit(batchSize)
                            .order('updated_at', { ascending: true });

                        if (error) {
                            console.error(`Pull error for ${table}:`, error);
                            throw error;
                        }

                        return {
                            documents: data || [],
                            checkpoint: data && data.length > 0
                                ? { updated_at: data[data.length - 1].updated_at }
                                : checkpoint
                        };
                    }
                },
                push: {
                    async handler(docs: Array<{ newDocumentState: Record<string, unknown> }>) {
                        const rows = docs.map(d => d.newDocumentState);
                        const { error } = await supabase
                            .from(table)
                            .upsert(rows);

                        if (error) {
                            console.error(`Push error for ${table}:`, error);
                            throw error;
                        }
                        return [];
                    }
                }
            });
        } catch (err) {
            console.warn(`Replication setup for ${table} skipped:`, err);
        }
    }
}

// -- Initialization --

let dbPromise: Promise<TitanDatabase> | null = null;

async function initDatabase(): Promise<TitanDatabase> {
    const db = await createRxDatabase<TitanDatabaseCollections>({
        name: 'titanplannerdb',
        storage: getRxStorageDexie(),
    });

    try {
        await db.addCollections({
            tasks: { schema: taskSchema },
            projects: {
                schema: projectSchema,
                migrationStrategies: {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RxDB migration doc
                    1: function (oldDoc: any) {
                        oldDoc.linked_vision_id = oldDoc.linked_vision_id || undefined;
                        oldDoc.category_id = oldDoc.category_id || undefined;
                        return oldDoc;
                    },
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RxDB migration doc
                    2: function (oldDoc: any) {
                        oldDoc.due_date = oldDoc.due_date || undefined;
                        oldDoc.calendar_event_id = oldDoc.calendar_event_id || undefined;
                        oldDoc.priority = oldDoc.priority || 'medium';
                        return oldDoc;
                    }
                }
            },
            sub_tasks: {
                schema: subTaskSchema,
                migrationStrategies: {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RxDB migration doc
                    1: function (oldDoc: any) {
                        oldDoc.completed_date = oldDoc.completed_date || undefined;
                        return oldDoc;
                    }
                }
            },
            daily_journal: {
                schema: dailyJournalSchema,
                migrationStrategies: {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RxDB migration doc
                    1: function (oldDoc: any) {
                        oldDoc.non_negotiables = oldDoc.non_negotiables || [];
                        oldDoc.created_at = oldDoc.created_at || undefined;
                        return oldDoc;
                    }
                }
            },
            vision_board: { schema: visionBoardSchema },
            categories: {
                schema: categoriesSchema,
                migrationStrategies: {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RxDB migration doc
                    1: function (oldDoc: any) {
                        oldDoc.current_progress = oldDoc.current_inflation ?? oldDoc.current_progress ?? 0;
                        oldDoc.streak_count = oldDoc.streak_count ?? 0;
                        oldDoc.last_active_date = oldDoc.last_active_date || oldDoc.last_1_percent_date || undefined;
                        oldDoc.sort_order = oldDoc.sort_order ?? 0;
                        // Remove old fields
                        delete oldDoc.current_inflation;
                        delete oldDoc.last_1_percent_date;
                        return oldDoc;
                    },
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RxDB migration doc
                    2: function (oldDoc: any) {
                        oldDoc.icon = oldDoc.icon || undefined;
                        return oldDoc;
                    }
                }
            },
            stressors: { schema: stressorSchema },
            stressor_milestones: { schema: stressorMilestoneSchema },
            calendar_events: { schema: calendarEventSchema },
            emails: { schema: emailSchema },
            pomodoro_sessions: { schema: pomodoroSessionSchema },
            habits: {
                schema: habitSchema,
                migrationStrategies: {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RxDB migration doc
                    1: function (oldDoc: any) { return oldDoc; }
                }
            },
            habit_completions: { schema: habitCompletionSchema },
        });

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

        if (supabaseUrl && supabaseKey) {
            console.log('Starting Supabase replication...');
            await startReplication(db, supabaseUrl, supabaseKey);
        } else {
            console.warn('Supabase credentials not found, running in offline-local-only mode.');
        }

        return db;
    } catch (err) {
        // DB6 = schema mismatch, DXE1 = Dexie index error — nuke and retry
        const code = (err as { code?: string })?.code;
        if (code === 'DB6' || code === 'DXE1') {
            console.warn(`[DB] Schema conflict (${code}), clearing database and retrying...`);
            await db.remove();
            // Recursive retry with a fresh database
            dbPromise = null;
            return initDatabase();
        }
        throw err;
    }
}

export const createDatabase = async (): Promise<TitanDatabase> => {
    if (dbPromise) return dbPromise;
    dbPromise = initDatabase();
    return dbPromise;
};
