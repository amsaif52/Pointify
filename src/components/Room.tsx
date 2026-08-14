"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { rememberName, useRememberedName, useSession } from "@/lib/client";
import { SCALES, getScale } from "@/lib/scales";
import { Button, Field, Input, Logo, cx } from "@/components/ui";
import type { PublicParticipant } from "@/lib/types";
import History from "@/components/History";

export default function Room({ sessionId }: { sessionId: string }) {
  const { session, you, status, act } = useSession(sessionId);
  const [error, setError] = useState("");

  const run = (action: string, extra?: Record<string, unknown>) => {
    setError("");
    act(action, extra).catch((e) =>
      setError(e instanceof Error ? e.message : "Something went wrong."),
    );
  };

  if (status === "missing") return <NotFound />;
  if (!session) return <Loading />;
  if (!you.present) {
    return <JoinGate sessionId={sessionId} onJoin={run} error={error} />;
  }

  const scale = getScale(session.scaleId);
  const me = session.participants.find((p) => p.id === you.slot);
  const voters = session.participants.filter((p) => !p.spectator);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <TopBar sessionId={sessionId} status={status} />

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-200"
        >
          {error}
        </p>
      ) : null}

      <div className="grid flex-1 gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-6">
          <StoryBar
            title={session.storyTitle}
            isAdmin={you.isAdmin}
            onSave={(title) => run("setStory", { title })}
            onNew={(title) => run("newStory", { title })}
          />

          <Table
            participants={session.participants}
            revealed={session.revealed}
            youSlot={you.slot}
          />

          <Results
            revealed={session.revealed}
            stats={session.stats}
            isAdmin={you.isAdmin}
            canReveal={session.stats.voted > 0}
            onReveal={() => run("reveal")}
            onClear={() => run("clear")}
            onNextRound={() => run("newRound")}
          />

          <Deck
            cards={scale.cards}
            myVote={you.vote}
            myHasVoted={me?.hasVoted ?? false}
            revealed={session.revealed}
            spectator={me?.spectator ?? false}
            onVote={(value) => run("vote", { value })}
          />
        </div>

        <aside className="flex flex-col gap-6">
          <People
            participants={session.participants}
            youSlot={you.slot}
            isAdmin={you.isAdmin}
            voted={session.stats.voted}
            voters={voters.length}
            onMakeAdmin={(slot) => run("makeAdmin", { slot })}
            onRemove={(slot) => run("remove", { slot })}
          />

          <ScalePicker
            current={session.scaleId}
            isAdmin={you.isAdmin}
            onPick={(scaleId) => run("setScale", { scaleId })}
          />

          <Spectate
            spectator={me?.spectator ?? false}
            onToggle={(spectator) => run("setSpectator", { spectator })}
          />

          <History
            entries={session.history}
            isAdmin={you.isAdmin}
            onClear={() => run("clearHistory")}
          />
        </aside>
      </div>
    </main>
  );
}

/* ---------------------------------------------------------------- chrome */

