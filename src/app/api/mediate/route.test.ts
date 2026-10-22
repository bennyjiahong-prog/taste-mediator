import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "@/app/api/mediate/route";

const url = "https://example.test/api/mediate";

test("mediate route requires JSON and rejects malformed or oversized bodies", async () => {
  const wrongType = await POST(new Request(url, { method: "POST", body: "{}" }));
  assert.equal(wrongType.status, 415);

  const malformed = await POST(
    new Request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    }),
  );
  assert.equal(malformed.status, 400);

  const oversized = await POST(
    new Request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ padding: "x".repeat(9_000) }),
    }),
  );
  assert.equal(oversized.status, 413);
});

test("mediate route caps a chunked body that has no Content-Length", async () => {
  let pulled = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulled += 1;
      if (pulled > 64) {
        controller.close();
        return;
      }
      controller.enqueue(new TextEncoder().encode("x".repeat(1024)));
    },
  });
  const request = new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: stream,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  assert.equal(request.headers.get("content-length"), null);

  const response = await POST(request);
  assert.equal(response.status, 413);
  assert.ok(pulled < 64, `read ${pulled} KiB before refusing`);
});

test("mediate route treats the JSON media type case-insensitively", async () => {
  const original = process.env.QLOO_API_KEY;
  delete process.env.QLOO_API_KEY;
  try {
    const response = await POST(
      new Request(url, {
        method: "POST",
        headers: { "Content-Type": "Application/JSON; charset=utf-8" },
        body: JSON.stringify({ personA: [], personB: [] }),
      }),
    );
    assert.equal(response.status, 503);
  } finally {
    if (original === undefined) delete process.env.QLOO_API_KEY;
    else process.env.QLOO_API_KEY = original;
  }
});

test("mediate route keeps the missing-key failure after parsing valid JSON", async () => {
  const original = process.env.QLOO_API_KEY;
  delete process.env.QLOO_API_KEY;
  try {
    const response = await POST(
      new Request(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personA: [], personB: [] }),
      }),
    );
    const payload = (await response.json()) as { code?: string };
    assert.equal(response.status, 503);
    assert.equal(payload.code, "missing_key");
  } finally {
    if (original === undefined) delete process.env.QLOO_API_KEY;
    else process.env.QLOO_API_KEY = original;
  }
});
