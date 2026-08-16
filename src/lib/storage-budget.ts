export type StoredObject = {
  key: string;
  size: number;
};

export type PlannedWrite = {
  key: string;
  size: number;
  enabled?: boolean;
};

export function projectStorageBytes(existing: StoredObject[], writes: PlannedWrite[]) {
  const sizes = new Map(existing.map((item) => [item.key, item.size]));
  for (const write of writes) {
    if (write.enabled === false) continue;
    sizes.set(write.key, write.size);
  }
  return [...sizes.values()].reduce((sum, size) => sum + size, 0);
}

export function parseOptionalGiB(name: string, raw: string | undefined) {
  if (!raw?.trim()) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number of GiB`);
  return Math.floor(value * 1024 ** 3);
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let unit = -1;
  do {
    value /= 1024;
    unit += 1;
  } while (value >= 1024 && unit < units.length - 1);
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unit]}`;
}
