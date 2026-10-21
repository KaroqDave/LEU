import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { EngineErrorCode, EngineStatus } from '../contracts/bridge';
import {
  isEngineRequest,
  isEngineResponse,
  isEngineResult,
  MAX_REQUEST_BYTES,
  MAX_RESPONSE_BYTES,
  PROTOCOL_VERSION,
  type EngineMethod,
  type EngineParams,
  type EngineRemoteErrorCode,
  type EngineResult,
} from '../contracts/protocol';
import { encodeFrame, FrameDecoder, FrameTooLargeError } from './framing';

export class EngineError extends Error {
  constructor(
    readonly code: EngineErrorCode | EngineRemoteErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'EngineError';
  }
}

interface PendingRequest {
  method: EngineMethod;
  resolve: (result: unknown) => void;
  reject: (error: EngineError) => void;
  timer: NodeJS.Timeout;
}

const stopped: Extract<EngineStatus, { state: 'error' }> = {
  state: 'error',
  code: 'ENGINE_EXITED',
  message: 'The Windows helper was stopped.',
};

/**
 * Owns one helper process and multiplexes requests over its stdio by request id. A transport
 * fault, a contract violation, or a missed deadline ends the connection and rejects every pending
 * request, because the stream can no longer be trusted. An error response rejects only its own
 * request.
 */
export class EngineClient {
  private child?: ChildProcessWithoutNullStreams;
  private handshake?: Promise<EngineStatus>;
  private readonly decoder = new FrameDecoder(MAX_RESPONSE_BYTES);
  private readonly pending = new Map<string, PendingRequest>();
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
    this.handshake ??= this.connect();
    return this.handshake;
  }

  /** Sends one request once the handshake has succeeded. Rejects with an EngineError. */
  async request<M extends EngineMethod>(
    method: M,
    params: EngineParams<M>,
    timeoutMs = this.timeoutMs,
  ): Promise<EngineResult<M>> {
    const status = await this.getStatus();
    if (status.state === 'error') throw new EngineError(status.code, status.message);
    if (!this.child) throw new EngineError(stopped.code, stopped.message);
    return this.send(this.child, method, params, timeoutMs);
  }

  private connect(): Promise<EngineStatus> {
    this.decoder.reset();
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
    return this.send(child, 'engine.version', {}, this.timeoutMs).then(
      (result) => {
        if (this.child === child && !this.status)
          this.setStatus({ state: 'ready', protocolVersion: PROTOCOL_VERSION, ...result });
        return this.status ?? stopped;
      },
      () => {
        if (this.child === child)
          this.fail('INVALID_RESPONSE', 'The Windows helper rejected the version request.');
        return this.status ?? stopped;
      },
    );
  }

  private send<M extends EngineMethod>(
    child: ChildProcessWithoutNullStreams,
    method: M,
    params: EngineParams<M>,
    timeoutMs: number,
  ): Promise<EngineResult<M>> {
    const request = { protocolVersion: PROTOCOL_VERSION, id: randomUUID(), method, params };
    const frame = isEngineRequest(request) ? encodeFrame(request, MAX_REQUEST_BYTES) : undefined;
    if (!frame)
      return Promise.reject(
        new EngineError('INVALID_LOCAL_REQUEST', 'The engine request is invalid or too large.'),
      );
    return new Promise<EngineResult<M>>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          this.fail(
            'TIMEOUT',
            `The Windows helper did not respond within ${timeoutMs / 1000} seconds.`,
          ),
        timeoutMs,
      );
      this.pending.set(request.id, {
        method,
        resolve: resolve as (result: unknown) => void,
        reject,
        timer,
      });
      child.stdin.write(frame);
    });
  }

  private receive(chunk: Buffer): void {
    let frames: Buffer[];
    try {
      frames = this.decoder.push(chunk);
    } catch (error) {
      if (!(error instanceof FrameTooLargeError)) throw error;
      this.fail('INVALID_RESPONSE', 'The Windows helper sent an oversized response.');
      return;
    }
    for (const frame of frames) {
      if (this.status?.state === 'error') return;
      this.handleFrame(frame);
    }
  }

  private handleFrame(frame: Buffer): void {
    let response: unknown;
    try {
      response = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(frame));
    } catch {
      this.fail('INVALID_RESPONSE', 'The Windows helper sent invalid JSON.');
      return;
    }
    // Read a recognizable version before applying this version's closed envelope schema.
    if (
      typeof response === 'object' &&
      response !== null &&
      'protocolVersion' in response &&
      typeof response.protocolVersion === 'number' &&
      Number.isInteger(response.protocolVersion) &&
      response.protocolVersion >= 0 &&
      response.protocolVersion !== PROTOCOL_VERSION
    ) {
      this.fail(
        'PROTOCOL_MISMATCH',
        'App and helper protocols do not match. Rebuild or reinstall them together.',
      );
      return;
    }
    if (!isEngineResponse(response)) {
      this.fail(
        'INVALID_RESPONSE',
        'The Windows helper response did not match the request contract.',
      );
      return;
    }
    if (!response.ok && response.error.code === 'PROTOCOL_MISMATCH') {
      this.fail(
        'PROTOCOL_MISMATCH',
        'App and helper protocols do not match. Rebuild or reinstall them together.',
      );
      return;
    }
    const pending = response.id === null ? undefined : this.pending.get(response.id);
    if (!pending || response.id === null) {
      this.fail('INVALID_RESPONSE', 'The Windows helper sent an unexpected response.');
      return;
    }
    if (response.ok && !isEngineResult(pending.method, response.result)) {
      this.fail(
        'INVALID_RESPONSE',
        'The Windows helper response did not match the request contract.',
      );
      return;
    }
    clearTimeout(pending.timer);
    this.pending.delete(response.id);
    if (response.ok) pending.resolve(response.result);
    else pending.reject(new EngineError(response.error.code, response.error.message));
  }

  private setStatus(status: EngineStatus): void {
    this.status = status;
    this.onStatus?.(status);
  }

  private rejectPending(code: EngineErrorCode, message: string): void {
    const requests = [...this.pending.values()];
    this.pending.clear();
    for (const request of requests) {
      clearTimeout(request.timer);
      request.reject(new EngineError(code, message));
    }
  }

  private fail(code: EngineErrorCode, message: string): void {
    if (this.status?.state === 'error') return;
    this.setStatus({ state: 'error', code, message });
    this.rejectPending(code, message);
    this.child?.kill();
  }

  async stop(): Promise<void> {
    const child = this.child;
    this.child = undefined;
    if ((this.handshake || this.status) && this.status?.state !== 'error') this.setStatus(stopped);
    this.rejectPending(stopped.code, stopped.message);
    this.decoder.reset();
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
      return this.getStatus();
    })().finally(() => {
      this.restarting = undefined;
    });
    return this.restarting;
  }
}
