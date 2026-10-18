"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  emptySetCopy,
  publicFailureMessage,
  publicFailureTitle,
  type EmptySetCopy,
} from "@/lib/results-copy";
import { seedKey, seedsFor, type Preset, type Seed, type Side } from "@/lib/seeds";
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
  PRIMARY_FOCUS_CLASS,
  primaryActionAriaDisabled,
  retryActionLabel,
  settleFocusId,
  type PanelCopy,
  type PhaseRow,
} from "@/lib/status-copy";
import type { ApiMovie, FailCode, MediateFailure, MediateSuccess, QlooStep, SeedHit } from "@/lib/types";
import { partitionZones, topTags } from "@/lib/zones";

const FAIL_CODES: readonly FailCode[] = [
  "missing_key",
  "invalid_key",
  "bad_request",
  "bad_config",
  "seed_unresolved",
  "upstream",
  "rate_limited",
];

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
  const mediatePaused = primaryActionAriaDisabled({ action: "mediate", loading, canMediate });
  const shelfPaused = primaryActionAriaDisabled({ action: "preset", loading, canMediate });

  useEffect(() => {
    if (view.kind === "idle") return;
    document.getElementById(settleFocusId(view.kind))?.focus();
  }, [view]);

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
          One shelf is horror. The other is romance. Mediate resolves the titles you picked, asks
          Qloo for each person separately, and lays out the conflict and the overlap.
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
            id={FOCUS.presetMain}
            type="button"
            variant={preset === "main" ? "default" : "outline"}
            className={shelfPaused ? `opacity-50 ${PRIMARY_FOCUS_CLASS}` : PRIMARY_FOCUS_CLASS}
            data-testid="preset-main"
            aria-disabled={shelfPaused || undefined}
            onClick={() => choosePreset("main")}
          >
            Main seeds
          </Button>
          <Button
            id={FOCUS.presetBackup}
            type="button"
            variant={preset === "backup" ? "default" : "outline"}
            className={shelfPaused ? `opacity-50 ${PRIMARY_FOCUS_CLASS}` : PRIMARY_FOCUS_CLASS}
            data-testid="preset-backup"
            aria-disabled={shelfPaused || undefined}
            onClick={() => choosePreset("backup")}
          >
            Backup seeds
          </Button>
        </div>
        <Button
          id={FOCUS.mediate}
          type="button"
          size="lg"
          className={
            mediatePaused
              ? `h-11 px-5 text-base opacity-50 sm:min-w-40 ${PRIMARY_FOCUS_CLASS}`
              : `h-11 px-5 text-base sm:min-w-40 ${PRIMARY_FOCUS_CLASS}`
          }
          data-testid="mediate-button"
          aria-describedby={FOCUS.mediateHint}
          aria-disabled={mediatePaused || undefined}
          onClick={() => void mediate()}
        >
          {mediateButtonLabel(loading)}
        </Button>
      </div>
      <p id={FOCUS.mediateHint} className="mt-3 text-sm text-muted-foreground">
        {mediateHint(canMediate)}
      </p>

      <div className="mt-10" aria-live="polite" data-testid="results">
        {view.kind === "idle" ? <IdleResults /> : null}
        {view.kind === "loading" ? <LoadingResults /> : null}
        {view.kind === "error" ? (
          <ErrorResults failure={view.failure} onRetry={() => void mediate()} />
        ) : null}
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
              aria-disabled={disabled || undefined}
              data-testid={`seed-${side}-${slug(seed.title)}`}
              onClick={() => {
                if (disabled) return;
                onToggle(seed);
              }}
              className={
                (on
                  ? horror
                    ? "flex min-h-14 w-full items-center justify-between gap-3 rounded-lg bg-horror px-3 py-3 text-left text-white"
                    : "flex min-h-14 w-full items-center justify-between gap-3 rounded-lg bg-romance px-3 py-3 text-left text-white"
                  : "flex min-h-14 w-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-3 text-left") +
                ` ${PRIMARY_FOCUS_CLASS}` +
                (disabled ? " opacity-60" : "")
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
  return <StatusPanel copy={idlePanelCopy()} headingId={FOCUS.idleHeading} testId="idle-panel" />;
}

