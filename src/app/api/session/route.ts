import { NextResponse } from "next/server";
import { createSession } from "@/lib/store";
import { emptySession, newId, newSlot, toPublic } from "@/lib/session";
import { writeParticipantId } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { name?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 40) : "";
  if (!name) {
    return NextResponse.json(
      { error: "Enter your name to start a session." },
      { status: 400 },
    );
  }

  const participantId = newId();
  const session = emptySession(participantId);
  const now = Date.now();
  session.participants[participantId] = {
    slot: newSlot(),
    name,
    vote: null,
    spectator: false,
    joinedAt: now,
    lastSeen: now,
  };

  await createSession(session);
  await writeParticipantId(session.id, participantId);

  return NextResponse.json({
    sessionId: session.id,
    session: toPublic(session),
  });
}
