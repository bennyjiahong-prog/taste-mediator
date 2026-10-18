import type { QlooStep } from "@/lib/types";

export const SEARCH_RATE_LIMIT_MESSAGE =
  "Qloo rate-limited title search. Try again shortly. Insights did not run, and no title was filled in.";

export const INSIGHTS_RATE_LIMIT_MESSAGE =
  "Qloo rate-limited an insights pull. Both lists were cleared. Try again shortly. No title was filled in.";

const SEARCH_FAILURE_MESSAGE =
  "Title search failed, so insights was not finished. No recommendation list is shown.";

const INSIGHTS_FAILURE_MESSAGE =
  "An insights pull failed, so neither person's list is shown. The other pull was not used to fill the gap.";

const FALLBACK_BY_CODE: Record<string, string> = {
  missing_key:
    "Qloo is not connected. The server has no QLOO_API_KEY, so no recommendation list was built.",
  invalid_key: "Qloo rejected the API key. Results were cleared. No stand-in list is shown.",
  bad_request: "Those seeds could not be mediated. Results were cleared.",
  bad_config:
    "The server's Qloo host setting was refused. The key was not sent. Results were cleared.",
  seed_unresolved:
    "One side has no resolved movie, so insights was not called. No recommendation list is shown.",
  rate_limited: SEARCH_RATE_LIMIT_MESSAGE,
  upstream: "Qloo failed before a recommendation list could be shown. Results were cleared.",
};

export type PublicFailure = {
  code: string;
  message: string;
  steps: QlooStep[];
};

export type EmptySetCopy = {
  headline: string;
  lead: string;
  body: string;
  counts: string;
};

export function failurePhase(steps: QlooStep[]): "search" | "insights" | "before-call" {
  if (steps.some((step) => step.path === "/v2/insights")) return "insights";
  if (steps.some((step) => step.path === "/search")) return "search";
  return "before-call";
}

/** User-facing text only. Rejects key material, credential URLs, and long opaque tokens. */
export function isSafePublicMessage(message: string): boolean {
  const text = message.trim();
  if (text.length === 0 || text.length > 360) return false;
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text)) return false;
  if (/https?:\/\/\S+@/i.test(text)) return false;
  if (/\b(?:bearer|x-api-key|authorization)\b\s*[:=]/i.test(text)) return false;
  if (/\b(?:qloo_api_key|api[_-]?key|token|secret)\b\s*[:=]\s*\S+/i.test(text)) return false;
  if (/\bnext_public_[a-z0-9_]*qloo/i.test(text)) return false;
  if (/[A-Za-z0-9+/=_-]{28,}/.test(text)) return false;
  return true;
}

export function rateLimitMessage(what: string): string {
  return what.startsWith("insights") ? INSIGHTS_RATE_LIMIT_MESSAGE : SEARCH_RATE_LIMIT_MESSAGE;
}

export function publicFailureTitle(code: string, steps: QlooStep[]): string {
  const phase = failurePhase(steps);
  if (code === "rate_limited") {
    return phase === "insights" ? "Insights rate limited" : "Search rate limited";
  }
  if (code === "upstream") {
    return phase === "insights" ? "Insights failed" : "Search failed";
  }
  if (code === "missing_key" || code === "invalid_key") return "Qloo is not connected";
  if (code === "seed_unresolved") return "Seeds did not resolve";
  if (code === "bad_config") return "Qloo host was refused";
  return "Results cleared";
}

export function publicFailureMessage(failure: PublicFailure): string {
  const phase = failurePhase(failure.steps);
  if (failure.code === "rate_limited") {
    return phase === "insights" ? INSIGHTS_RATE_LIMIT_MESSAGE : SEARCH_RATE_LIMIT_MESSAGE;
  }
  const safe = isSafePublicMessage(failure.message) ? failure.message.trim() : null;
  if (safe) return safe;
  if (failure.code === "upstream" && phase === "insights") return INSIGHTS_FAILURE_MESSAGE;
  if (failure.code === "upstream" && phase === "search") return SEARCH_FAILURE_MESSAGE;
  return FALLBACK_BY_CODE[failure.code] ?? FALLBACK_BY_CODE.upstream;
}

/**
 * Copy for a zero intersection. Counts only — never a movie title.
 * Returns null when at least one entity id is shared.
 */
export function emptySetCopy(input: {
  overlapCount: number;
  aOnlyCount: number;
  bOnlyCount: number;
}): EmptySetCopy | null {
  if (input.overlapCount > 0) return null;
  const bothEmpty = input.aOnlyCount === 0 && input.bOnlyCount === 0;
  if (bothEmpty) {
    return {
      headline: "Neither pull returned a title, so the shared set is empty.",
      lead: "No movie entities came back for either person.",
      body: "This page does not invent a title to sit in the safe zone.",
      counts: "Person A: 0. Person B: 0. Shared entity ids: 0.",
    };
  }
  return {
    headline: "No shared entity id. The safe zone is an empty set.",
    lead: "These two pulls share no entity id.",
    body: "Watch one person's pick this week and the other's next week. A title is listed here only when the same entity id comes back on both insights pulls.",
    counts: `Person A only: ${input.aOnlyCount}. Person B only: ${input.bOnlyCount}. Shared entity ids: 0.`,
  };
}