function LoadingResults() {
  return (
    <StatusPanel
      copy={loadingPanelCopy()}
      headingId={FOCUS.loadingHeading}
      testId="loading-panel"
      busy
    >
      <PhaseList rows={loadingPhaseRows()} testId="loading-phases" />
      <div className="mt-4 flex flex-col gap-2" data-testid="loading-skeleton" aria-hidden="true">
        <div className="h-2.5 w-2/3 animate-pulse rounded-full bg-muted" />
        <div className="h-2.5 w-1/2 animate-pulse rounded-full bg-muted" />
        <div className="h-2.5 w-3/5 animate-pulse rounded-full bg-muted" />
      </div>
      <p className="sr-only">{loadingSkeletonNote()}</p>
    </StatusPanel>
  );
}

function ErrorResults({ failure, onRetry }: { failure: MediateFailure; onRetry: () => void }) {
  const copy: PanelCopy = {
    tone: "error",
    title: publicFailureTitle(failure.code, failure.steps),
    body: publicFailureMessage(failure),
  };
  return (
    <StatusPanel copy={copy} headingId={FOCUS.errorHeading} testId="error-panel">
      <PhaseList rows={errorPhaseRows(failure)} testId="error-phases" />
      <Button
        id={FOCUS.retry}
        type="button"
        className={`mt-5 ${PRIMARY_FOCUS_CLASS}`}
        data-testid="mediate-retry"
        onClick={onRetry}
      >
        {retryActionLabel()}
      </Button>
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
    </StatusPanel>
  );
}

function StatusPanel({
  copy,
  headingId,
  testId,
  busy,
  children,
}: {
  copy: PanelCopy;
  headingId: string;
  testId: string;
  busy?: boolean;
  children?: ReactNode;
}) {
  const frame =
    copy.tone === "error"
      ? "border-destructive/30 bg-card"
      : copy.tone === "loading"
        ? "border-border bg-card"
        : "border-dashed border-border bg-card/70";
  return (
    <section
      className={`rounded-2xl border px-5 py-8 ${frame}`}
      aria-labelledby={headingId}
      aria-busy={busy ? true : undefined}
      data-testid={testId}
      data-tone={copy.tone}
    >
      <h2
        id={headingId}
        tabIndex={-1}
        className="scroll-mt-8 rounded-sm font-heading text-2xl outline-none focus-visible:ring-3 focus-visible:ring-ring"
        data-testid={testId === "error-panel" ? "error-title" : undefined}
      >
        {copy.title}
      </h2>
      <p
        className={
          copy.tone === "error"
            ? "mt-2 max-w-2xl text-sm leading-relaxed"
            : "mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground"
        }
        data-testid={copy.tone === "error" ? "results-message" : undefined}
      >
        {copy.body}
      </p>
      {children}
    </section>
  );
}

function PhaseList({ rows, testId }: { rows: PhaseRow[]; testId: string }) {
  return (
    <ol className="mt-6 flex flex-col gap-3" data-testid={testId}>
      {rows.map((row) => (
        <li
          key={row.id}
          className="rounded-xl border border-dashed border-border bg-background/60 px-3 py-3"
          data-phase={row.id}
          data-state={row.state}
        >
          <p className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
            {row.label}
            <span className="sr-only">, {row.stateLabel}</span>
          </p>
          <p className="mt-1 text-sm font-medium">{row.stateLabel}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{row.detail}</p>
        </li>
      ))}
    </ol>
  );
}

