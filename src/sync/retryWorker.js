import { config } from '../config.js';
import { getDueRetryJobs, markRetryDone, rescheduleRetry } from '../db/retryRepository.js';
import { errorToString } from '../utils/errors.js';
import { log } from '../utils/log.js';

export class RetryWorker {
  constructor({ avatarSync, telegramLogger }) {
    this.avatarSync = avatarSync;
    this.telegramLogger = telegramLogger;
    this.timer = null;
    this.running = false;
  }

  start() {
    this.timer = setInterval(() => {
      this.tick().catch((error) => log.error('Retry worker tick failed', { error: errorToString(error) }));
    }, 30_000);

    this.tick().catch((error) => log.error('Initial retry worker tick failed', { error: errorToString(error) }));
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick() {
    if (this.running) return;
    this.running = true;

    try {
      const jobs = await getDueRetryJobs();
      for (const job of jobs) {
        await this.processJob(job);
      }
    } finally {
      this.running = false;
    }
  }

  async processJob(job) {
    try {
      await this.telegramLogger.info(`Retrying job #${job.id} (${job.type}), attempt ${job.attempts + 1}.`);

      if (job.type !== 'avatar_sync') {
        throw new Error(`Unsupported retry job type: ${job.type}`);
      }

      await this.avatarSync.retry(job.payload);
      await markRetryDone(job.id);
      await this.telegramLogger.info(`Retry job #${job.id} completed.`);
    } catch (error) {
      const attempts = job.attempts + 1;
      const runAfter = new Date(Date.now() + config.retryDelayMs);
      await rescheduleRetry(job.id, attempts, runAfter, errorToString(error));
      await this.telegramLogger.error(
        `Retry job #${job.id} failed. Next retry at ${runAfter.toISOString()}. ${errorToString(error)}`,
      );
    }
  }
}
