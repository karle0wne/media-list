import Link from "next/link";
import { ProviderCover } from "@/components/provider-cover";
import { requireUser } from "@/lib/auth";
import { getDatabase } from "@/db";
import { scheduleMediaEnrichment } from "@/lib/enrichment-runtime";
import { listUserMedia } from "@/lib/services/media";
import { consumedMinutes, formatMinutes } from "@/lib/watch-time";
import { externalMediaUrl } from "@/lib/providers/urls";
import { isMediaStatus, isMediaType } from "@/lib/user-media";
import type { MediaStatus, MediaType } from "@/lib/types";
import { deleteMediaAction, retryMetadataAction, updateMediaAction } from "./actions";

const statuses: Array<[string, MediaStatus | ""]> = [["All", ""], ["Watching / Reading / Playing", "IN_PROGRESS"], ["Completed", "COMPLETED"], ["On hold", "ON_HOLD"], ["Dropped", "DROPPED"], ["Planned", "PLANNED"]];
const types: Array<[string, MediaType | ""]> = [["All types", ""], ["Anime", "ANIME"], ["Movies", "MOVIE"], ["Series", "SERIES"], ["Books", "BOOK"], ["Games", "GAME"]];

export default async function Home({ searchParams }: { searchParams: Promise<{ status?: string; type?: string; q?: string; error?: string }> }) {
  const user = await requireUser();
  scheduleMediaEnrichment();
  const params = await searchParams;
  const status = isMediaStatus(params.status) ? params.status : undefined;
  const type = isMediaType(params.type) ? params.type : undefined;
  const items = await listUserMedia(getDatabase().db, user.id, { status, type, q: params.q });
  const videoMinutes = items.reduce((sum, item) => isVideo(item.type) ? sum + (consumedMinutes({ type: item.type, runtimeMinutes: item.runtimeMinutes, progressCurrent: item.progressCurrent, progressTotal: item.progressTotal, status: item.status, overrideMinutes: item.timeSpentOverrideMinutes }) ?? 0) : sum, 0);
  const gameMinutes = items.reduce((sum, item) => item.type === "GAME" ? sum + (item.timeSpentOverrideMinutes ?? 0) : sum, 0);
  const pages = items.reduce((sum, item) => item.type === "BOOK" ? sum + item.progressCurrent : sum, 0);
  return <section>
    <div className="pageTitle"><div><h1>Your media</h1><p className="muted">{items.length} positions · {formatMinutes(videoMinutes)} video watched · {gameMinutes ? `${formatMinutes(gameMinutes)} played · ` : ""}{pages.toLocaleString()} pages recorded</p></div><Link className="button" href="/media/new">Add media</Link></div>
    {params.error && <p className="error">{params.error}</p>}
    <form className="filters" method="get"><input name="q" defaultValue={params.q ?? ""} placeholder="Search your list" /><select name="status" defaultValue={status ?? ""}>{statuses.map(([label, value]) => <option key={value} value={value}>{label}</option>)}</select><select name="type" defaultValue={type ?? ""}>{types.map(([label, value]) => <option key={value} value={value}>{label}</option>)}</select><button type="submit">Filter</button></form>
    <div className="mediaGrid">{items.map((item) => { const time = consumedMinutes({ type: item.type, runtimeMinutes: item.runtimeMinutes, progressCurrent: item.progressCurrent, progressTotal: item.progressTotal, status: item.status, overrideMinutes: item.timeSpentOverrideMinutes }); return <article className="card mediaCard" key={item.userMediaId}>
      {item.coverUrl ? <ProviderCover className="cover" src={item.coverUrl} width={84} height={118} /> : <div className="cover placeholder">{item.type}</div>}
      <div className="grow"><div className="mediaTitle"><h2>{item.title}</h2><span className="badge">{item.type}</span></div><p className="muted">{item.year ?? "year ?"} · <a href={externalMediaUrl(item.source, item.externalId, item.externalSubId)} target="_blank" rel="noreferrer">{item.source}</a></p>{item.metadataStatus === "PENDING" && <p className="muted">Metadata verification pending…</p>}{item.metadataStatus === "ERROR" && <div><p className="error">Metadata verification failed{item.metadataError ? `: ${item.metadataError}` : ""}</p><form action={retryMetadataAction}><input type="hidden" name="mediaId" value={item.mediaId}/><button type="submit">Retry metadata</button></form></div>}<p><strong>{labelStatus(item.status)}</strong>{item.score != null ? ` · ${item.score}/10` : ""}</p><p className="muted">Progress {item.progressCurrent}{item.progressTotal != null ? ` / ${item.progressTotal}` : ""} · {item.type === "GAME" ? "Played" : "Time"} {formatMinutes(time)}</p>{item.notes && <p>{item.notes}</p>}
      <details><summary>Edit</summary><form action={updateMediaAction} className="editForm"><input type="hidden" name="id" value={item.userMediaId}/><label>Status<select name="status" defaultValue={item.status}>{statuses.filter((x) => x[1]).map(([label,value]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Score<input name="score" type="number" min="0" max="10" defaultValue={item.score ?? ""}/></label><label>Progress<input name="progressCurrent" type="number" min="0" defaultValue={item.progressCurrent}/></label><label>Total<input name="progressTotal" type="number" min="0" defaultValue={item.progressTotal ?? ""}/></label><label className="wide">Notes<textarea name="notes" rows={3} defaultValue={item.notes ?? ""}/></label><label>{item.type === "GAME" ? "Played time" : "Manual time"} (minutes)<input name="timeSpentOverrideMinutes" type="number" min="0" defaultValue={item.timeSpentOverrideMinutes ?? ""}/></label><button type="submit">Save</button></form><form action={deleteMediaAction}><input type="hidden" name="id" value={item.userMediaId}/><button className="danger" type="submit">Remove from list</button></form></details></div>
    </article>; })}</div>
    {!items.length && <div className="empty"><p>No positions match these filters.</p><Link href="/media/new">Add your first one</Link></div>}
  </section>;
}
function labelStatus(status: MediaStatus) { return ({ PLANNED:"Planned", IN_PROGRESS:"Watching / Reading / Playing", COMPLETED:"Completed", ON_HOLD:"On hold", DROPPED:"Dropped" } as const)[status]; }
function isVideo(type: MediaType) { return type === "ANIME" || type === "MOVIE" || type === "SERIES"; }
