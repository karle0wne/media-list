// Runs once per server process. Kept to a dynamic import so nothing Node-specific is loaded
// for other runtimes.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startBackgroundWork } = await import("./lib/background");
  startBackgroundWork();
}
