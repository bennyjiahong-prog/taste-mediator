import { APICallError, isStepCount, ToolLoopAgent, tool, type LanguageModel } from "ai";
import { z } from "zod";
import {
  failureResult,
  mediate,
  prepareMediation,
  pullInsights,
  pullTagInsights,
  resolvedIds,
  resolveSide,
  SEED_UNRESOLVED,
  sideResult,
  withoutSeeds,
  type Fail,
  type MediateOptions,
  type Prepared,
} from "@/lib/mediate";
import { LLM_KEY_ENV } from "@/lib/llm";
import { partitionZones, sharedTags } from "@/lib/zones";
import type {
  AgentReport,
  AgentToolCall,
  ApiMovie,
  MediateResponse,
  SeedHit,
  TasteTag,
} from "@/lib/types";

export const MAX_AGENT_STEPS = 8;
const AGENT_TIMEOUT_MS = 45_000;
const SAMPLE = 8;

export type AgentOptions = MediateOptions & {
  model: LanguageModel | null;
  modelId: string | null;
  /** Server secrets that must never appear in a notice. */
  secrets?: string[];
};

type Person = "A" | "B";
type Result = { status: number; payload: MediateResponse };

export const INSTRUCTIONS = `You are Taste Mediator, an agent that helps two people pick a movie for tonight.
Person A chose horror seeds. Person B chose romance seeds. You cannot change the seeds.

Plan, then use the tools:
1. resolve_seeds for Person A and for Person B (Qloo search).
2. get_movie_insights for each person (one Qloo insights pull per person).
3. get_taste_tags for each person if you want to explain the taste themes (Qloo tag insights).
4. compare_tastes once both insight lists exist. It is deterministic code: it reports the exact Qloo entity IDs both pulls returned.

Rules:
- A movie is "shared" only if compare_tastes lists it under overlap. Never call any other movie shared, safe, or a compromise for both.
- If overlap is empty, say so plainly and recommend taking turns. You may point to one A-only and one B-only title, labelled as one person's pick.
- Only name movies and tags that a tool returned. Do not invent titles, numbers, or reasons Qloo did not give.
- If a tool returns an error, stop calling tools and explain what failed.
- Final answer: plain text, at most 120 words, no headings. Start with the recommendation, then the reasoning.`;

type State = {
  prepared: Prepared;
  hits: Partial<Record<Person, SeedHit[]>>;
  insights: Partial<Record<Person, ApiMovie[]>>;
  tags: Partial<Record<Person, TasteTag[]>>;
  fatal: { fail: Fail; seeds?: { personA: SeedHit[]; personB: SeedHit[] } } | null;
  compared: boolean;
  toolCalls: AgentToolCall[];
  pending: {
    hits: Partial<Record<Person, Promise<SeedHit[] | Fail>>>;
    insights: Partial<Record<Person, Promise<ApiMovie[] | Fail>>>;
  };
};

function label(person: Person) {
  return person === "A" ? "Person A" : "Person B";
}

function seedIds(state: State): Set<string> {
  return new Set([...resolvedIds(state.hits.A ?? []), ...resolvedIds(state.hits.B ?? [])]);
}

function brief(movie: ApiMovie) {
  return { name: movie.name, year: movie.year, tags: movie.tags.slice(0, 3) };
}

function once<T>(
  cache: Partial<Record<Person, Promise<T>>>,
  person: Person,
  run: () => Promise<T>,
): Promise<T> {
  cache[person] ??= run();
  return cache[person];
}

function ensureResolved(state: State, person: Person): Promise<SeedHit[] | Fail> {
  return once(state.pending.hits, person, () => resolvePerson(state, person));
}

function ensureInsights(state: State, person: Person): Promise<ApiMovie[] | Fail> {
  return once(state.pending.insights, person, () => pullPerson(state, person));
}

async function resolvePerson(state: State, person: Person): Promise<SeedHit[] | Fail> {
  const seeds = person === "A" ? state.prepared.personA : state.prepared.personB;
  const hits = await resolveSide(seeds, state.prepared.ctx);
  if (!Array.isArray(hits)) {
    state.fatal = { fail: hits };
    return hits;
  }
  state.hits[person] = hits;
  return hits;
}

