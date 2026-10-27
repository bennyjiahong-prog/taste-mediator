import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

export const LLM_KEY_ENV = "OPENROUTER_API_KEY";
export const LLM_MODEL_ENV = "OPENROUTER_MODEL";
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
/** Cheap on OpenRouter and lists `tools` in its supported parameters. */
export const DEFAULT_MODEL = "openai/gpt-4o-mini";

function withStableToolRouting(body: Record<string, unknown>, modelId: string) {
  if (!Array.isArray(body.tools) || body.tools.length === 0) return body;
  const provider =
    typeof body.provider === "object" && body.provider !== null && !Array.isArray(body.provider)
      ? body.provider
      : {};
  return {
    ...body,
    parallel_tool_calls: false,
    provider: { ...provider, require_parameters: true },
    ...(modelId.startsWith("deepseek/")
      ? { reasoning: { enabled: false, exclude: true } }
      : {}),
  };
}

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
    transformRequestBody: (body) => withStableToolRouting(body, modelId),
  });
  return { model: provider.chatModel(modelId), modelId, secrets: [apiKey] };
}
