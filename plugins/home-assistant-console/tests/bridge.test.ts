import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hookMessages, type FaceProvider, type Internals } from '../src/bridge.ts';

function fakeClient() {
  const sent: unknown[] = [];
  const passed: Buffer[] = [];
  let handler: ((data: Buffer) => void) | undefined;
  const internals: Internals = {
    _client: {
      onMessage: (h) => {
        handler = h;
      },
      sendMessage: (m) => {
        sent.push(m);
      },
    },
    _handleMessage: async (data) => {
      passed.push(data);
    },
  };
  return { internals, sent, passed, deliver: (m: unknown) => handler!(Buffer.from(JSON.stringify(m))) };
}

const provider: FaceProvider = { name: 'ha_entity_1', image: () => 'QUJD', text: () => 'label' };

test('answers GetActionImage and GetActionText for its own actions', () => {
  const { internals, sent, passed, deliver } = fakeClient();
  process.env.LPS_PLUGIN_NAME = 'HomeAssistantConsole';
  const notify = hookMessages(internals, [provider]);
  deliver({ id: 7, name: 'GetActionImage', messageType: 'Request', parameters: { actionName: 'ha_entity_1' } });
  deliver({ id: 8, name: 'GetActionText', messageType: 'Request', parameters: { actionName: 'ha_entity_1' } });
  assert.deepEqual(sent[0], { id: 7, name: 'GetActionImage', messageType: 'Response', data: { image: 'QUJD' }, failed: false, errorMessage: '', errorCode: 0 });
  assert.deepEqual(sent[1], { id: 8, name: 'GetActionText', messageType: 'Response', data: { text: 'label' }, failed: false, errorMessage: '', errorCode: 0 });
  assert.equal(passed.length, 0);

  notify('ActionImageChanged', 'ha_entity_1');
  assert.deepEqual(sent[2], {
    id: 0,
    name: 'ActionImageChanged',
    messageType: 'Event',
    parameters: { pluginName: 'HomeAssistantConsole', actionName: 'ha_entity_1', actionParameter: null },
  });
});

test('passes everything else to the SDK', () => {
  const { internals, sent, passed, deliver } = fakeClient();
  hookMessages(internals, [provider]);
  deliver({ id: 1, name: 'ExecuteCommand', messageType: 'Request', parameters: { actionName: 'ha_entity_1' } });
  deliver({ id: 2, name: 'GetActionImage', messageType: 'Request', parameters: { actionName: 'someone_else' } });
  deliver({ id: 3, name: 'StopPlugin', messageType: 'Event' });
  assert.equal(sent.length, 0);
  assert.equal(passed.length, 3);
});

test('degrades to a no-op when the SDK internals are missing', () => {
  const notify = hookMessages({}, [provider]);
  assert.doesNotThrow(() => notify('ActionTextChanged', 'ha_entity_1'));
});
