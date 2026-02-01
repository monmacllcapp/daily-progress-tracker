import { describe, it, expect } from 'vitest';
import { EmailProcessingQueue } from '../email-queue';

describe('EmailProcessingQueue', () => {
    it('should process tasks sequentially', async () => {
        const queue = new EmailProcessingQueue(10); // 10ms delay for tests
        const order: number[] = [];

        await Promise.all([
            queue.enqueue(async () => { order.push(1); }),
            queue.enqueue(async () => { order.push(2); }),
            queue.enqueue(async () => { order.push(3); }),
        ]);

        expect(order).toEqual([1, 2, 3]);
    });

    it('should report length correctly', () => {
        const queue = new EmailProcessingQueue(10);
        expect(queue.length).toBe(0);
    });

    it('should handle errors without stopping the queue', async () => {
        const queue = new EmailProcessingQueue(10);
        const results: string[] = [];

        const p1 = queue.enqueue(async () => { results.push('first'); });
        const p2 = queue.enqueue(async () => { throw new Error('fail'); });
        const p3 = queue.enqueue(async () => { results.push('third'); });

        await p1;
        await expect(p2).rejects.toThrow('fail');
        await p3;

        expect(results).toEqual(['first', 'third']);
    });

    it('should report processing state', async () => {
        const queue = new EmailProcessingQueue(10);
        expect(queue.isProcessing).toBe(false);

        let resolveInner: () => void;
        const blockingPromise = new Promise<void>(r => { resolveInner = r; });

        const taskPromise = queue.enqueue(async () => {
            await blockingPromise;
        });

        // Give the queue time to start processing
        await new Promise(r => setTimeout(r, 5));
        expect(queue.isProcessing).toBe(true);

        resolveInner!();
        await taskPromise;
    });
});
