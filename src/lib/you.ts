import type { Session } from "./types";

export type YouPayload = {
  slot: string | null;
  isAdmin: boolean;
  present: boolean;
  /**
   * Your own card, even before the reveal. Everyone else's stays on the
   * server — this only ever goes to the cookie that cast it.
   */
  vote: string | null;
  spectator: boolean;
};

export function youPayload(session: Session, me: string | null): YouPayload {
  const p = me ? session.participants[me] : undefined;
  return {
    slot: p?.slot ?? null,
    isAdmin: Boolean(me) && session.adminId === me,
    present: Boolean(p),
    vote: p?.vote ?? null,
    spectator: p?.spectator ?? false,
  };
}
