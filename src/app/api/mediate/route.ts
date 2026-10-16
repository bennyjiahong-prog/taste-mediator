import { mediate } from "@/lib/mediate";

export async function POST(request: Request) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const result = await mediate(body, {
    apiKey: process.env.QLOO_API_KEY,
    baseUrl: process.env.QLOO_BASE_URL,
  });

  return Response.json(result.payload, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
