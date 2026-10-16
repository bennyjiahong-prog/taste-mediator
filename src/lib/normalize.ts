import type { ApiMovie, SeedStatus } from "@/lib/types";

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9:_.-]{7,127}$/;

export function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function pickYear(props: Record<string, unknown> | null, entity: Record<string, unknown>): number | null {
  const candidates = [
    props?.release_year,
    props?.releaseYear,
    props?.year,
    entity.release_year,
    entity.year,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return Math.trunc(candidate);
    }
    if (typeof candidate === "string" && /^\d{4}$/.test(candidate.trim())) {
      return Number(candidate.trim());
    }
  }
  return null;
}

function pickImage(props: Record<string, unknown> | null): string | null {
  if (!props) return null;
  const image = asRecord(props.image);
  const raw = pickString(
    image?.url,
    typeof props.image === "string" ? props.image : null,
    props.image_url,
    props.imageUrl,
  );
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function pickTags(entity: Record<string, unknown>, props: Record<string, unknown> | null): string[] {
  const raw = entity.tags ?? props?.tags;
  if (!Array.isArray(raw)) return [];
  const names: string[] = [];
  for (const tag of raw) {
    const name =
      typeof tag === "string"
        ? tag.trim()
        : pickString(asRecord(tag)?.name, asRecord(tag)?.tag);
    if (!name) continue;
    const clipped = name.length > 60 ? name.slice(0, 60).trim() : name;
    if (clipped && !names.includes(clipped)) names.push(clipped);
    if (names.length === 8) break;
  }
  return names;
}

export function normalizeEntity(raw: unknown): ApiMovie | null {
  const entity = asRecord(raw);
  if (!entity) return null;
  const props = asRecord(entity.properties);
  const entityId = pickString(entity.entity_id, entity.entityId, entity.id);
  const name = pickString(entity.name, entity.title, props?.name, props?.title);
  if (!entityId || !name || !ID_RE.test(entityId)) return null;
  const description = pickString(
    props?.short_description,
    props?.shortDescription,
    props?.description,
    entity.description,
  );
  return {
    entityId,
    name,
    year: pickYear(props, entity),
    description: description ? description.replace(/\s+/g, " ").slice(0, 280) : null,
    imageUrl: pickImage(props),
    tags: pickTags(entity, props),
  };
}

/** Documented shapes: search `results[]`, insights `results.entities[]`. */
export function extractEntityArray(
  payload: unknown,
): { ok: true; entities: unknown[] } | { ok: false } {
  const root = asRecord(payload);
  if (!root) return { ok: false };
  if (Array.isArray(root.results)) return { ok: true, entities: root.results };
  const results = asRecord(root.results);
  if (results && Array.isArray(results.entities)) {
    return { ok: true, entities: results.entities };
  }
  if (Array.isArray(root.entities)) return { ok: true, entities: root.entities };
  return { ok: false };
}

export function normalizeEntities(rawList: unknown[]): ApiMovie[] {
  const movies: ApiMovie[] = [];
  for (const raw of rawList) {
    const movie = normalizeEntity(raw);
    if (movie) movies.push(movie);
  }
  return movies;
}

function nameMatches(candidateName: string, titles: readonly string[]): boolean {
  const normalized = normalizeTitle(candidateName);
  return titles.some((title) => {
    const want = normalizeTitle(title);
    return (
      normalized === want ||
      normalized.startsWith(`${want} `) ||
      want.startsWith(`${normalized} `)
    );
  });
}

export function pickSeedMatch(
  candidates: ApiMovie[],
  titles: readonly string[],
  year: number,
): {
  status: SeedStatus;
  entity: ApiMovie | null;
  note: string;
} {
  const label = `${titles[0]} (${year})`;
  if (candidates.length === 0) {
    return {
      status: "miss",
      entity: null,
      note: `Search returned no movie for ${label}.`,
    };
  }

  const named = candidates.filter((candidate) => nameMatches(candidate.name, titles));
  if (named.length === 0) {
    return {
      status: "miss",
      entity: null,
      note: `Search results did not match ${label}. Nothing was substituted.`,
    };
  }

  const yearHits = named.filter((candidate) => candidate.year === year);
  if (yearHits.length === 1) {
    return {
      status: "matched",
      entity: yearHits[0],
      note: `Matched “${yearHits[0].name}” (${yearHits[0].year}).`,
    };
  }
  if (yearHits.length > 1) {
    const exact = yearHits.filter((candidate) =>
      titles.some((title) => normalizeTitle(candidate.name) === normalizeTitle(title)),
    );
    if (exact.length === 1) {
      return {
        status: "matched",
        entity: exact[0],
        note: `Matched “${exact[0].name}” (${exact[0].year}).`,
      };
    }
    return {
      status: "ambiguous",
      entity: null,
      note: `More than one entity matched ${label}. None was chosen.`,
    };
  }

  const undated = named.filter(
    (candidate) =>
      candidate.year == null &&
      titles.some((title) => normalizeTitle(candidate.name) === normalizeTitle(title)),
  );
  if (undated.length === 1 && named.length === 1) {
    return {
      status: "matched",
      entity: undated[0],
      note: `Matched “${undated[0].name}”. Qloo did not return a release year; the title was exact.`,
    };
  }

  const otherYears = [
    ...new Set(named.map((candidate) => candidate.year).filter((value): value is number => value != null)),
  ];
  const yearNote =
    otherYears.length > 0
      ? ` Other years came back and were not used: ${otherYears.join(", ")}.`
      : "";
  return {
    status: "miss",
    entity: null,
    note: `No entity matched ${label}.${yearNote}`,
  };
}
