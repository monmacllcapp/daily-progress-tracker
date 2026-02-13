import { runAnticipationCycle, getDefaultContext } from '../services/intelligence/anticipation-engine';
import { useSignalStore } from '../store/signalStore';
import type { AnticipationContext } from '../types/signals';

export interface AnticipationWorkerConfig {
  intervalMs: number;  // default: 300000 (5 minutes)
  enabled: boolean;
}

const DEFAULT_CONFIG: AnticipationWorkerConfig = {
  intervalMs: 300000,
  enabled: true,
};

class AnticipationWorker {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private config: AnticipationWorkerConfig;
  private isRunning = false;
  private lastRunAt: string | null = null;
  private contextProvider: (() => Promise<AnticipationContext>) | null = null;

  constructor(config: Partial<AnticipationWorkerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setContextProvider(provider: () => Promise<AnticipationContext>) {
    this.contextProvider = provider;
  }

  async start(): Promise<void> {
    if (this.intervalId) return; // Already running
    if (!this.config.enabled) return;

    console.info('[Anticipation Worker] Starting with interval:', this.config.intervalMs, 'ms');

    // Run immediately on start
    await this.runCycle();

    // Then set up interval
    this.intervalId = setInterval(() => {
      this.runCycle().catch(err => {
        console.error('[Anticipation Worker] Cycle error:', err);
      });
    }, this.config.intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.info('[Anticipation Worker] Stopped');
    }
  }

  async runCycle(): Promise<void> {
    if (this.isRunning) {
      console.warn('[Anticipation Worker] Skipping — previous cycle still running');
      return;
    }

    this.isRunning = true;

    try {
      let context: AnticipationContext;

      if (this.contextProvider) {
        context = await this.contextProvider();
      } else {
        // Build minimal context from defaults
        const defaults = getDefaultContext();
        context = {
          tasks: [],
          projects: [],
          categories: [],
          emails: [],
          calendarEvents: [],
          deals: [],
          signals: useSignalStore.getState().signals,
          mcpData: {},
          today: defaults.today!,
          currentTime: defaults.currentTime!,
          dayOfWeek: defaults.dayOfWeek!,
          historicalPatterns: [],
        };
      }

      const result = await runAnticipationCycle(context);

      // Push new signals to store
      if (result.signals.length > 0) {
        useSignalStore.getState().addSignals(result.signals);
      }

      // Clear expired signals
      useSignalStore.getState().clearExpired();

      this.lastRunAt = result.timestamp;

      console.info(
        `[Anticipation Worker] Cycle complete: ${result.signals.length} new signals, ` +
        `${result.servicesRun.length} services ran in ${result.runDuration.toFixed(0)}ms`
      );
    } catch (err) {
      console.error('[Anticipation Worker] Cycle failed:', err);
    } finally {
      this.isRunning = false;
    }
  }

  getStatus() {
    return {
      isActive: this.intervalId !== null,
      isRunning: this.isRunning,
      lastRunAt: this.lastRunAt,
      config: this.config,
    };
  }

  async updateConfig(updates: Partial<AnticipationWorkerConfig>): Promise<void> {
    const wasActive = this.intervalId !== null;
    if (wasActive) this.stop();
    this.config = { ...this.config, ...updates };
    if (wasActive && this.config.enabled) {
      await this.start();
    }
  }
}

export const anticipationWorker = new AnticipationWorker();