function TopBar({ sessionId, status }: { sessionId: string; status: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const url = `${window.location.origin}/session/${sessionId}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("Copy the invite link:", url);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const live = status === "live";
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-4">
        <Link href="/" className="focus-ring rounded-lg">
          <Logo />
        </Link>
        <span className="hidden h-5 w-px bg-ink-600/70 sm:block" />
        <span className="hidden items-center gap-2 text-sm text-ink-400 sm:flex">
          Room
          <code className="rounded-md border border-ink-600/70 bg-ink-800/70 px-2 py-0.5 font-mono text-ink-100">
            {sessionId}
          </code>
        </span>
      </div>

      <div className="flex items-center gap-3">
        <span
          title={live ? "Live updates" : "Reconnecting"}
          className="flex items-center gap-1.5 text-xs text-ink-400"
        >
          <span
            className={cx(
              "h-1.5 w-1.5 rounded-full",
              live ? "bg-brand-500" : "bg-gold-500 animate-pulse",
            )}
          />
          {live ? "Live" : status === "polling" ? "Polling" : "Connecting"}
        </span>
        <Button size="sm" onClick={copy}>
          {copied ? "Link copied" : "Copy invite link"}
        </Button>
      </div>
    </header>
  );
}

function StoryBar({
  title,
  isAdmin,
  onSave,
  onNew,
}: {
  title: string;
  isAdmin: boolean;
  onSave: (t: string) => void;
  onNew: (t: string) => void;
}) {
  const [draft, setDraft] = useState(title);
  const focused = useRef(false);

  // Let remote edits through, but never yank the field out from under a typist.
  useEffect(() => {
    if (!focused.current) setDraft(title);
  }, [title]);

  if (!isAdmin) {
    return (
      <div className="panel px-5 py-4">
        <p className="text-xs font-medium tracking-wide text-ink-400 uppercase">
          Now estimating
        </p>
        <p className="mt-1 text-lg font-medium text-balance">
          {title || <span className="text-ink-400">Waiting for the host…</span>}
        </p>
      </div>
    );
  }

  return (
    <div className="panel flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-end">
      <div className="flex-1">
        <Field label="Now estimating">
          <Input
            value={draft}
            placeholder="PROJ-482 — Add SSO to the admin console"
            maxLength={200}
            onFocus={() => (focused.current = true)}
            onBlur={() => {
              focused.current = false;
              if (draft !== title) onSave(draft);
            }}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        </Field>
      </div>
      <Button
        onClick={() => {
          focused.current = false;
          onNew(draft);
        }}
        className="shrink-0"
      >
        Start new story
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------- the table */

function Table({
  participants,
  revealed,
  youSlot,
}: {
  participants: PublicParticipant[];
  revealed: boolean;
  youSlot: string | null;
}) {
  const voters = participants.filter((p) => !p.spectator);

  return (
    <div className="panel relative overflow-hidden px-5 py-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-8 inset-y-4 rounded-[3rem] border border-brand-500/10 bg-brand-500/[0.04]"
      />
      {voters.length === 0 ? (
        <p className="relative py-8 text-center text-ink-400">
          Everyone is spectating. Switch someone to voting to get started.
        </p>
      ) : (
        <ul className="relative flex flex-wrap justify-center gap-4">
          {voters.map((p) => (
            <li key={p.id} className="pop-in flex w-24 flex-col items-center gap-2">
              <VoteCard
                value={p.vote}
                hasVoted={p.hasVoted}
                revealed={revealed}
              />
              <span
                className={cx(
                  "max-w-full truncate text-sm",
                  p.id === youSlot ? "font-semibold text-brand-400" : "text-ink-300",
                )}
                title={p.name}
              >
                {p.name}
                {p.id === youSlot ? " (you)" : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function VoteCard({
  value,
  hasVoted,
  revealed,
}: {
  value: string | null;
  hasVoted: boolean;
  revealed: boolean;
}) {
  const showFace = revealed && hasVoted;
  return (
    <div className="[perspective:900px]">
      <div
        className={cx(
          "flip relative h-24 w-16 rounded-xl",
          showFace && "is-revealed",
        )}
      >
        <div
          className={cx(
            "flip-face absolute inset-0 grid place-items-center rounded-xl border transition-colors",
            hasVoted
              ? "border-brand-500/50 bg-ink-700/80 shadow-[0_0_0_1px_rgba(52,211,153,0.15)]"
              : "border-dashed border-ink-600/80 bg-ink-800/40",
          )}
        >
          {hasVoted ? (
            <span className="text-2xl text-brand-500">◆</span>
          ) : (
            <span className="text-xs text-ink-400">waiting</span>
          )}
        </div>
        <div className="flip-face flip-back absolute inset-0 grid place-items-center rounded-xl border border-brand-500/60 bg-linear-to-b from-ink-700 to-ink-800 font-mono text-2xl font-semibold text-brand-400">
          {value ?? "—"}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- results/deck */

function Results({
  revealed,
  stats,
  isAdmin,
  canReveal,
  onReveal,
  onClear,
  onNextRound,
}: {
  revealed: boolean;
  stats: {
    average: number | null;
    consensus: boolean;
    voted: number;
    voters: number;
    tally: { value: string; count: number }[];
  };
  isAdmin: boolean;
  canReveal: boolean;
  onReveal: () => void;
  onClear: () => void;
  onNextRound: () => void;
}) {
  return (
    <div className="panel flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {revealed ? (
          <>
            <Stat
              label="Average"
              value={stats.average === null ? "n/a" : String(stats.average)}
            />
            <Stat
              label="Result"
              value={stats.consensus ? "Consensus" : "Split"}
              accent={stats.consensus}
            />
            <div className="flex flex-wrap items-center gap-1.5">
              {stats.tally.map((t) => (
                <span
                  key={t.value}
                  className="rounded-lg border border-ink-600/70 bg-ink-800/70 px-2 py-1 font-mono text-xs"
                >
                  {t.value}
                  <span className="ml-1.5 text-ink-400">×{t.count}</span>
                </span>
              ))}
            </div>
          </>
        ) : (
          <Stat label="Votes in" value={`${stats.voted} / ${stats.voters}`} />
        )}
      </div>

      {isAdmin ? (
        <div className="flex shrink-0 flex-wrap gap-2">
          {revealed ? (
            <>
              <Button onClick={onClear}>Re-vote</Button>
              <Button variant="primary" onClick={onNextRound}>
                Next story
              </Button>
            </>
          ) : (
            <>
              <Button onClick={onClear} disabled={stats.voted === 0}>
                Clear votes
              </Button>
              <Button variant="primary" onClick={onReveal} disabled={!canReveal}>
                Reveal votes
              </Button>
            </>
          )}
        </div>
      ) : (
        <p className="shrink-0 text-sm text-ink-400">
          {revealed ? "Votes are in." : "The host reveals the votes."}
        </p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <p className="text-xs tracking-wide text-ink-400 uppercase">{label}</p>
      <p
        className={cx(
          "font-mono text-2xl font-semibold",
          accent ? "text-brand-400" : "text-ink-100",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function Deck({
  cards,
  myVote,
  myHasVoted,
  revealed,
  spectator,
  onVote,
}: {
  cards: string[];
  myVote: string | null;
  myHasVoted: boolean;
  revealed: boolean;
  spectator: boolean;
  onVote: (v: string) => void;
}) {
  if (spectator) {
    return (
      <p className="panel px-5 py-6 text-center text-sm text-ink-400">
        You are spectating — switch to voting in the sidebar to pick a card.
      </p>
    );
  }

  return (
    <div className="panel px-5 py-5">
      <p className="mb-3 text-xs font-medium tracking-wide text-ink-400 uppercase">
        {revealed ? "Deck locked until the next round" : "Pick your card"}
      </p>
      <div className="flex flex-wrap gap-2.5">
        {cards.map((card) => {
          const selected = myHasVoted && myVote === card;
          // Your own card comes back on the `you` payload, but if a round of
          // state lands before it does, fall back to "something is selected".
          const unknownSelection = myHasVoted && myVote === null;
          return (
            <button
              key={card}
              disabled={revealed}
              onClick={() => onVote(card)}
              aria-pressed={selected}
              className={cx(
                "focus-ring h-20 w-14 rounded-xl border font-mono text-lg font-semibold transition-all",
                "disabled:cursor-not-allowed disabled:opacity-40",
                selected
                  ? "-translate-y-1.5 border-brand-500 bg-brand-500 text-ink-950"
                  : "border-ink-600/70 bg-ink-800/70 text-ink-100 hover:-translate-y-1 hover:border-brand-500/60 hover:text-brand-400",
                unknownSelection && "border-ink-600",
              )}
            >
              {card}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- sidebar */

function People({
  participants,
  youSlot,
  isAdmin,
  voted,
  voters,
  onMakeAdmin,
  onRemove,
}: {
  participants: PublicParticipant[];
  youSlot: string | null;
  isAdmin: boolean;
  voted: number;
  voters: number;
  onMakeAdmin: (slot: string) => void;
  onRemove: (slot: string) => void;
}) {
  return (
    <section className="panel px-5 py-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Participants</h2>
        <span className="text-xs text-ink-400">
          {voted}/{voters} voted
        </span>
      </div>
      <ul className="space-y-1">
        {participants.map((p) => (
          <li
            key={p.id}
            className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-ink-800/60"
          >
            <span
              className={cx(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                p.spectator
                  ? "bg-ink-600"
                  : p.hasVoted
                    ? "bg-brand-500"
                    : "bg-ink-600",
              )}
            />
            <span className="min-w-0 flex-1 truncate text-sm" title={p.name}>
              {p.name}
              {p.id === youSlot ? (
                <span className="text-ink-400"> (you)</span>
              ) : null}
            </span>
            {p.isAdmin ? (
              <span className="rounded bg-gold-500/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-gold-400 uppercase">
                Host
              </span>
            ) : null}
            {p.spectator ? (
              <span className="text-[10px] tracking-wide text-ink-400 uppercase">
                Watching
              </span>
            ) : null}
            {isAdmin && p.id !== youSlot ? (
              <span className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                {!p.isAdmin ? (
                  <button
                    onClick={() => onMakeAdmin(p.id)}
                    title="Make host"
                    className="focus-ring rounded px-1 text-xs text-ink-400 hover:text-gold-400"
                  >
                    ★
                  </button>
                ) : null}
                <button
                  onClick={() => onRemove(p.id)}
                  title="Remove from session"
                  className="focus-ring rounded px-1 text-xs text-ink-400 hover:text-red-300"
                >
                  ✕
                </button>
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ScalePicker({
  current,
  isAdmin,
  onPick,
}: {
  current: string;
  isAdmin: boolean;
  onPick: (id: string) => void;
}) {
  const active = SCALES.find((s) => s.id === current);
  return (
    <section className="panel px-5 py-4">
      <h2 className="mb-3 text-sm font-semibold">Deck</h2>
      {isAdmin ? (
        <div className="space-y-1.5">
          {SCALES.map((s) => (
            <button
              key={s.id}
              onClick={() => onPick(s.id)}
              className={cx(
                "focus-ring block w-full rounded-lg border px-3 py-2 text-left transition-colors",
                s.id === current
                  ? "border-brand-500/50 bg-brand-500/10"
                  : "border-transparent hover:bg-ink-800/60",
              )}
            >
              <span className="block text-sm font-medium">{s.name}</span>
              <span className="block text-xs text-ink-400">{s.description}</span>
            </button>
          ))}
          <p className="pt-1 text-xs text-ink-400">
            Changing the deck clears the current round.
          </p>
        </div>
      ) : (
        <p className="text-sm text-ink-300">
          {active?.name}
          <span className="block text-xs text-ink-400">{active?.description}</span>
        </p>
      )}
    </section>
  );
}

function Spectate({
  spectator,
  onToggle,
}: {
  spectator: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <section className="panel flex items-center justify-between gap-3 px-5 py-4">
      <div>
        <h2 className="text-sm font-semibold">Spectator mode</h2>
        <p className="text-xs text-ink-400">Watch without casting a vote.</p>
      </div>
      <button
        role="switch"
        aria-checked={spectator}
        aria-label="Spectator mode"
        onClick={() => onToggle(!spectator)}
        className={cx(
          "focus-ring relative h-6 w-11 shrink-0 rounded-full transition-colors",
          spectator ? "bg-brand-500" : "bg-ink-600",
        )}
      >
        <span
          className={cx(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform",
            spectator ? "translate-x-5.5" : "translate-x-0.5",
          )}
        />
      </button>
    </section>
  );
}

/* ----------------------------------------------------------- entry states */

function JoinGate({
  sessionId,
  onJoin,
  error,
}: {
  sessionId: string;
  onJoin: (action: string, extra?: Record<string, unknown>) => void;
  error: string;
}) {
  const [name, setName] = useRememberedName();
  const [spectator, setSpectator] = useState(false);

  const submit = () => {
    if (!name.trim()) return;
    rememberName(name.trim());
    onJoin("join", { name: name.trim(), spectator });
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <Link href="/" className="focus-ring mx-auto mb-8 rounded-lg">
        <Logo />
      </Link>
      <div className="panel p-6">
        <h1 className="text-xl font-semibold">Join the session</h1>
        <p className="mt-1 mb-5 text-sm text-ink-400">
          Room{" "}
          <code className="font-mono text-ink-300">{sessionId}</code>
        </p>

        <Field label="Your name">
          <Input
            value={name}
            autoFocus
            maxLength={40}
            placeholder="Alex"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </Field>

        <label className="mt-4 flex items-center gap-2.5 text-sm text-ink-300">
          <input
            type="checkbox"
            checked={spectator}
            onChange={(e) => setSpectator(e.target.checked)}
            className="focus-ring h-4 w-4 rounded border-ink-600 bg-ink-800 accent-brand-500"
          />
          Join as a spectator
        </label>

        <Button
          variant="primary"
          className="mt-6 w-full py-3"
          onClick={submit}
          disabled={!name.trim()}
        >
          Join session
        </Button>

        {error ? (
          <p role="alert" className="mt-4 text-sm text-red-300">
            {error}
          </p>
        ) : null}
      </div>
    </main>
  );
}

function Loading() {
  return (
    <main className="grid min-h-dvh place-items-center px-5">
      <p className="text-sm text-ink-400">Connecting to the room…</p>
    </main>
  );
}

function NotFound() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-md place-items-center px-5 text-center">
      <div>
        <Logo className="mb-6" />
        <h1 className="text-2xl font-semibold">That room is gone</h1>
        <p className="mt-2 text-ink-400">
          Sessions expire 12 hours after their last vote. Check the code, or
          start a fresh one.
        </p>
        <Link
          href="/"
          className="focus-ring mt-6 inline-flex rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-ink-950 hover:bg-brand-400"
        >
          Start a new session
        </Link>
      </div>
    </main>
  );
}
