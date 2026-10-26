import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PluginSDK } from '@logitech/plugin-sdk';
import { exitOnDisconnect } from '../src/connection.ts';

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

const tick = () => new Promise((r) => setTimeout(r, 5));

test('exits with code 1 when the service connection closes', async () => {
  const { sdk, close } = fakeSdk();
  const codes: number[] = [];
  assert.equal(exitOnDisconnect(sdk, (c) => codes.push(c), 0), true);
  close();
  await tick();
  assert.deepEqual(codes, [1]);
});

test('exits once even when error and close both fire', async () => {
  const { sdk, close, error } = fakeSdk();
  const codes: number[] = [];
  exitOnDisconnect(sdk, (c) => codes.push(c), 0);
  error(new Error('ECONNRESET'));
  close();
  await tick();
  assert.deepEqual(codes, [1]);
});

test('leaves the plugin running when the SDK internals are unexpected', () => {
  const codes: number[] = [];
  assert.equal(exitOnDisconnect({} as PluginSDK, (c) => codes.push(c), 0), false);
  assert.deepEqual(codes, []);
});
