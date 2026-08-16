import "dotenv/config";
import { openDatabase } from "../src/db/index";

const { sqlite } = openDatabase();
sqlite.close();
console.log("Database migrations applied.");
