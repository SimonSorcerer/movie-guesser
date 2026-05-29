import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { isValidIcon, FALLBACK_ICON } from "@/lib/icons";
import { parseModelJson } from "@/lib/parseModelJson";
import { redis, PUZZLE_TTL_SECONDS } from "@/lib/redis";

const client = new Anthropic();

const SYSTEM_PROMPT = `You create icon-rebus movie puzzles. Pick ONE well-known, widely-recognized movie (broad international fame, not niche).

Encode its title as 2–4 Google Material Symbols icons that phonetically or semantically hint the title.

Rules:
- Use ONLY real Material Symbols icon names, snake_case.
- Prefer icons whose meaning maps clearly to a word or sound in the title.
- Return ONLY valid JSON. No markdown, no commentary.

JSON shape:
{
  "title": "canonical movie title",
  "icons": ["icon_name", ...],
  "acceptable_answers": ["lowercase variant", ...],
  "hints": ["vague hint", "more specific hint"]
}`;

interface PuzzleResponse {
  title: string;
  icons: string[];
  acceptable_answers: string[];
  hints: string[];
}

async function callClaude(messages: Anthropic.MessageParam[]): Promise<string> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    temperature: 0.9,
    system: SYSTEM_PROMPT,
    messages,
  });
  const block = response.content[0];
  if (block.type !== "text") throw new Error("Unexpected response type");
  return block.text;
}

function validateAndFixIcons(icons: string[]): string[] {
  return icons.map((name) => (isValidIcon(name) ? name : FALLBACK_ICON));
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const recentTitles: string[] = body.recentTitles ?? [];

  const userMessage =
    recentTitles.length > 0
      ? `Generate a new puzzle. Avoid these recent titles: ${recentTitles.join(", ")}.`
      : "Generate a new puzzle.";

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  let puzzle: PuzzleResponse;

  try {
    const firstText = await callClaude(messages);
    puzzle = parseModelJson<PuzzleResponse>(firstText);

    const badIcons = puzzle.icons.filter((n) => !isValidIcon(n));
    if (badIcons.length > 0) {
      const retryMessages: Anthropic.MessageParam[] = [
        ...messages,
        { role: "assistant", content: firstText },
        {
          role: "user",
          content: `These names are not valid Material Symbols: ${badIcons.join(", ")}. Replace only those icons and return the full JSON again.`,
        },
      ];
      const retryText = await callClaude(retryMessages);
      puzzle = parseModelJson<PuzzleResponse>(retryText);
    }
  } catch {
    return NextResponse.json(
      { error: "Failed to generate puzzle, please try again" },
      { status: 503 }
    );
  }

  puzzle.icons = validateAndFixIcons(puzzle.icons);

  const puzzleId = crypto.randomUUID();

  await redis.setex(
    `puzzle:${puzzleId}`,
    PUZZLE_TTL_SECONDS,
    JSON.stringify({
      title: puzzle.title,
      acceptable_answers: puzzle.acceptable_answers,
      hints: puzzle.hints,
      hintsRevealed: 0,
    })
  );

  return NextResponse.json({ puzzleId, icons: puzzle.icons });
}
