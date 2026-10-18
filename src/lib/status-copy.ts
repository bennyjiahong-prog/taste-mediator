import { failurePhase, type PublicFailure } from "@/lib/results-copy";

export type PanelTone = "idle" | "loading" | "empty" | "error";

export type PanelCopy = {
  title: string;
  body: string;
  tone: PanelTone;
};

export type PhaseState = "waiting" | "active" | "done" | "failed" | "skipped";

export type PhaseRow = {
  id: "search" | "mediate";
  label: string;
  state: PhaseState;
  stateLabel: string;
  detail: string;
};

/** Stable ids for keyboard focus. Primary actions and status headings use these. */
export const FOCUS = {
  mediate: "mediate-button",
  mediateHint: "mediate-hint",
  retry: "mediate-retry",
  presetMain: "preset-main",
  presetBackup: "preset-backup",
  idleHeading: "idle-heading",
  loadingHeading: "loading-heading",
  errorHeading: "error-heading",
  resultsHeading: "results-heading",
} as const;

/** Extra ring offset so the primary actions stay visible against the page. */
export const PRIMARY_FOCUS_CLASS =
  "focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none";

const STATE_LABEL: Record<PhaseState, string> = {
  waiting: "Waiting",
  active: "In progress",
  done: "Finished",
  failed: "Failed",
  skipped: "Skipped",
};

function row(
  id: PhaseRow["id"],
  label: string,
  state: PhaseState,
  detail: string,
): PhaseRow {
  return { id, label, state, stateLabel: STATE_LABEL[state], detail };
}

export function idlePanelCopy(): PanelCopy {
  return {
    tone: "idle",
    title: "No mediation yet",
    body: "Press Mediate. Title search runs first, then two insight pulls. This page does not keep a sample list and does not show a movie card until both pulls return.",
  };
}

export function loadingPanelCopy(): PanelCopy {
  return {
    tone: "loading",
    title: "Searching, then mediating",
    body: "Search resolves each selected title. Insights run after that, once per person. The bars below are a status skeleton, not movies.",
  };
}

export function loadingSkeletonNote(): string {
  return "No movie titles yet.";
}

export function loadingPhaseRows(): PhaseRow[] {
  return [
    row(
      "search",
      "Search",
      "active",
      "Resolving the selected titles. No movie card is filled in.",
    ),
    row(
      "mediate",
      "Mediate",
      "waiting",
      "Two insight pulls start after search. Titles appear only when both return.",
    ),
  ];
}

export function missingKeyBannerCopy(): PanelCopy {
  return {
    tone: "error",
    title: "Qloo is not connected",
    body: "This server has no QLOO_API_KEY. Mediate returns HTTP 503 with code missing_key and does not invent a movie list.",
  };
}

/**
 * Empty conflict column. Counts only — the caller must not pass a title.
 */
export function emptyColumnCopy(input: { side: "A" | "B"; pullCount: number }): PanelCopy {
  const person = input.side === "A" ? "Person A" : "Person B";
  if (input.pullCount <= 0) {
    return {
      tone: "empty",
      title: `${person} returned no titles`,
      body: "This pull is empty. No movie card was added to fill it.",
    };
  }
  return {
    tone: "empty",
    title: `${person} has no titles outside the overlap`,
    body: "Every title from this pull also came back for the other person. Nothing extra is shown here.",
  };
}

export function mediateHint(canMediate: boolean): string {
  return canMediate
    ? "Two Qloo insight pulls, one per person. At least two seeds stay selected on each side."
    : "Choose at least two seeds on each side.";
}

export function mediateButtonLabel(loading: boolean): string {
  return loading ? "Mediating…" : "Mediate";
}

export function retryActionLabel(): string {
  return "Mediate again";
}

/**
 * Primary actions stay in the tab order. `aria-disabled` replaces the
 * `disabled` attribute so a keyboard user can still land on them.
 */
export function primaryActionAriaDisabled(input: {
  action: "mediate" | "preset" | "seed";
  loading: boolean;
  canMediate: boolean;
}): boolean {
  if (input.action === "mediate") return input.loading || !input.canMediate;
  return input.loading;
}

export function settleFocusId(kind: "loading" | "error" | "ready"): string {
  if (kind === "loading") return FOCUS.loadingHeading;
  if (kind === "error") return FOCUS.errorHeading;
  return FOCUS.resultsHeading;
}

/**
 * Search and Mediate share one status list on failure.
 * A step that never ran is Skipped. An insights failure does not leave Search looking failed.
 */
export function errorPhaseRows(failure: Pick<PublicFailure, "code" | "steps">): PhaseRow[] {
  if (failure.code === "seed_unresolved") {
    return [
      row(
        "search",
        "Search",
        "done",
        "Search ran. One side still has no resolved movie, so no recommendation card is shown.",
      ),
      row(
        "mediate",
        "Mediate",
        "skipped",
        "Insights did not run. No movie card was filled in.",
      ),
    ];
  }

  const phase = failurePhase(failure.steps);
  if (phase === "insights") {
    return [
      row(
        "search",
        "Search",
        "done",
        "Title search finished. Those matches are not shown as recommendations.",
      ),
      row(
        "mediate",
        "Mediate",
        "failed",
        "An insights pull failed. Both lists were cleared. No movie card is shown.",
      ),
    ];
  }
  if (phase === "search") {
    return [
      row("search", "Search", "failed", "Title search failed. No movie card is shown."),
      row(
        "mediate",
        "Mediate",
        "skipped",
        "Insights did not run. No recommendation list was filled in.",
      ),
    ];
  }
  return [
    row("search", "Search", "skipped", "Title search did not run."),
    row("mediate", "Mediate", "skipped", "Insights did not run. No movie card is shown."),
  ];
}
