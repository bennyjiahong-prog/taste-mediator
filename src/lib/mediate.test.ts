import assert from "node:assert/strict";
import { test } from "node:test";
import { assertHackathonBase, mediate, RATE_LIMIT_BACKOFF_MS } from "@/lib/mediate";
import { INSIGHTS_RATE_LIMIT_MESSAGE, SEARCH_RATE_LIMIT_MESSAGE } from "@/lib/results-copy";
import { partitionZones } from "@/lib/zones";

const KEY = "test-key-do-not-leak-9f3a";

const mainBody = {
  personA: [
    { title: "The Shining", year: 1980 },
    { title: "Hereditary", year: 2018 },
    { title: "The Witch", year: 2015 },
  ],
  personB: [
    { title: "Pride & Prejudice", year: 2005 },
    { title: "Notting Hill", year: 1999 },
    { title: "Love Actually", year: 2003 },
  ],
};

function entity(id: string, name: string, year: number) {
  return {
    entity_id: id,
    name,
    properties: { release_year: year },
    tags: [{ name: name.includes("Dark") ? "Horror" : "Romance" }],
    popularity: 0.4,
  };
}

const IDS = {
  shining: "11111111-1111-4111-8111-111111111111",
  hereditary: "22222222-2222-4222-8222-222222222222",
  witch: "33333333-3333-4333-8333-333333333333",
  pride: "44444444-4444-4444-8444-444444444444",
  notting: "55555555-5555-4555-8555-555555555555",
  love: "66666666-6666-4666-8666-666666666666",
  shared: "77777777-7777-4777-8777-777777777777",
  dark: "88888888-8888-4888-8888-888888888888",
  warm: "99999999-9999-4999-8999-999999999999",
};

type Call = { url: URL; method: string; key: string | null };

function mockFetch(
  handler: (url: URL) => { status: number; body: unknown },
): { fetchImpl: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const href =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const url = new URL(href);
    const headers = new Headers(init?.headers);
    calls.push({
      url,
      method: init?.method ?? "GET",
      key: headers.get("X-Api-Key"),
    });
    const result = handler(url);
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { fetchImpl, calls };
}

function catalog(url: URL): { status: number; body: unknown } {
  if (url.pathname === "/search") {
    const query = url.searchParams.get("query");
    const table: Record<string, { id: string; name: string; year: number }> = {
      "The Shining": { id: IDS.shining, name: "The Shining", year: 1980 },
      Hereditary: { id: IDS.hereditary, name: "Hereditary", year: 2018 },
      "The Witch": { id: IDS.witch, name: "The Witch", year: 2015 },
      "Pride & Prejudice": { id: IDS.pride, name: "Pride & Prejudice", year: 2005 },
      "Notting Hill": { id: IDS.notting, name: "Notting Hill", year: 1999 },
      "Love Actually": { id: IDS.love, name: "Love Actually", year: 2003 },
    };
    const found = query ? table[query] : undefined;
    if (!found) return { status: 404, body: {} };
    return { status: 200, body: { results: [entity(found.id, found.name, found.year)] } };
  }
  if (url.pathname === "/v2/insights") {
    assert.equal(url.searchParams.get("filter.type"), "urn:entity:movie");
    const signal = url.searchParams.get("signal.interests.entities") ?? "";
    assert.equal(url.searchParams.get("signal.interests.entities"), signal);
    assert.equal(initMethodSafe(url), true);
    if (signal.includes(IDS.shining)) {
      return {
        status: 200,
        body: {
          results: {
            entities: [
              entity(IDS.shining, "The Shining", 1980),
              entity(IDS.dark, "Only Dark", 2010),
              entity(IDS.shared, "Shared Night", 2014),
            ],
          },
        },
      };
    }
    return {
      status: 200,
      body: {
        results: {
          entities: [
            entity(IDS.warm, "Only Warm", 2001),
            entity(IDS.shared, "Shared Night", 2014),
          ],
        },
      },
    };
  }
  return { status: 500, body: { message: "unexpected path" } };
}

function initMethodSafe(url: URL): boolean {
  return !url.pathname.includes("recommendation") && !url.pathname.endsWith("/recs");
}

