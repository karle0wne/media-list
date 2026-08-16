import { getDatabase } from "@/db";
export function GET() { getDatabase().sqlite.prepare("SELECT 1").get(); return Response.json({ ok: true }); }
