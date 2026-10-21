import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { readJsonOutput, typeFor } from '../scripts/contracts.mjs';

function child() {
  const process = new EventEmitter();
  process.stdout = new EventEmitter();
  return process;
}

test('contract output waits for drained stdout and preserves split UTF-8', async () => {
  const process = child();
  const result = readJsonOutput(process);
  const output = Buffer.from('{"name":"ü"}');
  const split = output.indexOf(Buffer.from('ü')) + 1;
  process.stdout.emit('data', output.subarray(0, split));
  process.emit('exit', 0);
  process.stdout.emit('data', output.subarray(split));
  process.emit('close', 0);
  assert.deepEqual(await result, { name: 'ü' });
});

test('malformed contract output rejects instead of throwing from the event handler', async () => {
  const process = child();
  const result = assert.rejects(readJsonOutput(process), /returned invalid JSON/);
  process.stdout.emit('data', Buffer.from('{truncated'));
  process.emit('close', 0);
  await result;
});

test('contract output reports process, stream, exit, and signal failures', async () => {
  for (const event of ['spawn', 'stdout', 'exit', 'signal']) {
    const process = child();
    const result = assert.rejects(readJsonOutput(process), /failed/);
    if (event === 'spawn') process.emit('error', new Error('spawn failed'));
    if (event === 'stdout') process.stdout.emit('error', new Error('read failed'));
    if (event === 'exit') process.emit('close', 1);
    if (event === 'signal') process.emit('close', null, 'SIGTERM');
    await result;
  }
});

test('closed empty objects generate strict parameter types without altering the schema', async () => {
  const schema = { type: 'object', additionalProperties: false, properties: {} };
  assert.match(await typeFor(schema, 'EmptyParams'), /type EmptyParams = Record<string, never>/);
  assert.equal(Object.hasOwn(schema, 'tsType'), false);
  assert.match(
    await typeFor({ type: 'object', properties: { nested: schema } }, 'Nested'),
    /nested\?: Record<string, never>/,
  );
  assert.doesNotMatch(await typeFor({ type: 'object' }, 'Open'), /Record<string, never>/);
});
