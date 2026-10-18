import assert from "node:assert/strict";
import { test } from "node:test";
import {
  emptySetCopy,
  INSIGHTS_RATE_LIMIT_MESSAGE,
  isSafePublicMessage,
  publicFailureMessage,
  publicFailureTitle,
  SEARCH_RATE_LIMIT_MESSAGE,
} from "@/lib/results-copy";
import type { QlooStep } from "@/lib/types";

const searchStep: QlooStep = {
  method: "GET",
  path: "/search",
  label: "Resolve “The Shining”",
  status: 429,
  ms: 12,
};

const insightsStep: QlooStep = {
  method: "GET",
  path: "/v2/insights",
  label: "Insights for Person B · urn:entity:movie",
  status: 429,
  ms: 20,
};

test("empty set copy counts the intersection and names no title", () => {
  const disjoint = emptySetCopy({ overlapCount: 0, aOnlyCount: 2, bOnlyCount: 1 });
  assert.ok(disjoint);
  assert.match(disjoint.headline, /empty set/i);
  assert.match(disjoint.counts, /Shared entity ids: 0/);
  assert.match(disjoint.counts, /Person A only: 2/);
  assert.equal(JSON.stringify(disjoint).includes("Only Dark"), false);
  assert.equal(JSON.stringify(disjoint).includes("The Shining"), false);

  const bothEmpty = emptySetCopy({ overlapCount: 0, aOnlyCount: 0, bOnlyCount: 0 });
  assert.ok(bothEmpty);
  assert.match(bothEmpty.counts, /Person A: 0/);
  assert.match(bothEmpty.body, /does not invent a title/);

  assert.equal(emptySetCopy({ overlapCount: 1, aOnlyCount: 3, bOnlyCount: 2 }), null);
});

test("search and insights rate limits use distinct public copy", () => {
  assert.equal(
    publicFailureMessage({
      code: "rate_limited",
      message: "Qloo rate-limited — try again shortly. Results were cleared.",
      steps: [searchStep],
    }),
    SEARCH_RATE_LIMIT_MESSAGE,
  );
  assert.equal(publicFailureTitle("rate_limited", [searchStep]), "Search rate limited");

  assert.equal(
    publicFailureMessage({
      code: "rate_limited",
      message: `leaked api_key=${"k".repeat(20)}`,
      steps: [searchStep, insightsStep],
    }),
    INSIGHTS_RATE_LIMIT_MESSAGE,
  );
  assert.equal(publicFailureTitle("rate_limited", [searchStep, insightsStep]), "Insights rate limited");
  assert.equal(INSIGHTS_RATE_LIMIT_MESSAGE.includes("k".repeat(20)), false);
});

test("unsafe upstream text is replaced and safe text is kept", () => {
  const leaked = publicFailureMessage({
    code: "upstream",
    message: "Qloo rejected search (400). api_key=super-secret-value Results were cleared.",
    steps: [searchStep],
  });
  assert.equal(leaked.includes("super-secret"), false);
  assert.match(leaked, /Title search failed/);
  assert.equal(publicFailureTitle("upstream", [searchStep]), "Search failed");

  const insightsLeak = publicFailureMessage({
    code: "upstream",
    message: `Bearer ${"a".repeat(32)}`,
    steps: [searchStep, { ...insightsStep, status: 500 }],
  });
  assert.equal(insightsLeak.includes("aaaa"), false);
  assert.match(insightsLeak, /neither person's list is shown/);
  assert.equal(publicFailureTitle("upstream", [searchStep, insightsStep]), "Insights failed");

  const safe =
    "Qloo failed during insights for Person A (500). Results were cleared. Try again later.";
  assert.equal(isSafePublicMessage(safe), true);
  assert.equal(
    publicFailureMessage({
      code: "upstream",
      message: safe,
      steps: [searchStep, { ...insightsStep, status: 500 }],
    }),
    safe,
  );
});
