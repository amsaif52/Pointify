import { customAlphabet } from "nanoid";
import { DEFAULT_SCALE, getScale } from "./scales";
import { deleteSession } from "./store";
import type { Participant, PublicSession, Session } from "./types";

/** No look-alike characters — session IDs get read aloud over a call. */
export const newSessionId = customAlphabet("abcdefghjkmnpqrstuvwxyz23456789", 8);
export const newId = customAlphabet(
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  21,
);
/** Public, shareable handle for a participant. */
export const newSlot = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 10);

/** A participant is dropped once we haven't heard from their tab in a while. */
export const PRESENCE_TIMEOUT_MS = 60_000;

export function emptySession(adminId: string): Session {
  return {
    id: newSessionId(),
    v: 1,
    createdAt: Date.now(),
    scaleId: DEFAULT_SCALE,
    storyTitle: "",
    storyId: null,
    revealed: false,
    adminId,
    participants: {},
    history: [],
  };
}

/** Drops participants whose tab has gone away. */
export function prune(s: Session, now = Date.now()): Session {
  for (const [id, p] of Object.entries(s.participants)) {
    if (now - p.lastSeen > PRESENCE_TIMEOUT_MS) delete s.participants[id];
  }
  return s;
}

/**
 * The room belongs to its host: when they go, it goes with them. Reads
 * lastSeen directly instead of assuming prune has already run, so every caller
 * reaches the same verdict at the same instant.
 */
export function hostGone(s: Session, now = Date.now()): boolean {
  const host = s.participants[s.adminId];
  return !host || now - host.lastSeen > PRESENCE_TIMEOUT_MS;
}

/**
 * Clears the room once its host has left. Returns true when the session is
 * gone, in which case the caller must not serve its contents.
 */
export async function clearIfHostGone(
  s: Session,
  now = Date.now(),
): Promise<boolean> {
  if (!hostGone(s, now)) return false;
  await deleteSession(s.id);
  return true;
}

/**
 * Takes the participants to count rather than the whole session: the caller
 * decides who is in scope, so the average can never be computed over people
 * the rest of the payload has already filtered out.
 */
export function numericVotes(participants: Participant[]): number[] {
  return participants
    .filter((p) => !p.spectator && p.vote !== null)
    .map((p) => Number(p.vote))
    .filter((n) => Number.isFinite(n));
}

function mean(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
}

export function toPublic(s: Session, now = Date.now()): PublicSession {
  const entries = Object.entries(s.participants)
    .filter(([, p]) => now - p.lastSeen <= PRESENCE_TIMEOUT_MS)
    .sort((a, b) => a[1].joinedAt - b[1].joinedAt);

  const voters = entries.filter(([, p]) => !p.spectator);
  const cast = voters.filter(([, p]) => p.vote !== null);

  const average = mean(numericVotes(cast.map(([, p]) => p)));

  const counts = new Map<string, number>();
  for (const [, p] of cast) {
    if (p.vote) counts.set(p.vote, (counts.get(p.vote) ?? 0) + 1);
  }
  const tally = [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

  return {
    id: s.id,
    v: s.v,
    scaleId: s.scaleId,
    storyTitle: s.storyTitle,
    storyId: s.storyId,
    revealed: s.revealed,
    participants: entries.map(([id, p]) => ({
      id: p.slot,
      name: p.name,
      spectator: p.spectator,
      hasVoted: p.vote !== null,
      // Votes stay on the server until the reveal — hiding them in the UI
      // alone would leak them to anyone with devtools open.
      vote: s.revealed ? p.vote : null,
      isAdmin: id === s.adminId,
    })),
    history: s.history,
    stats: {
      // Everything derived from the actual card values has to wait for the
      // reveal. The average alone is enough to back out a hidden vote — with
      // two voters it gives it away exactly — and consensus leaks whether the
      // room already agrees, which is the anchoring this is meant to prevent.
      average: s.revealed ? average : null,
      consensus: s.revealed && cast.length > 1 && tally.length === 1,
      voted: cast.length,
      voters: voters.length,
      tally: s.revealed ? tally : [],
    },
  };
}

/** Snapshots the current round into history. Called on reveal→reset. */
export function archive(s: Session): void {
  const cast = Object.values(s.participants).filter(
    (p) => !p.spectator && p.vote !== null,
  );
  if (cast.length === 0) return;

  const values = new Set(cast.map((p) => p.vote));

  s.history.unshift({
    id: s.storyId ?? newId(),
    title: s.storyTitle || "Untitled story",
    scaleId: s.scaleId,
    average: mean(numericVotes(cast)),
    consensus: cast.length > 1 && values.size === 1,
    votes: cast.map((p) => ({ name: p.name, value: p.vote as string })),
    finishedAt: Date.now(),
  });
  s.history = s.history.slice(0, 50);
}

export function clearVotes(s: Session): void {
  for (const p of Object.values(s.participants)) p.vote = null;
  s.revealed = false;
}

export function isValidCard(s: Session, value: string): boolean {
  return getScale(s.scaleId).cards.includes(value);
}

/** Resolves a public slot back to the secret participant id. */
export function findBySlot(s: Session, slot: string): string | null {
  for (const [id, p] of Object.entries(s.participants)) {
    if (p.slot === slot) return id;
  }
  return null;
}
