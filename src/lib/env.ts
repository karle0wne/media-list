export function intEnv(name: string, fallback: number) { const value = process.env[name]; if (!value) return fallback; const parsed = Number.parseInt(value, 10); return Number.isFinite(parsed) ? parsed : fallback; }
export const maxUsers = () => Math.max(1, intEnv("MAX_USERS", 5));
export const sessionTtlDays = () => Math.max(1, intEnv("SESSION_TTL_DAYS", 30));
export const cookieSecure = () => process.env.COOKIE_SECURE === "true";
