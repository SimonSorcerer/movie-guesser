# SPEC.md — Pictogram Movie Game

Design document. Source of truth for behaviour, prompts, and data shapes.

## Goal

A small, visually appealing web game that demonstrates working with an LLM API.
The model does two distinct jobs:

1. **Constrained generation** — pick a famous movie, encode its title as
   validated Material Symbols icons.
2. **Fuzzy evaluation** — judge whether a free-text guess matches the title,
   tolerating typos, word order, and missing articles.

The validation layer between generation and display is the deliberate
engineering signal: the app does not trust raw model output.

## Architecture

```
Browser ──> POST /api/generate ──> Claude (generate)
                                       │
                                       ▼
                                  validate icon names
                                  (retry once, then fallback)
                                       │
                                       ▼
                              return { puzzleId, icons }     (NO title)

Browser ──> POST /api/guess ──> local exact-match check (free, instant)
                                       │ miss
                                       ▼
                                  Claude (judge, temp 0)
                                       │
                                       ▼
                              return { correct, hint? }
```

### State handling

The title and acceptable answers must not reach the browser. Options:

- **Simplest (demo):** store `{ puzzleId → { title, acceptable_answers, hints } }`
  in Vercel KV with a short TTL. `/api/guess` looks it up by `puzzleId`.
- Alternative: encrypt the payload into an opaque token sent to the client and
  decrypt it on guess. More work, no DB. KV is recommended for clarity.

## Call 1 — Generate

- `temperature`: ~0.9
- Pass the last few titles to avoid repeats.

**System prompt**

```
You create icon-rebus movie puzzles. Pick ONE well-known, widely-recognized
movie (broad international fame, not niche).

Encode its title as 2–4 Google Material Symbols icons that phonetically or
semantically hint the title.

Rules:
- Use ONLY real Material Symbols icon names, snake_case.
- Prefer icons whose meaning maps clearly to a word or sound in the title.
- Return ONLY valid JSON. No markdown, no commentary.

JSON shape:
{
  "title": "canonical movie title",
  "icons": ["icon_name", ...],            // 2 to 4 names
  "acceptable_answers": ["lowercase variant", ...],
  "hints": ["vague hint", "more specific hint"]
}
```

**User message**

```
Generate a new puzzle. Avoid these recent titles: [<titles>].
```

## Validation step

```js
const valid = new Set(iconNames); // from material-symbols-names.json
let puzzle = parseModelJson(modelText);
const bad = puzzle.icons.filter((n) => !valid.has(n));

if (bad.length) {
    // one retry: send the same context plus
    // "These names are not valid Material Symbols: [...]. Replace only those."
}
// any still-invalid name → swap for a generic fallback ("help")
```

The icon name list is fetched once from the font's `codepoints` file or
`https://fonts.google.com/metadata/icons`, parsed to a string array, and
committed as `material-symbols-names.json`. Never fetched per request.

## Call 2 — Evaluate

Local check first (no API cost):

```js
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
if (puzzle.acceptable_answers.map(norm).includes(norm(guess))) return CORRECT;
```

Only on a miss, ask the model:

- `temperature`: 0

**System prompt**

```
You judge whether a user's guess matches a movie title.
Accept minor typos, word-order swaps, missing articles ("the"), and common
alternate names. Reject genuinely different movies.
Return ONLY JSON: { "correct": boolean, "reason": "short string" }
```

**User message**

```
Title: "<title>". Guess: "<guess>".
```

On a wrong guess, reveal the next unused entry from `hints`.

## Shared helper

````js
function parseModelJson(text) {
    const cleaned = text.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned); // caller wraps in try/catch + one retry
}
````

## Frontend

- Load Material Symbols via one CSS `<link>`. Render an icon with
  `<span class="material-symbols-outlined">{name}</span>`.
- State: `puzzleId`, `icons`, `guessCount`, `revealedHints`, `status`.
  `useState` (or a plain object in vanilla) is enough.
- Layout: large icon row, text input, "Guess" button, "Hint" button,
  win state with a small animation, "New puzzle" button.
- Keep styling clean and modern — this is the visual showcase.

## Endpoints

| Method | Path            | Body                          | Returns               |
| ------ | --------------- | ----------------------------- | --------------------- |
| POST   | `/api/generate` | `{ recentTitles?: string[] }` | `{ puzzleId, icons }` |
| POST   | `/api/guess`    | `{ puzzleId, guess }`         | `{ correct, hint? }`  |

## Guardrails

- **Rate limit** `/api/generate` and `/api/guess` by IP (Vercel KV counter).
  The endpoint is public and uses your key — cap it.
- **Env:** `ANTHROPIC_API_KEY` set in Vercel project settings, never committed.
- **Errors:** if the model fails twice, return a friendly error and let the UI
  offer "try again" rather than crashing.

## Out of scope (intentionally)

Accounts, leaderboards, difficulty levels, image generation, sound. Keep the
surface small; the point is to demonstrate clean LLM integration, not features.
