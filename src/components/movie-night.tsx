"use client";

import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { seedKey, seedsFor, type Preset, type Seed, type Side } from "@/lib/seeds";
import type {
  AgentReport,
  AgentToolCall,
  ApiMovie,
  MediateFailure,
  MediateSuccess,
  QlooStep,
  SeedHit,
  TasteTag,
} from "@/lib/types";
import { partitionZones, topTags } from "@/lib/zones";

const SHOW_LIMIT = 8;

type View =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; failure: MediateFailure }
  | { kind: "ready"; data: MediateSuccess };

export function MovieNight({ children }: { children?: ReactNode }) {
  const [preset, setPreset] = useState<Preset>("main");
  const [selected, setSelected] = useState<string[]>(() =>
    seedsFor("main", "A")
      .concat(seedsFor("main", "B"))
      .map(seedKey),
  );
  const [view, setView] = useState<View>({ kind: "idle" });

  const selectedA = seedsFor(preset, "A").filter((seed) => selected.includes(seedKey(seed)));
  const selectedB = seedsFor(preset, "B").filter((seed) => selected.includes(seedKey(seed)));
  const canMediate = selectedA.length >= 2 && selectedB.length >= 2;
  const loading = view.kind === "loading";

  function choosePreset(next: Preset) {
    if (loading) return;
    setPreset(next);
    setSelected(seedsFor(next, "A").concat(seedsFor(next, "B")).map(seedKey));
    setView({ kind: "idle" });
  }

  function toggle(seed: Seed) {
    if (loading) return;
    const key = seedKey(seed);
    setSelected((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
    setView({ kind: "idle" });
  }

  async function mediate() {
    if (!canMediate || loading) return;
    setView({ kind: "loading" });
    try {
      const response = await fetch("/api/mediate", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          personA: selectedA.map(({ title, year }) => ({ title, year })),
          personB: selectedB.map(({ title, year }) => ({ title, year })),
        }),
      });
      const payload: unknown = await response.json();
      const ready = asSuccess(payload);
      if (ready) {
        setView({ kind: "ready", data: ready });
        return;
      }
      const failure = asFailure(payload);
      setView({
        kind: "error",
        failure: failure ?? {
          ok: false,
          code: "upstream",
          message: "The proxy returned a response this page could not read. Results were cleared.",
          steps: [],
        },
      });
    } catch {
      setView({
        kind: "error",
        failure: {
          ok: false,
          code: "upstream",
          message: "The request to this app's proxy failed. Results were cleared.",
          steps: [],
        },
      });
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <header className="max-w-3xl">
        <p className="flex items-center gap-2 text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
          <span className="inline-flex gap-1" aria-hidden="true">
            <span className="size-2.5 rounded-full bg-horror" />
            <span className="size-2.5 rounded-full bg-romance" />
          </span>
          Friday movie night
        </p>
        <h1 className="mt-3 font-heading text-5xl leading-[0.95] tracking-tight text-foreground sm:text-6xl">
          Taste Mediator
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          One shelf is horror. The other is romance. An AI agent calls Qloo tools to resolve the
          titles you picked, pull insights for each person separately, and explain the conflict and
          the overlap. The overlap itself is computed by code.
        </p>
      </header>

      <div className="mt-6">{children}</div>

      <section className="mt-8 grid gap-4 lg:grid-cols-2" aria-label="Seed shelves">
        <SeedColumn
          side="A"
          preset={preset}
          selected={selected}
          disabled={loading}
          onToggle={toggle}
        />
        <SeedColumn
          side="B"
          preset={preset}
          selected={selected}
          disabled={loading}
          onToggle={toggle}
        />
      </section>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Seed shelf">
          <Button
            type="button"
            variant={preset === "main" ? "default" : "outline"}
            data-testid="preset-main"
            disabled={loading}
            onClick={() => choosePreset("main")}
          >
            Main seeds
          </Button>
          <Button
            type="button"
            variant={preset === "backup" ? "default" : "outline"}
            data-testid="preset-backup"
            disabled={loading}
            onClick={() => choosePreset("backup")}
          >
            Backup seeds
          </Button>
        </div>
        <Button
          type="button"
          size="lg"
          className="h-11 px-5 text-base sm:min-w-40"
          data-testid="mediate-button"
          disabled={!canMediate || loading}
          onClick={() => void mediate()}
        >
          {loading ? "Mediating…" : "Mediate"}
        </Button>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        {canMediate
          ? "Two Qloo insight pulls, one per person. At least two seeds stay selected on each side."
          : "Choose at least two seeds on each side."}
      </p>

      <div className="mt-10" aria-live="polite" data-testid="results">
        {view.kind === "idle" ? <IdleResults /> : null}
        {view.kind === "loading" ? <LoadingResults /> : null}
        {view.kind === "error" ? <ErrorResults failure={view.failure} /> : null}
        {view.kind === "ready" ? <ReadyResults data={view.data} /> : null}
      </div>
    </div>
  );
}

