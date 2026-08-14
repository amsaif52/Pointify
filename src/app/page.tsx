"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Logo } from "@/components/ui";
import { rememberName, useRememberedName } from "@/lib/client";
import { SCALES } from "@/lib/scales";

export default function Home() {
  const router = useRouter();
  const [name, setName] = useRememberedName();
  const [joinId, setJoinId] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState("");

  async function create() {
    if (!name.trim()) return setError("Enter your name to start a session.");
    setError("");
    setBusy("create");
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start the session.");
      rememberName(name.trim());
      router.push(`/session/${data.sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the session.");
      setBusy(null);
    }
  }

  function join() {
    const id = joinId.trim().toLowerCase().replace(/.*\/session\//, "").split(/[/?#]/)[0];
    if (!name.trim() || !id) {
      return setError("Enter your name and a room code to join.");
    }
    rememberName(name.trim());
    setBusy("join");
    router.push(`/session/${id}`);
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-5 py-8">
      <header className="flex items-center justify-between">
        <Logo />
        <a
          href="https://github.com"
          className="text-sm text-ink-400 transition-colors hover:text-ink-100"
        >
          No signup. No cost.
        </a>
      </header>

      <div className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        <section>
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-500/25 bg-brand-500/10 px-3 py-1 text-xs font-medium text-brand-400">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
            Real-time estimation
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Planning poker your team will actually{" "}
            <span className="text-brand-400">finish on time</span>.
          </h1>
          <p className="mt-5 max-w-lg text-lg text-ink-300">
            Create a room, drop the link in your standup channel, and everyone
            votes at once. Cards stay hidden on the server until you reveal, so
            nobody anchors on the first number.
          </p>

          <ul className="mt-8 grid gap-3 text-sm text-ink-300 sm:grid-cols-2">
            {[
              "Five decks, from Fibonacci to t-shirts",
              "Votes hidden until the reveal",
              "Average and consensus, computed live",
              "Story history for the whole session",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <svg
                  viewBox="0 0 20 20"
                  className="mt-0.5 h-4 w-4 shrink-0 text-brand-500"
                  fill="currentColor"
                  aria-hidden
                >
                  <path d="M8.1 13.6 5 10.5l-1.3 1.3 4.4 4.4 8.2-8.2-1.3-1.3z" />
                </svg>
                {item}
              </li>
            ))}
          </ul>

          <div className="mt-10 flex flex-wrap gap-2">
            {SCALES.map((s) => (
              <span
                key={s.id}
                title={s.description}
                className="rounded-lg border border-ink-600/60 bg-ink-800/50 px-2.5 py-1 font-mono text-xs text-ink-400"
              >
                {s.cards.slice(0, 5).join("  ")} …
              </span>
            ))}
          </div>
        </section>

        <section className="panel p-6 sm:p-7">
          <div className="space-y-5">
            <Field label="Your name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex"
                maxLength={40}
                autoComplete="nickname"
                onKeyDown={(e) => e.key === "Enter" && create()}
              />
            </Field>

            <Button
              variant="primary"
              className="w-full py-3"
              onClick={create}
              disabled={busy !== null}
            >
              {busy === "create" ? "Starting…" : "Start a new session"}
            </Button>

            <div className="flex items-center gap-3 text-xs text-ink-400">
              <span className="h-px flex-1 bg-ink-600/60" />
              or join one
              <span className="h-px flex-1 bg-ink-600/60" />
            </div>

            <Field label="Room code" hint="The code from your invite link.">
              <Input
                value={joinId}
                onChange={(e) => setJoinId(e.target.value)}
                placeholder="k4m2p9xt"
                className="font-mono"
                onKeyDown={(e) => e.key === "Enter" && join()}
              />
            </Field>

            <Button
              className="w-full py-3"
              onClick={join}
              disabled={busy !== null}
            >
              {busy === "join" ? "Joining…" : "Join session"}
            </Button>

            {error ? (
              <p role="alert" className="text-sm text-red-300">
                {error}
              </p>
            ) : null}
          </div>
        </section>
      </div>

      <footer className="border-t border-ink-700/60 pt-6 text-sm text-ink-400">
        Rooms clear themselves 12 hours after the last vote.
      </footer>
    </main>
  );
}
