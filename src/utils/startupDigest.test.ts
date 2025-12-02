import test from 'node:test';
import assert from 'node:assert/strict';
import {
  triggerStartupDigest,
  StartupDigestLogger,
} from './startupDigest';

function createLoggerSpy() {
  const records = {
    info: [] as Array<{ message: string; meta?: unknown }>,
    warn: [] as Array<{ message: string; meta?: unknown }>,
    error: [] as Array<{ message: string; meta?: unknown }>,
  };

  const logger = {
    info: (message: string, meta?: unknown) => {
      records.info.push({ message, meta });
    },
    warn: (message: string, meta?: unknown) => {
      records.warn.push({ message, meta });
    },
    error: (message: string, meta?: unknown) => {
      records.error.push({ message, meta });
    },
  } as StartupDigestLogger;

  return { logger, records };
}

test('triggerStartupDigest calls sendDigests and logs success', async () => {
  let sendCalls = 0;
  const scheduler = {
    async sendDigests() {
      sendCalls += 1;
    },
  };
  const { logger, records } = createLoggerSpy();

  await triggerStartupDigest(scheduler, logger);

  assert.equal(sendCalls, 1);
  assert.equal(records.info.length, 1);
  assert.equal(records.warn.length, 0);
  assert.equal(records.error.length, 0);
});

test('triggerStartupDigest warns when scheduler missing', async () => {
  const { logger, records } = createLoggerSpy();

  await triggerStartupDigest(null, logger);

  assert.equal(records.warn.length, 1);
  assert.equal(records.info.length, 0);
  assert.equal(records.error.length, 0);
});

test('triggerStartupDigest logs error when sendDigests rejects', async () => {
  const scheduler = {
    async sendDigests() {
      throw new Error('boom');
    },
  };
  const { logger, records } = createLoggerSpy();

  await triggerStartupDigest(scheduler, logger);

  assert.equal(records.error.length, 1);
  assert.equal(records.info.length, 0);
});


