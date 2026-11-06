import test from 'node:test';
import assert from 'node:assert/strict';
import register, { cleanLabel, toastScript } from '../src/index.ts';

test('labels strip controls and bound length', () => {
  assert.equal(cleanLabel('a\nb\u0000c'), 'a b c');
  assert.equal(cleanLabel('x'.repeat(200)).length, 100);
});

test('notification data cannot inject PowerShell or XML', () => {
  const title = "Session '); throw 'injected'; # <>&";
  const script = toastScript(title, 'Project test');
  assert(!script.includes(title));
  const encoded = script.match(/FromBase64String\('([^']+)'\)/)[1];
  assert.equal(JSON.parse(Buffer.from(encoded, 'base64').toString()).title, title);
  assert(script.includes('.InnerText = $d.title'));
  assert(script.includes('<audio src="ms-winsoundevent:Notification.Default"/>'));
  assert(!script.includes('silent="true"'));
});

test('extension registers settled lifecycle and local controls', () => {
  const events = new Map();
  const commands = new Map();
  register({ on: (name, fn) => events.set(name, fn), registerCommand: (name, cmd) => commands.set(name, cmd) });
  for (const name of ['agent_start', 'message_end', 'agent_settled', 'session_shutdown']) assert(events.has(name));
  assert(commands.has('win-notify'));
});

test('RPC settlement never launches Windows helper', async () => {
  const events = new Map();
  register({ on: (name, fn) => events.set(name, fn), registerCommand() {} });
  events.get('agent_start')();
  await events.get('agent_settled')({}, { mode: 'rpc', ui: { notify() { throw Error('unexpected notification'); } } });
});
