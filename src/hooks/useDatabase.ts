import { useState, useEffect } from 'react';
import { createDatabase } from '../db';
import type { TitanDatabase } from '../db';

/**
 * useDatabase — Provides the initialized RxDB database instance.
 *
 * Returns [db, loading, error]. The database is initialized once and cached.
 */
export function useDatabase(): [TitanDatabase | null, boolean, Error | null] {
    const [db, setDb] = useState<TitanDatabase | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        let cancelled = false;

        createDatabase()
            .then(database => {
                if (!cancelled) {
                    setDb(database);
                    setLoading(false);
                }
            })
            .catch(err => {
                if (!cancelled) {
                    console.error('[useDatabase] Failed to initialize:', err);
                    setError(err instanceof Error ? err : new Error(String(err)));
                    setLoading(false);
                }
            });

        return () => { cancelled = true; };
    }, []);

    return [db, loading, error];
}
