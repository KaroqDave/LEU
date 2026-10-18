const mode = process.argv[2];
process.stdin.once('data', (data) => {
  const request = JSON.parse(data.toString());
  if (mode === 'exit') process.exit(7);
  if (mode === 'timeout') return;
  if (mode === 'oversized') {
    process.stdout.write('x'.repeat(17 * 1024));
    return;
  }
  const response = {
    protocolVersion: mode === 'mismatch' ? 2 : 1,
    id: mode === 'wrong-id' ? 'other-request' : request.id,
    ok: true,
    result: { engineVersion: '0.1.0', platform: 'windows', arch: 'x86_64' },
  };
  const frame = JSON.stringify(response) + '\n';
  if (mode === 'fragmented') {
    process.stdout.write(frame.slice(0, 12));
    setTimeout(() => process.stdout.write(frame.slice(12)), 20);
  } else {
    process.stdout.write(mode === 'invalid' ? '{not json}\n' : frame);
  }
  if (mode === 'crash-later') setTimeout(() => process.exit(9), 50);
});
process.stdin.on('end', () => process.exit(0));
process.stdin.resume();
