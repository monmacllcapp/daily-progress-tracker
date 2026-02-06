import { useState, useEffect } from 'react';
import type { RxCollection, MangoQuery } from 'rxdb';

/**
 * useRxQuery — Subscribe to an RxDB collection query with automatic cleanup.
 *
 * Returns [data, loading, error] tuple. Unsubscribes on unmount to prevent
 * memory leaks from orphaned RxDB subscriptions.
 */
export function useRxQuery<T>(
    collection: RxCollection<T> | null | undefined,
    query?: MangoQuery<T>
): [T[], boolean, Error | null] {
    const [data, setData] = useState<T[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    // Stable key for the query to avoid unnecessary re-subscriptions
    const queryKey = query ? JSON.stringify(query) : '{}';

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
                    setData(docs.map(d => d.toJSON() as T));
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
