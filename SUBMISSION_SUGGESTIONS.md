# Devpost submission suggestions

These edits are based only on the submitted draft and this repository. They deliberately avoid user counts, performance claims, prizes, team history, or other facts that are not evidenced here.

## Second-round review (2026-10-22)

Sources checked on 2026-10-22: the public challenge page (https://qloo.devpost.com/) and official rules (https://qloo.devpost.com/rules). Re-read both before submitting; they can change.

### Highest risk: the theme is agentic

The event is the **Qloo Agentic Hackathon**. The official rules require a working application that integrates the Qloo API and either (a) functions as an agentic tool, (b) is built using an agent framework, or (c) integrates the Qloo API into an existing agent. Stage One of judging is pass/fail on whether the project "reasonably fits the theme."

At the time of the second-round review, the repository had no LLM, no agent framework, and no agent loop. The owner chose option 2: wire it into a real agent. That is now done in code (see the next section). It only counts if the deployed demo actually runs the agent, so this branch and `OPENROUTER_API_KEY` must be deployed on Vercel before submitting. The public demo checked on 2026-10-22 was still serving the pre-agent UI. After this branch is deployed, omitting `OPENROUTER_API_KEY` makes the demo use the fixed pipeline and show an agent-fallback notice, so the "agent" wording below would not describe that run.

### Agent integration (2026-10-22)

What was added, and what can be claimed:

- **Agent framework:** Vercel AI SDK (`ai` v7) `ToolLoopAgent`, calling a model through OpenRouter's OpenAI-compatible API (`@ai-sdk/openai-compatible`, base URL `https://openrouter.ai/api/v1`). Default model `openai/gpt-4o-mini`, overridable with `OPENROUTER_MODEL`. This fits rule (b) "built using an agent framework" and (a) "functions as an agentic tool".
- **Tools the model can call:** `resolve_seeds` (Qloo `GET /search`), `get_movie_insights` (Qloo `GET /v2/insights`, `urn:entity:movie`), optional `get_taste_tags` (Qloo `GET /v2/insights`, `filter.type=urn:tag`), and `compare_tastes` (deterministic exact-ID intersection).
- **Honesty guards are code:** the zones are computed from Qloo entity IDs, not from model text. After comparison, the model can select only returned entity IDs; code verifies the IDs against the overlap/A-only/B-only zones and renders the explanation. Free-form prose, invented IDs, and mislabelled IDs are not displayed. Required search or movie-insights failures stop the loop and clear results; the loop is capped at 8 model steps.
- **Fallback:** without `OPENROUTER_API_KEY`, the agent does not run; if the model fails, it does not complete. The server returns the fixed search-then-insights result, reusing Qloo steps that already finished, and the page shows a notice.
- **Tests:** model and Qloo are mocked. No test calls OpenRouter or Qloo. No live end-to-end run with real keys was done in this change, so no latency, accuracy, or quality numbers exist. Do not quote any.
- **Not verified live:** the `filter.type=urn:tag` request was written from the Qloo Insights documentation and tested only against mocks. If the hackathon key rejects it, the tool list shows `get_taste_tags · failed` and the movie result still stands. Check this on the live demo before claiming tag insights in the write-up.
- **Still not used:** audiences, cross-domain entity types (music, books, places), and Qloo explainability. Do not claim them.
- **Cost risk:** each Mediate press is up to 8 OpenRouter model calls on a public, un-rate-limited endpoint. Set a credit limit on the OpenRouter key before judging.

Wording rule: say "an AI agent that calls Qloo tools" only for the deployed demo with `OPENROUTER_API_KEY` set. Do not say the agent "decides" or freely explains the overlap; code computes the zones and renders grounded copy from the agent's validated entity-ID selection.

### Live-agent stability follow-up (2026-10-24)

The deployed demo was observed intermittently, then repeatedly, returning `agent.mode="fallback"` with model HTTP 400 while Vercel reported `deepseek/deepseek-chat-v3.1`. The fixed Qloo pipeline still returned `ok:true`; that is not evidence that the agent completed.

This change hardens OpenRouter tool requests by disabling parallel tool calls, requiring parameter-compatible provider routing, and disabling reasoning for DeepSeek models. Local tests verify the request shape and fallback/grounding behavior, but they do not call OpenRouter with a real key. **Ben still needs to set Vercel `OPENROUTER_MODEL=openai/gpt-4o-mini`, redeploy, and run both locked presets repeatedly.** Do not claim the live agent is stable until each response shows `mode="agent"`, `compare_tastes`, and a grounded explanation.

### Corrections to the first-round notes

- The "likely judging criteria" section below was replaced with the published criteria. The previous list (working demo, Qloo depth, UX, clarity, originality) was not the official list.
- **Built with:** the draft lists "MIT", which is a license, not a technology. The repository supports: Qloo Hackathon API, Vercel AI SDK, OpenRouter, Next.js, React, TypeScript, Tailwind CSS. Vercel hosting is supported only by the demo's `vercel.app` address. Mention the MIT license in the description instead.
- **Seeds are excluded from results.** Every selected seed is removed from both insight lists before zoning. A Person B seed returned by Person A's pull is not shown as overlap. The copy below now says so, which prevents a judge from reading a missing title as a bug.
- **The tagline change is optional.** "Two tastes. One Qloo graph. Zero fake compromises." describes real behavior: the app never inserts a fallback title. The owner chose it (T1). The alternative below is more literal, not more correct.
- **Judges may not run the demo.** The rules say judges may judge only from the text description, images, and video. Put the mechanism and the empty-overlap behavior in the text, and add screenshots of a real overlap result and a real zero-overlap or error state. A demo video is not required.

### Submission requirements to tick (from the rules)

- [ ] Live, externally hosted demo that works end-to-end without private access.
- [ ] Public GitHub repository with all source, assets, and run instructions.
- [ ] Open-source license detected and shown in the repository's **About** section on GitHub (the `LICENSE` file is MIT; confirm GitHub detects it).
- [ ] Text description that explains what the workflow does and what makes it Qloo-powered.
- [x] Theme fit decision: real agent integration (Vercel AI SDK tool loop calling Qloo tools).
- [ ] `OPENROUTER_API_KEY` set on Vercel and the deployed page says "The AI agent will call Qloo." Without this the demo does not show the agent.

## Claims to change before submitting

1. **“A title only surfaces when both requests return the same entity” is inaccurate.** Titles returned by only one pull do surface in the Conflict zone. Say “A title reaches the Safe zone…” instead.
2. **“This hard constraint is impossible without Qloo” is an overclaim.** Set intersection is ordinary application logic. Qloo's contribution is the cultural-graph result set being compared, not the intersection operation itself.
3. **“Generic recommenders interpolate” is too broad to substantiate.** The implementation proves only what this app does: it keeps the two result sets separate and reports an empty intersection honestly.
4. **Do not imply free-form shelves.** The current UI offers two locked presets, not arbitrary movie entry. This is a focused demo constraint and should be stated plainly.
5. **Treat the old HTTP check as stale.** Re-test the demo, both presets, and the public repository in a signed-out browser immediately before submission. Do not quote the October 18 check as current evidence.

## Suggested paste-ready copy

### Tagline

> Two tastes. Two Qloo pulls. One honest overlap.

The existing “Zero fake compromises” line is punchier, but “fake” is vague and sounds like a claim about competitors. The replacement describes the actual mechanism.

Second-round note: both lines are accurate. If the Safe zone is empty for the main seeds, "One honest overlap" can read as a promise of a result; the owner's T1 line avoids that.

### Impact

> Taste Mediator turns a familiar movie-night disagreement into two independent views of Qloo's cultural graph. A Vercel AI SDK agent calls Qloo search and insights tools, while deterministic code compares the two Qloo result sets by exact entity ID and grounds the displayed mediation. Movies returned for only one person stay visible in the Conflict zone; a movie reaches the Safe zone only when both pulls return the same entity. If there is no shared entity, the app shows an empty Safe zone instead of inserting a fallback recommendation.

### What it does

> Taste Mediator is a focused movie-night demo with locked horror and romance presets. An AI agent, built with the Vercel AI SDK and served through OpenRouter, plans and calls Qloo tools on the server: it resolves the selected titles with Qloo's `GET /search`, makes two separate `GET /v2/insights` requests (one for each person), can optionally ask Qloo for taste tags, and then calls a deterministic comparison tool. The selected seeds are removed from both lists, so a seed never counts as overlap. A movie reaches the Safe zone only when both Qloo pulls return the same entity ID; that rule is code, not the model. Code validates the agent's selected entity IDs and renders the explanation, while the page shows the tools it chose and every Qloo call it made. If Qloo fails, results are cleared rather than replaced with sample data. If the model is unavailable, the app runs the same Qloo steps without the agent and says so.

## Add the missing Devpost story

The supplied package has no draft for several sections judges commonly scan. Keep these short and personal; replace the prompts below with the owner's true experience.

### Inspiration

Explain the real movie-night disagreement or product observation that motivated the project. Do not invent a couple, quote, or user interview.

### How we built it

Safe repository-backed points:

- Next.js, React, TypeScript, and Tailwind CSS UI plus a server-side `POST /api/mediate` route.
- A Vercel AI SDK `ToolLoopAgent` (model served through OpenRouter) that calls seed search, movie insights, optional tag insights, and a deterministic comparison.
- Qloo `GET /search` resolves the locked movie seeds.
- Two independent Qloo `GET /v2/insights` calls produce the two result sets.
- Exact `entityId` membership creates A-only, B-only, and overlap zones.
- `QLOO_API_KEY` and `OPENROUTER_API_KEY` are read only from the server environment. The Qloo key is sent to Qloo in `X-Api-Key`.
- Without `OPENROUTER_API_KEY`, the same Qloo steps run without the agent and the page says so.
- No sample recommendation list is used when Qloo is unavailable.

### Challenges

Only claim challenges the owner actually encountered. Potential topics visible in the code are strict title/year matching, handling missing or ambiguous search results, normalizing Qloo response fields, and preserving an honest empty state. Do not present these as personal experience without owner confirmation.

### Accomplishments

The code supports a modest, defensible claim: the agent's Qloo tools and deterministic comparison are isolated behind a server route and covered by unit tests (mocked model and mocked Qloo) for overlap, failures, retries, OpenRouter tool-routing options, the no-LLM fallback, early agent stops, entity-ID grounding, and key non-disclosure. Avoid “production-ready,” “secure,” “fully protected,” or “100% stable”; the tests do not exercise a real OpenRouter provider and the public proxy does not have a durable platform-level rate limit.

### What we learned

Add the owner's real learning about Qloo entities, search resolution, or designing for no-overlap results. No learning claim can be recovered from source code alone.

### What's next

Label future ideas as future work. Plausible options include free-form movie input, more taste domains, ranked explanations, and a durable deployment-level rate limit. Do not imply these exist now.

## Judge-facing demo order

1. State the constraint: two locked, deliberately different shelves.
2. Press **Mediate** once. Point out the agent panel: its code-grounded explanation, the tools it chose in order, then the resolved seeds and the `/v2/insights` trace entries.
3. Show A-only and B-only results before showing exact-ID overlap.
4. If the Safe zone is empty, frame that as the designed honest outcome—not a broken demo.
5. Show that the browser calls only `/api/mediate`; never reveal environment values or an `X-Api-Key` header from a server log.

Because judges may not open the demo, the same points should be visible in the description and screenshots.

## Positioning against the published judging criteria

The challenge page lists four criteria: Technological Implementation, Design, Potential Impact, and Quality of the Idea.

- **Technological Implementation** ("How thoroughly and skillfully does the project use Qloo?"): still the weakest area, though less so. The agent uses one entity domain (`urn:entity:movie`), `GET /search`, two `GET /v2/insights` movie calls with entity signals, and (if the live key accepts it) two `filter.type=urn:tag` insights calls. It does not use audiences, cross-domain entity types, or explainability. Be precise about what is used; do not call it a broad use of the graph. The server-side key handling, strict seed matching, and unit tests are real effort worth one sentence.
- **Design** ("complete, coherent product experience, not just a technical proof of concept"): the Conflict/Safe-zone layout, loading, empty, and error states are coherent. The locked preset shelves make it read as a demo; say plainly that the shelves are presets.
- **Potential Impact** ("credible, specific case for solving a real problem for a real audience"): only the owner can supply the real audience or observation. Do not invent users, quotes, or numbers.
- **Quality of the Idea** ("creative, non-obvious use of Qloo"): lead with visualizing disagreement and accepting an empty compromise, not with claims that set intersection itself is novel. The rule "if your submission would work the same without Qloo, you're building the wrong thing" is answered by the fact that both result sets come from Qloo; the intersection itself is ordinary logic.
