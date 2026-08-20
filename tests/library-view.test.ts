import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_VISIBLE_COLUMNS, areAllVisibleSelected, parseVisibleColumns, reconcileSelection, serializeVisibleColumns } from "../src/lib/library-view";

test("selection is scoped to currently visible rows", () => {
  const selected = new Set(["old-a", "visible-b"]);
  const next = reconcileSelection(selected, ["visible-b", "visible-c"]);
  assert.deepEqual([...next], ["visible-b"]);
  assert.equal(areAllVisibleSelected(next, ["visible-b", "visible-c"]), false);
  assert.equal(areAllVisibleSelected(new Set(["visible-b", "visible-c", "hidden"]), ["visible-b", "visible-c"]), true);
});

test("visible columns distinguish defaults from explicitly empty", () => {
  assert.deepEqual(parseVisibleColumns(undefined), DEFAULT_VISIBLE_COLUMNS);
  assert.deepEqual(parseVisibleColumns("none"), []);
  assert.equal(serializeVisibleColumns([]), "none");
  assert.equal(serializeVisibleColumns(DEFAULT_VISIBLE_COLUMNS), undefined);
  assert.deepEqual(parseVisibleColumns("status,added"), ["status", "added"]);
});
