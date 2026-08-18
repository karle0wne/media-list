import test from "node:test";
import assert from "node:assert/strict";
import { ProviderCover } from "../src/components/provider-cover";

test("provider covers bypass the server image optimizer", () => {
  const element = ProviderCover({ src: "https://image.tmdb.org/t/p/w500/poster.jpg", width: 84, height: 118 });
  assert.equal(element.props.src, "https://image.tmdb.org/t/p/w500/poster.jpg");
  assert.equal(element.props.unoptimized, true);
});