test("missing key never calls Qloo and returns no titles", async () => {
  const { fetchImpl, calls } = mockFetch(() => ({ status: 200, body: { results: [] } }));
  const result = await mediate(mainBody, { apiKey: "  ", fetchImpl, sleepImpl: async () => {} });
  assert.equal(result.status, 503);
  assert.equal(result.payload.ok, false);
  if (!result.payload.ok) assert.equal(result.payload.code, "missing_key");
  assert.equal(calls.length, 0);
  assert.equal(JSON.stringify(result.payload).includes("Only Dark"), false);
  assert.equal(JSON.stringify(result.payload).includes("insights"), false);
});

test("hackathon base is locked before the key is sent", async () => {
  assert.equal(assertHackathonBase(undefined), "https://hackathon.api.qloo.com");
  assert.throws(() => assertHackathonBase("https://api.qloo.com"));
  assert.throws(() => assertHackathonBase("https://staging.api.qloo.com"));
  const { fetchImpl, calls } = mockFetch(catalog);
  const result = await mediate(mainBody, {
    apiKey: KEY,
    baseUrl: "https://api.qloo.com",
    fetchImpl,
    sleepImpl: async () => {},
  });
  assert.equal(result.status, 500);
  assert.equal(calls.length, 0);
  assert.equal(JSON.stringify(result.payload).includes(KEY), false);
});

test("search then two insight pulls, seeds removed, key stays on the request", async () => {
  const { fetchImpl, calls } = mockFetch(catalog);
  const result = await mediate(mainBody, {
    apiKey: KEY,
    fetchImpl,
    sleepImpl: async () => {},
  });
  assert.equal(result.status, 200);
  assert.equal(result.payload.ok, true);
  if (!result.payload.ok) return;

  const paths = calls.map((call) => call.url.pathname);
  assert.deepEqual(
    paths.filter((path) => path === "/search").length,
    6,
  );
  assert.deepEqual(paths.filter((path) => path === "/v2/insights"), [
    "/v2/insights",
    "/v2/insights",
  ]);
  assert.ok(paths.every((path) => path === "/search" || path === "/v2/insights"));
  assert.ok(calls.every((call) => call.method === "GET" && call.key === KEY));
  assert.ok(
    calls.every((call) => !call.url.searchParams.has("api_key") && !call.url.href.includes(KEY)),
  );

  const namesA = result.payload.personA.insights.map((movie) => movie.name);
  const namesB = result.payload.personB.insights.map((movie) => movie.name);
  assert.deepEqual(namesA, ["Only Dark", "Shared Night"]);
  assert.deepEqual(namesB, ["Only Warm", "Shared Night"]);
  assert.equal(JSON.stringify(result.payload).includes(KEY), false);
  assert.equal(JSON.stringify(result.payload).includes("popularity"), false);
  assert.equal(result.payload.steps[0]?.method, "GET");
  assert.equal(result.payload.steps.at(-1)?.path, "/v2/insights");
});

test("a rejected key does not continue into insights or a movie list", async () => {
  const { fetchImpl, calls } = mockFetch(() => ({ status: 401, body: { message: "nope" } }));
  const result = await mediate(mainBody, { apiKey: KEY, fetchImpl, sleepImpl: async () => {} });
  assert.equal(result.status, 401);
  assert.equal(result.payload.ok, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url.pathname, "/search");
  assert.equal(JSON.stringify(result.payload).includes("insights"), false);
});

test("unresolved side skips insights", async () => {
  const { fetchImpl, calls } = mockFetch((url) => {
    if (url.pathname === "/search") return { status: 200, body: { results: [] } };
    return { status: 200, body: { results: { entities: [entity(IDS.dark, "Only Dark", 2010)] } } };
  });
  const result = await mediate(mainBody, { apiKey: KEY, fetchImpl, sleepImpl: async () => {} });
  assert.equal(result.status, 422);
  assert.equal(result.payload.ok, false);
  if (!result.payload.ok) {
    assert.equal(result.payload.code, "seed_unresolved");
    assert.equal(result.payload.seeds?.personA.length, 3);
  }
  assert.ok(calls.every((call) => call.url.pathname === "/search"));
  assert.equal(JSON.stringify(result.payload).includes("Only Dark"), false);
});

