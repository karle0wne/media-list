export function runCli(main: () => void | Promise<void>) {
  Promise.resolve()
    .then(main)
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.stack ?? error.message : error);
      process.exitCode = 1;
    });
}
