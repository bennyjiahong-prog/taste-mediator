import assert from "node:assert/strict";
import { test } from "node:test";
import { SEEDS } from "@/lib/seeds";
import {
  emptyColumnCopy,
  errorPhaseRows,
  FOCUS,
  idlePanelCopy,
  loadingPanelCopy,
  loadingPhaseRows,
  loadingSkeletonNote,
  mediateButtonLabel,
  mediateHint,
  missingKeyBannerCopy,
  PRIMARY_FOCUS_CLASS,
  primaryActionAriaDisabled,
  retryActionLabel,
  settleFocusId,
} from "@/lib/status-copy";
import type { QlooStep } from "@/lib/types";

const FORBIDDEN = [
  ...SEEDS.flatMap((seed) => [seed.title, ...seed.queries]),
  "Only Dark",
  "Only Warm",
  "Shared Night",
];

function assertNoTitles(value: unknown) {
  const text = JSON.stringify(value);
  for (const title of FORBIDDEN) {
    assert.equal(text.includes(title), false, `status copy named “${title}”`);
  }
  assert.equal(/movie card titled/i.test(text), false);
}

const searchStep: QlooStep = {
  method: "GET",
  path: "/search",
  label: "Resolve a title",
  status: 429,
  ms: 4,
};

const insightsStep: QlooStep = {
  method: "GET",
  path: "/v2/insights",
  label: "Insights for Person A",
  status: 500,
  ms: 8,
};

test("idle and loading copy name search then mediate and no title", () => {
  const idle = idlePanelCopy();
  const loading = loadingPanelCopy();
  const phases = loadingPhaseRows();
  assert.equal(idle.tone, "idle");
  assert.match(idle.body, /search runs first/i);
  assert.match(idle.body, /does not show a movie card/i);
  assert.equal(loading.tone, "loading");
  assert.match(loading.title, /Searching, then mediating/);
  assert.match(loading.body, /status skeleton, not movies/i);
  assert.deepEqual(
    phases.map((row) => [row.id, row.label, row.state, row.stateLabel]),
    [
      ["search", "Search", "active", "In progress"],
      ["mediate", "Mediate", "waiting", "Waiting"],
    ],
  );
  assert.match(phases[0].detail, /No movie card/);
  assert.match(phases[1].detail, /both return/);
  assert.equal(loadingSkeletonNote(), "No movie titles yet.");
  assertNoTitles([idle, loading, phases, loadingSkeletonNote()]);
});

test("empty columns stay empty of titles", () => {
  const none = emptyColumnCopy({ side: "A", pullCount: 0 });
  const absorbed = emptyColumnCopy({ side: "B", pullCount: 3 });
  assert.equal(none.tone, "empty");
  assert.match(none.title, /Person A returned no titles/);
  assert.match(none.body, /No movie card was added/);
  assert.match(absorbed.title, /Person B has no titles outside the overlap/);
  assert.match(absorbed.body, /Nothing extra is shown/);
  assert.equal(JSON.stringify(none).includes("3"), false);
  assertNoTitles([none, absorbed]);
});

test("missing key banner states 503 missing_key and invents no list", () => {
  const banner = missingKeyBannerCopy();
  assert.equal(banner.title, "Qloo is not connected");
  assert.match(banner.body, /HTTP 503/);
  assert.match(banner.body, /missing_key/);
  assert.match(banner.body, /does not invent a movie list/);
  assertNoTitles(banner);
});

test("error phase rows distinguish search, insights, unresolved seeds, and no call", () => {
  const before = errorPhaseRows({ code: "missing_key", steps: [] });
  assert.deepEqual(
    before.map((row) => [row.id, row.state]),
    [
      ["search", "skipped"],
      ["mediate", "skipped"],
    ],
  );

  const searchLimited = errorPhaseRows({ code: "rate_limited", steps: [searchStep] });
  assert.deepEqual(
    searchLimited.map((row) => [row.id, row.state, row.stateLabel]),
    [
      ["search", "failed", "Failed"],
      ["mediate", "skipped", "Skipped"],
    ],
  );
  assert.match(searchLimited[1].detail, /Insights did not run/);

  const insightsFailed = errorPhaseRows({
    code: "upstream",
    steps: [searchStep, insightsStep],
  });
  assert.deepEqual(
    insightsFailed.map((row) => [row.id, row.state]),
    [
      ["search", "done"],
      ["mediate", "failed"],
    ],
  );
  assert.match(insightsFailed[1].detail, /Both lists were cleared/);

  const unresolved = errorPhaseRows({
    code: "seed_unresolved",
    steps: [{ ...searchStep, status: 200 }],
  });
  assert.deepEqual(
    unresolved.map((row) => [row.id, row.state]),
    [
      ["search", "done"],
      ["mediate", "skipped"],
    ],
  );
  assert.match(unresolved[0].detail, /no resolved movie/);
  assertNoTitles([before, searchLimited, insightsFailed, unresolved]);
});

test("keyboard focus targets and primary-action rules stay stable", () => {
  assert.equal(settleFocusId("loading"), FOCUS.loadingHeading);
  assert.equal(settleFocusId("error"), FOCUS.errorHeading);
  assert.equal(settleFocusId("ready"), FOCUS.resultsHeading);
  assert.equal(FOCUS.mediate, "mediate-button");
  assert.equal(FOCUS.retry, "mediate-retry");
  assert.match(PRIMARY_FOCUS_CLASS, /focus-visible:ring-3/);
  assert.match(PRIMARY_FOCUS_CLASS, /focus-visible:outline-none/);
  assert.equal(mediateButtonLabel(false), "Mediate");
  assert.equal(mediateButtonLabel(true), "Mediating…");
  assert.equal(retryActionLabel(), "Mediate again");
  assert.match(mediateHint(true), /At least two seeds/);
  assert.match(mediateHint(false), /Choose at least two seeds/);
  assert.equal(
    primaryActionAriaDisabled({ action: "mediate", loading: false, canMediate: true }),
    false,
  );
  assert.equal(
    primaryActionAriaDisabled({ action: "mediate", loading: false, canMediate: false }),
    true,
  );
  assert.equal(
    primaryActionAriaDisabled({ action: "mediate", loading: true, canMediate: true }),
    true,
  );
  assert.equal(
    primaryActionAriaDisabled({ action: "preset", loading: true, canMediate: true }),
    true,
  );
  assert.equal(
    primaryActionAriaDisabled({ action: "seed", loading: false, canMediate: false }),
    false,
  );
});
