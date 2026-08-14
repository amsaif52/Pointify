"use client";

import { useState } from "react";
import { getScale } from "@/lib/scales";
import type { HistoryEntry } from "@/lib/types";
import { cx } from "@/components/ui";

export default function History({
  entries,
  isAdmin,
  onClear,
}: {
  entries: HistoryEntry[];
  isAdmin: boolean;
  onClear: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <section className="panel px-5 py-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">History</h2>
        {isAdmin && entries.length > 0 ? (
          <button
            onClick={onClear}
            className="focus-ring rounded text-xs text-ink-400 hover:text-red-300"
          >
            Clear
          </button>
        ) : null}
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-ink-400">
          Finished rounds land here with their average and every card played.
        </p>
      ) : (
        <ul className="-mx-2 max-h-80 space-y-0.5 overflow-y-auto">
          {entries.map((e) => {
            const expanded = open === e.id;
            return (
              <li key={e.id}>
                <button
                  onClick={() => setOpen(expanded ? null : e.id)}
                  aria-expanded={expanded}
                  className="focus-ring flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-ink-800/60"
                >
                  <span className="min-w-0 flex-1 truncate text-sm" title={e.title}>
                    {e.title}
                  </span>
                  <span
                    className={cx(
                      "shrink-0 rounded px-1.5 py-0.5 font-mono text-xs",
                      e.consensus
                        ? "bg-brand-500/15 text-brand-400"
                        : "bg-ink-700/70 text-ink-300",
                    )}
                  >
                    {e.average ?? summarize(e)}
                  </span>
                </button>

                {expanded ? (
                  <div className="mx-2 mb-2 rounded-lg border border-ink-600/50 bg-ink-900/50 px-3 py-2">
                    <p className="mb-1.5 text-[11px] tracking-wide text-ink-400 uppercase">
                      {getScale(e.scaleId).name} ·{" "}
                      {new Date(e.finishedAt).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                    <ul className="space-y-0.5">
                      {e.votes.map((v, i) => (
                        <li
                          key={`${v.name}-${i}`}
                          className="flex justify-between gap-3 text-xs"
                        >
                          <span className="truncate text-ink-300">{v.name}</span>
                          <span className="font-mono text-ink-100">{v.value}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Non-numeric decks have no average, so show the winning card instead. */
function summarize(e: HistoryEntry): string {
  const counts = new Map<string, number>();
  for (const v of e.votes) counts.set(v.value, (counts.get(v.value) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : "—";
}
