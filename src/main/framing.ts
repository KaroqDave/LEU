const NEWLINE = 0x0a;

export class FrameTooLargeError extends Error {}

/** Serializes one newline-terminated frame, or returns undefined when it exceeds `limit` bytes. */
export function encodeFrame(message: unknown, limit: number): Buffer | undefined {
  const frame = Buffer.from(JSON.stringify(message) + '\n', 'utf8');
  return frame.length > limit ? undefined : frame;
}

/**
 * Splits a byte stream into newline-terminated frames without the newline. Frame limits include
 * the newline. Buffered chunks are joined once per frame, so large responses stay linear.
 */
export class FrameDecoder {
  private chunks: Buffer[] = [];
  private buffered = 0;

  constructor(private readonly limit: number) {}

  push(chunk: Buffer): Buffer[] {
    const frames: Buffer[] = [];
    let rest = chunk;
    for (let newline = rest.indexOf(NEWLINE); newline >= 0; newline = rest.indexOf(NEWLINE)) {
      if (this.buffered + newline + 1 > this.limit) throw new FrameTooLargeError();
      this.chunks.push(rest.subarray(0, newline));
      frames.push(Buffer.concat(this.chunks, this.buffered + newline));
      this.reset();
      rest = rest.subarray(newline + 1);
    }
    if (rest.length > 0) {
      // Without its newline, a frame of this size can no longer fit.
      if (this.buffered + rest.length + 1 > this.limit) throw new FrameTooLargeError();
      this.chunks.push(rest);
      this.buffered += rest.length;
    }
    return frames;
  }

  reset(): void {
    this.chunks = [];
    this.buffered = 0;
  }
}
