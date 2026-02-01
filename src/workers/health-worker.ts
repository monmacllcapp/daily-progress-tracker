// Health Worker - Background timer for hydration, stretch, and eye break nudges
// Configurable intervals via START message payload

interface NudgeConfig {
    hydrationMinutes: number;
    stretchMinutes: number;
    eyeBreakMinutes: number;
}

const DEFAULT_CONFIG: NudgeConfig = {
    hydrationMinutes: 25,    // Every 20-30 min (default 25)
    stretchMinutes: 45,      // Every 45 min of continuous work
    eyeBreakMinutes: 60,     // Every 60 min (look far away)
};

let hydrationTimer: number | null = null;
let stretchTimer: number | null = null;
let eyeBreakTimer: number | null = null;

function clearAllTimers() {
    if (hydrationTimer) { self.clearInterval(hydrationTimer); hydrationTimer = null; }
    if (stretchTimer) { self.clearInterval(stretchTimer); stretchTimer = null; }
    if (eyeBreakTimer) { self.clearInterval(eyeBreakTimer); eyeBreakTimer = null; }
}

function startTimers(config: NudgeConfig) {
    clearAllTimers();

    // Hydration reminder
    hydrationTimer = self.setInterval(() => {
        self.postMessage({ type: 'HYDRATE' });
    }, config.hydrationMinutes * 60 * 1000);

    // Stretch reminder
    stretchTimer = self.setInterval(() => {
        self.postMessage({ type: 'STRETCH' });
    }, config.stretchMinutes * 60 * 1000);

    // Eye break reminder
    eyeBreakTimer = self.setInterval(() => {
        self.postMessage({ type: 'EYE_BREAK' });
    }, config.eyeBreakMinutes * 60 * 1000);

    // Legacy: Pattern interrupt at 60 min (maps to eye break for backward compat)
    // Removed — replaced by EYE_BREAK above
}

self.onmessage = (e: MessageEvent) => {
    const { type, config } = e.data;

    if (type === 'START') {
        const mergedConfig: NudgeConfig = {
            ...DEFAULT_CONFIG,
            ...(config || {}),
        };
        console.log('[Health Worker] Starting health timers', mergedConfig);
        startTimers(mergedConfig);
        self.postMessage({ type: 'STARTED', config: mergedConfig });
    }

    if (type === 'UPDATE_CONFIG') {
        const mergedConfig: NudgeConfig = {
            ...DEFAULT_CONFIG,
            ...(config || {}),
        };
        console.log('[Health Worker] Updating config', mergedConfig);
        startTimers(mergedConfig);
        self.postMessage({ type: 'CONFIG_UPDATED', config: mergedConfig });
    }

    if (type === 'SNOOZE') {
        // Snooze a specific nudge for 10 minutes
        const { nudgeType } = e.data;
        const snoozeMs = 10 * 60 * 1000;
        console.log(`[Health Worker] Snoozing ${nudgeType} for 10 min`);
        setTimeout(() => {
            self.postMessage({ type: nudgeType });
        }, snoozeMs);
    }

    if (type === 'STOP') {
        console.log('[Health Worker] Stopping health timers');
        clearAllTimers();
        self.postMessage({ type: 'STOPPED' });
    }
};

export { };