async function pullPerson(state: State, person: Person): Promise<ApiMovie[] | Fail> {
  for (const side of ["A", "B"] as const) {
    const hits = await ensureResolved(state, side);
    if (!Array.isArray(hits)) return hits;
  }
  const hitsA = state.hits.A ?? [];
  const hitsB = state.hits.B ?? [];
  if (resolvedIds(hitsA).length === 0 || resolvedIds(hitsB).length === 0) {
    state.fatal = { fail: SEED_UNRESOLVED, seeds: { personA: hitsA, personB: hitsB } };
    return SEED_UNRESOLVED;
  }
  const ids = resolvedIds(person === "A" ? hitsA : hitsB);
  const pulled = await pullInsights(label(person), ids, state.prepared.ctx);
  if (!Array.isArray(pulled)) {
    state.fatal = { fail: pulled };
    return pulled;
  }
  const kept = withoutSeeds(pulled, seedIds(state));
  state.insights[person] = kept;
  return kept;
}

function record(state: State, call: AgentToolCall) {
  state.toolCalls.push(call);
}

function buildTools(state: State) {
  const person = z.object({ person: z.enum(["A", "B"]) });
  return {
    resolve_seeds: tool({
      description:
        "Resolve one person's locked seed movies to Qloo entities with Qloo search. Returns which seeds matched.",
      inputSchema: person,
      execute: async ({ person: who }) => {
        const hits = await ensureResolved(state, who);
        if (!Array.isArray(hits)) {
          record(state, { tool: "resolve_seeds", input: who, ok: false, summary: hits.message });
          return { error: hits.message };
        }
        const matched = hits.filter((hit) => hit.entityId).length;
        record(state, {
          tool: "resolve_seeds",
          input: who,
          ok: true,
          summary: `${matched} of ${hits.length} seeds matched a Qloo entity.`,
        });
        return {
          seeds: hits.map((hit) => ({
            title: hit.title,
            year: hit.year,
            status: hit.status,
            note: hit.note,
          })),
        };
      },
    }),
    get_movie_insights: tool({
      description:
        "One Qloo insights pull (urn:entity:movie) using only this person's resolved seeds. Seeds from both people are removed from the list.",
      inputSchema: person,
      execute: async ({ person: who }) => {
        const movies = await ensureInsights(state, who);
        if (!Array.isArray(movies)) {
          record(state, { tool: "get_movie_insights", input: who, ok: false, summary: movies.message });
          return { error: movies.message };
        }
        record(state, {
          tool: "get_movie_insights",
          input: who,
          ok: true,
          summary: `Qloo returned ${movies.length} movies after removing seeds.`,
        });
        return { count: movies.length, top: movies.slice(0, 12).map(brief) };
      },
    }),
    get_taste_tags: tool({
      description:
        "Qloo tag insights (urn:tag) for this person's resolved seeds: the taste themes Qloo associates with them.",
      inputSchema: person,
      execute: async ({ person: who }) => {
        const hits = await ensureResolved(state, who);
        if (!Array.isArray(hits)) {
          record(state, { tool: "get_taste_tags", input: who, ok: false, summary: hits.message });
          return { error: hits.message };
        }
        const ids = resolvedIds(hits);
        if (ids.length === 0) {
          const message = "This person has no resolved seed, so tag insights was not called.";
          record(state, { tool: "get_taste_tags", input: who, ok: false, summary: message });
          return { error: message };
        }
        const tags = await pullTagInsights(label(who), ids, state.prepared.ctx);
        if (!Array.isArray(tags)) {
          if (tags.code === "invalid_key" || tags.code === "rate_limited") state.fatal = { fail: tags };
          record(state, { tool: "get_taste_tags", input: who, ok: false, summary: tags.message });
          return { error: tags.message };
        }
        state.tags[who] = tags;
        record(state, {
          tool: "get_taste_tags",
          input: who,
          ok: true,
          summary: `Qloo returned ${tags.length} tags.`,
        });
        return { tags: tags.map((tag) => tag.name) };
      },
    }),
    compare_tastes: tool({
      description:
        "Deterministic comparison of the two insight lists by exact Qloo entity ID, plus tags both people share. Call after both get_movie_insights calls.",
      inputSchema: z.object({}),
      execute: async () => {
        const a = state.insights.A;
        const b = state.insights.B;
        if (!a || !b) {
          const message = "Call get_movie_insights for both people first.";
          record(state, { tool: "compare_tastes", input: "", ok: false, summary: message });
          return { error: message };
        }
        const zones = partitionZones(a, b);
        const shared = sharedTags(state.tags.A ?? [], state.tags.B ?? []);
        state.compared = true;
        record(state, {
          tool: "compare_tastes",
          input: "",
          ok: true,
          summary: `${zones.overlap.length} shared, ${zones.aOnly.length} A only, ${zones.bOnly.length} B only.`,
        });
        return {
          overlap: zones.overlap.map(brief),
          aOnlyCount: zones.aOnly.length,
          aOnlySample: zones.aOnly.slice(0, SAMPLE).map(brief),
          bOnlyCount: zones.bOnly.length,
          bOnlySample: zones.bOnly.slice(0, SAMPLE).map(brief),
          sharedTags: state.tags.A && state.tags.B ? shared.map((tag) => tag.name) : null,
        };
      },
    }),
  };
}

