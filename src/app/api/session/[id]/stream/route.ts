import { mutate, readSession } from "@/lib/store";
import { clearIfHostGone, prune, toPublic } from "@/lib/session";
import { readParticipantId } from "@/lib/auth";
import { youPayload } from "@/lib/you";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const POLL_MS = 800;
const TOUCH_MS = 20_000;
/** Ends the stream before the platform's function timeout can cut it mid-write. */
const STREAM_TTL_MS = 45_000;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await params;
  const sessionId = rawId.toLowerCase();
  const me = await readParticipantId(sessionId);

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          closed = true;
        }
      };

      // Reconnect fast: we deliberately end the stream well before the
      // serverless timeout, so the gap between streams should be short.
      controller.enqueue(encoder.encode("retry: 400\n\n"));

      let lastVersion = -1;
      let lastTouch = 0;
      const startedAt = Date.now();

      const tick = async () => {
        if (closed) return;

        const now = Date.now();
        if (me && now - lastTouch > TOUCH_MS) {
          lastTouch = now;
          // Presence: an open stream is what keeps a participant in the room.
          await mutate(sessionId, (s) => {
            const p = s.participants[me];
            if (!p) return null;
            p.lastSeen = Date.now();
            prune(s);
            return s;
          }).catch((err) => {
            console.error(
              `[pointify] presence write failed for ${sessionId}:`,
              err,
            );
          });
        }

        // A read that throws means we could not reach the store — which is not
        // the same thing as the room being deleted. Reporting it as "gone"
        // would tear down a session that is perfectly alive, so hold the
        // stream open and let the next tick try again.
        let session;
        try {
          session = await readSession(sessionId);
        } catch (err) {
          console.error(`[pointify] session read failed for ${sessionId}:`, err);
          return;
        }

        if (!session) {
          send("gone", { error: "Session not found." });
          close();
          return;
        }

        // Whoever notices first clears the room, and every other stream sees
        // the session vanish on its next read and closes the same way.
        const cleared = await clearIfHostGone(session).catch((err) => {
          console.error(`[pointify] clearing ${sessionId} failed:`, err);
          return false;
        });
        if (cleared) {
          send("gone", { error: "The host ended this session." });
          close();
          return;
        }

        if (session.v !== lastVersion) {
          lastVersion = session.v;
          send("state", {
            session: toPublic(session),
            you: youPayload(session, me),
          });
        } else {
          send("ping", now);
        }

        if (Date.now() - startedAt > STREAM_TTL_MS) {
          send("cycle", {});
          close();
        }
      };

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      const timer = setInterval(() => void tick(), POLL_MS);
      req.signal.addEventListener("abort", close);
      await tick();
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
