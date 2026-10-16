import assert from "node:assert/strict";
import { test } from "node:test";
import { extractEntityArray, normalizeEntity, pickSeedMatch } from "@/lib/normalize";

const shining = {
  entity_id: "11111111-1111-4111-8111-111111111111",
  name: "The Shining",
  properties: {
    release_year: 1980,
    short_description: "A family winters at the Overlook.",
    image: { url: "https://images.example/shining.jpg" },
  },
  tags: [{ name: "Horror" }, { name: "Horror" }, "Psychological"],
  popularity: 0.9,
};

test("normalizeEntity keeps provider fields and drops scores", () => {
  const movie = normalizeEntity(shining);
  assert.ok(movie);
  assert.equal(movie.year, 1980);
  assert.deepEqual(movie.tags, ["Horror", "Psychological"]);
  assert.equal(movie.imageUrl, "https://images.example/shining.jpg");
  assert.equal("popularity" in movie, false);
  assert.deepEqual(
    Object.keys(movie).sort(),
    ["description", "entityId", "imageUrl", "name", "tags", "year"],
  );
});

test("normalizeEntity rejects unsafe ids and image urls", () => {
  assert.equal(normalizeEntity({ entity_id: "short", name: "Nope" }), null);
  assert.equal(
    normalizeEntity({ entity_id: shining.entity_id, name: "" }),
    null,
  );
  const movie = normalizeEntity({
    ...shining,
    properties: { image: { url: "javascript:alert(1)" }, release_year: "1980" },
  });
  assert.equal(movie?.imageUrl, null);
  assert.equal(movie?.year, 1980);
});

test("extractEntityArray reads search and insights shapes", () => {
  assert.deepEqual(extractEntityArray({ results: [shining] }), {
    ok: true,
    entities: [shining],
  });
  assert.deepEqual(extractEntityArray({ results: { entities: [shining] } }), {
    ok: true,
    entities: [shining],
  });
  assert.equal(extractEntityArray({ ok: true }).ok, false);
  assert.equal(extractEntityArray(null).ok, false);
});

test("pickSeedMatch uses the requested year and refuses lookalikes", () => {
  const movies = [
    normalizeEntity(shining),
    normalizeEntity({
      ...shining,
      entity_id: "22222222-2222-4222-8222-222222222222",
      properties: { release_year: 1997 },
    }),
  ].filter((movie) => movie != null);

  const hit = pickSeedMatch(movies, ["The Shining"], 1980);
  assert.equal(hit.status, "matched");
  assert.equal(hit.entity?.year, 1980);

  const miss = pickSeedMatch(movies, ["The Shining"], 1981);
  assert.equal(miss.status, "miss");
  assert.equal(miss.entity, null);
  assert.match(miss.note, /not used: 1980, 1997/);

  const vvitch = normalizeEntity({
    entity_id: "33333333-3333-4333-8333-333333333333",
    name: "The VVitch: A New-England Folktale",
    properties: { release_year: 2015 },
  });
  assert.ok(vvitch);
  const witch = pickSeedMatch([vvitch], ["The Witch", "The VVitch"], 2015);
  assert.equal(witch.status, "matched");
  assert.equal(witch.entity?.entityId, vvitch.entityId);
});
