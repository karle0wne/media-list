import type { AppDb } from "@/db";
import { externalMediaUrl } from "../providers/urls";
import type { MediaStatus, MediaType } from "../types";
import { listUserMedia } from "./media";
const statusOrder:MediaStatus[]=["IN_PROGRESS","PLANNED","COMPLETED","ON_HOLD","DROPPED"];
const statusLabels:Record<MediaStatus,string>={IN_PROGRESS:"In progress",PLANNED:"Planned",COMPLETED:"Completed",ON_HOLD:"On hold",DROPPED:"Dropped"};
export async function exportMarkdown(db:AppDb,userId:string,exportedAt=new Date()){const rows=await listUserMedia(db,userId,{sort:"title",direction:"asc"});const out=["# My media list","",`_Exported ${exportedAt.toISOString().slice(0,10)}_`,""];for(const status of statusOrder){const group=rows.filter(row=>row.status===status);if(!group.length)continue;out.push(`## ${statusLabels[status]}`,"");for(const row of group){const link=externalMediaUrl(row.source,row.externalId,row.externalSubId);const meta=[typeLabel(row.type),row.year?String(row.year):null,row.score!=null?`score ${row.score}/10`:null,progress(row.type,row.progressCurrent,row.progressTotal)].filter(Boolean).join(" · ");out.push(`- **[${escapeMd(row.title)}](${link})**${meta?` — ${meta}`:""}`);if(row.notes)out.push(`  - _Notes:_ ${escapeMd(row.notes).replace(/\n+/g," ")}`);}out.push("");}return `${out.join("\n").trim()}\n`;}
function typeLabel(type:MediaType){return({ANIME:"Anime",MOVIE:"Movie",SERIES:"Series",BOOK:"Book",GAME:"Game"}as const)[type];}
function progress(type:MediaType,current:number,total:number|null){if(type==="GAME")return null;if(type==="BOOK")return total!=null?`${current}/${total} pages`:(current?`${current} pages`:null);return total!=null?`${current}/${total}`:(current?String(current):null);}
function escapeMd(value:string){return value.replace(/([\\`*_[\]<>])/g,"\\$1");}
