import { cookies } from "next/headers";

const MAX_AGE = 60 * 60 * 12;

/**
 * Identity is a per-session httpOnly cookie. Keeping the participant id out of
 * JS means nobody can vote as someone else or claim the admin seat by pasting
 * an id they read off the participants list.
 */
function cookieName(sessionId: string) {
  return `pf_${sessionId}`;
}

export async function readParticipantId(
  sessionId: string,
): Promise<string | null> {
  const jar = await cookies();
  return jar.get(cookieName(sessionId))?.value ?? null;
}

export async function writeParticipantId(sessionId: string, participantId: string) {
  const jar = await cookies();
  jar.set(cookieName(sessionId), participantId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}
