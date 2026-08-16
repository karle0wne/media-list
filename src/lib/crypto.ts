import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
export function hashPassword(password: string) { const salt = randomBytes(16); const digest = scryptSync(password, salt, 64); return `scrypt$${salt.toString("hex")}$${digest.toString("hex")}`; }
export function verifyPassword(password: string, encoded: string) { const [kind, saltHex, digestHex] = encoded.split("$"); if (kind !== "scrypt" || !saltHex || !digestHex) return false; const expected = Buffer.from(digestHex, "hex"); const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length); return expected.length === actual.length && timingSafeEqual(expected, actual); }
export function randomToken(bytes = 32) { return randomBytes(bytes).toString("base64url"); }
export function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
