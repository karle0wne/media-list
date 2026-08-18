import Image from "next/image";
import Link from "next/link";
import { requireSessionToken, requireUser } from "@/lib/auth";
import { encodeCandidateToken } from "@/lib/candidate-token";
import { scheduleMediaEnrichment } from "@/lib/enrichment-runtime";
import { getSeriesSeasons, searchMediaByType, searchSeriesShows } from "@/lib/providers";
import type { MediaCandidate, MediaType } from "@/lib/types";
import { isMediaType } from "@/lib/user-media";
import { addCandidateAction } from "../../actions";

const categories: Array<[MediaType, string]> = [["ANIME", "Anime / donghua"], ["MOVIE", "Movies"], ["SERIES", "TV series"], ["BOOK", "Books"]];

export default async function AddPage({ searchParams }: { searchParams: Promise<{ type?: string; q?: string; show?: string; error?: string }> }) {
  await requireUser();
  const sessionToken = await requireSessionToken();
  scheduleMediaEnrichment();
  const params = await searchParams;
  const type: MediaType = isMediaType(params.type) ? params.type : "ANIME";
  const q = params.q?.trim() ?? "";
  const showId = type === "SERIES" ? params.show?.trim() ?? "" : "";
  const results: MediaCandidate[] = q && type !== "SERIES" ? await searchMediaByType(type, q) : showId ? await getSeriesSeasons(showId) : [];
  const shows = q && type === "SERIES" && !showId ? await searchSeriesShows(q) : [];

  return <section>
    <h1>Add media</h1>
    <p className="muted">Choose a category first so search only waits for the relevant provider. After you select the exact work or season, Add is saved locally first and provider metadata is verified after the response.</p>
    {params.error && <p className="error">{params.error}</p>}
    <form method="get" className="searchbar">
      <select name="type" defaultValue={type} aria-label="Media category">{categories.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
      <input name="q" defaultValue={q} placeholder={placeholder(type)} autoFocus/>
      <button type="submit">Search</button>
    </form>

    {showId && <p><Link href={`/media/new?type=SERIES&q=${encodeURIComponent(q)}`}>← Back to series results</Link></p>}

    <div className="results">
      {shows.map((show) => <article className="card result" key={show.externalId}>
        {show.coverUrl && <Image src={show.coverUrl} alt="" width={84} height={118} />}
        <div className="grow"><h2>{show.title}</h2><p className="muted">TV series · {show.year ?? "year ?"} · TMDB</p>{show.originalTitle && show.originalTitle !== show.title && <p>{show.originalTitle}</p>}</div>
        <Link className="button" href={`/media/new?type=SERIES&q=${encodeURIComponent(q)}&show=${encodeURIComponent(show.externalId)}`}>Choose season</Link>
      </article>)}

      {results.map((item) => <article className="card result" key={item.key}>
        {item.coverUrl && <Image src={item.coverUrl} alt="" width={84} height={118} />}
        <div className="grow"><h2>{item.title}</h2><p className="muted">{item.type} · {item.year ?? "year ?"} · {item.source}</p>{item.originalTitle && item.originalTitle !== item.title && <p>{item.originalTitle}</p>}</div>
        <form action={addCandidateAction}><input type="hidden" name="candidateToken" value={encodeCandidateToken(item, sessionToken)}/><button type="submit">Add</button></form>
      </article>)}

      {q && !showId && !results.length && !shows.length && <p>No candidates found in {label(type)}.</p>}
      {showId && !results.length && <p>No seasons found for this series.</p>}
    </div>
  </section>;
}

function placeholder(type: MediaType) { return type === "BOOK" ? "Book title" : type === "MOVIE" ? "Movie title" : type === "SERIES" ? "Series title" : "Anime title in any language"; }
function label(type: MediaType) { return categories.find(([value]) => value === type)?.[1] ?? type; }
