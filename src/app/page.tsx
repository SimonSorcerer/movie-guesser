"use client";

import { useState, useEffect, useRef } from "react";

type Status = "idle" | "loading" | "playing" | "won";

interface GameState {
  puzzleId: string | null;
  icons: string[];
  guess: string;
  guessCount: number;
  revealedHints: string[];
  status: Status;
  error: string | null;
  recentTitles: string[];
}

const initialState: GameState = {
  puzzleId: null,
  icons: [],
  guess: "",
  guessCount: 0,
  revealedHints: [],
  status: "idle",
  error: null,
  recentTitles: [],
};

export default function Home() {
  const [state, setState] = useState<GameState>(initialState);
  const inputRef = useRef<HTMLInputElement>(null);

  async function loadPuzzle(recentTitles: string[]) {
    setState((s) => ({ ...s, status: "loading", error: null }));
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recentTitles }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate puzzle");
      setState((s) => ({
        ...s,
        puzzleId: data.puzzleId,
        icons: data.icons,
        guess: "",
        guessCount: 0,
        revealedHints: [],
        status: "playing",
        recentTitles: [...recentTitles, data.puzzleId].slice(-5),
      }));
      inputRef.current?.focus();
    } catch (e) {
      setState((s) => ({
        ...s,
        status: "idle",
        error: e instanceof Error ? e.message : "Something went wrong",
      }));
    }
  }

  async function submitGuess() {
    if (!state.puzzleId || !state.guess.trim() || state.status !== "playing") return;
    const res = await fetch("/api/guess", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ puzzleId: state.puzzleId, guess: state.guess }),
    });
    const data = await res.json();
    if (data.correct) {
      setState((s) => ({ ...s, status: "won" }));
    } else {
      setState((s) => ({
        ...s,
        guessCount: s.guessCount + 1,
        revealedHints: data.hint
          ? [...s.revealedHints, data.hint]
          : s.revealedHints,
        guess: "",
      }));
      inputRef.current?.focus();
    }
  }

  useEffect(() => {
    loadPuzzle([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isPlaying = state.status === "playing";
  const isLoading = state.status === "loading";

  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-4 gap-10">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">Movie Guesser</h1>
        <p className="mt-2 text-sm text-gray-500">Guess the movie from the icons</p>
      </div>

      {/* Icon row */}
      <div className="flex items-center justify-center gap-6 min-h-[80px]">
        {isLoading && (
          <span className="text-gray-400 text-lg animate-pulse">Generating puzzle…</span>
        )}
        {!isLoading && state.icons.map((icon, i) => (
          <span
            key={i}
            className="material-symbols-outlined"
            style={{ fontSize: "72px" }}
          >
            {icon}
          </span>
        ))}
      </div>

      {/* Win state */}
      {state.status === "won" && (
        <div className="flex flex-col items-center gap-4">
          <p className="text-2xl font-semibold text-green-600">You got it!</p>
          <button
            onClick={() => loadPuzzle(state.recentTitles)}
            className="px-6 py-2 rounded-full bg-black text-white text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            New puzzle
          </button>
        </div>
      )}

      {/* Guess form */}
      {isPlaying && (
        <div className="flex flex-col items-center gap-4 w-full max-w-sm">
          <div className="flex w-full gap-2">
            <input
              ref={inputRef}
              type="text"
              value={state.guess}
              onChange={(e) => setState((s) => ({ ...s, guess: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && submitGuess()}
              placeholder="Type a movie title…"
              className="flex-1 px-4 py-2 rounded-full border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            />
            <button
              onClick={submitGuess}
              disabled={!state.guess.trim()}
              className="px-5 py-2 rounded-full bg-black text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-40 transition-colors"
            >
              Guess
            </button>
          </div>

          {state.guessCount > 0 && (
            <p className="text-xs text-gray-400">
              {state.guessCount} incorrect guess{state.guessCount !== 1 ? "es" : ""}
            </p>
          )}
        </div>
      )}

      {/* Hints */}
      {state.revealedHints.length > 0 && (
        <div className="flex flex-col items-center gap-2 max-w-sm w-full">
          {state.revealedHints.map((hint, i) => (
            <div
              key={i}
              className="w-full px-4 py-2 rounded-lg bg-gray-100 text-sm text-gray-700 text-center"
            >
              <span className="font-medium text-gray-400 text-xs uppercase tracking-wide mr-2">
                Hint {i + 1}
              </span>
              {hint}
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {state.error && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-red-500">{state.error}</p>
          <button
            onClick={() => loadPuzzle(state.recentTitles)}
            className="px-5 py-2 rounded-full border border-gray-300 text-sm hover:bg-gray-50 transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {/* Idle / start */}
      {state.status === "idle" && !state.error && (
        <button
          onClick={() => loadPuzzle([])}
          className="px-6 py-2 rounded-full bg-black text-white text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          Start
        </button>
      )}
    </main>
  );
}