function SeedColumn({
  side,
  preset,
  selected,
  disabled,
  onToggle,
}: {
  side: Side;
  preset: Preset;
  selected: string[];
  disabled: boolean;
  onToggle: (seed: Seed) => void;
}) {
  const horror = side === "A";
  const seeds = seedsFor(preset, side);
  return (
    <Card className={horror ? "border-t-4 border-t-horror bg-horror-soft/50" : "border-t-4 border-t-romance bg-romance-soft/60"}>
      <CardHeader>
        <p className={horror ? "text-xs font-medium tracking-[0.16em] text-horror uppercase" : "text-xs font-medium tracking-[0.16em] text-romance uppercase"}>
          {horror ? "Person A · Horror" : "Person B · Romance"}
        </p>
        <h2 className="font-heading text-3xl tracking-tight">
          {horror ? "The dark shelf" : "The warm shelf"}
        </h2>
        <CardDescription className="text-sm leading-relaxed">
          {preset === "main"
            ? horror
              ? "Locked seeds. They travel together as Person A's interests, on their own call."
              : "Locked seeds. Person B gets a second insights call. The two lists stay separate."
            : horror
              ? "Backup horror shelf, if the main titles do not resolve."
              : "Backup romance shelf. Still the opposite of horror."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {seeds.map((seed) => {
          const on = selected.includes(seedKey(seed));
          return (
            <button
              key={seedKey(seed)}
              type="button"
              aria-pressed={on}
              disabled={disabled}
              data-testid={`seed-${side}-${slug(seed.title)}`}
              onClick={() => onToggle(seed)}
              className={
                on
                  ? horror
                    ? "flex min-h-14 w-full items-center justify-between gap-3 rounded-lg bg-horror px-3 py-3 text-left text-white focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
                    : "flex min-h-14 w-full items-center justify-between gap-3 rounded-lg bg-romance px-3 py-3 text-left text-white focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
                  : "flex min-h-14 w-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-3 text-left focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
              }
            >
              <span>
                <span className="block font-heading text-lg leading-tight">{seed.title}</span>
                <span className={on ? "text-sm text-white/80" : "text-sm text-muted-foreground"}>
                  {seed.year}
                </span>
              </span>
              <span className="text-xs tracking-wide uppercase">{on ? "In" : "Out"}</span>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}

function IdleResults() {
  return (
    <section className="rounded-2xl border border-dashed border-border bg-card/70 px-5 py-8">
      <h2 className="font-heading text-2xl">No mediation yet</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Press Mediate. The agent plans the Qloo calls: search, two insight pulls, optional tag
        insights, then a deterministic comparison. This page does not keep a sample list.
      </p>
    </section>
  );
}

function LoadingResults() {
  return (
    <section className="rounded-2xl border border-border bg-card px-5 py-8">
      <h2 className="font-heading text-2xl">Asking Qloo</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        The agent is calling Qloo tools: resolving each selected title, then requesting movie
        insights for Person A and again for Person B. Titles appear only after those calls return.
      </p>
    </section>
  );
}

function ErrorResults({ failure }: { failure: MediateFailure }) {
  return (
    <section className="rounded-2xl border border-destructive/30 bg-card px-5 py-8">
      <h2 className="font-heading text-2xl">Results cleared</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed" data-testid="results-message">
        {visibleFailureMessage(failure)}
      </p>
      {failure.agent ? (
        <div className="mt-6">
          <AgentPanel agent={failure.agent} />
        </div>
      ) : null}
      {failure.seeds ? (
        <div className="mt-6">
          <SeedReport personA={failure.seeds.personA} personB={failure.seeds.personB} />
        </div>
      ) : null}
      {failure.steps.length > 0 ? (
        <div className="mt-6">
          <Trace steps={failure.steps} />
        </div>
      ) : null}
    </section>
  );
}

function ReadyResults({ data }: { data: MediateSuccess }) {
  const zones = partitionZones(data.personA.insights, data.personB.insights);
  const aTags = topTags(zones.aOnly);
  const bTags = topTags(zones.bOnly);
  const bothEmpty = data.personA.insights.length === 0 && data.personB.insights.length === 0;

  return (
    <div className="flex flex-col gap-8">
      {data.agent ? <AgentPanel agent={data.agent} /> : null}
      <blockquote className="max-w-3xl font-heading text-2xl leading-snug sm:text-3xl">
        {zones.overlap.length > 0
          ? "The safe zone is the overlap. A title is here because both pulls returned it."
          : bothEmpty
            ? "Neither pull returned a title, so the overlap is empty too."
            : "No title landed in both pulls. The compromise tonight is to take turns."}
      </blockquote>
      <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Each side is its own Qloo insights call. A shared title is membership in both lists. The
        two pulls are never averaged into one score.
      </p>

      <section data-testid="conflict-zone" aria-labelledby="conflict-heading">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="conflict-heading" className="font-heading text-3xl tracking-tight">
            Conflict zone
          </h2>
          <p className="text-sm text-muted-foreground">Titles only one pull returned</p>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <ZoneColumn
            title="A only"
            detail="Person A's pull, absent from Person B"
            tone="horror"
            movies={zones.aOnly}
            pullCount={data.personA.insights.length}
            tags={aTags}
          />
          <ZoneColumn
            title="B only"
            detail="Person B's pull, absent from Person A"
            tone="romance"
            movies={zones.bOnly}
            pullCount={data.personB.insights.length}
            tags={bTags}
          />
        </div>
      </section>

      <section
        className="rounded-2xl bg-safe-soft px-4 py-5 sm:px-5"
        data-testid="safe-zone"
        aria-labelledby="safe-heading"
      >
        <h2 id="safe-heading" className="font-heading text-3xl tracking-tight text-safe">
          Safe zone
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {zones.overlap.length > 0
            ? "Listed in the order Person A's pull returned them."
            : "Zero overlap. No title was added to fill this space."}
        </p>
        {zones.overlap.length > 0 ? (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {zones.overlap.slice(0, 12).map((movie) => (
              <li key={movie.entityId}>
                <MovieCard movie={movie} mark="Both pulls" />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 max-w-2xl text-sm leading-relaxed">
            {bothEmpty
              ? "Qloo returned no movie entities for either person."
              : "Watch one person's pick this week and the other's next week. A hybrid only belongs here after a later call actually returns it for both."}
          </p>
        )}
      </section>

      <Separator />
      <SeedReport personA={data.personA.seeds} personB={data.personB.seeds} />
      <Trace steps={data.steps} />
    </div>
  );
}

function ZoneColumn({
  title,
  detail,
  tone,
  movies,
  pullCount,
  tags,
}: {
  title: string;
  detail: string;
  tone: "horror" | "romance";
  movies: ApiMovie[];
  pullCount: number;
  tags: string[];
}) {
  const shown = movies.slice(0, SHOW_LIMIT);
  const empty =
    pullCount === 0
      ? "This pull returned no titles."
      : "Every title from this pull also came back for the other person.";
  return (
    <div className={tone === "horror" ? "rounded-2xl bg-horror-soft/70 p-4" : "rounded-2xl bg-romance-soft/80 p-4"}>
      <h3 className="font-heading text-2xl">{title}</h3>
      <p className="text-sm text-muted-foreground">{detail}</p>
      {tags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1">
          {tags.map((tag) => (
            <Badge key={tag} variant="outline">
              {tag}
            </Badge>
          ))}
        </div>
      ) : null}
      {shown.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-3">
          {shown.map((movie) => (
            <li key={movie.entityId}>
              <MovieCard movie={movie} mark={title} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm">{empty}</p>
      )}
      {movies.length > SHOW_LIMIT ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Showing {SHOW_LIMIT} of {movies.length} from this pull.
        </p>
      ) : null}
    </div>
  );
}

function MovieCard({ movie, mark }: { movie: ApiMovie; mark: string }) {
  return (
    <Card size="sm" className="bg-card">
      {movie.imageUrl ? <Poster src={movie.imageUrl} /> : null}
      <CardHeader>
        <Badge variant="secondary">{mark}</Badge>
        <h3 className="font-heading text-lg leading-tight">{movie.name}</h3>
        <CardDescription>{movie.year ?? "Year not returned"}</CardDescription>
      </CardHeader>
      {movie.description || movie.tags.length > 0 ? (
        <CardContent className="flex flex-col gap-2">
          {movie.description ? (
            <p className="line-clamp-2 text-sm text-muted-foreground">{movie.description}</p>
          ) : null}
          {movie.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {movie.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}

function Poster({ src }: { src: string }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    // Qloo image hosts are not known at build time.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className="aspect-video w-full object-cover"
      onError={() => setHidden(true)}
    />
  );
}

function SeedReport({ personA, personB }: { personA: SeedHit[]; personB: SeedHit[] }) {
  return (
    <section aria-labelledby="seeds-heading">
      <h2 id="seeds-heading" className="font-heading text-2xl">
        Seeds Qloo resolved
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        These are the titles you picked. A miss is left blank.
      </p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <SeedList label="Person A" hits={personA} />
        <SeedList label="Person B" hits={personB} />
      </div>
    </section>
  );
}

function SeedList({ label, hits }: { label: string; hits: SeedHit[] }) {
  return (
    <div>
      <h3 className="text-sm font-medium">{label}</h3>
      <ul className="mt-2 flex flex-col gap-2">
        {hits.map((hit) => (
          <li key={`${hit.title}-${hit.year}`} className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
            <span className="font-medium">
              {hit.title} ({hit.year})
            </span>
            <span className="mt-1 block text-muted-foreground">{hit.note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AgentPanel({ agent }: { agent: AgentReport }) {
  return (
    <section
      className="rounded-2xl border border-border bg-card px-4 py-5 sm:px-5"
      data-testid="agent-panel"
      aria-labelledby="agent-heading"
    >
      <h2 id="agent-heading" className="font-heading text-2xl">
        {agent.mode === "agent" ? "The agent's mediation" : "Agent fallback"}
      </h2>
      {agent.notice ? (
        <p className="mt-2 max-w-3xl text-sm leading-relaxed" data-testid="agent-notice" role="status">
          {agent.notice}
        </p>
      ) : null}
      {agent.explanation ? (
        <>
          <p className="mt-3 max-w-3xl text-base leading-relaxed whitespace-pre-line" data-testid="agent-explanation">
            {agent.explanation}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Written by {agent.model ?? "the model"} after calling the Qloo tools below. The zones
            are computed by code from Qloo entity IDs, not by the model.
          </p>
        </>
      ) : null}
      {agent.tags && agent.tags.shared.length > 0 ? (
        <div className="mt-3">
          <p className="text-sm font-medium">Taste tags Qloo returned for both people</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {agent.tags.shared.slice(0, 8).map((tag) => (
              <Badge key={tag.id} variant="outline">
                {tag.name}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
      {agent.toolCalls.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-sm font-medium">Tools the agent chose, in order</h3>
          <ol className="mt-1 space-y-1 font-mono text-xs leading-relaxed text-muted-foreground" data-testid="agent-tools">
            {agent.toolCalls.map((call, index) => (
              <li key={`${call.tool}-${index}`}>
                {index + 1}. {call.tool}
                {call.input ? `(${call.input})` : "()"} · {call.ok ? "ok" : "failed"} · {call.summary}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}

function Trace({ steps }: { steps: QlooStep[] }) {
  return (
    <section aria-labelledby="trace-heading">
      <h2 id="trace-heading" className="font-heading text-2xl">
        What Qloo was asked
      </h2>
      <ol className="mt-3 space-y-1 font-mono text-xs leading-relaxed text-muted-foreground">
        {steps.map((step, index) => (
          <li key={`${step.path}-${step.label}-${index}`}>
            {index + 1}. {step.method} {step.path} · {step.label} ·{" "}
            {step.status ?? "no response"} · {step.ms}ms
          </li>
        ))}
      </ol>
    </section>
  );
}

function visibleFailureMessage(failure: MediateFailure): string {
  if (failure.code === "rate_limited") {
    return "Qloo rate-limited — try again shortly. Results were cleared.";
  }
  return failure.message;
}

function slug(title: string): string {
  return title
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function isMovie(value: unknown): value is ApiMovie {
  if (!value || typeof value !== "object") return false;
  const movie = value as Partial<ApiMovie>;
  return (
    typeof movie.entityId === "string" &&
    movie.entityId.length > 0 &&
    typeof movie.name === "string" &&
    movie.name.trim().length > 0
  );
}

function cleanMovie(movie: ApiMovie): ApiMovie {
  return {
    entityId: movie.entityId,
    name: movie.name,
    year: typeof movie.year === "number" ? movie.year : null,
    description: typeof movie.description === "string" ? movie.description : null,
    imageUrl: typeof movie.imageUrl === "string" ? movie.imageUrl : null,
    tags: Array.isArray(movie.tags) ? movie.tags.filter((tag) => typeof tag === "string") : [],
  };
}

function asSeeds(value: unknown): SeedHit[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const hit = item as Partial<SeedHit>;
    if (typeof hit.title !== "string" || typeof hit.year !== "number" || typeof hit.note !== "string") {
      return [];
    }
    if (hit.status !== "matched" && hit.status !== "miss" && hit.status !== "ambiguous") return [];
    return [
      {
        title: hit.title,
        year: hit.year,
        status: hit.status,
        note: hit.note,
        entityId: typeof hit.entityId === "string" ? hit.entityId : null,
        resolvedName: typeof hit.resolvedName === "string" ? hit.resolvedName : null,
        resolvedYear: typeof hit.resolvedYear === "number" ? hit.resolvedYear : null,
      },
    ];
  });
}

function asSteps(value: unknown): QlooStep[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const step = item as Partial<QlooStep>;
    if (step.method !== "GET") return [];
    if (step.path !== "/search" && step.path !== "/v2/insights") return [];
    if (typeof step.label !== "string") return [];
    return [
      {
        method: "GET",
        path: step.path,
        label: step.label,
        status: typeof step.status === "number" ? step.status : null,
        ms: typeof step.ms === "number" ? step.ms : 0,
      },
    ];
  });
}

function asTags(value: unknown): TasteTag[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const tag = item as Partial<TasteTag> | null;
    return tag && typeof tag.id === "string" && typeof tag.name === "string"
      ? [{ id: tag.id, name: tag.name }]
      : [];
  });
}

function asAgent(value: unknown): AgentReport | undefined {
  if (!value || typeof value !== "object") return undefined;
  const agent = value as Partial<AgentReport>;
  if (agent.mode !== "agent" && agent.mode !== "fallback") return undefined;
  const toolCalls = Array.isArray(agent.toolCalls)
    ? agent.toolCalls.flatMap((item): AgentToolCall[] => {
        const call = item as Partial<AgentToolCall> | null;
        if (!call || typeof call.tool !== "string" || typeof call.summary !== "string") return [];
        return [
          {
            tool: call.tool,
            input: typeof call.input === "string" ? call.input : "",
            ok: call.ok === true,
            summary: call.summary,
          },
        ];
      })
    : [];
  const tags = agent.tags && typeof agent.tags === "object" ? agent.tags : null;
  return {
    mode: agent.mode,
    model: typeof agent.model === "string" ? agent.model : null,
    notice: typeof agent.notice === "string" ? agent.notice : null,
    explanation: typeof agent.explanation === "string" ? agent.explanation : null,
    toolCalls,
    tags: tags
      ? {
          personA: asTags(tags.personA),
          personB: asTags(tags.personB),
          shared: asTags(tags.shared),
        }
      : null,
  };
}

function asSuccess(value: unknown): MediateSuccess | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Partial<MediateSuccess>;
  if (payload.ok !== true) return null;
  if (!payload.personA || !payload.personB) return null;
  if (!Array.isArray(payload.personA.insights) || !Array.isArray(payload.personB.insights)) {
    return null;
  }
  const agent = asAgent(payload.agent);
  return {
    ok: true,
    steps: asSteps(payload.steps),
    ...(agent ? { agent } : {}),
    personA: {
      seeds: asSeeds(payload.personA.seeds),
      insights: payload.personA.insights.filter(isMovie).map(cleanMovie),
    },
    personB: {
      seeds: asSeeds(payload.personB.seeds),
      insights: payload.personB.insights.filter(isMovie).map(cleanMovie),
    },
  };
}

function asFailure(value: unknown): MediateFailure | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Partial<MediateFailure>;
  if (payload.ok !== false || typeof payload.message !== "string" || typeof payload.code !== "string") {
    return null;
  }
  const seeds =
    payload.seeds && Array.isArray(payload.seeds.personA) && Array.isArray(payload.seeds.personB)
      ? { personA: asSeeds(payload.seeds.personA), personB: asSeeds(payload.seeds.personB) }
      : undefined;
  const agent = asAgent(payload.agent);
  return {
    ok: false,
    code: payload.code,
    message: payload.message,
    steps: asSteps(payload.steps),
    ...(seeds ? { seeds } : {}),
    ...(agent ? { agent } : {}),
  };
}
