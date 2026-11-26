import { accessSync, constants, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { databasePathSetting, enrichmentRecoveryIntervalSecondsSetting } from "@/config/runtime";
import { gatewayPolicy } from "./gateway-auth";

/**
 * Configuration that would make every request fail. Next.js only logs an error thrown while the
 * server starts and then answers 500 forever, so the container entrypoint and `npm start` run
 * this first (scripts/check-config.ts) to stop a bad installation before it serves anything;
 * the server runs it again at start as a second line of defence.
 */
export function assertServerConfig() {
  gatewayPolicy();
  assertDataDirectoryWritable(databasePathSetting());
  return { recoveryIntervalSeconds: enrichmentRecoveryIntervalSecondsSetting() };
}

/** A mounted data directory the process user cannot write to is the classic first-install trap. */
export function assertDataDirectoryWritable(databasePath: string) {
  if (databasePath === ":memory:") return;
  const directory = dirname(resolve(databasePath));
  try {
    mkdirSync(directory, { recursive: true });
    accessSync(directory, constants.W_OK);
  } catch {
    const owner =
      typeof process.getuid === "function"
        ? `uid ${process.getuid()}:${process.getgid?.()}`
        : "the server user";
    throw new Error(
      `${directory} is not writable by ${owner}. Give that user ownership of the data ` +
        `directory (in a container, of the mounted host directory), e.g. chown <uid>:<gid> <dir>`,
    );
  }
}
