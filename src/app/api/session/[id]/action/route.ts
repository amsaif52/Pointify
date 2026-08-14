import { NextResponse } from "next/server";
import { ConflictError, mutate, readSession } from "@/lib/store";
import {
  archive,
  clearIfHostGone,
  clearVotes,
  findBySlot,
  isValidCard,
  newId,
  newSlot,
  prune,
  toPublic,
} from "@/lib/session";
import { isScaleId } from "@/lib/scales";
import { readParticipantId, writeParticipantId } from "@/lib/auth";
import { youPayload } from "@/lib/you";
import type { Session } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = Record<string, unknown>;

const HOST_LEFT = "The host ended this session.";

const str = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await params;
  const sessionId = rawId.toLowerCase();

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const action = str(body.action, 32);
  const existing = await readSession(sessionId);
  if (!existing) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
  // Nobody joins or acts in a room whose host has already left.
  if (await clearIfHostGone(existing)) {
    return NextResponse.json({ error: HOST_LEFT }, { status: 404 });
  }

  let me = await readParticipantId(sessionId);

  // Joining is the one action that does not require an existing identity.
  if (action === "join") {
    const name = str(body.name, 40);
    if (!name) {
      return NextResponse.json(
        { error: "Enter your name to join." },
        { status: 400 },
      );
    }
    const spectator = body.spectator === true;
    const participantId = me && existing.participants[me] ? me : newId();
    me = participantId;

    const updated = await safeMutate(sessionId, (s) => {
      prune(s);
      const now = Date.now();
      const current = s.participants[participantId];
      if (current) {
        current.name = name;
        current.spectator = spectator;
        current.lastSeen = now;
        if (spectator) current.vote = null;
      } else {
        s.participants[participantId] = {
          slot: newSlot(),
          name,
          vote: null,
          spectator,
          joinedAt: now,
          lastSeen: now,
        };
        if (Object.keys(s.participants).length === 1) s.adminId = participantId;
      }
      return s;
    });
    if (updated instanceof NextResponse) return updated;

    await writeParticipantId(sessionId, participantId);
    return ok(updated, participantId);
  }

  if (!me || !existing.participants[me]) {
    return NextResponse.json(
      { error: "You are not in this session.", code: "NOT_JOINED" },
      { status: 401 },
    );
  }
  const self = me;
  const isAdmin = existing.adminId === self;

  const adminOnly = new Set([
    "setStory",
    "setScale",
    "reveal",
    "newRound",
    "clear",
    "makeAdmin",
    "remove",
    "clearHistory",
  ]);
  if (adminOnly.has(action) && !isAdmin) {
    return NextResponse.json(
      { error: "Only the session host can do that." },
      { status: 403 },
    );
  }

  let unknownAction = false;
  const updated = await safeMutate(sessionId, (s) => {
    prune(s);
    const p = s.participants[self];
    if (!p) return s;
    p.lastSeen = Date.now();

    switch (action) {
      case "heartbeat":
        return s;

      case "rename": {
        const name = str(body.name, 40);
        if (name) p.name = name;
        return s;
      }

      case "setSpectator": {
        p.spectator = body.spectator === true;
        if (p.spectator) p.vote = null;
        return s;
      }

      case "vote": {
        if (p.spectator || s.revealed) return s;
        const value = str(body.value, 8);
        // An empty value un-votes; anything off the current deck is ignored.
        if (value === "") p.vote = null;
        else if (isValidCard(s, value)) p.vote = p.vote === value ? null : value;
        return s;
      }

      case "setStory": {
        const title = str(body.title, 200);
        if (title !== s.storyTitle) {
          s.storyTitle = title;
          s.storyId ??= newId();
        }
        return s;
      }

      case "newStory": {
        const title = str(body.title, 200);
        if (s.revealed) archive(s);
        clearVotes(s);
        s.storyTitle = title;
        s.storyId = newId();
        return s;
      }

      case "setScale": {
        if (!isScaleId(body.scaleId) || body.scaleId === s.scaleId) return s;
        s.scaleId = body.scaleId;
        // Old cards may not exist on the new deck, so the round restarts.
        clearVotes(s);
        return s;
      }

      case "reveal": {
        if (s.revealed) return s;
        s.revealed = true;
        return s;
      }

      case "newRound": {
        if (s.revealed) archive(s);
        clearVotes(s);
        s.storyId = null;
        s.storyTitle = "";
        return s;
      }

      case "clear": {
        clearVotes(s);
        return s;
      }

      case "makeAdmin": {
        const target = findBySlot(s, str(body.slot, 16));
        if (target) s.adminId = target;
        return s;
      }

      case "remove": {
        const target = findBySlot(s, str(body.slot, 16));
        if (target && target !== self) delete s.participants[target];
        return s;
      }

      case "clearHistory": {
        s.history = [];
        return s;
      }

      case "leave": {
        delete s.participants[self];
        prune(s);
        return s;
      }

      default:
        // Returning null aborts the write, so a typo'd action cannot even
        // refresh presence — it is reported rather than silently succeeding.
        unknownAction = true;
        return null;
    }
  });

  if (updated instanceof NextResponse) return updated;
  if (unknownAction) {
    return NextResponse.json(
      { error: `Unknown action "${action}".` },
      { status: 400 },
    );
  }
  // The host leaving is the one action that takes the room with it.
  if (updated && (await clearIfHostGone(updated))) {
    return NextResponse.json({ error: HOST_LEFT }, { status: 404 });
  }
  return ok(updated, self);
}

async function safeMutate(
  sessionId: string,
  fn: (s: Session) => Session | null,
): Promise<Session | null | NextResponse> {
  try {
    return await mutate(sessionId, fn);
  } catch (err) {
    if (err instanceof ConflictError) {
      return NextResponse.json(
        { error: "The session is busy, try again." },
        { status: 409 },
      );
    }
    throw err;
  }
}

function ok(session: Session | null, me: string) {
  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
  // Must be the same shape the stream sends — the client overwrites its whole
  // `you` from this, and a missing `present` reads as "not in the room".
  return NextResponse.json({
    session: toPublic(session),
    you: youPayload(session, me),
  });
}
