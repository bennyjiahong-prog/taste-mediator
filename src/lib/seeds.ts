export type Side = "A" | "B";
export type Preset = "main" | "backup";

export type Seed = {
  title: string;
  year: number;
  side: Side;
  preset: Preset;
  /** Search strings tried in order. Aliases stay inside the locked catalog. */
  queries: readonly string[];
};

export const SEEDS: readonly Seed[] = [
  {
    title: "The Shining",
    year: 1980,
    side: "A",
    preset: "main",
    queries: ["The Shining"],
  },
  {
    title: "Hereditary",
    year: 2018,
    side: "A",
    preset: "main",
    queries: ["Hereditary"],
  },
  {
    title: "The Witch",
    year: 2015,
    side: "A",
    preset: "main",
    queries: ["The Witch", "The VVitch"],
  },
  {
    title: "Pride & Prejudice",
    year: 2005,
    side: "B",
    preset: "main",
    queries: ["Pride & Prejudice", "Pride and Prejudice"],
  },
  {
    title: "Notting Hill",
    year: 1999,
    side: "B",
    preset: "main",
    queries: ["Notting Hill"],
  },
  {
    title: "Love Actually",
    year: 2003,
    side: "B",
    preset: "main",
    queries: ["Love Actually"],
  },
  {
    title: "Get Out",
    year: 2017,
    side: "A",
    preset: "backup",
    queries: ["Get Out"],
  },
  {
    title: "Midsommar",
    year: 2019,
    side: "A",
    preset: "backup",
    queries: ["Midsommar"],
  },
  {
    title: "Crazy Rich Asians",
    year: 2018,
    side: "B",
    preset: "backup",
    queries: ["Crazy Rich Asians"],
  },
  {
    title: "La La Land",
    year: 2016,
    side: "B",
    preset: "backup",
    queries: ["La La Land"],
  },
];

export function seedKey(seed: Pick<Seed, "title" | "year">): string {
  return `${seed.title}|${seed.year}`;
}

export function findSeed(title: string, year: number): Seed | null {
  return SEEDS.find((seed) => seed.title === title && seed.year === year) ?? null;
}

export function seedsFor(preset: Preset, side: Side): Seed[] {
  return SEEDS.filter((seed) => seed.preset === preset && seed.side === side);
}