test("a failed second insights pull drops the first pull's titles", async () => {
  let insights = 0;
  const { fetchImpl } = mockFetch((url) => {
    if (url.pathname === "/search") return catalog(url);
    insights += 1;
    if (insights === 1) {
      return {
        status: 200,
        body: { results: { entities: [entity(IDS.dark, "Lantern District", 2011)] } },
      };
    }
    return { status: 500, body: { message: "down" } };
  });
  const result = await mediate(mainBody, { apiKey: KEY, fetchImpl, sleepImpl: async () => {} });
  assert.equal(result.payload.ok, false);
  assert.equal(JSON.stringify(result.payload).includes("Lantern District"), false);
});

test("unknown titles are refused", async () => {
  const { fetchImpl, calls } = mockFetch(catalog);
  const result = await mediate(
    {
      personA: [
        { title: "Inception", year: 2010 },
        { title: "The Shining", year: 1980 },
      ],
      personB: mainBody.personB,
    },
    { apiKey: KEY, fetchImpl, sleepImpl: async () => {} },
  );
  assert.equal(result.status, 400);
  assert.equal(calls.length, 0);
});

test("a 429 followed by 200 finishes the chain", async () => {
  let searches = 0;
  const sleeps: number[] = [];
  const { fetchImpl, calls } = mockFetch((url) => {
    if (url.pathname === "/search") {
      searches += 1;
      if (searches === 1) return { status: 429, body: { message: "slow down" } };
    }
    return catalog(url);
  });
  const result = await mediate(mainBody, {
    apiKey: KEY,
    fetchImpl,
    sleepImpl: async (ms) => {
      sleeps.push(ms);
    },
  });
  assert.equal(result.status, 200);
  assert.equal(result.payload.ok, true);
  assert.deepEqual(sleeps, [RATE_LIMIT_BACKOFF_MS[0]]);
  assert.equal(calls.filter((call) => call.url.pathname === "/search").length, 7);
  assert.equal(calls.filter((call) => call.url.pathname === "/v2/insights").length, 2);
  if (result.payload.ok) {
    assert.deepEqual(
      result.payload.personA.insights.map((movie) => movie.name),
      ["Only Dark", "Shared Night"],
    );
  }
  assert.equal(JSON.stringify(result.payload).includes(KEY), false);
});

test("persistent 429 returns rate_limited and no titles", async () => {
  const sleeps: number[] = [];
  const { fetchImpl, calls } = mockFetch(() => ({
    status: 429,
    body: { message: "Invented Movie Should Not Appear" },
  }));
  const result = await mediate(mainBody, {
    apiKey: KEY,
    fetchImpl,
    sleepImpl: async (ms) => {
      sleeps.push(ms);
    },
  });
  assert.equal(result.status, 429);
  assert.equal(result.payload.ok, false);
  if (!result.payload.ok) {
    assert.equal(result.payload.code, "rate_limited");
    assert.equal(result.payload.message, SEARCH_RATE_LIMIT_MESSAGE);
  }
  assert.deepEqual(sleeps, [...RATE_LIMIT_BACKOFF_MS]);
  assert.equal(calls.length, 1 + RATE_LIMIT_BACKOFF_MS.length);
  assert.ok(calls.every((call) => call.url.pathname === "/search"));
  const encoded = JSON.stringify(result.payload);
  assert.equal(encoded.includes("Invented Movie"), false);
  assert.equal(encoded.includes(KEY), false);
  assert.equal(encoded.includes("insights"), false);
});

