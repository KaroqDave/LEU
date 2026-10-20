import assert from 'node:assert/strict';
import { test } from 'node:test';
import { encodeFrame, FrameDecoder, FrameTooLargeError } from '../src/main/framing';
import { MAX_REQUEST_BYTES, MAX_RESPONSE_BYTES } from '../src/contracts/protocol';

const text = (frames: Buffer[]) => frames.map((frame) => frame.toString());

test('keeps requests small and allows large responses', () => {
  assert.equal(MAX_REQUEST_BYTES, 16 * 1024);
  assert.ok(MAX_RESPONSE_BYTES >= 300 * MAX_REQUEST_BYTES);
});

test('splits several frames and keeps a partial tail', () => {
  const decoder = new FrameDecoder(64);
  assert.deepEqual(text(decoder.push(Buffer.from('{"a":1}\n{"b":2}\n{"c"'))), [
    '{"a":1}',
    '{"b":2}',
  ]);
  assert.deepEqual(text(decoder.push(Buffer.from(':3}\n'))), ['{"c":3}']);
  assert.deepEqual(decoder.push(Buffer.alloc(0)), []);
});

test('reassembles a frame larger than the request limit from many chunks', () => {
  const decoder = new FrameDecoder(MAX_RESPONSE_BYTES);
  const payload = JSON.stringify({ data: 'x'.repeat(MAX_REQUEST_BYTES * 20) });
  const bytes = Buffer.from(payload + '\n');
  const frames: Buffer[] = [];
  for (let offset = 0; offset < bytes.length; offset += 65536)
    frames.push(...decoder.push(bytes.subarray(offset, offset + 65536)));
  assert.deepEqual(text(frames), [payload]);
});

test('counts the newline toward the frame limit', () => {
  assert.deepEqual(text(new FrameDecoder(4).push(Buffer.from('abc\n'))), ['abc']);
  assert.throws(() => new FrameDecoder(4).push(Buffer.from('abcd\n')), FrameTooLargeError);
});

test('rejects an oversized frame before its newline arrives', () => {
  const decoder = new FrameDecoder(8);
  decoder.push(Buffer.from('abcdef'));
  assert.throws(() => decoder.push(Buffer.from('gh')), FrameTooLargeError);
});

test('refuses to encode a request over its limit', () => {
  assert.equal(encodeFrame({ id: 'x' }, 64)?.toString(), '{"id":"x"}\n');
  assert.equal(encodeFrame({ data: 'x'.repeat(MAX_REQUEST_BYTES) }, MAX_REQUEST_BYTES), undefined);
});
