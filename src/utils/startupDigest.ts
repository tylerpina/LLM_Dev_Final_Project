import { logger as defaultLogger } from './logger';
import type { DigestScheduler } from '../services/digestScheduler';

export interface StartupDigestLogger {
  info(message: string, meta?: unknown): unknown;
  warn(message: string, meta?: unknown): unknown;
  error(message: string, meta?: unknown): unknown;
}

type DigestSchedulerLike = Pick<DigestScheduler, 'sendDigests'>;

/**
 * Trigger a one-off digest send during startup so the latest content is delivered
 * immediately after boot. The logger is injected to make the behavior testable.
 */
export async function triggerStartupDigest(
  digestScheduler: DigestSchedulerLike | null | undefined,
  log: StartupDigestLogger = defaultLogger
): Promise<void> {
  if (!digestScheduler) {
    log.warn('Skipping startup digest: scheduler is not initialized');
    return;
  }

  try {
    await digestScheduler.sendDigests();
    log.info('Startup digest dispatched');
  } catch (error) {
    log.error('Failed to send startup digest', { error });
  }
}


