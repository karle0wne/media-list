import type { AppDb } from "@/db";
import { externalMediaUrl } from "../providers/urls";
import type { MediaStatus, MediaType } from "../types";
import { listUserMedia } from "./media";

const typeOrder:MediaType[]=["ANIME","MOVIE","SERIES","BOOK","GAME"];
const typeLabels:Record<MediaType,string>={ANIME:"Anime",MOVIE:"Movies",SERIES:"Series",BOOK:"Books",GAME:"Games"};
const statusOrder:MediaStatus[]=["IN_PROGRESS","PLANNED","COMPLETED","ON_HOLD","DROPPED"];
const statusLabels:Record<MediaStatus,string>={IN_PROGRESS:"In progress",PLANNED:"Planned",COMPLETED:"Completed",ON_HOLD:"On hold",DROPPED:"Dropped"};
const statusRank=new Map(statusOrder.map((status,index)=>[status,index]));

export async function exportMarkdown(db:AppDb,userId:string,exportedAt=new Date()){
  const rows=await listUserMedia(db,userId,{sort:"title",direction:"asc"});
  const out=["# My media list","",`_Exported ${exportedAt.toISOString().slice(0,10)}_`,""];
  for(const type of typeOrder){
    const group=rows.filter(row=>row.type===type).sort((a,b)=>(statusRank.get(a.status)??99)-(statusRank.get(b.status)??99)||a.title.localeCompare(b.title));
    if(!group.length)continue;
    out.push(`## ${typeLabels[type]}`,"","| Status | Title | Year | Score | Progress | Notes | Date added | Date updated |","| --- | --- | ---: | ---: | --- | --- | --- | --- |");
    for(const row of group){
      const link=row.externalUrl||externalMediaUrl(row.source,row.externalId,row.externalSubId);
      out.push(`| ${statusLabels[row.status]} | [${tableCell(row.title)}](${link}) | ${row.year??"—"} | ${row.score!=null?`${row.score}/10`:"—"} | ${progress(row.type,row.progressCurrent,row.progressTotal)} | ${row.notes?tableCell(row.notes):"—"} | ${date(row.createdAt)} | ${date(row.updatedAt)} |`);
    }
    out.push("");
  }
  return `${out.join("\n").trim()}\n`;
}

function progress(type:MediaType,current:number,total:number|null){if(type==="GAME")return"—";if(type==="BOOK")return total!=null?`${current}/${total} pages`:(current?`${current} pages`:"—");return total!=null?`${current}/${total}`:(current?String(current):"—");}
function date(value:Date){return value.toISOString().slice(0,10);}
function tableCell(value:string){return escapeMd(value).replace(/\|/g,"\\|").replace(/\r?\n/g,"<br>");}
function escapeMd(value:string){return value.replace(/([\\`*_[\]<>])/g,"\\$1");}
