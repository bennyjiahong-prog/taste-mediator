import assert from "node:assert/strict";
import { test } from "node:test";
import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { mediateWithAgent, MAX_AGENT_STEPS, NO_LLM_NOTICE } from "@/lib/agent";
import { mediate } from "@/lib/mediate";
import { partitionZones } from "@/lib/zones";

const QLOO_KEY = "qloo-test-key-do-not-leak-1b2c";
const LLM_KEY = "sk-or-v1-test-llm-key-do-not-leak-7d8e";

const body = {
  personA: [
    { title: "The Shining", year: 1980 },
    { title: "Hereditary", year: 2018 },
  ],
  personB: [
    { title: "Notting Hill", year: 1999 },
    { title: "Love Actually", year: 2003 },
  ],
};

const IDS = {
  shining: "11111111-1111-4111-8111-111111111111",
  hereditary: "22222222-2222-4222-8222-222222222222",
  notting: "55555555-5555-4555-8555-555555555555",
  love: "66666666-6666-4666-8666-666666666666",
  shared: "77777777-7777-4777-8777-777777777777",
  dark: "88888888-8888-4888-8888-888888888888",
  warm: "99999999-9999-4999-8999-999999999999",
};

function entity(id: string, name: string, year: number) {
  return { entity_id: id, name, properties: { release_year: year }, tags: [] };
}

type Handler = (url: URL) => { status: number; body: unknown } | null;

function qloo(override: Handler = () => null) {
  const urls: URL[] = [];
  const keys: (string | null)[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof URL ? input.href : String(input));
    urls.push(url);
    keys.push(new Headers(init?.headers).get("X-Api-Key"));
    const result = override(url) ?? catalog(url);
    return new Response(JSON.stringify(result.body), { status: result.status });
  };
  return { fetchImpl, urls, keys };
}

function catalog(url: URL): { status: number; body: unknown } {
  if (url.pathname === "/search") {
    const table: Record<string, [string, number]> = {
      "The Shining": [IDS.shining, 1980],
      Hereditary: [IDS.hereditary, 2018],
      "Notting Hill": [IDS.notting, 1999],
      "Love Actually": [IDS.love, 2003],
    };
    const query = url.searchParams.get("query") ?? "";
    const hit = table[query];
    if (!hit) return { status: 404, body: {} };
    return { status: 200, body: { results: [entity(hit[0], query, hit[1])] } };
  }
  const signal = url.searchParams.get("signal.interests.entities") ?? "";
  const horror = signal.includes(IDS.shining);
  if (url.searchParams.get("filter.type") === "urn:tag") {
    return {
      status: 200,
      body: {
        results: {
          tags: horror
            ? [
                { tag_id: "urn:tag:keyword:media:isolation", name: "Isolation" },
                { tag_id: "urn:tag:genre:media:horror", name: "Horror" },
              ]
            : [
                { tag_id: "urn:tag:genre:media:romance", name: "Romance" },
                { tag_id: "urn:tag:keyword:media:isolation", name: "Isolation" },
              ],
        },
      },
    };
  }
  return {
    status: 200,
    body: {
      results: {
        entities: horror
          ? [
              entity(IDS.notting, "Notting Hill", 1999),
              entity(IDS.dark, "Only Dark", 2010),
              entity(IDS.shared, "Shared Night", 2014),
            ]
          : [entity(IDS.warm, "Only Warm", 2001), entity(IDS.shared, "Shared Night", 2014)],
      },
    },
  };
}

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
};

let callId = 0;
function calls(...list: [string, Record<string, unknown>][]) {
  return {
    content: list.map(([toolName, input]) => ({
      type: "tool-call" as const,
      toolCallId: `call-${++callId}`,
      toolName,
      input: JSON.stringify(input),
    })),
    finishReason: { unified: "tool-calls" as const, raw: undefined },
    usage,
    warnings: [],
  };
}

function say(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    finishReason: { unified: "stop" as const, raw: undefined },
    usage,
    warnings: [],
  };
}

const fullPlan = [
  calls(["resolve_seeds", { person: "A" }], ["resolve_seeds", { person: "B" }]),
  calls(["get_movie_insights", { person: "A" }], ["get_movie_insights", { person: "B" }]),
  calls(["get_taste_tags", { person: "A" }], ["get_taste_tags", { person: "B" }]),
  calls(["compare_tastes", {}]),
  say(`SHARED ${IDS.shared}`),
];

