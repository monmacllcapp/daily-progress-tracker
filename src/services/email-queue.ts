/**
 * Email Processing Queue
 *
 * Rate-limited queue for Gmail API operations.
 * Prevents hitting Gmail's rate limits when batch processing emails.
 */

type QueueTask = () => Promise<void>;

interface QueueItem {
    task: QueueTask;
    resolve: () => void;
    reject: (err: Error) => void;
}

export class EmailProcessingQueue {
    private queue: QueueItem[] = [];
    private processing = false;
    private rateDelayMs: number;

    constructor(rateDelayMs: number = 250) {
        this.rateDelayMs = rateDelayMs;
    }

    /**
     * Add a task to the queue. Returns when the task completes.
     */
    enqueue(task: QueueTask): Promise<void> {
        return new Promise((resolve, reject) => {
            this.queue.push({ task, resolve, reject });
            if (!this.processing) this.processNext();
        });
    }

    get length(): number {
        return this.queue.length;
    }

    get isProcessing(): boolean {
        return this.processing;
    }

    private async processNext(): Promise<void> {
        if (this.queue.length === 0) {
            this.processing = false;
            return;
        }

        this.processing = true;
        const item = this.queue.shift()!;

        try {
            await item.task();
            item.resolve();
        } catch (err) {
            item.reject(err instanceof Error ? err : new Error(String(err)));
        }

        // Rate limit delay between operations
        await new Promise(r => setTimeout(r, this.rateDelayMs));
        this.processNext();
    }
}

// Singleton for Gmail operations
let emailQueue: EmailProcessingQueue | null = null;

export function getEmailQueue(): EmailProcessingQueue {
    if (!emailQueue) {
        emailQueue = new EmailProcessingQueue(250);
    }
    return emailQueue;
}
