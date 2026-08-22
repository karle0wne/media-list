import test from "node:test";
import assert from "node:assert/strict";
import { applySchemaCompatibility } from "../src/db/compat";
import { addMediaToUser, listUserMedia, updateUserMedia } from "../src/lib/services/media";
import { updateUserProgress } from "../src/lib/services/progress";
import { createAdmin } from "../src/lib/services/users";
import type { MediaCandidate } from "../src/lib/types";
import { openTestDatabase } from "./db";

const anime:MediaCandidate={key:"ANILIST:101:",type:"ANIME",source:"ANILIST",externalId:"101",externalSubId:"",title:"Anime",year:2024,episodeCount:12};
const book:MediaCandidate={key:"OPENLIBRARY:OL101W:",type:"BOOK",source:"OPENLIBRARY",externalId:"OL101W",externalSubId:"",title:"Book",year:2020,pageCount:300};

test("schema compatibility restores and backfills user_media.updated_at",async()=>{const{db,sqlite}=openTestDatabase();try{const user=await createAdmin(db,"admin_user","correct-horse-battery");await addMediaToUser(db,user,anime);const before=sqlite.prepare("SELECT created_at, updated_at FROM user_media").get() as {created_at:number;updated_at:number};assert.equal(before.updated_at,before.created_at);sqlite.exec("ALTER TABLE user_media DROP COLUMN updated_at");applySchemaCompatibility(sqlite);const after=sqlite.prepare("SELECT created_at, updated_at FROM user_media").get() as {created_at:number;updated_at:number};assert.equal(after.updated_at,after.created_at);}finally{sqlite.close();}});

test("default list sorting follows user updates",async()=>{const{db,sqlite}=openTestDatabase();try{const user=await createAdmin(db,"admin_user","correct-horse-battery");await addMediaToUser(db,user,anime,{status:"IN_PROGRESS",progressCurrent:2});await addMediaToUser(db,user,book,{status:"PLANNED"});const rows=await listUserMedia(db,user,{sort:"title",direction:"asc"});const animeRow=rows.find(row=>row.title==="Anime")!;const bookRow=rows.find(row=>row.title==="Book")!;sqlite.prepare("UPDATE user_media SET updated_at=? WHERE id=?").run(1_000,animeRow.userMediaId);sqlite.prepare("UPDATE user_media SET updated_at=? WHERE id=?").run(2_000,bookRow.userMediaId);assert.deepEqual((await listUserMedia(db,user)).map(row=>row.title),["Book","Anime"]);await updateUserMedia(db,user,animeRow.userMediaId,{score:8});assert.equal((await listUserMedia(db,user))[0].title,"Anime");sqlite.prepare("UPDATE user_media SET updated_at=? WHERE id=?").run(1_000,animeRow.userMediaId);await updateUserProgress(db,user,animeRow.userMediaId,3);const updated=sqlite.prepare("SELECT updated_at FROM user_media WHERE id=?").get(animeRow.userMediaId) as {updated_at:number};assert.ok(updated.updated_at>1_000);}finally{sqlite.close();}});
