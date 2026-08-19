import { requireUser } from "@/lib/auth";
import { getDatabase } from "@/db";
import { exportMarkdown } from "@/lib/services/markdown";
export async function GET(){const user=await requireUser();const markdown=await exportMarkdown(getDatabase().db,user.id);return new Response(markdown,{headers:{"content-type":"text/markdown; charset=utf-8","content-disposition":`attachment; filename="media-list-${new Date().toISOString().slice(0,10)}.md"`,"cache-control":"no-store"}});}
