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
import { deleteMediaAction, quickScoreAction, quickStatusAction, retryMetadataAction, updateMediaAction } from "./actions";

const statuses: Array<[string, MediaStatus | ""]> = [["All", ""], ["In progress", "IN_PROGRESS"], ["Completed", "COMPLETED"], ["On hold", "ON_HOLD"], ["Dropped", "DROPPED"], ["Planned", "PLANNED"]];
const types: Array<[string, MediaType | ""]> = [["All types", ""], ["Anime", "ANIME"], ["Movies", "MOVIE"], ["Series", "SERIES"], ["Books", "BOOK"], ["Games", "GAME"]];

export default async function Home({ searchParams }: { searchParams: Promise<{ status?: string; type?: string; q?: string; error?: string }> }) {
  const user = await requireUser();
  scheduleMediaEnrichment();
  const params = await searchParams;
  const status = isMediaStatus(params.status) ? params.status : undefined;
  const type = isMediaType(params.type) ? params.type : undefined;
  const q = params.q?.trim() ?? "";
  const items = await listUserMedia(getDatabase().db, user.id, { status, type, q });
  const videoMinutes = items.reduce((sum, item) => isVideo(item.type) ? sum + (consumedMinutes({ type: item.type, runtimeMinutes: item.runtimeMinutes, progressCurrent: item.progressCurrent, progressTotal: item.progressTotal, status: item.status, overrideMinutes: item.timeSpentOverrideMinutes }) ?? 0) : sum, 0);
  const gameMinutes = items.reduce((sum, item) => item.type === "GAME" ? sum + (item.timeSpentOverrideMinutes ?? 0) : sum, 0);
  const pages = items.reduce((sum, item) => item.type === "BOOK" ? sum + item.progressCurrent : sum, 0);
  const returnPath = currentPath(status, type, q);

  return <section className="libraryPage">
    <div className="pageTitle libraryTitle">
      <div><h1>Your media</h1><p className="muted listSummary">{items.length} positions · {formatMinutes(videoMinutes)} watched{gameMinutes ? ` · ${formatMinutes(gameMinutes)} played` : ""} · {pages.toLocaleString()} pages</p></div>
      <Link className="button" href="/media/new">+ Add media</Link>
    </div>

    {params.error && <p className="error">{params.error}</p>}

    <nav className="statusTabs" aria-label="List status">
      {statuses.map(([label, value]) => <Link key={value || "all"} className={(status ?? "") === value ? "active" : ""} href={filterHref(value || undefined, type, q)}>{label}</Link>)}
    </nav>

    <form className="listTools" method="get">
      {status && <input type="hidden" name="status" value={status}/>} 
      <input name="q" defaultValue={q} placeholder="Search your list" aria-label="Search your list"/>
      <select name="type" defaultValue={type ?? ""} aria-label="Media type">{types.map(([label, value]) => <option key={value || "all"} value={value}>{label}</option>)}</select>
      <button className="secondary" type="submit">Filter</button>
      {(q || type) && <Link className="clearFilter" href={filterHref(status, undefined, "")}>Clear</Link>}
    </form>

    {items.length ? <div className="mediaList" role="table" aria-label="Media list">
      <div className="mediaListHeader" role="row">
        <span>#</span><span>Media</span><span>Status</span><span>Score</span><span>Progress</span><span>Type</span><span></span>
      </div>
      {items.map((item, index) => {
        const time = consumedMinutes({ type: item.type, runtimeMinutes: item.runtimeMinutes, progressCurrent: item.progressCurrent, progressTotal: item.progressTotal, status: item.status, overrideMinutes: item.timeSpentOverrideMinutes });
        return <article className={`mediaRow status-${item.status.toLowerCase().replace("_", "-")}`} key={item.userMediaId} role="row">
          <div className="rowNumber" role="cell">{index + 1}</div>
          <div className="rowMedia" role="cell">
            {item.coverUrl ? <ProviderCover className="rowCover" src={item.coverUrl} width={48} height={68}/> : <div className="rowCover placeholder">{item.type}</div>}
            <div className="rowTitleBlock">
              <a className="rowTitle" href={externalMediaUrl(item.source, item.externalId, item.externalSubId)} target="_blank" rel="noreferrer">{item.title}</a>
              <div className="rowMeta">{item.year ?? "year ?"} · {item.source}{item.originalTitle && item.originalTitle !== item.title ? ` · ${item.originalTitle}` : ""}</div>
              {item.metadataStatus === "PENDING" && <div className="metadataState">Metadata pending…</div>}
              {item.metadataStatus === "ERROR" && <div className="metadataState errorText">Metadata failed{item.metadataError ? `: ${item.metadataError}` : ""} <form action={retryMetadataAction} className="inlineForm"><input type="hidden" name="mediaId" value={item.mediaId}/><input type="hidden" name="returnTo" value={returnPath}/><button className="textAction" type="submit">Retry</button></form></div>}
              {item.notes && <div className="rowNotes">{item.notes}</div>}
            </div>
          </div>
          <form className="quickCell" action={quickStatusAction} role="cell">
            <input type="hidden" name="id" value={item.userMediaId}/><input type="hidden" name="returnTo" value={returnPath}/>
            <select name="status" defaultValue={item.status} aria-label={`Status for ${item.title}`}>{statuses.filter((entry) => entry[1]).map(([label,value]) => <option key={value} value={value}>{label}</option>)}</select><button type="submit" aria-label="Save status">✓</button>
          </form>
          <form className="quickCell scoreCell" action={quickScoreAction} role="cell">
            <input type="hidden" name="id" value={item.userMediaId}/><input type="hidden" name="returnTo" value={returnPath}/>
            <select name="score" defaultValue={item.score ?? ""} aria-label={`Score for ${item.title}`}><option value="">—</option>{Array.from({ length: 10 }, (_, i) => i + 1).map((score) => <option key={score} value={score}>{score}</option>)}</select><button type="submit" aria-label="Save score">✓</button>
          </form>
          <div className="progressCell" role="cell">{progressLabel(item.type, item.progressCurrent, item.progressTotal, time)}</div>
          <div className="typeCell" role="cell"><span className="typeBadge">{typeLabel(item.type)}</span></div>
          <details className="rowEdit" role="cell"><summary aria-label={`Edit ${item.title}`}>•••</summary><div className="editPopover">
            <form action={updateMediaAction} className="editForm"><input type="hidden" name="id" value={item.userMediaId}/><input type="hidden" name="returnTo" value={returnPath}/><label>Status<select name="status" defaultValue={item.status}>{statuses.filter((entry) => entry[1]).map(([label,value]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Score<input name="score" type="number" min="0" max="10" defaultValue={item.score ?? ""}/></label>{item.type !== "GAME" && <><label>Progress<input name="progressCurrent" type="number" min="0" defaultValue={item.progressCurrent}/></label><label>Total<input name="progressTotal" type="number" min="0" defaultValue={item.progressTotal ?? ""}/></label></>}<label className="wide">Notes<textarea name="notes" rows={3} defaultValue={item.notes ?? ""}/></label><label>{item.type === "GAME" ? "Played time" : "Manual time"} (minutes)<input name="timeSpentOverrideMinutes" type="number" min="0" defaultValue={item.timeSpentOverrideMinutes ?? ""}/></label><button type="submit">Save details</button></form>
            <form action={deleteMediaAction}><input type="hidden" name="id" value={item.userMediaId}/><input type="hidden" name="returnTo" value={returnPath}/><button className="danger" type="submit">Remove from list</button></form>
          </div></details>
        </article>;
      })}
    </div> : <div className="empty"><p>No positions match these filters.</p><Link href="/media/new">Add a position</Link></div>}
  </section>;
}

function filterHref(status?: MediaStatus, type?: MediaType, q = "") { const params = new URLSearchParams(); if (status) params.set("status", status); if (type) params.set("type", type); if (q) params.set("q", q); const query = params.toString(); return query ? `/?${query}` : "/"; }
function currentPath(status?: MediaStatus, type?: MediaType, q = "") { return filterHref(status, type, q); }
function isVideo(type: MediaType) { return type === "ANIME" || type === "MOVIE" || type === "SERIES"; }
function typeLabel(type: MediaType) { return ({ ANIME:"Anime", MOVIE:"Movie", SERIES:"Series", BOOK:"Book", GAME:"Game" } as const)[type]; }
function progressLabel(type: MediaType, current: number, total: number | null, time: number | null) {
  if (type === "GAME") return time == null ? "—" : formatMinutes(time);
  if (type === "BOOK") return `${current}${total != null ? ` / ${total}` : ""} pages`;
  return `${current || "—"} / ${total ?? "—"}`;
}
