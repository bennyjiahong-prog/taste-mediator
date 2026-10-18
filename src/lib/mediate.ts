import { extractEntityArray, normalizeEntities, pickSeedMatch } from "@/lib/normalize";
import { isSafePublicMessage, rateLimitMessage } from "@/lib/results-copy";
import { findSeed, type Seed, type Side } from "@/lib/seeds";
import type {
  ApiMovie,
  FailCode,
  MediateFailure,
  MediateResponse,
  QlooStep,
  SeedHit,
  SideResult,
} from "@/lib/types";

export const HACKATHON_ORIGIN = "https://hackathon.api.qloo.com";
export const MOVIE_TYPE = "urn:entity:movie";
export const SEARCH_PATH = "/search" as const;
export const INSIGHTS_PATH = "/v2/insights" as const;

const SEARCH_TAKE = "8";
const INSIGHTS_TAKE = "20";
/** Three retries. 400 + 800 + 1600 = 2800ms, under a 3s cap. Retry-After is not read. */
export const RATE_LIMIT_BACKOFF_MS = [400, 800, 1600] as const;

export type MediateOptions = {
  apiKey: string | null | undefined;
  baseUrl?: string | undefined;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
};

type Fail = {
  code: FailCode;
  message: string;
  status: number;
};

function failure(
  code: FailCode,
  message: string,
  httpStatus: number,
  steps: QlooStep[],
  seeds?: MediateFailure["seeds"],
): { status: number; payload: MediateResponse } {
  const payload: MediateFailure = { ok: false, code, message, steps };
  if (seeds) payload.seeds = seeds;
  return { status: httpStatus, payload };
}

export function assertHackathonBase(raw: string | undefined): string {
  const value = raw?.trim() || HACKATHON_ORIGIN;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("QLOO_BASE_URL is not a valid URL.");
  }
  if (
    url.origin !== HACKATHON_ORIGIN ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new Error("QLOO_BASE_URL must be https://hackathon.api.qloo.com.");
  }
  return HACKATHON_ORIGIN;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function parseSide(raw: unknown, side: Side): Seed[] | string {
  if (!Array.isArray(raw)) return "Each person needs a list of seeds.";
  if (raw.length < 2 || raw.length > 3) {
    return "Pick two or three seeds on each side.";
  }
  const seeds: Seed[] = [];
  for (const item of raw) {
    const record = asRecord(item);
    const title = typeof record?.title === "string" ? record.title : "";
    const year = record?.year;
    if (!title || typeof year !== "number") return "A seed needs a title and a year.";
    const seed = findSeed(title, year);
    if (!seed || seed.side !== side) {
      return "Only the locked movie-night seeds can be mediated.";
    }
    if (seeds.some((existing) => existing.title === seed.title && existing.year === seed.year)) {
      return "A seed was listed twice.";
    }
    seeds.push(seed);
  }
  const presets = new Set(seeds.map((seed) => seed.preset));
  if (presets.size !== 1) return "Stay on one shelf, main or backup.";
  return seeds;
}

function upstreamHint(body: unknown, key: string): string {
  const record = asRecord(body);
  const nested = asRecord(record?.error);
  const raw =
    (typeof record?.message === "string" && record.message) ||
    (typeof nested?.message === "string" && nested.message) ||
    (typeof record?.error === "string" && record.error) ||
    "";
  if (!raw || raw.includes(key)) return "";
  const clean = raw.replace(/\s+/g, " ").trim().slice(0, 160);
  if (!isSafePublicMessage(clean)) return "";
  return ` ${clean}`;
}

