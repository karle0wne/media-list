import test from "node:test";
import assert from "node:assert/strict";
import { openTestDatabase } from "./db";
import { createAdmin } from "../src/lib/services/users";
import { addMediaToUser } from "../src/lib/services/media";
import { exportMarkdown } from "../src/lib/services/markdown";

test("Markdown export is grouped, linked, and keeps personal list state",async()=>{const{db,sqlite}=openTestDatabase();try{const user=await createAdmin(db,"admin_user","correct-horse-battery");await addMediaToUser(db,user,{key:"ANILIST:1:",type:"ANIME",source:"ANILIST",externalId:"1",externalSubId:"",title:"Cowboy Bebop",year:1998,episodeCount:26},{status:"COMPLETED",score:9,notes:"great"});const text=await exportMarkdown(db,user,new Date("2026-08-20T00:00:00Z"));assert.match(text,/# My media list/);assert.match(text,/## Completed/);assert.match(text,/\[Cowboy Bebop\]\(https:\/\/anilist\.co\/anime\/1\)/);assert.match(text,/score 9\/10/);assert.match(text,/26\/26/);assert.match(text,/Notes:.*great/);}finally{sqlite.close();}});
