import "./library.css";
import { cookies } from "next/headers";
import { requireIdentity } from "@/lib/identity";
import { getDatabase } from "@/db";
import { listUserMedia, type MediaSort, type SortDirection } from "@/lib/services/media";
import { externalMediaUrl } from "@/lib/providers/catalog";
import { isMediaStatus, isMediaType } from "@/lib/user-media";
import type { MediaStatus } from "@/lib/types";
import {
  DEFAULT_LIBRARY_DIRECTION,
  DEFAULT_LIBRARY_SORT,
  parseViewMode,
  parseVisibleColumns,
  VIEW_MODE_COOKIE,
} from "@/lib/library-view";
import { STATUS_LABELS, STATUS_ORDER } from "@/lib/labels";
import { LibraryWorkspace } from "@/components/library-workspace";
import {
  queryPath,
  singleSearchParams,
  withoutMessages,
  type RawSearchParams,
} from "@/lib/search-params";

const statuses: Array<[string, MediaStatus | ""]> = [
  ["All", ""],
  ...STATUS_ORDER.map((status): [string, MediaStatus] => [STATUS_LABELS[status], status]),
];

const sortKeys = new Set<MediaSort>([
  "updated",
  "created",
  "title",
  "score",
  "progress",
  "type",
  "year",
]);

export default async function Home({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const user = await requireIdentity();

  const rawParams = singleSearchParams(await searchParams);
  // `error` is shown once; the links and forms below carry only the view state.
  const params = withoutMessages(rawParams);
  const viewMode = parseViewMode((await cookies()).get(VIEW_MODE_COOKIE)?.value);
  const status = isMediaStatus(params.status) ? params.status : undefined;
  const selectedTypes = (params.types ?? "").split(",").filter(isMediaType);
  const q = params.q?.trim() ?? "";
  const scoreMin = parseScore(params.scoreMin);
  const hasNotes = params.hasNotes === "1";
  const sort = sortKeys.has(params.sort as MediaSort)
    ? (params.sort as MediaSort)
    : DEFAULT_LIBRARY_SORT;
  const direction: SortDirection = params.dir === "asc" ? "asc" : DEFAULT_LIBRARY_DIRECTION;
  const visibleColumns = parseVisibleColumns(params.cols);

  const items = await listUserMedia(getDatabase().db, user.id, {
    status,
    types: selectedTypes,
    q,
    scoreMin,
    hasNotes,
    sort,
    direction,
  });

  const current = queryPath(params);
  const sortLinks = Object.fromEntries(
    [...sortKeys].map((key) => [
      key,
      {
        asc: queryPath({
          ...params,
          sort: key === DEFAULT_LIBRARY_SORT ? undefined : key,
          dir: "asc",
        }),
        desc: queryPath({
          ...params,
          sort: key === DEFAULT_LIBRARY_SORT ? undefined : key,
          dir: key === DEFAULT_LIBRARY_SORT ? undefined : "desc",
        }),
      },
    ]),
  ) as Record<MediaSort, Record<SortDirection, string>>;

  const statusLinks = statuses.map(([label, value]) => ({
    label,
    status: value || null,
    active: (status ?? "") === value,
    href: queryPath({ ...params, status: value || undefined }),
  }));

  const hiddenSearchParams = Object.entries(params)
    .filter(([key, value]) => key !== "q" && Boolean(value))
    .map(([key, value]) => [key, value as string] as [string, string]);

  return (
    <section className="libraryPage">
      {rawParams.error && <p className="error">{rawParams.error}</p>}
      <LibraryWorkspace
        key={current}
        initialViewMode={viewMode}
        items={items.map((item) => ({
          ...item,
          externalUrl:
            item.externalUrl || externalMediaUrl(item.source, item.externalId, item.externalSubId),
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
        }))}
        returnTo={current}
        visibleColumns={visibleColumns}
        sort={sort}
        direction={direction}
        sortLinks={sortLinks}
        selectedTypes={selectedTypes}
        scoreMin={scoreMin}
        hasNotes={hasNotes}
        statusLinks={statusLinks}
        query={q}
        hiddenSearchParams={hiddenSearchParams}
      />
    </section>
  );
}

function parseScore(value?: string) {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const n = Number(value);
  return n >= 1 && n <= 10 ? n : undefined;
}
