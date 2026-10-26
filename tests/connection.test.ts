import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PluginSDK } from '@logitech/plugin-sdk';
import { recoverOnDisconnect } from '../src/connection.ts';

function fakeSdk() {
  let close: (() => void) | undefined;
  let error: ((e: unknown) => void) | undefined;
  const sdk = {
    _client: {
      onClose: (h: () => void) => {
        close = h;
      },
      onError: (h: (e: unknown) => void) => {
        error = h;
      },
    },
  } as unknown as PluginSDK;
  return { sdk, close: () => close!(), error: (e: unknown) => error!(e) };
}

const after = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('requests a reload when the service connection closes, and exits only after the attempts run out', async () => {
  const { sdk, close } = fakeSdk();
  const reloads: string[] = [];
  const codes: number[] = [];
  assert.equal(
    recoverOnDisconnect(sdk, { reload: (r) => reloads.push(r), exit: (c) => codes.push(c), reloadWaitMs: 5, reloadAttempts: 2 }),
    true,
  );
  close();
  assert.equal(reloads.length, 1);
  assert.match(reloads[0], /closed; requesting a plugin reload \(attempt 1 of 2\)/);
  assert.deepEqual(codes, []);
  await after(8);
  assert.equal(reloads.length, 2);
  assert.deepEqual(codes, []);
  await after(8);
  assert.equal(reloads.length, 2);
  assert.deepEqual(codes, [1]);
});

test('recovers once even when error and close both fire', async () => {
  const { sdk, close, error } = fakeSdk();
  const reloads: string[] = [];
  recoverOnDisconnect(sdk, { reload: (r) => reloads.push(r), exit: () => {}, reloadWaitMs: 1000, reloadAttempts: 1 });
  error(new Error('ECONNRESET'));
  close();
  assert.equal(reloads.length, 1);
  assert.match(reloads[0], /failed \(ECONNRESET\)/);
});

test('leaves the plugin running when the SDK internals are unexpected', () => {
  const reloads: string[] = [];
  assert.equal(recoverOnDisconnect({} as PluginSDK, { reload: (r) => reloads.push(r), exit: () => {} }), false);
  assert.deepEqual(reloads, []);
});
