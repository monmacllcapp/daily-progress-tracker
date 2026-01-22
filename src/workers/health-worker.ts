// Health Worker - Background timer for hydration and pattern interrupts
let hydrationTimer: number | null = null;
let patternTimer: number | null = null;

const HYDRATION_INTERVAL = 30 * 60 * 1000; // 30 minutes
const PATTERN_INTERVAL = 60 * 60 * 1000; // 60 minutes

self.onmessage = (e: MessageEvent) => {
    const { type } = e.data;

    if (type === 'START') {
        console.log('[Health Worker] Starting health timers');

        // Hydration reminder every 30 minutes
        hydrationTimer = self.setInterval(() => {
            self.postMessage({ type: 'HYDRATE' });
        }, HYDRATION_INTERVAL);

        // Pattern interrupt every 60 minutes
        patternTimer = self.setInterval(() => {
            self.postMessage({ type: 'PATTERN_INTERRUPT' });
        }, PATTERN_INTERVAL);

        self.postMessage({ type: 'STARTED' });
    }

    if (type === 'STOP') {
        console.log('[Health Worker] Stopping health timers');

        if (hydrationTimer) {
            self.clearInterval(hydrationTimer);
            hydrationTimer = null;
        }

        if (patternTimer) {
            self.clearInterval(patternTimer);
            patternTimer = null;
        }

        self.postMessage({ type: 'STOPPED' });
    }
};

export { };
