/**
 * ============================================================
 *  AI QUEUE — Concurrent Task Orchestrator
 * ============================================================
 *  Manages AI requests to prevent API rate-limiting.
 *  - Concurrency: 2 (Simultaneous active calls)
 *  - Queue Depth: 6 (Waiting tasks)
 *  - Supports AbortSignal for tab abandonment.
 * ============================================================
 */

export class AIQueue {
  constructor(options = {}) {
    this.maxConcurrency = options.maxConcurrency || 2;
    this.maxQueueDepth = options.maxQueueDepth || 6;
    this.queue = [];
    this.activeCount = 0;
  }

  /**
   * Add a task to the queue.
   * @param {Function} taskFn - The async function to execute.
   * @param {Object} options - { signal, taskId }
   * @returns {Promise}
   */
  async add(taskFn, options = {}) {
    const { signal, taskId } = options;

    if (signal?.aborted) {
      throw new Error('Task aborted before starting.');
    }

    // Check Queue Depth (Waiters only)
    if (this.queue.length >= this.maxQueueDepth) {
      const error = new Error('System busy. Please try again in a moment.');
      error.category = 'QUEUE_ERROR';
      error.isBusy = true;
      throw error;
    }

    return new Promise((resolve, reject) => {
      const task = {
        taskId,
        execute: async () => {
          try {
            if (signal?.aborted) {
              reject(new Error('Task cancelled.'));
              return;
            }
            const result = await taskFn(signal);
            resolve(result);
          } catch (err) {
            reject(err);
          }
        },
        reject,
        signal
      };

      // Handle signal cancellation while in queue
      if (signal) {
        signal.addEventListener('abort', () => {
          const idx = this.queue.indexOf(task);
          if (idx !== -1) {
            this.queue.splice(idx, 1);
            reject(new Error('Task cancelled by user or tab closed.'));
          }
        }, { once: true });
      }

      this.queue.push(task);
      this._processNext();
    });
  }

  /**
   * Internal worker loop.
   * Processes the next task if capacity allows.
   */
  async _processNext() {
    if (this.activeCount >= this.maxConcurrency || this.queue.length === 0) {
      return;
    }

    this.activeCount++;
    const task = this.queue.shift();

    try {
      await task.execute();
    } finally {
      this.activeCount--;
      // Small tick to prevent stack overflow on high throughput
      setTimeout(() => this._processNext(), 0);
    }
  }

  /**
   * Check if the system is currently at maximum capacity.
   */
  isFull() {
    return this.queue.length >= this.maxQueueDepth;
  }

  get stats() {
    return {
      active: this.activeCount,
      waiting: this.queue.length,
      availableSpots: this.maxQueueDepth - this.queue.length
    };
  }
}

// Singleton instance for the whole backend/service-worker process
const defaultQueue = new AIQueue();
export default defaultQueue;
