// Daily Reset Worker - Triggers at 6:00 AM every day
let resetCheckInterval: number | null = null;
let lastResetDate: string | null = null;

const RESET_HOUR = 6; // 6 AM
const CHECK_INTERVAL = 60 * 1000; // Check every minute

function getTodayDateString(): string {
    const now = new Date();
    return now.toISOString().split('T')[0]; // YYYY-MM-DD
}

function getCurrentHour(): number {
    return new Date().getHours();
}

function shouldTriggerReset(): boolean {
    const today = getTodayDateString();
    const currentHour = getCurrentHour();

    // Trigger if:
    // 1. Current hour is >= 6 AM
    // 2. We haven't reset today yet
    return currentHour >= RESET_HOUR && lastResetDate !== today;
}

function performReset() {
    const today = getTodayDateString();

    console.log('[Daily Reset] Triggering 6 AM reset for', today);

    // Clear morning flow completion
    self.postMessage({
        type: 'RESET_MORNING_FLOW',
        date: today
    });

    // Clear today's stressors flag
    self.postMessage({
        type: 'RESET_STRESSORS',
        date: today
    });

    // Update last reset date
    lastResetDate = today;

    console.log('[Daily Reset] Reset complete');
}

self.onmessage = (e: MessageEvent) => {
    const { type } = e.data;

    if (type === 'START') {
        console.log('[Daily Reset Worker] Starting daily reset checks');

        // Initialize last reset date from storage if provided
        if (e.data.lastResetDate) {
            lastResetDate = e.data.lastResetDate;
        }

        // Check immediately on start
        if (shouldTriggerReset()) {
            performReset();
        }

        // Then check every minute
        resetCheckInterval = self.setInterval(() => {
            if (shouldTriggerReset()) {
                performReset();
            }
        }, CHECK_INTERVAL);

        self.postMessage({ type: 'STARTED' });
    }

    if (type === 'STOP') {
        console.log('[Daily Reset Worker] Stopping daily reset checks');

        if (resetCheckInterval) {
            self.clearInterval(resetCheckInterval);
            resetCheckInterval = null;
        }

        self.postMessage({ type: 'STOPPED' });
    }

    if (type === 'FORCE_RESET') {
        console.log('[Daily Reset Worker] Force reset triggered');
        performReset();
    }
};

export { };
