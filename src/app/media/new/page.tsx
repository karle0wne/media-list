import Image from "next/image";
import { requireSessionToken, requireUser } from "@/lib/auth";
import { encodeCandidateToken } from "@/lib/candidate-token";
import { scheduleMediaEnrichment } from "@/lib/enrichment-runtime";
import { searchAllProviders } from "@/lib/providers";
import { addCandidateAction } from "../../actions";

export default async function AddPage({ searchParams }: { searchParams: Promise<{ q?: string; error?: string }> }) {
  await requireUser();
  const sessionToken = await requireSessionToken();
  scheduleMediaEnrichment();
  const { q = "", error } = await searchParams;
  const results = q.trim() ? await searchAllProviders(q.trim()) : [];

  return <section><h1>Add media</h1><p className="muted">Search providers, then explicitly select the exact work/season. Add is saved locally first; provider metadata is verified after the response.</p>{error && <p className="error">{error}</p>}<form method="get" className="searchbar"><input name="q" defaultValue={q} placeholder="Title in any language" autoFocus/><button type="submit">Search</button></form><div className="results">{results.map((item) => <article className="card result" key={item.key}>{item.coverUrl && <Image src={item.coverUrl} alt="" width={84} height={118} />}<div className="grow"><h2>{item.title}</h2><p className="muted">{item.type} · {item.year ?? "year ?"} · {item.source}</p>{item.originalTitle && item.originalTitle !== item.title && <p>{item.originalTitle}</p>}</div><form action={addCandidateAction}><input type="hidden" name="candidateToken" value={encodeCandidateToken(item, sessionToken)}/><button type="submit">Add</button></form></article>)}{q && !results.length && <p>No candidates found. If this is a localized title, Quick Import also has a multilingual fallback.</p>}</div></section>;
}
