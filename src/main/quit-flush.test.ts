import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQuitFlushHandler } from "./quit-flush";

function makeEvent(): { preventDefault: ReturnType<typeof vi.fn> & (() => void) } {
  return { preventDefault: vi.fn() as ReturnType<typeof vi.fn> & (() => void) };
}

function hangingFlush(): Promise<void> {
  return new Promise(() => {});
}

describe("quit-flush handler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls preventDefault on first invocation", async () => {
    const quit = vi.fn();
    const handler = createQuitFlushHandler([() => Promise.resolve()], quit);
    const event = makeEvent();

    const promise = handler(event);
    // Advance timers to fire any internal race.
    vi.runAllTimersAsync();
    await promise;

    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it("calls quit exactly once after all flushes resolve", async () => {
    const quit = vi.fn();
    let resolveFlush!: () => void;
    const flush = (): Promise<void> => new Promise((res) => (resolveFlush = res));
    const handler = createQuitFlushHandler([flush], quit);
    const event = makeEvent();

    const promise = handler(event);
    expect(quit).not.toHaveBeenCalled();
    resolveFlush();
    await promise;
    expect(quit).toHaveBeenCalledOnce();
  });

  it("calls quit after timeout when a flush hangs", async () => {
    const quit = vi.fn();
    const handler = createQuitFlushHandler([hangingFlush], quit, 2000);
    const event = makeEvent();

    const promise = handler(event);
    expect(quit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    await promise;
    expect(quit).toHaveBeenCalledOnce();
  });

  it("does not call preventDefault on second invocation", async () => {
    const quit = vi.fn();
    const handler = createQuitFlushHandler([() => Promise.resolve()], quit);

    const event1 = makeEvent();
    const p1 = handler(event1);
    vi.runAllTimersAsync();
    await p1;

    const event2 = makeEvent();
    const p2 = handler(event2);
    vi.runAllTimersAsync();
    await p2;

    expect(event2.preventDefault).not.toHaveBeenCalled();
  });

  it("does not call quit a second time on re-entrant invocation", async () => {
    const quit = vi.fn();
    const handler = createQuitFlushHandler([() => Promise.resolve()], quit);

    const event1 = makeEvent();
    const p1 = handler(event1);
    vi.runAllTimersAsync();
    await p1;

    const event2 = makeEvent();
    const p2 = handler(event2);
    vi.runAllTimersAsync();
    await p2;

    // quit was called exactly once from the first invocation, never from second.
    expect(quit).toHaveBeenCalledOnce();
  });
});
