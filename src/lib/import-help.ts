export const QUICK_IMPORT_PROMPT=`# Prepare a media-list quick import

Use this prompt when one or more attached documents contain personal media lists in arbitrary formats such as Markdown, text, spreadsheets, PDFs, or Word documents. Read the supplied files and convert only the media identities into text that can be pasted directly into media-list Quick Import.

## Task

Extract anime/donghua, movies, TV seasons, books, and games that the documents actually identify. Reconcile obvious duplicates across files, but do not invent missing media or guess when two ambiguous names refer to the same work.

Prefer an exact supported provider URL only when that URL is explicitly present in the source material. Otherwise output the clearest title the source provides. Preserve season specificity: if the source says a particular TV season, the output line must still identify that season rather than collapsing it to the whole series.

Do not invent provider IDs, URLs, release years, seasons, translations, scores, statuses, or other metadata. Do not perform speculative matching merely to make the output look cleaner. If a source item is too ambiguous to identify as a media title, omit it rather than manufacture certainty.

## Output contract

Return plain text only, with exactly one import item per line. Each line must be either a title or an exact provider URL already present in the source. Do not use Markdown bullets, numbering, headings, code fences, tables, explanations, comments, or blank sections.

The result must be directly pasteable into media-list Quick Import without editing.`;

export const CANONICAL_CSV_HELP=`Canonical CSV is the strict round-trip format for media-list. Use it when you already have exact provider identities and want to preserve user state such as status, score, progress, or notes.

Required identity columns:
external_source, external_id, external_sub_id, type, title

User-state columns:
status, score, progress_current, progress_total, notes

Accepted sources are ANILIST, TMDB, OPENLIBRARY, and RAWG. Types are ANIME, MOVIE, SERIES, BOOK, and GAME. TV seasons use the TMDB series ID plus external_sub_id=season:N. The application revalidates every provider identity during import, so guessed or fabricated IDs are invalid.

Example output:
external_source,external_id,external_sub_id,type,title,status,score,progress_current,progress_total,notes
ANILIST,1,,ANIME,Cowboy Bebop,COMPLETED,9,26,26,
TMDB,1396,season:1,SERIES,Breaking Bad — Season 1,COMPLETED,10,7,7,`;
