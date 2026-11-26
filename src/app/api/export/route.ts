import { withIdentity } from "@/lib/identity";
import { getDatabase } from "@/db";
import { exportCanonical } from "@/lib/services/canonical";
export const GET = withIdentity(async (user) => {
  const csv = await exportCanonical(getDatabase().db, user.id);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="media-list-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
});
