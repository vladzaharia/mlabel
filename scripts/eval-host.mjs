/**
 * The Electron half of the model eval. Not shipped; see `eval-models.ts`.
 *
 * Exists only because the real inference worker speaks `process.parentPort` and
 * is started with `utilityProcess.fork` — both Electron APIs. A plain Node
 * harness could not run `out/main/ai-worker.mjs` at all, and reimplementing it
 * would mean evaluating a copy of the inference path rather than the one that
 * ships, so a chat-wrapper or grammar regression would be invisible.
 *
 * This process is deliberately dumb: it forks the real worker and relays
 * newline-delimited JSON between it and stdio. Every decision about what to ask
 * and how to score it stays in `eval-models.ts`, which runs under tsx and can
 * import the app's own prompt and schema builders.
 *
 * **Never `await app.whenReady()` at the top level of this file.** Electron does
 * not dispatch `ready` until the entry module has finished evaluating, and a
 * top-level await keeps it evaluating — so the await never resolves. The process
 * sits there having printed nothing and reported no error, which reads as a hang
 * anywhere else in the stack and sent me looking at stdio, at the worker, and at
 * ESM support before the actual cause. `.then()` breaks the cycle. (ESM is fine
 * here; it is specifically the top-level await that deadlocks.)
 *
 * Run as: electron scripts/eval-host.mjs
 */
import { join } from "node:path";
import { app, utilityProcess } from "electron";

const WORKER = join(process.cwd(), "out/main/ai-worker.mjs");

/** One JSON object per line, so the parent can read us with a line splitter. */
const emit = (message) => {
  process.stdout.write(`${JSON.stringify(message)}\n`);
};

app.whenReady().then(() => {
  const child = utilityProcess.fork(WORKER, [], {
    serviceName: "mlabel-eval",
    // Unlike the app, keep the worker's output: a native-side failure prints
    // here and nowhere else, and is often the only evidence of why a load died.
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout?.on("data", (d) => emit({ type: "worker-stdout", text: String(d) }));
  child.stderr?.on("data", (d) => emit({ type: "worker-stderr", text: String(d) }));

  child.on("message", (message) => emit(message));
  child.on("exit", (code) => {
    emit({ type: "worker-exit", code });
    app.quit();
  });

  // Requests arrive from the parent the same way, one JSON object per line.
  let buffer = "";
  process.stdin.on("data", (chunk) => {
    buffer += String(chunk);
    let index = buffer.indexOf("\n");
    while (index !== -1) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line !== "") {
        const request = JSON.parse(line);
        if (request.type === "quit") {
          child.kill();
          app.quit();
        } else {
          child.postMessage(request);
        }
      }
      index = buffer.indexOf("\n");
    }
  });

  process.stdin.on("end", () => {
    child.kill();
    app.quit();
  });

  emit({ type: "host-ready" });
});
