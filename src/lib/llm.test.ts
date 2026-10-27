import assert from "node:assert/strict";
import { test } from "node:test";
import { generateText, tool } from "ai";
import { z } from "zod";
import { agentModelFromEnv, DEFAULT_MODEL } from "@/lib/llm";

const KEY = "sk-or-v1-test-key-do-not-leak-4f5a";

test("no OpenRouter key means no model", () => {
  assert.equal(agentModelFromEnv({}).model, null);
  assert.equal(agentModelFromEnv({ OPENROUTER_API_KEY: "   " }).model, null);
  assert.equal(agentModelFromEnv({ OPENAI_API_KEY: KEY }).model, null);
});

test("the model calls OpenRouter's chat completions with a bearer key", async () => {
  const seen: { url: string; auth: string | null; body: Record<string, unknown> }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    seen.push({
      url: String(input instanceof URL ? input.href : input),
      auth: new Headers(init?.headers).get("Authorization"),
      body,
    });
    return Response.json({
      id: "gen-1",
      created: 0,
      model: body.model,
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
  assert.equal(seen[0]?.url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(seen[0]?.auth, `Bearer ${KEY}`);
  assert.equal(seen[0]?.body.model, DEFAULT_MODEL);

  const custom = agentModelFromEnv(
    { OPENROUTER_API_KEY: KEY, OPENROUTER_MODEL: "deepseek/deepseek-chat-v3.1" },
    fetchImpl,
  );
  assert.equal(custom.modelId, "deepseek/deepseek-chat-v3.1");
  assert.ok(custom.model);
  await generateText({
    model: custom.model,
    prompt: "use the tool",
    tools: {
      noop: tool({
        description: "No operation.",
        inputSchema: z.object({}),
        execute: async () => ({ ok: true }),
      }),
    },
  });
  assert.equal(seen[1]?.body.parallel_tool_calls, false);
  assert.deepEqual(seen[1]?.body.provider, { require_parameters: true });
  assert.deepEqual(seen[1]?.body.reasoning, { enabled: false, exclude: true });
});
