import "dotenv/config";
import { openDatabase } from "../src/db/index";
import { createAdmin } from "../src/lib/services/users";

const [, , username, password] = process.argv;
if (!username || !password) {
  console.error("Usage: npm run admin:create -- <username> <password>");
  process.exit(2);
}
const { db, sqlite } = openDatabase();
try {
  await createAdmin(db, username, password);
  console.log(`Admin '${username}' created.`);
} finally {
  sqlite.close();
}
