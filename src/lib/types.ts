export type ScaleId = "fibonacci" | "modified" | "tshirt" | "powers" | "linear";

export type Participant = {
  /** Public handle. The map key is the participant's secret id and never leaves the server. */
  slot: string;
  name: string;
  vote: string | null;
  spectator: boolean;
  joinedAt: number;
  lastSeen: number;
};

export type HistoryEntry = {
  id: string;
  title: string;
  scaleId: ScaleId;
  average: number | null;
  consensus: boolean;
  votes: { name: string; value: string }[];
  finishedAt: number;
};

/** Server-side session record. Never send this to the browser as-is. */
export type Session = {
  id: string;
  v: number;
  createdAt: number;
  scaleId: ScaleId;
  storyTitle: string;
  storyId: string | null;
  revealed: boolean;
  adminId: string;
  participants: Record<string, Participant>;
  history: HistoryEntry[];
};

export type PublicParticipant = {
  /** The participant's slot, not their secret id. */
  id: string;
  name: string;
  spectator: boolean;
  hasVoted: boolean;
  /** Only populated once votes are revealed. */
  vote: string | null;
  isAdmin: boolean;
};

export type PublicSession = {
  id: string;
  v: number;
  scaleId: ScaleId;
  storyTitle: string;
  storyId: string | null;
  revealed: boolean;
  participants: PublicParticipant[];
  history: HistoryEntry[];
  stats: {
    average: number | null;
    consensus: boolean;
    voted: number;
    voters: number;
    tally: { value: string; count: number }[];
  };
};
