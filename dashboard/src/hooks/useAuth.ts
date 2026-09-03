import { createContext, useContext } from "react";

import type { AdminUser } from "../types/api.js";

export type AuthState = {
  ready: boolean;
  configured: boolean;
  user: AdminUser | null;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthState | undefined>(undefined);

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (value === undefined) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return value;
}
