import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_LIBRARY_SORT,
  DEFAULT_VISIBLE_COLUMNS,
  areAllVisibleSelected,
  parseVisibleColumns,
  reconcileSelection,
  serializeVisibleColumns,
} from "../src/lib/library-view";

test("selection is scoped to currently visible rows", () => {
  const selected = new Set(["old-a", "visible-b"]);
  const next = reconcileSelection(selected, ["visible-b", "visible-c"]);
  assert.deepEqual([...next], ["visible-b"]);
  assert.equal(areAllVisibleSelected(next, ["visible-b", "visible-c"]), false);
  assert.equal(
    areAllVisibleSelected(new Set(["visible-b", "visible-c", "hidden"]), [
      "visible-b",
      "visible-c",
    ]),
    true,
  );
});

test("visible columns distinguish defaults from explicitly empty", () => {
  assert.deepEqual(parseVisibleColumns(undefined), DEFAULT_VISIBLE_COLUMNS);
  assert.deepEqual(parseVisibleColumns("none"), []);
  assert.equal(serializeVisibleColumns([]), "none");
  assert.equal(serializeVisibleColumns(DEFAULT_VISIBLE_COLUMNS), undefined);
  assert.deepEqual(parseVisibleColumns("status,added,updated"), ["status", "added", "updated"]);
});

test("library defaults to latest user update", () => {
  assert.equal(DEFAULT_LIBRARY_SORT, "updated");
});

test("repeated or oversized query parameters cannot break a page", async () => {
  const { singleSearchParams } = await import("../src/lib/search-params");
  assert.deepEqual(singleSearchParams({ q: ["a", "b"], sort: "title", empty: undefined }), {
    q: "a",
    sort: "title",
    empty: undefined,
  });
  assert.equal(singleSearchParams({ error: "x".repeat(5000) }).error?.length, 500);
});

test("the stored view mode accepts only known values", async () => {
  const { parseViewMode } = await import("../src/lib/library-view");
  assert.equal(parseViewMode("grid"), "grid");
  assert.equal(parseViewMode("table"), "table");
  assert.equal(parseViewMode("<script>"), "table");
  assert.equal(parseViewMode(undefined), "table");
});

test("an error message is shown once and never carried into links or later redirects", async () => {
  const { pathWithError, queryPath, safeReturnPath, withoutMessages } =
    await import("../src/lib/search-params");
  const params = { q: "naruto", sort: "title", error: "boom", result: "done" };
  assert.deepEqual(withoutMessages(params), { q: "naruto", sort: "title" });
  assert.equal(queryPath(withoutMessages(params)), "/?q=naruto&sort=title");
  assert.equal(safeReturnPath("/?q=naruto&error=boom"), "/?q=naruto");
  assert.equal(safeReturnPath("/?error=boom"), "/");
  assert.equal(safeReturnPath("//evil.example"), "/");
  assert.equal(safeReturnPath("https://evil.example"), "/");
  // A new error replaces an old one instead of sitting next to it.
  assert.equal(pathWithError("/?error=old&q=a", "new one"), "/?error=new+one&q=a");
  assert.equal(pathWithError("/media/new", "x"), "/media/new?error=x");
});
