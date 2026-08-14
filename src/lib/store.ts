import { Redis } from "@upstash/redis";
import type { Session } from "./types";

const TTL_SECONDS = 60 * 60 * 12; // sessions expire after 12h of inactivity

const url = process.env.UPSTASH_REDIS_REST_URL ?? "";
const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? "";

const redis = url && token ? new Redis({ url, token }) : null;

export const storageBackend = redis ? "redis" : "memory";

/**
 * Serverless deployments run many instances, each with its own Map, so a room
 * created on one is a 404 on the next — which surfaces as "that room is gone"
 * the instant the host lands in a room they just created. Refuse to serve at
 * all rather than hand out rooms that only exist on one instance.
 *
 * Thrown per request rather than at import time so a build without credentials
 * still succeeds; the routes are all force-dynamic, so nothing calls in here
 * until a real request arrives.
 */
function assertUsableBackend() {
  if (redis || process.env.NODE_ENV !== "production") return;
  throw new Error(
    "[pointify] No Upstash credentials found. Set UPSTASH_REDIS_REST_URL and " +
      "UPSTASH_REDIS_REST_TOKEN in the deployment environment — in-memory " +
      "sessions cannot work across serverless instances. (Vercel KV injects " +
      "KV_REST_API_URL / KV_REST_API_TOKEN; those names are not read here.)",
  );
}

/**
 * In-memory fallback so `next dev` works with zero configuration. It lives on
 * globalThis to survive HMR, and is per-instance — fine locally, not for a
 * multi-instance deployment, which is what the Redis path is for.
 */
const mem: Map<string, Session> = ((
  globalThis as unknown as { __pointifyMem?: Map<string, Session> }
).__pointifyMem ??= new Map());

function key(id: string) {
  return `pointify:session:${id}`;
}

export async function readSession(id: string): Promise<Session | null> {
  assertUsableBackend();
  if (!redis) {
    const s = mem.get(key(id));
    return s ? (structuredClone(s) as Session) : null;
  }
  const raw = await redis.get<Session | string>(key(id));
  if (!raw) return null;
  return typeof raw === "string" ? (JSON.parse(raw) as Session) : raw;
}

export async function createSession(session: Session): Promise<void> {
  assertUsableBackend();
  if (!redis) {
    mem.set(key(session.id), structuredClone(session) as Session);
    return;
  }
  await redis.set(key(session.id), JSON.stringify(session), {
    ex: TTL_SECONDS,
  });
}

export async function deleteSession(id: string): Promise<void> {
  assertUsableBackend();
  if (!redis) {
    mem.delete(key(id));
    return;
  }
  await redis.del(key(id));
}

/**
 * Compare-and-set on the session's version field. Returns 1 on success, 0 if
 * another writer got there first.
 */
const CAS_SCRIPT = `
local cur = redis.call('GET', KEYS[1])
if not cur then return 0 end
local ok, obj = pcall(cjson.decode, cur)
if not ok then return 0 end
if tostring(obj.v) ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'EX', tonumber(ARGV[3]))
return 1
`;

export class ConflictError extends Error {}

/**
 * Read-modify-write with optimistic concurrency. `fn` may return null to
 * abort the write (e.g. the action was a no-op or unauthorized).
 */
export async function mutate(
  id: string,
  fn: (s: Session) => Session | null,
): Promise<Session | null> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const current = await readSession(id);
    if (!current) return null;

    const expectedVersion = current.v;
    const next = fn(current);
    if (!next) return current;
    next.v = expectedVersion + 1;

    if (!redis) {
      // Single-threaded: no one could have interleaved since the read above.
      mem.set(key(id), structuredClone(next) as Session);
      return next;
    }

    const ok = await redis.eval(
      CAS_SCRIPT,
      [key(id)],
      [String(expectedVersion), JSON.stringify(next), String(TTL_SECONDS)],
    );
    if (ok === 1) return next;

    await new Promise((r) => setTimeout(r, 25 + attempt * 40));
  }
  throw new ConflictError("Could not update the session, please retry.");
}
