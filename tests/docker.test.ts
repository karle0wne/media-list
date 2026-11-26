import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

/** The part of a Dockerfile after its last FROM: what actually runs in production. */
function finalStage(dockerfile: string) {
  const stages = dockerfile.split(/^FROM /m);
  return stages[stages.length - 1]
    .split("\n")
    .filter((line) => line.trim() && !line.trim().startsWith("#"))
    .slice(1) // the rest of the FROM line
    .map((line) =>
      line
        .replace(/\s+/g, " ")
        .replace(/--from=build /g, "")
        .replace(/\/app\//g, ""),
    );
}

test("the image that CI publishes and the one Compose builds run the same way", () => {
  const built = finalStage(read("Dockerfile"));
  const published = finalStage(read("Dockerfile.runtime"));
  assert.deepEqual(built, published);
});

test("the container runs as a fixed unprivileged user under an init process", () => {
  for (const file of ["Dockerfile", "Dockerfile.runtime"]) {
    const source = read(file);
    assert.match(source, /useradd --system --uid 10001/, file);
    assert.match(source, /^USER app$/m, file);
    assert.match(source, /ENTRYPOINT \["tini", "--"\]/, file);
    assert.match(source, /^HEALTHCHECK /m, file);
    assert.match(source, /chown app:app \/data/, `${file}: /data must be writable by the app user`);
    assert.doesNotMatch(source, /CMD \[?"?(npm|sh", "-c)/, `${file}: no shell chain as the server`);
  }
});

test("the start script checks the configuration, migrates, then replaces itself with the server", () => {
  const script = read("scripts/docker-start.sh");
  assert.match(script, /^set -eu$/m);
  const check = script.indexOf("scripts/check-config.ts");
  const migrate = script.indexOf("scripts/migrate.ts");
  const start = script.indexOf("exec node node_modules/next/dist/bin/next start");
  assert.ok(
    check > 0 && migrate > check,
    "a bad configuration stops the container before it migrates",
  );
  assert.ok(start > migrate, "migrations run first, the server is exec'd last");
  assert.equal(JSON.parse(read("package.json")).scripts.prestart, "tsx scripts/check-config.ts");
});

test("secrets and local state stay out of the build context", () => {
  const ignored = read(".dockerignore").split("\n");
  for (const entry of [".env", ".env.*", "data", "*.db", ".git", "node_modules"])
    assert.ok(ignored.includes(entry), entry);
  assert.ok(ignored.includes("!.env.example"));
});
