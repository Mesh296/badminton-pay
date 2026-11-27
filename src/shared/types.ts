// Shapes shared by the Worker API and the client. All money is integer VND.

export interface Member {
  id: number;
  name: string;
  bankCode: string | null;
  accountNo: string | null;
  accountName: string | null;
  active: boolean;
  /** Google account linked to this member. Only sent to admins. */
  email?: string | null;
}

export interface Attendee {
  memberId: number;
  drank: boolean;
  share: number;
}

export interface Session {
  id: string;
  date: string; // YYYY-MM-DD
  payerId: number;
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
  sessions: Session[];
  transfers: Transfer[];
  /** null for a visitor who is not signed in. */
  me: Me | null;
  /** Open requests to join: all of them for an admin, only their own for anyone else. */
  joinRequests: JoinRequest[];
}
