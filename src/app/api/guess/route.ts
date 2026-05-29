import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { parseModelJson } from "@/lib/parseModelJson";
import { redis, PUZZLE_TTL_SECONDS } from "@/lib/redis";
import { checkRateLimit } from "@/lib/rateLimit";

const client = new Anthropic();

interface StoredPuzzle {
  title: string;
  acceptable_answers: string[];
  hints: string[];
  hintsRevealed: number;
}

interface JudgeResponse {
  correct: boolean;
  reason: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function getIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

export async function POST(req: NextRequest) {
  const ip = getIp(req);
  const allowed = await checkRateLimit(ip, "guess", 60, 60 * 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const { puzzleId, guess } = body as { puzzleId?: string; guess?: string };

  if (!puzzleId || typeof guess !== "string") {
    return NextResponse.json({ error: "Missing puzzleId or guess" }, { status: 400 });
  }

  const raw = await redis.get<string>(`puzzle:${puzzleId}`);
  if (!raw) {
    return NextResponse.json({ error: "Puzzle not found or expired" }, { status: 404 });
  }

  const puzzle: StoredPuzzle = typeof raw === "string" ? JSON.parse(raw) : raw;

  // Local normalised check — free, instant
  const normGuess = norm(guess);
  if (puzzle.acceptable_answers.map(norm).includes(normGuess)) {
    return NextResponse.json({ correct: true });
  }

  // Claude judge on miss
  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 256,
      temperature: 0,
      system: `You judge whether a user's guess matches a movie title.
Accept minor typos, word-order swaps, missing articles ("the"), and common alternate names. Reject genuinely different movies.
Return ONLY JSON: { "correct": boolean, "reason": "short string" }`,
      messages: [
        {
          role: "user",
          content: `Title: "${puzzle.title}". Guess: "${guess}".`,
        },
      ],
    });

    const block = response.content[0];
    if (block.type !== "text") throw new Error("Unexpected response type");

    const result = parseModelJson<JudgeResponse>(block.text);

    if (result.correct) {
      return NextResponse.json({ correct: true });
    }
  } catch {
    // Fall through to wrong-guess path if Claude fails
  }

  // Wrong guess — reveal next hint if available
  const hintIndex = puzzle.hintsRevealed ?? 0;
  const hint = puzzle.hints[hintIndex];

  if (hint !== undefined) {
    const updated: StoredPuzzle = { ...puzzle, hintsRevealed: hintIndex + 1 };
    await redis.setex(`puzzle:${puzzleId}`, PUZZLE_TTL_SECONDS, JSON.stringify(updated));
    return NextResponse.json({ correct: false, hint });
  }

  return NextResponse.json({ correct: false });
}
