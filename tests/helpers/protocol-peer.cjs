// A scripted stand-in for the Rust helper. The first request is the handshake; modes ending in
// "-second" misbehave on the first request after it.
const readline = require('node:readline');

const mode = process.argv[2];
const MAX_RESPONSE_BYTES = require('../../src/contracts/contract.json').limits.responseBytes;
const version = { engineVersion: '0.1.0', platform: 'windows', arch: 'x86_64' };
const ok = (request, result = version) => ({
  protocolVersion: mode.startsWith('mismatch') ? 2 : mode === 'invalid-version' ? '2' : 1,
  id: mode === 'wrong-id' ? 'other-request' : request.id,
  ok: true,
  result,
});
const frame = (response) => JSON.stringify(response) + '\n';
let count = 0;
const held = [];

function handle(request) {
  count += 1;
  if (count === 1) {
    if (mode === 'exit') process.exit(7);
    if (mode === 'timeout') return;
    if (mode === 'oversized') {
      process.stdout.write('x'.repeat(MAX_RESPONSE_BYTES + 1));
      return;
    }
    if (mode === 'invalid') {
      process.stdout.write('{not json}\n');
      return;
    }
    const envelope = ok(request);
    if (mode === 'extra' || mode === 'mismatch-extra') envelope.futureField = true;
    const response = frame(
      mode === 'mismatch-envelope' ? { protocolVersion: 2, futurePayload: {} } : envelope,
    );
    if (mode === 'fragmented') {
      process.stdout.write(response.slice(0, 12));
      setTimeout(() => process.stdout.write(response.slice(12)), 20);
    } else {
      process.stdout.write(response);
    }
    if (mode === 'crash-later') setTimeout(() => process.exit(9), 50);
    if (mode === 'unsolicited')
      setTimeout(() => process.stdout.write(frame({ ...ok(request), id: 'never-sent' })), 20);
    return;
  }
  if (mode === 'reverse') {
    // Answer three requests at once, newest first, in a single write.
    held.push(request);
    if (held.length === 3)
      process.stdout.write(
        held
          .reverse()
          .map((r) => frame(ok(r)))
          .join(''),
      );
    return;
  }
  if (count === 2 && mode === 'stall-second') return;
  if (count === 2 && mode === 'exit-second') process.exit(3);
  if (count === 2 && (mode === 'reject-second' || mode === 'invalid-request-second')) {
    const error = {
      code: mode === 'reject-second' ? 'UNKNOWN_METHOD' : 'INVALID_REQUEST',
      message: 'Rejected request.',
    };
    process.stdout.write(frame({ protocolVersion: 1, id: request.id, ok: false, error }));
    return;
  }
  if (count === 2 && mode === 'bad-result') {
    process.stdout.write(frame(ok(request, { ...version, arch: 64 })));
    return;
  }
  process.stdout.write(frame(ok(request)));
}

readline.createInterface({ input: process.stdin }).on('line', (line) => handle(JSON.parse(line)));
process.stdin.on('end', () => process.exit(0));
