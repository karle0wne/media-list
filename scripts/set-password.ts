import "dotenv/config";
import { openDatabase } from "../src/db/index";
import { runCli } from "../src/lib/cli";
import { setUserPassword } from "../src/lib/services/users";

runCli(async () => {
  const [, , username, password] = process.argv;
  if (!username || !password) throw new Error("Usage: npm run admin:set-password -- <username> <password>");
  const { db, sqlite } = openDatabase();
  try {
    await setUserPassword(db, username, password);
    console.log(`Password updated for '${username}'. Existing sessions were revoked.`);
  } finally {
    sqlite.close();
  }
});