function ReadyResults({ data }: { data: MediateSuccess }) {
  const zones = partitionZones(data.personA.insights, data.personB.insights);
  const aTags = topTags(zones.aOnly);
  const bTags = topTags(zones.bOnly);
  const empty = emptySetCopy({
    overlapCount: zones.overlap.length,
    aOnlyCount: zones.aOnly.length,
    bOnlyCount: zones.bOnly.length,
  });

  return (
    <div className="flex flex-col gap-8">
      <blockquote
        id={FOCUS.resultsHeading}
        tabIndex={-1}
        className="max-w-3xl scroll-mt-8 rounded-sm font-heading text-2xl leading-snug outline-none focus-visible:ring-3 focus-visible:ring-ring sm:text-3xl"
      >
        {empty
          ? empty.headline
          : "The safe zone is the overlap. A title is here because both pulls returned the same entity id."}
      </blockquote>
      <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Each side is its own Qloo insights call. A shared title is the same entity id in both
        lists. The two pulls are never averaged into one score.
      </p>

      <section
        data-testid="conflict-zone"
        aria-labelledby="conflict-heading"
        aria-describedby="conflict-detail"
      >
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="conflict-heading" className="font-heading text-3xl tracking-tight">
            Conflict zone
            <span className="sr-only">, minefield</span>
          </h2>
          <p id="conflict-detail" className="text-sm text-muted-foreground">
            Titles only one pull returned
          </p>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <ZoneColumn
            side="A"
            title="A only"
            detail="Person A's pull, absent from Person B"
            tone="horror"
            movies={zones.aOnly}
            pullCount={data.personA.insights.length}
            tags={aTags}
          />
          <ZoneColumn
            side="B"
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
        aria-describedby="safe-detail"
      >
        <h2 id="safe-heading" className="font-heading text-3xl tracking-tight text-safe">
          Safe zone
          <span className="sr-only">, shared entity ids only</span>
        </h2>
        <p id="safe-detail" className="mt-1 text-sm text-muted-foreground">
          {empty
            ? "Zero overlap. No title was added to fill this space."
            : "Listed in the order Person A's pull returned them."}
        </p>
        {empty ? (
          <EmptySet copy={empty} />
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {zones.overlap.slice(0, 12).map((movie) => (
              <li key={movie.entityId}>
                <MovieCard movie={movie} mark="Both pulls" />
              </li>
            ))}
          </ul>
        )}
      </section>

      <Separator />
      <SeedReport personA={data.personA.seeds} personB={data.personB.seeds} />
      <Trace steps={data.steps} />
    </div>
  );
}

function ZoneColumn({
  side,
  title,
  detail,
  tone,
  movies,
  pullCount,
  tags,
}: {
  side: Side;
  title: string;
  detail: string;
  tone: "horror" | "romance";
  movies: ApiMovie[];
  pullCount: number;
  tags: string[];
}) {
  const shown = movies.slice(0, SHOW_LIMIT);
  const empty = emptyColumnCopy({ side, pullCount });
  const minefield = tone === "horror" ? ", minefield, Person A" : ", minefield, Person B";
  return (
    <div className={tone === "horror" ? "rounded-2xl bg-horror-soft/70 p-4" : "rounded-2xl bg-romance-soft/80 p-4"}>
      <h3 className="font-heading text-2xl">
        {title}
        <span className="sr-only">{minefield}</span>
      </h3>
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
        <div
          className="mt-4 rounded-xl border border-dashed border-border bg-card/80 px-3 py-3"
          data-testid={`empty-column-${side}`}
          data-tone="empty"
        >
          <p className="text-sm font-medium">{empty.title}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{empty.body}</p>
        </div>
      )}
      {movies.length > SHOW_LIMIT ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Showing {SHOW_LIMIT} of {movies.length} from this pull.
        </p>
      ) : null}
    </div>
  );
}

function EmptySet({ copy }: { copy: EmptySetCopy }) {
  return (
    <div
      className="mt-4 rounded-xl border border-dashed border-safe/50 bg-card/80 px-4 py-5"
      data-testid="safe-zone-empty"
    >
      <p className="text-xs font-medium tracking-[0.16em] text-safe uppercase">Empty set</p>
      <p className="mt-2 font-heading text-2xl leading-snug">{copy.lead}</p>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed">{copy.body}</p>
      <p className="mt-3 text-sm text-muted-foreground" data-testid="empty-set-counts">
        {copy.counts}
      </p>
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

function asSuccess(value: unknown): MediateSuccess | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Partial<MediateSuccess>;
  if (payload.ok !== true) return null;
  if (!payload.personA || !payload.personB) return null;
  if (!Array.isArray(payload.personA.insights) || !Array.isArray(payload.personB.insights)) {
    return null;
  }
  return {
    ok: true,
    steps: asSteps(payload.steps),
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
  const code: FailCode = FAIL_CODES.includes(payload.code as FailCode)
    ? (payload.code as FailCode)
    : "upstream";
  const seeds =
    payload.seeds && Array.isArray(payload.seeds.personA) && Array.isArray(payload.seeds.personB)
      ? { personA: asSeeds(payload.seeds.personA), personB: asSeeds(payload.seeds.personB) }
      : undefined;
  return {
    ok: false,
    code,
    message: payload.message,
    steps: asSteps(payload.steps),
    ...(seeds ? { seeds } : {}),
  };
}
