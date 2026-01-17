import { createRxDatabase } from 'rxdb';
import type { RxDatabase, RxCollection } from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { replicateSupabase } from 'rxdb/plugins/replication-supabase';
import { createClient } from '@supabase/supabase-js';
import type { DailyJournal, Project, SubTask } from '../types/schema';

// -- RxDB Schema Definitions --

const projectSchema = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        title: { type: 'string' },
        status: { type: 'string' },
        motivation_payload: { type: 'object' },
        metrics: { type: 'object' },
        updated_at: { type: 'string' }
    },
    required: ['id', 'title', 'status']
};

const subTaskSchema = {
    version: 0,
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
        updated_at: { type: 'string' }
    },
    required: ['id', 'project_id', 'title']
};

const dailyJournalSchema = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        date: { type: 'string' },
        gratitude: { type: 'array', items: { type: 'string' } },
        stressors: { type: 'array', items: { type: 'string' } },
        habits: { type: 'object' },
        updated_at: { type: 'string' }
    },
    required: ['id', 'date']
};

// -- Database Type Definition --

export type TitanDatabaseCollections = {
    projects: RxCollection<Project>;
    sub_tasks: RxCollection<SubTask>;
    daily_journal: RxCollection<DailyJournal>;
};

export type TitanDatabase = RxDatabase<TitanDatabaseCollections>;

// -- Replication Logic --

async function startReplication(db: TitanDatabase, url: string, key: string) {
    const supabase = createClient(url, key);
    const tables = ['projects', 'sub_tasks', 'daily_journal'];

    for (const table of tables) {
        // @ts-ignore - dynamic access
        const collection = db[table];
        if (!collection) continue;

        await replicateRxCollection({
            collection,
            replicationIdentifier: `sync-${table}`,
            pull: {
                async handler(checkpointOrNull, batchSize) {
                    const checkpoint = checkpointOrNull ? checkpointOrNull : { updated_at: new Date(0).toISOString() };

                    const { data, error } = await supabase
                        .from(table)
                        .select('*')
                        .gt('updated_at', checkpoint.updated_at)
                        .limit(batchSize)
                        .order('updated_at', { ascending: true });

                    if (error) {
                        console.error(`Pull error for ${table}:`, error);
                        throw error;
                    };

                    return {
                        documents: data || [],
                        checkpoint: data && data.length > 0
                            ? { updated_at: data[data.length - 1].updated_at }
                            : checkpoint
                    };
                }
            },
            push: {
                async handler(docs) {
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
    }
}

// -- Initialization --

let dbPromise: Promise<TitanDatabase> | null = null;

export const createDatabase = async (): Promise<TitanDatabase> => {
    if (dbPromise) return dbPromise;

    dbPromise = createRxDatabase<TitanDatabaseCollections>({
        name: 'titanplannerdb',
        storage: getRxStorageDexie(),
    }).then(async (db) => {
        await db.addCollections({
            projects: { schema: projectSchema },
            sub_tasks: { schema: subTaskSchema },
            daily_journal: { schema: dailyJournalSchema },
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
    });

    return dbPromise;
};
