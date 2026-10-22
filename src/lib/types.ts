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

export type TasteTag = {
  id: string;
  name: string;
};

export type AgentToolCall = {
  tool: string;
  input: string;
  ok: boolean;
  summary: string;
};

export type AgentTags = {
  personA: TasteTag[];
  personB: TasteTag[];
  shared: TasteTag[];
};

export type AgentReport = {
  /** "fallback" means no LLM ran; the result is the fixed pipeline. */
  mode: "agent" | "fallback";
  model: string | null;
  notice: string | null;
  explanation: string | null;
  toolCalls: AgentToolCall[];
  tags: AgentTags | null;
};

export type MediateSuccess = {
  ok: true;
  steps: QlooStep[];
  personA: SideResult;
  personB: SideResult;
  agent?: AgentReport;
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
  agent?: AgentReport;
};

export type MediateResponse = MediateSuccess | MediateFailure;
