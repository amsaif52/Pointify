"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { PublicSession } from "./types";
import type { YouPayload } from "./you";

export type You = YouPayload;

export type Status = "connecting" | "live" | "polling" | "missing";

type Payload = { session: PublicSession; you: You };

/**
 * Live session state. Prefers SSE; if the stream fails three times in a row we
 * fall back to polling (plus an explicit heartbeat, since polling alone does
 * not refresh presence) so the room still works behind proxies that buffer or
 * strip event streams.
 */
export function useSession(sessionId: string) {
  const [session, setSession] = useState<PublicSession | null>(null);
  const [you, setYou] = useState<You>({
    slot: null,
    isAdmin: false,
    present: false,
    vote: null,
    spectator: false,
  });
  const [status, setStatus] = useState<Status>("connecting");
  const [epoch, setEpoch] = useState(0);

  const failures = useRef(0);
  const stopped = useRef(false);

  const apply = useCallback((p: Partial<Payload>) => {
    if (p.session) setSession(p.session);
    if (p.you) setYou(p.you);
  }, []);

  useEffect(() => {
    stopped.current = false;
    failures.current = 0;
    let source: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let beatTimer: ReturnType<typeof setInterval> | null = null;
    let reopenTimer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const res = await fetch(`/api/session/${sessionId}`, {
          cache: "no-store",
        });
        if (res.status === 404) {
          setStatus("missing");
          return;
        }
        apply((await res.json()) as Payload);
      } catch {
        /* transient — the next tick will retry */
      }
    };

    /**
     * An open stream is what normally keeps us in the room, so without one we
     * have to say we are still here ourselves. Polling the read endpoint is
     * not enough — it never touches presence, so we would be pruned after
     * PRESENCE_TIMEOUT_MS and dropped back to the join screen.
     */
    const beat = async () => {
      try {
        const res = await fetch(`/api/session/${sessionId}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "heartbeat" }),
        });
        // A 401 just means we have not joined yet; polling still shows the room.
        if (res.ok) apply((await res.json()) as Payload);
      } catch {
        /* transient — the next beat will retry */
      }
    };

    const startPolling = () => {
      if (pollTimer || stopped.current) return;
      setStatus("polling");
      void poll();
      void beat();
      pollTimer = setInterval(() => void poll(), 1500);
      beatTimer = setInterval(() => void beat(), 20_000);
    };

    const openStream = () => {
      if (stopped.current) return;
      source = new EventSource(`/api/session/${sessionId}/stream`);

      source.addEventListener("state", (e) => {
        failures.current = 0;
        setStatus("live");
        apply(JSON.parse((e as MessageEvent).data) as Payload);
      });

      source.addEventListener("gone", () => {
        stopped.current = true;
        source?.close();
        setStatus("missing");
      });

      // The server ends each stream before the platform timeout; reopen at once.
      source.addEventListener("cycle", () => {
        source?.close();
        source = null;
        reopenTimer = setTimeout(openStream, 50);
      });

      source.onerror = () => {
        source?.close();
        source = null;
        if (stopped.current) return;
        failures.current += 1;
        if (failures.current >= 3) startPolling();
        else reopenTimer = setTimeout(openStream, 600);
      };
    };

    openStream();

    return () => {
      stopped.current = true;
      source?.close();
      if (pollTimer) clearInterval(pollTimer);
      if (beatTimer) clearInterval(beatTimer);
      if (reopenTimer) clearTimeout(reopenTimer);
    };
  }, [sessionId, apply, epoch]);

  const act = useCallback(
    async (action: string, extra: Record<string, unknown> = {}) => {
      const res = await fetch(`/api/session/${sessionId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<Payload> & {
        error?: string;
        code?: string;
      };
      if (!res.ok) throw new ActionError(data.error ?? "Something went wrong.", data.code);
      apply(data);
      // The open stream captured our identity cookie when it connected, so a
      // stream opened before we joined would keep reporting us as absent (and
      // would never refresh our presence). Reconnect it with the new cookie.
      if (action === "join") setEpoch((n) => n + 1);
      return data;
    },
    [sessionId, apply],
  );

  return { session, you, status, act };
}

export class ActionError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

const NAME_KEY = "pointify:name";

export function rememberName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* private mode */
  }
}

export function recallName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

function subscribeName(onChange: () => void) {
  // Only fires for writes from *other* tabs, which is exactly when the stored
  // name can change out from under a form we are not typing in.
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/**
 * A name input pre-filled with whatever the browser remembers. The stored name
 * is read through useSyncExternalStore rather than an effect so the server and
 * the hydrating client agree on an empty field, and anything the user types
 * takes over from there.
 */
export function useRememberedName(): [string, (value: string) => void] {
  const stored = useSyncExternalStore(subscribeName, recallName, () => "");
  const [typed, setTyped] = useState<string | null>(null);
  return [typed ?? stored, setTyped];
}
