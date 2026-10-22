import { mediateWithAgent } from "@/lib/agent";
import { agentModelFromEnv } from "@/lib/llm";

const MAX_BODY_BYTES = 8 * 1024;

export const maxDuration = 60;

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    return badRequest("Send the two seed lists as JSON.", 415);
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return badRequest("The request body is too large.", 413);
  }

  let body: unknown = null;
  try {
    const raw = await readBodyWithin(request, MAX_BODY_BYTES);
    if (raw === null) {
      return badRequest("The request body is too large.", 413);
    }
    body = JSON.parse(raw) as unknown;
  } catch {
    return badRequest("Send the two seed lists as valid JSON.", 400);
  }

  const result = await mediateWithAgent(body, {
    apiKey: process.env.QLOO_API_KEY,
    baseUrl: process.env.QLOO_BASE_URL,
    ...agentModelFromEnv(process.env),
  });

  return Response.json(result.payload, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}

/** Content-Length is optional (chunked uploads), so the cap is enforced while streaming. */
async function readBodyWithin(request: Request, limit: number): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function badRequest(message: string, status: number) {
  return Response.json(
    { ok: false, code: "bad_request", message, steps: [] },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
