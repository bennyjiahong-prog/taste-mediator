# Taste Mediator

Friday movie night for two people who want different films.

Person A brings a horror shelf. Person B brings a romance shelf. An AI agent (built with the [Vercel AI SDK](https://ai-sdk.dev/) `ToolLoopAgent` and a model served through [OpenRouter](https://openrouter.ai/)) plans and calls Qloo tools: it resolves those titles on the Qloo hackathon API, asks for movie insights **twice** (once per person), can ask Qloo for each person's taste tags, and then calls a deterministic comparison tool. It explains the result in a short paragraph. A title reaches the safe zone only when both Qloo pulls return the same entity ID. That rule is code, not the model. The two pulls are never averaged into one score. If Qloo returns no shared title, the page says so. Nothing is invented to fill the gap.

## Links

- [Live demo](https://taste-mediator.vercel.app/)
- [Public GitHub repository](https://github.com/bennyjiahong-prog/taste-mediator)

## How the agent works

The browser talks only to this app. `POST /api/mediate` runs the agent on the server (`src/lib/agent.ts`). The model gets the locked seeds in its prompt and four tools. It decides the order and can call tools in parallel:

| Tool | What it does |
| --- | --- |
| `resolve_seeds(person)` | `GET /search` for each of that person's seeds (`types=urn:entity:movie`). Strict title and year matching; a miss is not replaced. |
| `get_movie_insights(person)` | One `GET /v2/insights?filter.type=urn:entity:movie&signal.interests.entities=…` using only that person's resolved seeds. Every seed from either side is removed from the list. |
| `get_taste_tags(person)` | One `GET /v2/insights?filter.type=urn:tag&signal.interests.entities=…` for that person's seeds. |
| `compare_tastes()` | Deterministic code. Splits the two insight lists into **A only**, **B only**, and **overlap** by exact entity ID, and intersects the two tag lists by exact tag ID. |

Guards in code, not in the prompt:

- The zones on the page are always computed from the two Qloo insight lists. The model's text is shown beside them and labelled as model-written.
- The model's explanation is shown only if it called `compare_tastes`. If it stops early, the server finishes the missing Qloo steps and shows a notice instead of its text.
- The loop stops after 8 model steps, or as soon as a required Qloo search or movie-insights call fails. A rejected key or rate limit also stops the loop and clears the results.
- Tag insights is optional. If only a tag-insights call fails for another reason, the agent is told and the movie result still stands.
- Both keys are redacted from the agent's notice and explanation before they are returned.

**Fallback.** If `OPENROUTER_API_KEY` is not set, the agent does not run. If a model call fails, the agent does not complete. In either case, the server returns the fixed search-then-insights result, reusing any Qloo steps that already finished, and the page shows a fallback notice.

Auth to Qloo is the `X-Api-Key` header, attached only on the server. Insights is a GET with query parameters. `/recommendations` and `/recs` are not called. The hackathon base URL is `https://hackathon.api.qloo.com`.

The response contains `steps` (every Qloo call, without the key) and `agent` (`mode`, `model`, `notice`, `explanation`, the ordered `toolCalls`, and the tags). The page shows both.

## Environment variables

| Name | Required | Purpose |
| --- | --- | --- |
| `QLOO_API_KEY` | Yes | Hackathon key from the Qloo form. Without it, Mediate returns a not-connected state. |
| `OPENROUTER_API_KEY` | For the agent | Turns on the AI agent. Without it, the fixed pipeline runs and the page says the agent is off. |
| `OPENROUTER_MODEL` | No | OpenRouter model slug. Defaults to `openai/gpt-4o-mini`, chosen because it is cheap and OpenRouter lists tool support for it. Any replacement must support tool calling. |
| `QLOO_BASE_URL` | No | Only `https://hackathon.api.qloo.com` is accepted. |

```bash
cp .env.example .env.local
```

Put the keys in `.env.local`:

```bash
QLOO_API_KEY=your_hackathon_key
OPENROUTER_API_KEY=your_openrouter_key
```

`.env.local` is gitignored. `.env.example` ships with empty placeholders. Do not commit a real key, and do not prefix either variable with `NEXT_PUBLIC_`. Both are read only in server code.

The agent calls OpenRouter's OpenAI-compatible chat completions API at `https://openrouter.ai/api/v1` with `Authorization: Bearer $OPENROUTER_API_KEY`, through `@ai-sdk/openai-compatible` (`src/lib/llm.ts`).

On Vercel, set `QLOO_API_KEY` and `OPENROUTER_API_KEY` in the project environment, then redeploy. Leave `QLOO_BASE_URL` unset unless you need to repeat the default host. Any other host is refused, so a hackathon key is not sent to production or staging. The route sets `maxDuration = 60` seconds; the agent call itself times out after 45 seconds.

The route accepts only JSON bodies up to 8 KiB, enforced while the body is read, and the seed catalog is validated on the server. This limits a single request, but it is not a durable rate limit. A public deployment can still be called by scripts and consume Qloo quota and OpenRouter credit (each Mediate press is up to 8 model calls). Add a platform-level rate limit, and a credit limit on the OpenRouter key, before using this beyond a judged demo.

## Run

```bash
npm ci
npm test
npm run lint
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run build
npm start
```

## Demo

The page opens on the locked seeds.

| Person | Shelf | Seeds |
| --- | --- | --- |
| A | Horror | The Shining (1980), Hereditary (2018), The Witch (2015) |
| B | Romance | Pride & Prejudice (2005), Notting Hill (1999), Love Actually (2003) |

**Backup seeds** swaps the shelves to Get Out (2017) and Midsommar (2019) against Crazy Rich Asians (2018) and La La Land (2016).

Press **Mediate**.

- **Conflict zone** — titles returned for only one person.
- **Safe zone** — titles returned for both. An empty overlap stays empty, with the rule to take turns.
- **Seeds Qloo resolved** — which of your own picks matched, and which missed. A miss is not replaced.
- **The agent's mediation** — the model's short explanation, the tools it chose in order, and any taste tags Qloo returned for both people. If the agent was off, a notice says why.
- **What Qloo was asked** — the GET search and insights steps, without the key.

A missing key, a rejected key, a rate limit, or an upstream failure clears recommendation titles. Seed notes appear only when search ran and a side still could not be resolved. Those notes are about the seeds you selected.

## How to verify a real API call

Set `QLOO_API_KEY` on the server, open the app, and use the browser developer tools.

1. Press **Mediate** and watch the Network panel. The only request the browser makes is `POST /api/mediate`.
2. Open that response. `steps` lists `GET /search` for each selected title, `GET /v2/insights` once per person, and any tag insights calls. `agent.toolCalls` lists the tools the model chose, in order. The server sends the Qloo calls to `https://hackathon.api.qloo.com`.
3. The browser request does not carry `X-Api-Key`, `QLOO_API_KEY`, or `OPENROUTER_API_KEY`. The keys stay in the server environment.
4. Locally, remove `OPENROUTER_API_KEY`, restart `npm run dev`, and press **Mediate**. The result still appears, with a notice that the agent was off. Remove `QLOO_API_KEY` too and the zones clear. On Vercel, an environment change applies only after a redeploy.
5. With a key, the safe zone is the titles whose `entityId` is in both insight lists. The two pulls are not averaged. If that intersection is empty, the page says to take turns and does not invent a title.

## Submission checklist

- [ ] Re-test the live **Mediate** flow on both seed shelves immediately before submitting.
- [ ] Confirm the Devpost demo and repository links are public in a signed-out browser.
- [ ] Confirm the deployed environment has `QLOO_API_KEY`, while the browser bundle, repository, logs, screenshots, and demo video do not.
- [ ] Capture one successful overlap and the honest zero-overlap/error state for the demo.
- [ ] Set `OPENROUTER_API_KEY` on Vercel, redeploy, and confirm the page says the AI agent will call Qloo.
- [ ] Press **Mediate** with both keys and confirm the agent panel shows an explanation and a tool list. Check that tag insights works on the hackathon key; if it fails, the tool list shows it as failed.
- [x] The agent calls Qloo through tools; the overlap is computed by a deterministic tool. Unit tests mock the model and Qloo and cover the full loop, the no-LLM-key fallback, model failure, early stop, Qloo key rejection, tag failure, the step cap, and key redaction.
- [x] The repository is MIT licensed. See [./LICENSE](./LICENSE).

The public path is this GitHub repository and the live demo. Origin repositories `taste-mediator` and `taste-mediator-public` stay private. They are an optional private backup, not the submission judges should use.

Devpost submission is human-only. This repository does not auto-submit.

## License

[MIT](./LICENSE)
