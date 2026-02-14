import type { Signal, AnticipationContext } from '../../types/signals';
import { detectAgingSignals } from './aging-detector';
import { detectStreakSignals } from './streak-guardian';
import { detectDeadlineSignals } from './deadline-radar';
import { detectPatternSignals } from './pattern-recognizer';
import { generateClaudeInsights } from './claude-insight-engine';
import { synthesizePriorities } from './priority-synthesizer';

export interface AnticipationResult {
  signals: Signal[];
  prioritizedSignals: Signal[];
  runDuration: number;
  timestamp: string;
  servicesRun: string[];
}

export async function runAnticipationCycle(
  context: AnticipationContext
): Promise<AnticipationResult> {
  const startTime = performance.now();
  const timestamp = new Date().toISOString();

  console.info('[Anticipation Engine] Starting anticipation cycle at', timestamp);

  const detectors = [
    { name: 'aging-detector', fn: () => detectAgingSignals(context) },
    { name: 'streak-guardian', fn: () => detectStreakSignals(context) },
    { name: 'deadline-radar', fn: () => detectDeadlineSignals(context) },
    { name: 'pattern-recognizer', fn: () => detectPatternSignals(context) },
    { name: 'claude-insight-engine', fn: () => generateClaudeInsights(context, context.historicalPatterns, context.signals) },
  ];

  const results = await Promise.allSettled(
    detectors.map(({ name, fn }) =>
      Promise.resolve().then(() => fn()).then((signals) => ({ name, signals }))
    )
  );

  const allSignals: Signal[] = [];
  const servicesRun: string[] = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      const { name, signals } = result.value;
      allSignals.push(...signals);
      servicesRun.push(name);
      console.info(
        `[Anticipation Engine] ${name} completed: ${signals.length} signals`
      );
    } else {
      const name = detectors[index].name;
      console.error(
        `[Anticipation Engine] ${name} failed:`,
        result.reason
      );
    }
  });

  const prioritizedSignals = synthesizePriorities(allSignals, context, context.signalWeights);

  const runDuration = performance.now() - startTime;

  console.info(
    `[Anticipation Engine] Cycle complete in ${runDuration.toFixed(2)}ms: ${allSignals.length} total signals, ${servicesRun.length} services succeeded`
  );

  return {
    signals: allSignals,
    prioritizedSignals,
    runDuration,
    timestamp,
    servicesRun,
  };
}

export function getDefaultContext(): Partial<AnticipationContext> {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const currentTime = now.toTimeString().slice(0, 5);
  const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });

  return {
    today,
    currentTime,
    dayOfWeek,
  };
}
