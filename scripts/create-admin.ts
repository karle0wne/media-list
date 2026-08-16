import "dotenv/config";
import { openDatabase } from "../src/db/index";
import { runCli } from "../src/lib/cli";
import { createAdmin } from "../src/lib/services/users";

runCli(async () => {
  const [, , username, password] = process.argv;
  if (!username || !password) throw new Error("Usage: npm run admin:create -- <username> <password>");
  const { db, sqlite } = openDatabase();
  try {
    await createAdmin(db, username, password);
    console.log(`Admin '${username}' created.`);
  } finally {
    sqlite.close();
  }
});
