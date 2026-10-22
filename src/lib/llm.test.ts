import assert from "node:assert/strict";
import { test } from "node:test";
import { generateText } from "ai";
import { agentModelFromEnv, DEFAULT_MODEL } from "@/lib/llm";

const KEY = "sk-or-v1-test-key-do-not-leak-4f5a";

test("no OpenRouter key means no model", () => {
  assert.equal(agentModelFromEnv({}).model, null);
  assert.equal(agentModelFromEnv({ OPENROUTER_API_KEY: "   " }).model, null);
  assert.equal(agentModelFromEnv({ OPENAI_API_KEY: KEY }).model, null);
});

test("the model calls OpenRouter's chat completions with a bearer key", async () => {
  const seen: { url: string; auth: string | null; model: unknown }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const body = JSON.parse(String(init?.body)) as { model: unknown };
    seen.push({
      url: String(input instanceof URL ? input.href : input),
      auth: new Headers(init?.headers).get("Authorization"),
      model: body.model,
    });
    return Response.json({
      id: "gen-1",
      created: 0,
      model: DEFAULT_MODEL,
      choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });
  };

  const fromEnv = agentModelFromEnv({ OPENROUTER_API_KEY: ` ${KEY} ` }, fetchImpl);
  assert.equal(fromEnv.modelId, DEFAULT_MODEL);
  assert.deepEqual(fromEnv.secrets, [KEY]);
  assert.ok(fromEnv.model);
  const result = await generateText({ model: fromEnv.model, prompt: "hi" });
  assert.equal(result.text, "ok");
  assert.deepEqual(seen, [
    {
      url: "https://openrouter.ai/api/v1/chat/completions",
      auth: `Bearer ${KEY}`,
      model: DEFAULT_MODEL,
    },
  ]);

  const custom = agentModelFromEnv(
    { OPENROUTER_API_KEY: KEY, OPENROUTER_MODEL: "google/gemini-2.5-flash" },
    fetchImpl,
  );
  assert.equal(custom.modelId, "google/gemini-2.5-flash");
});
