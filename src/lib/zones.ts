import type { ApiMovie } from "@/lib/types";

function mergePair(left: ApiMovie, right: ApiMovie): ApiMovie {
  const tags: string[] = [];
  for (const tag of [...left.tags, ...right.tags]) {
    if (!tags.includes(tag)) tags.push(tag);
    if (tags.length === 8) break;
  }
  return {
    entityId: left.entityId,
    name: left.name,
    year: left.year ?? right.year,
    description: left.description ?? right.description,
    imageUrl: left.imageUrl ?? right.imageUrl,
    tags,
  };
}

/**
 * Compromise is set membership across two independent pulls.
 * Nothing here blends scores.
 */
export function partitionZones(personA: ApiMovie[], personB: ApiMovie[]) {
  const bById = new Map<string, ApiMovie>();
  for (const movie of personB) {
    if (!bById.has(movie.entityId)) bById.set(movie.entityId, movie);
  }
  const aIds = new Set(personA.map((movie) => movie.entityId));

  const overlap: ApiMovie[] = [];
  const aOnly: ApiMovie[] = [];
  const seenA = new Set<string>();
  for (const movie of personA) {
    if (seenA.has(movie.entityId)) continue;
    seenA.add(movie.entityId);
    const other = bById.get(movie.entityId);
    if (other) overlap.push(mergePair(movie, other));
    else aOnly.push(movie);
  }

  const bOnly: ApiMovie[] = [];
  const seenB = new Set<string>();
  for (const movie of personB) {
    if (seenB.has(movie.entityId) || aIds.has(movie.entityId)) continue;
    seenB.add(movie.entityId);
    bOnly.push(movie);
  }

  return { overlap, aOnly, bOnly };
}

export function topTags(movies: ApiMovie[], limit = 4): string[] {
  const counts = new Map<string, number>();
  for (const movie of movies) {
    for (const tag of movie.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([tag]) => tag);
}
