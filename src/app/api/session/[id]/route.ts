import { NextResponse } from "next/server";
import { readSession } from "@/lib/store";
import { toPublic } from "@/lib/session";
import { readParticipantId } from "@/lib/auth";
import { youPayload } from "@/lib/you";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await params;
  const sessionId = rawId.toLowerCase();

  const session = await readSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  const me = await readParticipantId(sessionId);
  return NextResponse.json({
    session: toPublic(session),
    you: youPayload(session, me),
  });
}
