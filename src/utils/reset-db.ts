// Database Reset Utility
// Run this in browser console to clear IndexedDB and reload

export async function resetDatabase() {
    try {
        // Close any existing connections
        const databases = await indexedDB.databases();

        for (const db of databases) {
            if (db.name === 'titanplannerdb') {
                console.log('Deleting database:', db.name);
                indexedDB.deleteDatabase(db.name);
            }
        }

        console.log('Database reset complete. Reloading...');

        // Wait a moment then reload
        setTimeout(() => {
            window.location.reload();
        }, 500);

    } catch (err) {
        console.error('Failed to reset database:', err);
    }
}

// Make it available globally for console access
if (typeof window !== 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- expose utility on window for console access
    (window as any).resetDB = resetDatabase;
}
