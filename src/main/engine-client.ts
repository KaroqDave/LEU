import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { EngineErrorCode, EngineStatus } from '../contracts/bridge';
import { isEngineResponse, MAX_FRAME_BYTES, PROTOCOL_VERSION } from '../contracts/protocol';

export class EngineClient {
  private child?: ChildProcessWithoutNullStreams;
  private handshake?: Promise<EngineStatus>;
  private settle?: (status: EngineStatus) => void;
  private timer?: NodeJS.Timeout;
  private buffer = Buffer.alloc(0);
  private requestId = '';
  private status?: EngineStatus;
  private restarting?: Promise<EngineStatus>;

  constructor(
    private readonly executable: string,
    private readonly args: string[] = [],
    private readonly timeoutMs = 5_000,
    private readonly onStatus?: (status: EngineStatus) => void,
  ) {}

  async getStatus(): Promise<EngineStatus> {
    if (this.status) return this.status;
    if (this.handshake) return this.handshake;
    this.handshake = new Promise<EngineStatus>((resolve) => {
      this.settle = resolve;
    });
    this.requestId = randomUUID();
    const child = spawn(this.executable, this.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true,
    });
    this.child = child;
    child.stdout.on('data', (chunk: Buffer) => {
      if (this.child === child) this.receive(chunk);
    });
    child.stderr.resume();
    child.once('error', (error: NodeJS.ErrnoException) => {
      if (this.child !== child) return;
      this.fail(
        error.code === 'ENOENT' ? 'MISSING_HELPER' : 'START_FAILED',
        error.code === 'ENOENT'
          ? 'The Windows helper is missing. Build or reinstall LEU.'
          : 'The Windows helper could not start.',
      );
    });
    child.once('exit', () => {
      if (this.child === child)
        this.fail('ENGINE_EXITED', 'The Windows helper stopped. Reconnect to try again.');
    });
    child.stdin.on('error', () => {
      if (this.child === child) this.fail('ENGINE_EXITED', 'The Windows helper connection closed.');
    });
    this.timer = setTimeout(
      () =>
        this.fail(
          'TIMEOUT',
          `The Windows helper did not respond within ${this.timeoutMs / 1000} seconds.`,
        ),
      this.timeoutMs,
    );
    child.stdin.write(
      JSON.stringify({
        protocolVersion: PROTOCOL_VERSION,
        id: this.requestId,
        method: 'engine.version',
        params: {},
      }) + '\n',
    );
    return this.handshake;
  }

  private receive(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const newline = this.buffer.indexOf(10);
    if ((newline < 0 && this.buffer.length > MAX_FRAME_BYTES) || newline + 1 > MAX_FRAME_BYTES) {
      this.fail('INVALID_RESPONSE', 'The Windows helper sent an oversized response.');
      return;
    }
    if (newline < 0) return;
    if (this.status?.state === 'ready' || this.buffer.length !== newline + 1) {
      this.fail('INVALID_RESPONSE', 'The Windows helper sent an unexpected response.');
      return;
    }
    let response: unknown;
    try {
      response = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(this.buffer.subarray(0, newline)),
      );
    } catch {
      this.fail('INVALID_RESPONSE', 'The Windows helper sent invalid JSON.');
      return;
    }
    this.buffer = Buffer.alloc(0);
    if (!isEngineResponse(response) || response.id !== this.requestId) {
      this.fail(
        'INVALID_RESPONSE',
        'The Windows helper response did not match the request contract.',
      );
      return;
    }
    if (
      response.protocolVersion !== PROTOCOL_VERSION ||
      (!response.ok && response.error.code === 'PROTOCOL_MISMATCH')
    ) {
      this.fail(
        'PROTOCOL_MISMATCH',
        'App and helper protocols do not match. Rebuild or reinstall them together.',
      );
      return;
    }
    if (!response.ok) {
      this.fail('INVALID_RESPONSE', 'The Windows helper rejected the version request.');
      return;
    }
    this.complete({
      state: 'ready',
      protocolVersion: response.protocolVersion,
      ...response.result,
    });
  }

  private complete(status: EngineStatus): void {
    clearTimeout(this.timer);
    this.status = status;
    this.onStatus?.(status);
    this.settle?.(status);
    this.settle = undefined;
  }

  private fail(code: EngineErrorCode, message: string): void {
    if (this.status?.state === 'error') return;
    this.complete({ state: 'error', code, message });
    this.child?.kill();
  }

  async stop(): Promise<void> {
    const child = this.child;
    this.child = undefined;
    clearTimeout(this.timer);
    if (this.settle)
      this.complete({
        state: 'error',
        code: 'ENGINE_EXITED',
        message: 'The Windows helper was stopped.',
      });
    if (!child || child.exitCode !== null || child.signalCode !== null || !child.pid) return;
    await new Promise<void>((resolve) => {
      const fallback = setTimeout(() => child.kill(), 500);
      child.once('exit', () => {
        clearTimeout(fallback);
        resolve();
      });
      child.stdin.end();
    });
  }

  restart(): Promise<EngineStatus> {
    if (this.restarting) return this.restarting;
    this.restarting = (async () => {
      await this.stop();
      this.status = undefined;
      this.handshake = undefined;
      this.buffer = Buffer.alloc(0);
      return this.getStatus();
    })().finally(() => {
      this.restarting = undefined;
    });
    return this.restarting;
  }
}
