import { getDatabase } from "@/db";
import { serviceState } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { listUsers } from "@/lib/services/users";

export default async function AdminPage() {
  await requireAdmin();
  const db = getDatabase().db;
  const users = await listUsers(db);
  const backup = (await db.select().from(serviceState).limit(1))[0] ?? null;

  return (
    <section className="adminPage">
      <div className="pageTitle">
        <div>
          <h1>Users</h1>
          <p className="muted">Identity, access and roles are managed centrally. This page shows the local business identities linked by OIDC.</p>
        </div>
      </div>
      <div className="adminMeta"><span>Last successful backup</span><strong>{backup?.lastBackupAt ? backup.lastBackupAt.toISOString() : "Not recorded yet"}</strong></div>
      <div className="tableWrap adminUsersTable">
        <table>
          <thead><tr><th>User</th><th>Email</th><th>Role</th><th>Status</th></tr></thead>
          <tbody>{users.map((user) => (
            <tr key={user.id}>
              <td data-label="User">{user.username}</td>
              <td data-label="Email">{user.email ?? "—"}</td>
              <td data-label="Role">{user.role}</td>
              <td data-label="Status">{user.active ? "active" : "disabled"}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}