async function qlooGet(options: {
  base: string;
  path: typeof SEARCH_PATH | typeof INSIGHTS_PATH;
  params: Record<string, string>;
  key: string;
  label: string;
  steps: QlooStep[];
  fetchImpl: typeof fetch;
  sleepImpl: (ms: number) => Promise<void>;
}): Promise<{ status: number; body: unknown } | Fail> {
  const once = async () => {
    const url = new URL(options.path, options.base);
    for (const [name, value] of Object.entries(options.params)) {
      url.searchParams.set(name, value);
    }
    const started = Date.now();
    try {
      const response = await options.fetchImpl(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-Api-Key": options.key,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
      const ms = Date.now() - started;
      const text = await response.text();
      let body: unknown = null;
      if (text.trim()) {
        try {
          body = JSON.parse(text) as unknown;
        } catch {
          body = { invalidJson: true };
        }
      }
      options.steps.push({
        method: "GET",
        path: options.path,
        label: options.label,
        status: response.status,
        ms,
      });
      console.info(JSON.stringify({ path: options.path, status: response.status, ms }));
      return { status: response.status, body };
    } catch {
      const ms = Date.now() - started;
      options.steps.push({
        method: "GET",
        path: options.path,
        label: options.label,
        status: null,
        ms,
      });
      console.info(JSON.stringify({ path: options.path, status: null, ms }));
      return { status: 0, body: null };
    }
  };

  const first = await once();
  if (first.status === 429) {
    let latest = first;
    for (const delay of RATE_LIMIT_BACKOFF_MS) {
      await options.sleepImpl(delay);
      latest = await once();
      if (latest.status !== 429) break;
    }
    return latest;
  }
  if (first.status === 0 || first.status >= 500) {
    await options.sleepImpl(250);
    return once();
  }
  return first;
}

function fatalFromStatus(status: number, body: unknown, key: string, what: string): Fail | null {
  if (status === 401 || status === 403) {
    return {
      code: "invalid_key",
      status: 401,
      message: `Qloo rejected the API key (${status}). Results were cleared. No stand-in list is shown.`,
    };
  }
  if (status === 429) {
    return {
      code: "rate_limited",
      status: 429,
      message: rateLimitMessage(what),
    };
  }
  if (status === 0) {
    return {
      code: "upstream",
      status: 502,
      message: `Qloo did not respond during ${what}. Results were cleared. Nothing was filled in.`,
    };
  }
  if (status >= 500) {
    return {
      code: "upstream",
      status: 502,
      message: `Qloo failed during ${what} (${status}). Results were cleared. Try again later.`,
    };
  }
  if (status >= 400) {
    return {
      code: "upstream",
      status: 502,
      message: `Qloo rejected ${what} (${status}).${upstreamHint(body, key)} Results were cleared.`,
    };
  }
  return null;
}

function readMovies(body: unknown, key: string, what: string): ApiMovie[] | Fail {
  if (asRecord(body)?.invalidJson === true) {
    return {
      code: "upstream",
      status: 502,
      message: `Qloo returned an unreadable ${what} response. Results were cleared.`,
    };
  }
  const extracted = extractEntityArray(body);
  if (!extracted.ok) {
    return {
      code: "upstream",
      status: 502,
      message: `Qloo returned a ${what} response this app could not read. Results were cleared.`,
    };
  }
  return normalizeEntities(extracted.entities);
}

async function resolveSeed(
  seed: Seed,
  ctx: {
    base: string;
    key: string;
    steps: QlooStep[];
    fetchImpl: typeof fetch;
    sleepImpl: (ms: number) => Promise<void>;
  },
): Promise<SeedHit | Fail> {
  let last: ReturnType<typeof pickSeedMatch> = {
    status: "miss",
    entity: null,
    note: `Search returned no movie for ${seed.title} (${seed.year}).`,
  };

  for (const query of seed.queries) {
    const result = await qlooGet({
      ...ctx,
      path: SEARCH_PATH,
      label: `Resolve “${query}”`,
      params: {
        query,
        types: MOVIE_TYPE,
        take: SEARCH_TAKE,
      },
    });
    if ("code" in result) return result;
    if (result.status === 404) {
      last = {
        status: "miss",
        entity: null,
        note: `Search returned no movie for ${seed.title} (${seed.year}).`,
      };
      continue;
    }
    const fatal = fatalFromStatus(result.status, result.body, ctx.key, `search for ${query}`);
    if (fatal) return fatal;
    const movies = readMovies(result.body, ctx.key, "search");
    if (!Array.isArray(movies)) return movies;
    last = pickSeedMatch(movies, seed.queries, seed.year);
    if (last.status === "matched") break;
  }

  return {
    title: seed.title,
    year: seed.year,
    status: last.status,
    note: last.note,
    entityId: last.entity?.entityId ?? null,
    resolvedName: last.entity?.name ?? null,
    resolvedYear: last.entity?.year ?? null,
  };
}

function withoutSeeds(movies: ApiMovie[], seedIds: Set<string>): ApiMovie[] {
  const seen = new Set<string>();
  const kept: ApiMovie[] = [];
  for (const movie of movies) {
    if (seedIds.has(movie.entityId) || seen.has(movie.entityId)) continue;
    seen.add(movie.entityId);
    kept.push(movie);
  }
  return kept;
}

async function pullInsights(
  sideLabel: string,
  entityIds: string[],
  ctx: {
    base: string;
    key: string;
    steps: QlooStep[];
    fetchImpl: typeof fetch;
    sleepImpl: (ms: number) => Promise<void>;
  },
): Promise<ApiMovie[] | Fail> {
  const result = await qlooGet({
    ...ctx,
    path: INSIGHTS_PATH,
    label: `Insights for ${sideLabel} · ${MOVIE_TYPE}`,
    params: {
      "filter.type": MOVIE_TYPE,
      "signal.interests.entities": entityIds.join(","),
      take: INSIGHTS_TAKE,
    },
  });
  if ("code" in result) return result;
  const fatal = fatalFromStatus(result.status, result.body, ctx.key, `insights for ${sideLabel}`);
  if (fatal) return fatal;
  return readMovies(result.body, ctx.key, "insights");
}

export async function mediate(
  body: unknown,
  options: MediateOptions,
): Promise<{ status: number; payload: MediateResponse }> {
  const key = options.apiKey?.trim() ?? "";
  if (!key) {
    return failure(
      "missing_key",
      "Qloo is not connected. The server has no QLOO_API_KEY, so no recommendation list was built.",
      503,
      [],
    );
  }

  let base: string;
  try {
    base = assertHackathonBase(options.baseUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "QLOO_BASE_URL is not usable.";
    return failure(
      "bad_config",
      `${message} The key was not sent. Results were cleared.`,
      500,
      [],
    );
  }

  const record = asRecord(body);
  if (!record) {
    return failure("bad_request", "Send the two seed lists as JSON.", 400, []);
  }
  const personA = parseSide(record.personA, "A");
  const personB = parseSide(record.personB, "B");
  if (typeof personA === "string") return failure("bad_request", personA, 400, []);
  if (typeof personB === "string") return failure("bad_request", personB, 400, []);
  if (personA[0]?.preset !== personB[0]?.preset) {
    return failure("bad_request", "Both people need to use the same shelf.", 400, []);
  }

  const steps: QlooStep[] = [];
  const ctx = {
    base,
    key,
    steps,
    fetchImpl: options.fetchImpl ?? fetch,
    sleepImpl:
      options.sleepImpl ??
      ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))),
  };

  const hitsA: SeedHit[] = [];
  for (const seed of personA) {
    const hit = await resolveSeed(seed, ctx);
    if ("code" in hit) return failure(hit.code, hit.message, hit.status, steps);
    hitsA.push(hit);
  }
  const hitsB: SeedHit[] = [];
  for (const seed of personB) {
    const hit = await resolveSeed(seed, ctx);
    if ("code" in hit) return failure(hit.code, hit.message, hit.status, steps);
    hitsB.push(hit);
  }

  const idsA = hitsA.flatMap((hit) => (hit.entityId ? [hit.entityId] : []));
  const idsB = hitsB.flatMap((hit) => (hit.entityId ? [hit.entityId] : []));
  const seeds = { personA: hitsA, personB: hitsB };
  if (idsA.length === 0 || idsB.length === 0) {
    return failure(
      "seed_unresolved",
      "One side has no resolved movie, so insights was not called. No recommendation list is shown.",
      422,
      steps,
      seeds,
    );
  }

  const insightsA = await pullInsights("Person A", idsA, ctx);
  if (!Array.isArray(insightsA)) {
    return failure(insightsA.code, insightsA.message, insightsA.status, steps);
  }
  const insightsB = await pullInsights("Person B", idsB, ctx);
  if (!Array.isArray(insightsB)) {
    return failure(insightsB.code, insightsB.message, insightsB.status, steps);
  }

  const seedIds = new Set([...idsA, ...idsB]);
  const payload: MediateResponse = {
    ok: true,
    steps,
    personA: sideResult(hitsA, withoutSeeds(insightsA, seedIds)),
    personB: sideResult(hitsB, withoutSeeds(insightsB, seedIds)),
  };
  return { status: 200, payload };
}

function sideResult(seeds: SeedHit[], insights: ApiMovie[]): SideResult {
  return { seeds, insights };
}
