import { createContext, useContext } from "react";
import type { SuggestedTransfer } from "../shared/money";
import type { AppState, Me } from "../shared/types";

export interface AppContextValue {
  state: AppState;
  /** Running balance per member id; missing means zero. */
  balances: Map<number, number>;
  suggestions: SuggestedTransfer[];
  nameOf: (memberId: number) => string;
  /** The signed-in account, or null for a visitor (who can only look). */
  me: Me | null;
  /** True when the account may enter a session: an admin, or a signed-in member. */
  canAdd: boolean;
  /** True when the account is an admin or is this member; gates what only that member may do. */
  actsAs: (memberId: number) => boolean;
  /**
   * Sends a write, then reloads state.
   * Resolves true on success; on failure a notice is shown and it resolves false.
   */
  write: (method: "POST" | "PUT" | "DELETE", path: string, body?: unknown) => Promise<boolean>;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used inside AppContext");
  return value;
}
