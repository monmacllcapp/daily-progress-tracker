import { useState, useEffect, useRef } from 'react';
import type { RxCollection, MangoQuery } from 'rxdb';

/**
 * useRxQuery — Subscribe to an RxDB collection query with automatic cleanup.
 *
 * Returns [data, loading, error] tuple. Unsubscribes on unmount to prevent
 * memory leaks from orphaned RxDB subscriptions.
 *
 * Includes shallow comparison to prevent unnecessary re-renders when data
 * hasn't actually changed (only the array reference changed).
 */
export function useRxQuery<T>(
    collection: RxCollection<T> | null | undefined,
    query?: MangoQuery<T>
): [T[], boolean, Error | null] {
    const [data, setData] = useState<T[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const dataRef = useRef<T[]>([]);

    // Stable key for the query to avoid unnecessary re-subscriptions
    const queryKey = query ? JSON.stringify(query) : '{}';

    // Shallow comparison: check if arrays are deeply equal
    const arraysEqual = (a: T[], b: T[]): boolean => {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) return false;
        }
        return true;
    };

    useEffect(() => {
        if (!collection) {
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        const sub = collection
            .find(query)
            .$.subscribe({
                next: (docs) => {
                    const newData = docs.map(d => d.toJSON() as T);
                    // Only update state if data actually changed
                    if (!arraysEqual(newData, dataRef.current)) {
                        dataRef.current = newData;
                        setData(newData);
                    }
                    setLoading(false);
                },
                error: (err) => {
                    console.error('[useRxQuery] Subscription error:', err);
                    setError(err instanceof Error ? err : new Error(String(err)));
                    setLoading(false);
                },
            });

        return () => sub.unsubscribe();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [collection, queryKey]);

    return [data, loading, error];
}
