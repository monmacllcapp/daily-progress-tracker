// Pomodoro Worker - Background countdown timer using wall-clock deltas
// Wall-clock delta ensures accuracy even if tab is throttled by the browser

let startTime: number | null = null;
let pausedAt: number | null = null;
let totalPauseMs = 0;
let durationSeconds = 0;
let tickInterval: number | null = null;

function clearTimer() {
    if (tickInterval) {
        self.clearInterval(tickInterval);
        tickInterval = null;
    }
}

function getElapsed(): number {
    if (!startTime) return 0;
    const now = pausedAt ?? Date.now();
    return Math.floor((now - startTime - totalPauseMs) / 1000);
}

function tick() {
    const elapsed = getElapsed();
    const remaining = Math.max(0, durationSeconds - elapsed);

    self.postMessage({
        type: 'TICK',
        remaining,
        elapsed,
        total: durationSeconds,
    });

    if (remaining <= 0) {
        clearTimer();
        self.postMessage({ type: 'COMPLETE' });
    }
}

self.onmessage = (e: MessageEvent) => {
    const { type } = e.data;

    if (type === 'START') {
        clearTimer();
        durationSeconds = e.data.durationSeconds;
        startTime = Date.now();
        pausedAt = null;
        totalPauseMs = 0;

        tick(); // immediate first tick
        tickInterval = self.setInterval(tick, 1000);
        self.postMessage({ type: 'STARTED' });
    }

    if (type === 'PAUSE') {
        if (pausedAt === null && startTime !== null) {
            pausedAt = Date.now();
            clearTimer();
            self.postMessage({ type: 'PAUSED' });
        }
    }

    if (type === 'RESUME') {
        if (pausedAt !== null && startTime !== null) {
            totalPauseMs += Date.now() - pausedAt;
            pausedAt = null;
            tick(); // immediate tick on resume
            tickInterval = self.setInterval(tick, 1000);
            self.postMessage({ type: 'RESUMED' });
        }
    }

    if (type === 'STOP') {
        clearTimer();
        startTime = null;
        pausedAt = null;
        totalPauseMs = 0;
        self.postMessage({ type: 'STOPPED' });
    }
};

export {};