function scrub(text: string, secrets: string[]): string {
  let clean = text;
  for (const secret of secrets) {
    if (secret) clean = clean.split(secret).join("[redacted]");
  }
  return clean.replace(/sk-[A-Za-z0-9_*.-]{6,}/g, "[redacted]");
}

function failureNotice(error: unknown): string {
  if (APICallError.isInstance(error) && error.statusCode) {
    return `The AI agent's model call failed (${error.statusCode}), so the fixed pipeline finished the mediation.`;
  }
  return "The AI agent did not finish, so the fixed pipeline finished the mediation.";
}

function tagReport(state: State): AgentReport["tags"] {
  if (!state.tags.A && !state.tags.B) return null;
  const a = state.tags.A ?? [];
  const b = state.tags.B ?? [];
  return { personA: a, personB: b, shared: state.tags.A && state.tags.B ? sharedTags(a, b) : [] };
}

export function fallbackReport(notice: string): AgentReport {
  return { mode: "fallback", model: null, notice, explanation: null, toolCalls: [], tags: null };
}

export const NO_LLM_NOTICE = `No ${LLM_KEY_ENV} is set on the server, so the AI agent did not run. This result comes from the fixed search-then-insights pipeline.`;

export async function mediateWithAgent(body: unknown, options: AgentOptions): Promise<Result> {
  if (!options.model) {
    const result = await mediate(body, options);
    result.payload.agent = fallbackReport(NO_LLM_NOTICE);
    return result;
  }

  const prepared = prepareMediation(body, options);
  if (!("ctx" in prepared)) return prepared;

  const state: State = {
    prepared,
    hits: {},
    insights: {},
    tags: {},
    fatal: null,
    compared: false,
    toolCalls: [],
    pending: { hits: {}, insights: {} },
  };
  const secrets = [prepared.ctx.key, ...(options.secrets ?? [])];
  const agent = new ToolLoopAgent({
    model: options.model,
    instructions: INSTRUCTIONS,
    tools: buildTools(state),
    stopWhen: [isStepCount(MAX_AGENT_STEPS), () => state.fatal !== null],
    maxRetries: 1,
  });

  let explanation: string | null = null;
  let notice: string | null = null;
  let mode: AgentReport["mode"] = "agent";
  try {
    const result = await agent.generate({
      prompt: `Mediate tonight's movie. Person A seeds: ${prepared.personA
        .map((seed) => `${seed.title} (${seed.year})`)
        .join(", ")}. Person B seeds: ${prepared.personB
        .map((seed) => `${seed.title} (${seed.year})`)
        .join(", ")}.`,
      abortSignal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
    });
    explanation = result.text.trim() || null;
  } catch (error) {
    mode = "fallback";
    notice = failureNotice(error);
  }

  const report = (): AgentReport => ({
    mode,
    model: options.modelId,
    notice: notice ? scrub(notice, secrets) : null,
    explanation: explanation ? scrub(explanation, secrets).slice(0, 1200) : null,
    toolCalls: state.toolCalls,
    tags: tagReport(state),
  });

  const failedRun = (fatal: NonNullable<State["fatal"]>): Result => {
    explanation = null;
    const failed = failureResult(fatal.fail, prepared.ctx.steps, fatal.seeds);
    failed.payload.agent = report();
    return failed;
  };

  if (state.fatal) return failedRun(state.fatal);

  if (!state.compared) {
    if (mode === "agent") {
      notice = "The agent stopped before comparing both insight lists, so the server finished the fixed steps. Its text is not shown.";
    }
    explanation = null;
    for (const person of ["A", "B"] as const) {
      const pulled = await ensureInsights(state, person);
      if (!Array.isArray(pulled)) return failedRun(state.fatal ?? { fail: pulled });
    }
  }

  return {
    status: 200,
    payload: {
      ok: true,
      steps: prepared.ctx.steps,
      personA: sideResult(state.hits.A ?? [], state.insights.A ?? []),
      personB: sideResult(state.hits.B ?? [], state.insights.B ?? []),
      agent: report(),
    },
  };
}
