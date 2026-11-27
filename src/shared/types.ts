// Shapes shared by the Worker API and the client. All money is integer VND.

export interface Member {
  id: number;
  name: string;
  bankCode: string | null;
  accountNo: string | null;
  accountName: string | null;
  active: boolean;
  /** Version of their profile photo (ms), null without one: shown from /api/avatars/{id}?v={avatar} */
  avatar: number | null;
  /** Google account linked to this member. Only sent to admins. */
  email?: string | null;
}

export interface Attendee {
  memberId: number;
  drank: boolean;
  /** Whole hours played; the court cost is split in proportion to it. */
  hours: number;
  share: number;
}

/** A badminton venue, for where each session was played. */
export interface Court {
  id: number;
  name: string;
}

export interface Session {
  id: string;
  date: string; // YYYY-MM-DD
  payerId: number;
  /** Where it was played; null for sessions entered before courts were recorded */
  courtId: number | null;
  /** "18:00"-"20:00", on the half hour, a whole number of hours apart; null when not given */
  startTime: string | null;
  endTime: string | null;
  courtAmount: number;
  drinkAmount: number;
  note: string | null;
  attendees: Attendee[];
}

export interface Transfer {
  id: number;
  date: string; // YYYY-MM-DD
  fromId: number;
  toId: number;
  amount: number;
  note: string | null;
}

/** A session or transfer as it was at one moment, kept in the activity log. */
export type SessionSnapshot = Session;
export type TransferSnapshot = Omit<Transfer, "id">;

/** Who joined the group, kept in the activity log. */
export interface MemberEvent {
  memberId: number;
}

/**
 * One thing that happened, for the Thông báo tab: a change to the money
 * records (who made it, when, the record before and after, null where it did
 * not exist), a payment reported or withdrawn, someone joining or signing in.
 * Anyone can see these, so a session or transfer entered against someone shows
 * up with the name of who did it.
 */
export type ActivityEntry = {
  id: number;
  at: string; // ISO 8601, UTC
  /** null for an admin who is not a member */
  actorMemberId: number | null;
  /** Only sent to admins, like member emails. */
  actorEmail?: string;
} & (
  | { action: "session.create" | "session.update" | "session.delete"; before: SessionSnapshot | null; after: SessionSnapshot | null }
  | { action: "transfer.create" | "transfer.update" | "transfer.delete"; before: TransferSnapshot | null; after: TransferSnapshot | null }
  /** A payer reported a payment (after), or the report was withdrawn or turned down (before) */
  | { action: "claim.create" | "claim.delete"; before: TransferSnapshot | null; after: TransferSnapshot | null }
  /** auth.login: the actor signed in; member.join: someone became a member */
  | { action: "member.join" | "auth.login"; before: null; after: MemberEvent | null }
);

/** A signed-in person asking to join the group, waiting for an admin. */
export interface JoinRequest {
  id: number;
  email: string;
  name: string;
  bankCode: string | null;
  accountNo: string | null;
  accountName: string | null;
}

/** The signed-in account. `memberId` is null until an admin links the email to a member. */
export interface Me {
  email: string;
  memberId: number | null;
  admin: boolean;
}

export interface AppState {
  members: Member[];
  /** Venues to pick from, by name */
  courts: Court[];
  sessions: Session[];
  transfers: Transfer[];
  /** Payments a payer reported sending, oldest first. Not in any balance until the receiver confirms them. */
  claims: Transfer[];
  /** null for a visitor who is not signed in. */
  me: Me | null;
  /** Open requests to join: all of them for an admin, only their own for anyone else. */
  joinRequests: JoinRequest[];
  /** The latest changes to sessions and transfers, newest first. */
  activity: ActivityEntry[];
}
