/**
 * The decisions a model download has to make, with no I/O in sight.
 *
 * Extracted so resume arithmetic, disk-space headroom and the acceptability of
 * a server's response can be tested as arithmetic rather than by actually
 * fetching a gigabyte over a network that may or may not be there.
 */

export interface ResumePlan {
  /** Byte offset to start from; 0 means start over. */
  from: number;
  /** The `Range` header to send, or undefined to ask for the whole file. */
  rangeHeader?: string;
}

/**
 * Where to pick up.
 *
 * A partial at or beyond the expected size is not a resumable download, it is a
 * corrupt one — starting over is cheaper than reasoning about why.
 */
export function planResume(alreadyHave: number, totalBytes: number): ResumePlan {
  if (alreadyHave <= 0 || alreadyHave >= totalBytes) return { from: 0 };
  return { from: alreadyHave, rangeHeader: `bytes=${String(alreadyHave)}-` };
}

/**
 * Headroom over the download size before starting.
 *
 * The file is written once and then renamed within the same directory, so the
 * peak requirement is one copy — but finishing with a disk at literally zero
 * free bytes breaks everything else the machine is doing, so leave a margin.
 */
const HEADROOM_BYTES = 512 * 1024 * 1024;

export interface SpaceCheck {
  ok: boolean;
  needed: number;
  error?: string;
}

export function checkSpace(remainingBytes: number, freeBytes: number): SpaceCheck {
  const needed = remainingBytes + HEADROOM_BYTES;
  if (freeBytes >= needed) return { ok: true, needed };
  const gb = (n: number): string => `${(n / 1e9).toFixed(1)} GB`;
  return {
    ok: false,
    needed,
    error: `Not enough disk space: needs about ${gb(needed)}, ${gb(freeBytes)} free.`,
  };
}

/**
 * Whether a response can be appended to what is already on disk.
 *
 * The trap this catches: asking for a range and being handed `200 OK` with the
 * *whole* file. Appending that to an existing partial produces a file of
 * plausible length made of two overlapping halves — which then fails the hash
 * check with no clue as to why. A resumed request must be answered with 206.
 */
export function acceptsResume(status: number, requestedRange: boolean): boolean {
  return requestedRange ? status === 206 : status === 200;
}

/** Whether progress has moved enough to be worth telling the renderer about. */
export function shouldReport(lastReported: number, received: number, total: number): boolean {
  if (received >= total) return true;
  // Roughly every half percent — often enough to look alive, rarely enough not
  // to spend the IPC channel on a 1.3 GB file's worth of updates.
  return received - lastReported >= Math.max(1_000_000, Math.floor(total / 200));
}
