import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import {
  getSession,
  signIn as signInRequest,
  signOut as signOutRequest,
} from "../api/auth.js";
import { setUnauthorizedHandler } from "../api/client.js";
import { AuthContext } from "../hooks/useAuth.js";
import type { AdminUser } from "../types/api.js";

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [user, setUser] = useState<AdminUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getSession()
      .then((session) => {
        if (cancelled) {
          return;
        }
        setConfigured(session.configured !== false);
        setUser(session.authenticated && session.user ? session.user : null);
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      navigate("/login", { replace: true });
    });
    return () => setUnauthorizedHandler(undefined);
  }, [navigate]);

  const value = useMemo(
    () => ({
      ready,
      configured,
      user,
      signIn: async (username: string, password: string) => {
        const session = await signInRequest(username, password);
        if (!session.authenticated || !session.user) {
          throw new Error("Sign in failed.");
        }
        setConfigured(true);
        setUser(session.user);
      },
      signOut: async () => {
        await signOutRequest();
        setUser(null);
        navigate("/login", { replace: true });
      },
    }),
    [configured, navigate, ready, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
