# Taste Mediator

Friday movie night for two people who want different films.

Person A brings a horror shelf. Person B brings a romance shelf. Taste Mediator resolves those titles on the Qloo hackathon API, asks for movie insights **twice** (once per person), and shows the conflict and the overlap. A title reaches the safe zone only when both pulls return it. The two pulls are never averaged into one score. If Qloo returns no shared title, the page says so and stops. It does not invent a movie to fill the gap.

## Call chain

The browser talks only to this app. `POST /api/mediate` runs the Qloo calls on the server:

1. `GET /search` for each selected title (`types=urn:entity:movie`).
2. `GET /v2/insights?filter.type=urn:entity:movie&signal.interests.entities=…` for Person A.
3. The same insights request for Person B.

The page then splits the two lists into **A only**, **B only**, and **overlap**.

Auth is the `X-Api-Key` header, attached only on the server. Insights is a GET with query parameters. `/recommendations` and `/recs` are not called. The hackathon base URL is `https://hackathon.api.qloo.com`.

## Set `QLOO_API_KEY`

```bash
cp .env.example .env.local
```

Put the hackathon key in `.env.local`:

```bash
QLOO_API_KEY=your_hackathon_key
```

`.env.local` is gitignored. `.env.example` ships with an empty placeholder. Do not commit a real key, and do not prefix the variable with `NEXT_PUBLIC_`.

On Vercel, set `QLOO_API_KEY` in the project environment. Leave `QLOO_BASE_URL` unset unless you need to repeat the default host. Any other host is refused, so a hackathon key is not sent to production or staging.

Without `QLOO_API_KEY`, the app still builds and runs. Press **Mediate** and `POST /api/mediate` returns **HTTP 503** with `"code": "missing_key"`. Search does not run, insights do not run, and the page shows that status with no movie cards. See [Run without a key](#run-without-a-key).

## Run

```bash
npm install
npm test
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run build
npm start
```

## Demo

Live demo: [https://taste-mediator.vercel.app/](https://taste-mediator.vercel.app/). `QLOO_API_KEY` is set on the Vercel server environment. A same-day smoke check on 2026-10-17 passed: **Mediate** returns real Qloo results for the locked seeds.

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
- **What Qloo was asked** — the GET search and insights steps, without the key.

A missing key, a rejected key, a rate limit, or an upstream failure clears recommendation titles. Seed notes appear only when search ran and a side still could not be resolved. Those notes are about the seeds you selected.

## How to verify a real API call

Set `QLOO_API_KEY` on the server, open the app, and use the browser developer tools.

1. Press **Mediate** and watch the Network panel. The only request the browser makes is `POST /api/mediate`.
2. Open that response. `steps` lists `GET /search` for each selected title, then `GET /v2/insights` twice. The server sends those to `https://hackathon.api.qloo.com`.
3. The browser request does not carry `X-Api-Key` or `QLOO_API_KEY`. The key stays in the server environment.
4. Remove the key and press **Mediate** again. The response is HTTP 503 `missing_key`, and the zones clear.
5. With a key, the safe zone is the titles whose `entityId` is in both insight lists. The two pulls are not averaged. If that intersection is empty, the page says to take turns and does not invent a title.

## Honest empty set

Overlap is the set of `entityId` values that appear in both insights pulls. A matching title with two different ids is not a match. When that intersection is empty, the safe zone is an empty set: a short explanation, the count on each side, and no movie card. The page does not borrow a title from A only or B only to fill it.

Search `429` and insights `429` clear every recommendation title. The page says which call was limited. An insights failure does not keep the other person's list. Upstream error text is shown only when it is short and has no key material.

### Run locally

```bash
npm install
npm test
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The browser only calls `POST /api/mediate`. Put `QLOO_API_KEY` in `.env.local` when you want live Qloo data.

### Run without a key

Leave `QLOO_API_KEY` unset. An empty `.env.local` copied from `.env.example` is enough. The page loads and the banner says Qloo is not connected.

Press **Mediate**. Expect **HTTP 503** and a JSON body with `"ok": false` and `"code": "missing_key"`. The results area uses the same status layout as a search or insights failure: a heading, a Search row, a Mediate row, and no movie card.

```bash
curl -s -D - \
  -H "Content-Type: application/json" \
  -d '{"personA":[{"title":"The Shining","year":1980},{"title":"Hereditary","year":2018}],"personB":[{"title":"Notting Hill","year":1999},{"title":"Love Actually","year":2003}]}' \
  http://localhost:3000/api/mediate
```

The status line is `503`. The body code is `missing_key`. No `steps` are recorded, because the key check happens before any Qloo call.

### How tests stub Qloo

There is no runtime movie stub and no sample list in the client. Loading shows a status skeleton (bars, not posters or titles). An empty overlap and an empty conflict column stay empty.

`npm test` calls `mediate()` with a `fetchImpl`. That function is the stub: it returns canned JSON for `GET /search` and `GET /v2/insights` and does not open a socket to `https://hackathon.api.qloo.com`. A blank key still returns 503 `missing_key` before `fetchImpl` is used. The suite includes a zero-intersection case and a rate limit. It is not a live Qloo check.

### HOLD — Devpost

Devpost submission is only by the human owner. Do not submit from this repository, from an agent, or from CI. This tree does not call Devpost.

## Stage 1 checklist

- [x] **Demo URL** — live at [https://taste-mediator.vercel.app/](https://taste-mediator.vercel.app/).
- [x] **Public repo** — this public GitHub repository: [bennyjiahong-prog/taste-mediator](https://github.com/bennyjiahong-prog/taste-mediator).
- [x] **Real API** — `QLOO_API_KEY` is set on the Vercel server environment. Never commit the key, and never prefix it with `NEXT_PUBLIC_`. Mediate performs live `GET /search` and two `GET /v2/insights` calls. A same-day smoke check on 2026-10-17 passed: Mediate returns real Qloo results for the locked seeds. A missing key or an API failure clears the results. No stand-in list is shipped in the client.
- [x] **Open source** — MIT. See [./LICENSE](./LICENSE).

The public path is this GitHub repository and the live demo above. Origin repositories `taste-mediator` and `taste-mediator-public` stay private. They are an optional private backup, not the submission judges should use.

HOLD: Devpost submission is only by the human owner. This repository does not submit.

## License

[MIT](./LICENSE)