function options(model: MockLanguageModelV4 | null, fetchImpl: typeof fetch) {
  return {
    apiKey: QLOO_KEY,
    fetchImpl,
    sleepImpl: async () => {},
    model,
    modelId: model ? "mock-model" : null,
    secrets: [LLM_KEY],
  };
}

test("agent plans Qloo tool calls and the overlap comes from code", async () => {
  const model = new MockLanguageModelV4({ doGenerate: fullPlan });
  const { fetchImpl, urls, keys } = qloo();
  const result = await mediateWithAgent(body, options(model, fetchImpl));

  assert.equal(result.status, 200);
  assert.equal(result.payload.ok, true);
  if (!result.payload.ok) return;
  const agent = result.payload.agent;
  assert.ok(agent);
  assert.equal(agent.mode, "agent");
  assert.equal(agent.model, "mock-model");
  assert.deepEqual(
    agent.toolCalls.map((call) => `${call.tool}:${call.input}:${call.ok}`),
    [
      "resolve_seeds:A:true",
      "resolve_seeds:B:true",
      "get_movie_insights:A:true",
      "get_movie_insights:B:true",
      "get_taste_tags:A:true",
      "get_taste_tags:B:true",
      "compare_tastes::true",
    ],
  );
  assert.equal(
    agent.explanation,
    "Watch Shared Night (2014): it appears in both Qloo movie-insight pulls with the same entity ID.",
  );
  assert.deepEqual(agent.tags?.shared.map((tag) => tag.name), ["Isolation"]);

  const zones = partitionZones(result.payload.personA.insights, result.payload.personB.insights);
  assert.deepEqual(zones.overlap.map((movie) => movie.name), ["Shared Night"]);
  assert.deepEqual(zones.aOnly.map((movie) => movie.name), ["Only Dark"]);
  assert.equal(
    result.payload.personA.insights.some((movie) => movie.entityId === IDS.notting),
    false,
    "a Person B seed is not overlap",
  );

  const tagCalls = urls.filter((url) => url.searchParams.get("filter.type") === "urn:tag");
  assert.equal(tagCalls.length, 2);
  assert.ok(keys.every((key) => key === QLOO_KEY));
  assert.equal(result.payload.steps.length, urls.length);

  const compareResult = JSON.stringify(model.doGenerateCalls[4]?.prompt);
  assert.match(
    compareResult,
    new RegExp(`"overlap":\\[\\{"entityId":"${IDS.shared}","name":"Shared Night"`),
  );

  const serialized = JSON.stringify(result.payload);
  assert.equal(serialized.includes(QLOO_KEY), false);
  assert.equal(serialized.includes(LLM_KEY), false);
});

test("without an LLM key the deterministic flow runs with a clear notice", async () => {
  const { fetchImpl } = qloo();
  const result = await mediateWithAgent(body, options(null, fetchImpl));
  const plain = await mediate(body, { apiKey: QLOO_KEY, fetchImpl: qloo().fetchImpl });

  assert.equal(result.status, 200);
  assert.equal(result.payload.agent?.mode, "fallback");
  assert.equal(result.payload.agent?.notice, NO_LLM_NOTICE);
  assert.match(NO_LLM_NOTICE, /OPENROUTER_API_KEY/);
  const { agent, ...rest } = result.payload;
  assert.ok(agent);
  assert.deepEqual(
    JSON.stringify({ ...rest, steps: [] }),
    JSON.stringify({ ...plain.payload, steps: [] }),
  );
});

test("an LLM failure falls back to the fixed pipeline without leaking the key", async () => {
  const model = new MockLanguageModelV4({
    doGenerate: async () => {
      throw new APICallError({
        message: `Incorrect API key provided: ${LLM_KEY}`,
        url: "https://openrouter.ai/api/v1/chat/completions",
        requestBodyValues: {},
        statusCode: 401,
        isRetryable: false,
      });
    },
  });
  const { fetchImpl } = qloo();
  const result = await mediateWithAgent(body, options(model, fetchImpl));

  assert.equal(result.status, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.agent?.mode, "fallback");
  assert.match(result.payload.agent?.notice ?? "", /401/);
  assert.equal(result.payload.agent?.explanation, null);
  if (result.payload.ok) {
    const zones = partitionZones(result.payload.personA.insights, result.payload.personB.insights);
    assert.deepEqual(zones.overlap.map((movie) => movie.name), ["Shared Night"]);
  }
  assert.equal(JSON.stringify(result.payload).includes(LLM_KEY), false);
});

