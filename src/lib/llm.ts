import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

export const LLM_KEY_ENV = "OPENROUTER_API_KEY";
export const LLM_MODEL_ENV = "OPENROUTER_MODEL";
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
/** Cheap on OpenRouter and lists `tools` in its supported parameters. */
export const DEFAULT_MODEL = "openai/gpt-4o-mini";

export type AgentModel = {
  model: LanguageModel | null;
  modelId: string | null;
  secrets: string[];
};

export function agentModelFromEnv(
  env: Record<string, string | undefined>,
  fetchImpl?: typeof fetch,
): AgentModel {
  const apiKey = env[LLM_KEY_ENV]?.trim();
  if (!apiKey) return { model: null, modelId: null, secrets: [] };
  const modelId = env[LLM_MODEL_ENV]?.trim() || DEFAULT_MODEL;
  const provider = createOpenAICompatible({
    name: "openrouter",
    baseURL: OPENROUTER_BASE_URL,
    apiKey,
    headers: { "X-Title": "Taste Mediator" },
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  });
  return { model: provider.chatModel(modelId), modelId, secrets: [apiKey] };
}
