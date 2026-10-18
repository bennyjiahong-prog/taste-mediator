import assert from "node:assert/strict";
import { test } from "node:test";
import type { ApiMovie } from "@/lib/types";
import { partitionZones, topTags } from "@/lib/zones";

function movie(entityId: string, name: string, tags: string[] = []): ApiMovie {
  return {
    entityId,
    name,
    year: 2000,
    description: null,
    imageUrl: null,
    tags,
  };
}

test("partitionZones is overlap and leftovers, not a blended score", () => {
  const shared = movie("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "Shared Night", ["Thriller"]);
  const aOnly = movie("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "Only Dark", ["Horror"]);
  const bOnly = movie("cccccccc-cccc-4ccc-8ccc-cccccccccccc", "Only Warm", ["Romance"]);
  const zones = partitionZones(
    [aOnly, shared, aOnly],
    [{ ...shared, tags: ["Thriller", "Romance"] }, bOnly],
  );

  assert.deepEqual(
    zones.overlap.map((item) => item.name),
    ["Shared Night"],
  );
  assert.deepEqual(zones.overlap[0]?.tags, ["Thriller", "Romance"]);
  assert.deepEqual(
    zones.aOnly.map((item) => item.name),
    ["Only Dark"],
  );
  assert.deepEqual(
    zones.bOnly.map((item) => item.name),
    ["Only Warm"],
  );
  assert.equal("score" in zones, false);
});

test("empty pulls stay empty", () => {
  const zones = partitionZones([], []);
  assert.deepEqual(zones, { overlap: [], aOnly: [], bOnly: [] });
  assert.deepEqual(topTags([movie("dddddddd-dddd-4ddd-8ddd-dddddddddddd", "X", [])]), []);
});

test("the same title with different entity ids is not overlap", () => {
  const zones = partitionZones(
    [movie("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "The Notebook", ["Romance"])],
    [movie("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "The Notebook", ["Romance"])],
  );
  assert.deepEqual(zones.overlap, []);
  assert.deepEqual(
    zones.aOnly.map((item) => item.entityId),
    ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
  );
  assert.deepEqual(
    zones.bOnly.map((item) => item.entityId),
    ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
  );
  assert.equal(zones.aOnly.length + zones.bOnly.length + zones.overlap.length, 2);
});
