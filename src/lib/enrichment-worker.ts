import { getDatabase } from "@/db";
import { enrichPendingBacklog } from "./services/enrichment";

declare global {
  var __mediaListBacklogDrain: Promise<unknown> | undefined;
  var __mediaListTotalQueue: Set<string> | undefined;
  var __mediaListRecovery: { tick: () => Promise<void>; stop: () => void } | undefined;
}

// Everything here is plain Node (no Next imports) so the instrumentation hook can start it,
// and it keeps its state on globalThis so every bundle in the process shares one drain.

/** READY records whose new list positions still wait for a total from the provider. */
export function totalQueue() {
  return (globalThis.__mediaListTotalQueue ??= new Set<string>());
}

/**
 * Works through the pending backlog and the queued total lookups. One drain runs at a time: a
 * caller that arrives meanwhile gets the running one, and anything it queued is picked up by
 * the loop below.
 */
export function runBacklogDrain(): Promise<unknown> {
  if (globalThis.__mediaListBacklogDrain) return globalThis.__mediaListBacklogDrain;
  const queue = totalQueue();
  // Started from a microtask so the slot below is taken before any of the work can finish: a
  // failure that happens synchronously (the database cannot be opened) must still release it.
  const drain: Promise<void> = Promise.resolve().then(async () => {
    try {
      do {
        const lookups = [...queue];
        queue.clear();
        try {
          const { unfinished } = await enrichPendingBacklog(getDatabase().db, {
            totalLookups: lookups,
          });
          // The provider is unavailable for longer than a drain waits: keep the lookups for
          // the next pass (the recovery loop, or the next import) and stop instead of spinning.
          if (unfinished.length) {
            for (const id of unfinished) queue.add(id);
            break;
          }
        } catch (error) {
          for (const id of lookups) queue.add(id);
          throw error;
        }
      } while (queue.size > 0);
    } catch (error) {
      console.error("metadata backlog enrichment failed", error);
    } finally {
      globalThis.__mediaListBacklogDrain = undefined;
    }
  });
  globalThis.__mediaListBacklogDrain = drain;
  return drain;
}

/**
 * Calls `run` every `intervalMs`, never two at once, and never lets a failure stop the loop.
 * The timer is unref'd: it must not keep the process alive. Returns the stop function.
 */
export function startRecoveryLoop(
  run: () => Promise<unknown>,
  intervalMs: number,
  timers: {
    setInterval: typeof setInterval;
    clearInterval: typeof clearInterval;
  } = { setInterval, clearInterval },
) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await run();
    } catch (error) {
      console.error("metadata recovery pass failed", error);
    } finally {
      running = false;
    }
  };
  const timer = timers.setInterval(tick, intervalMs);
  timer.unref?.();
  return { tick, stop: () => timers.clearInterval(timer) };
}
