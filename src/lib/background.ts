import { runBacklogDrain, startRecoveryLoop } from "./enrichment-worker";
import { assertServerConfig } from "./server-config";

const FIRST_PASS_DELAY_MS = 5_000;

/**
 * Called once when the server starts (see instrumentation.ts): checks the configuration again
 * (the entrypoint already did, see server-config.ts) and starts the loop that finishes
 * interrupted enrichment.
 */
export function startBackgroundWork() {
  const { recoveryIntervalSeconds: intervalSeconds } = assertServerConfig();
  if (globalThis.__mediaListRecovery) return;
  const loop = startRecoveryLoop(runBacklogDrain, intervalSeconds * 1000);
  // The first pass comes soon after start, so work a restart interrupted resumes without
  // waiting for a whole interval.
  const first = setTimeout(() => void loop.tick(), FIRST_PASS_DELAY_MS);
  first.unref();
  globalThis.__mediaListRecovery = {
    tick: loop.tick,
    stop() {
      clearTimeout(first);
      loop.stop();
      globalThis.__mediaListRecovery = undefined;
    },
  };
}