test("search, two insight pulls, and a zero entityId intersection stay empty", async () => {
  const { fetchImpl, calls } = mockFetch((url) => {
    if (url.pathname === "/search") return catalog(url);
    const signal = url.searchParams.get("signal.interests.entities") ?? "";
    if (signal.includes(IDS.shining)) {
      return {
        status: 200,
        body: { results: { entities: [entity(IDS.dark, "Only Dark", 2010)] } },
      };
    }
    return {
      status: 200,
      body: { results: { entities: [entity(IDS.warm, "Only Warm", 2001)] } },
    };
  });
  const result = await mediate(mainBody, {
    apiKey: KEY,
    fetchImpl,
    sleepImpl: async () => {},
  });
  assert.equal(result.status, 200);
  assert.equal(result.payload.ok, true);
  if (!result.payload.ok) return;

  const paths = calls.map((call) => call.url.pathname);
  assert.equal(paths.filter((path) => path === "/search").length, 6);
  assert.deepEqual(paths.filter((path) => path === "/v2/insights"), [
    "/v2/insights",
    "/v2/insights",
  ]);
  const zones = partitionZones(result.payload.personA.insights, result.payload.personB.insights);
  assert.deepEqual(zones.overlap, []);
  assert.deepEqual(
    zones.aOnly.map((movie) => movie.name),
    ["Only Dark"],
  );
  assert.deepEqual(
    zones.bOnly.map((movie) => movie.name),
    ["Only Warm"],
  );
  const encoded = JSON.stringify(result.payload);
  assert.equal(encoded.includes("Shared Night"), false);
  assert.equal(encoded.includes("Invented Compromise"), false);
  assert.equal(encoded.includes(KEY), false);
});

test("an insights 429 clears the first pull and does not echo the key", async () => {
  const sleeps: number[] = [];
  let insights = 0;
  const { fetchImpl, calls } = mockFetch((url) => {
    if (url.pathname === "/search") return catalog(url);
    insights += 1;
    if (insights === 1) {
      return {
        status: 200,
        body: { results: { entities: [entity(IDS.dark, "Only Dark", 2010)] } },
      };
    }
    return { status: 429, body: { message: `slow down ${KEY}` } };
  });
  const result = await mediate(mainBody, {
    apiKey: KEY,
    fetchImpl,
    sleepImpl: async (ms) => {
      sleeps.push(ms);
    },
  });
  assert.equal(result.status, 429);
  assert.equal(result.payload.ok, false);
  if (!result.payload.ok) {
    assert.equal(result.payload.code, "rate_limited");
    assert.equal(result.payload.message, INSIGHTS_RATE_LIMIT_MESSAGE);
  }
  assert.deepEqual(sleeps, [...RATE_LIMIT_BACKOFF_MS]);
  assert.equal(calls.filter((call) => call.url.pathname === "/search").length, 6);
  assert.equal(
    calls.filter((call) => call.url.pathname === "/v2/insights").length,
    2 + RATE_LIMIT_BACKOFF_MS.length,
  );
  const encoded = JSON.stringify(result.payload);
  assert.equal(encoded.includes("Only Dark"), false);
  assert.equal(encoded.includes(KEY), false);
});

test("a search error that echoes the key omits the body", async () => {
  const { fetchImpl } = mockFetch(() => ({
    status: 400,
    body: { message: `rejected ${KEY} and ${"a".repeat(40)}` },
  }));
  const result = await mediate(mainBody, { apiKey: KEY, fetchImpl, sleepImpl: async () => {} });
  assert.equal(result.status, 502);
  assert.equal(result.payload.ok, false);
  if (!result.payload.ok) {
    assert.equal(result.payload.code, "upstream");
    assert.match(result.payload.message, /Qloo rejected search for The Shining \(400\)/);
    assert.match(result.payload.message, /Results were cleared/);
    assert.equal(result.payload.message.includes(KEY), false);
    assert.equal(result.payload.message.includes("a".repeat(28)), false);
  }
});

test("a short upstream detail can stay when it has no secret", async () => {
  const { fetchImpl } = mockFetch(() => ({
    status: 400,
    body: { message: "unknown filter" },
  }));
  const result = await mediate(mainBody, { apiKey: KEY, fetchImpl, sleepImpl: async () => {} });
  assert.equal(result.payload.ok, false);
  if (!result.payload.ok) {
    assert.match(result.payload.message, /unknown filter/);
    assert.equal(result.payload.message.includes(KEY), false);
  }
});