test("an agent that skips the comparison does not get its text shown", async () => {
  const model = new MockLanguageModelV4({
    doGenerate: [
      calls(["get_movie_insights", { person: "A" }]),
      say("Everyone will love Only Dark, it is the perfect compromise."),
    ],
  });
  const { fetchImpl } = qloo();
  const result = await mediateWithAgent(body, options(model, fetchImpl));

  assert.equal(result.status, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.agent?.explanation, null);
  assert.match(result.payload.agent?.notice ?? "", /before comparing/);
  if (result.payload.ok) {
    assert.equal(result.payload.personB.insights.length, 2);
  }
});

test("an ungrounded final directive is hidden after comparison", async () => {
  const model = new MockLanguageModelV4({
    doGenerate: [...fullPlan.slice(0, 4), say(`SHARED ${IDS.dark}`)],
  });
  const { fetchImpl } = qloo();
  const result = await mediateWithAgent(body, options(model, fetchImpl));

  assert.equal(result.status, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.agent?.mode, "agent");
  assert.equal(result.payload.agent?.explanation, null);
  assert.match(result.payload.agent?.notice ?? "", /failed entity-ID grounding/);
});

test("a rejected Qloo key stops the agent loop and clears results", async () => {
  const model = new MockLanguageModelV4({ doGenerate: fullPlan });
  const { fetchImpl } = qloo(() => ({ status: 401, body: { message: "bad key" } }));
  const result = await mediateWithAgent(body, options(model, fetchImpl));

  assert.equal(result.status, 401);
  assert.equal(result.payload.ok, false);
  if (!result.payload.ok) assert.equal(result.payload.code, "invalid_key");
  assert.equal(model.doGenerateCalls.length, 1);
  assert.equal(result.payload.agent?.explanation, null);
  assert.equal(JSON.stringify(result.payload).includes("Shared Night"), false);
});

test("a tag insights failure is reported to the agent but does not clear movies", async () => {
  const model = new MockLanguageModelV4({ doGenerate: fullPlan });
  const { fetchImpl } = qloo((url) =>
    url.searchParams.get("filter.type") === "urn:tag"
      ? { status: 400, body: { message: "filter not supported" } }
      : null,
  );
  const result = await mediateWithAgent(body, options(model, fetchImpl));

  assert.equal(result.status, 200);
  assert.equal(result.payload.ok, true);
  const tagCalls = result.payload.agent?.toolCalls.filter((call) => call.tool === "get_taste_tags");
  assert.deepEqual(tagCalls?.map((call) => call.ok), [false, false]);
  assert.equal(result.payload.agent?.tags, null);
  assert.ok(result.payload.agent?.explanation);
});

test("the loop is capped and secrets in model text are redacted", async () => {
  const model = new MockLanguageModelV4({
    doGenerate: [
      ...Array.from({ length: MAX_AGENT_STEPS + 4 }, () =>
        calls(["resolve_seeds", { person: "A" }]),
      ),
    ],
  });
  const { fetchImpl, urls } = qloo();
  const result = await mediateWithAgent(body, options(model, fetchImpl));
  assert.equal(model.doGenerateCalls.length, MAX_AGENT_STEPS);
  assert.equal(result.payload.ok, true);
  assert.equal(
    urls.filter((url) => url.searchParams.get("query") === "The Shining").length,
    1,
    "resolved seeds are cached across tool calls",
  );

  const leaky = new MockLanguageModelV4({
    doGenerate: [...fullPlan.slice(0, 4), say(`SHARED ${IDS.shared} ${QLOO_KEY} ${LLM_KEY}`)],
  });
  const leakResult = await mediateWithAgent(body, options(leaky, qloo().fetchImpl));
  const serialized = JSON.stringify(leakResult.payload.agent);
  assert.equal(serialized.includes(QLOO_KEY), false);
  assert.equal(serialized.includes(LLM_KEY), false);
});

test("a missing Qloo key fails before the model is called", async () => {
  const model = new MockLanguageModelV4({ doGenerate: fullPlan });
  const { fetchImpl, urls } = qloo();
  const result = await mediateWithAgent(body, { ...options(model, fetchImpl), apiKey: "" });
  assert.equal(result.status, 503);
  assert.equal(model.doGenerateCalls.length, 0);
  assert.equal(urls.length, 0);
});
