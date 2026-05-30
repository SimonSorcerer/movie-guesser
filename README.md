# Movie Guesser

<img src="public/screenshot.png" width="48%" /> <img src="public/screenshot2.png" width="48%" />

**[Live demo →](https://movie-guesser-two.vercel.app)**

A small web game that demonstrates two practical LLM integration patterns: constrained generation and fuzzy evaluation. Guess the movie from a row of Google Material Symbols icons.

## How it works

**Generating a puzzle** — the server asks Claude (Sonnet) to pick a movie and encode its title as 1–5 Material Symbols icons. Every icon name is validated against the full 4,200-name icon list before being shown; invalid names trigger a retry, and any still-invalid names fall back to a generic icon. The movie title never leaves the server.

**Variety** — LLMs have a probability distribution over their outputs and tend to favour the same "obvious" films without intervention. To counteract this, each request randomly picks a genre and an abstract theme (e.g. "thriller" + "betrayal") and injects them into the prompt, shifting the model's distribution toward a different region of the film space. A server-side list of recent titles is also passed to the model to prevent short-term repeats.

**Judging a guess** — a local normalised string check runs first (free, instant). On a miss, Claude (Haiku) judges whether the guess is close enough, tolerating typos, missing articles, and alternate titles. Wrong guesses progressively reveal up to five hints, the last two of which are algorithmically generated from the title.

**State** — puzzle answers are stored in Upstash Redis with a 24-hour TTL, keyed by a random `puzzleId`. The browser only ever sees icons and a puzzle ID.

## Stack

- [Next.js 16](https://nextjs.org) — App Router, TypeScript
- [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript) — Claude Sonnet (generation) and Claude Haiku (judging)
- [Upstash Redis](https://upstash.com) — serverless puzzle state storage
- [Google Material Symbols](https://fonts.google.com/icons) — icon set
- [Tailwind CSS v4](https://tailwindcss.com)

---

Built by orchestrating [Claude Code](https://claude.ai/code).
