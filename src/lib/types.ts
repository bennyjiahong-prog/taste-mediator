export type ApiMovie = {
  entityId: string;
  name: string;
  year: number | null;
  description: string | null;
  imageUrl: string | null;
  tags: string[];
};

export type SeedStatus = "matched" | "miss" | "ambiguous";

export type SeedHit = {
  title: string;
  year: number;
  status: SeedStatus;
  note: string;
  entityId: string | null;
  resolvedName: string | null;
  resolvedYear: number | null;
};

export type QlooStep = {
  method: "GET";
  path: "/search" | "/v2/insights";
  label: string;
  status: number | null;
  ms: number;
};

export type SideResult = {
  seeds: SeedHit[];
  insights: ApiMovie[];
};

export type FailCode =
  | "missing_key"
  | "invalid_key"
  | "bad_request"
  | "bad_config"
  | "seed_unresolved"
  | "upstream"
  | "rate_limited";

export type MediateSuccess = {
  ok: true;
  steps: QlooStep[];
  personA: SideResult;
  personB: SideResult;
};

export type MediateFailure = {
  ok: false;
  code: FailCode;
  message: string;
  steps: QlooStep[];
  seeds?: {
    personA: SeedHit[];
    personB: SeedHit[];
  };
};

export type MediateResponse = MediateSuccess | MediateFailure;
