import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { api } from "./api";
import type { User } from "./api";

interface Ctx {
  user: User | null;
  loading: boolean;
  setUser: (u: User | null) => void;
  logout: () => Promise<void>;
  can: (perm: string) => boolean;
}
const AuthCtx = createContext<Ctx>(null as unknown as Ctx);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    api<{ user: User }>("/auth/me")
      .catch(() => api<{ user: User }>("/auth/refresh", { method: "POST" }))
      .then((r) => live && setUser(r.user))
      .catch(() => live && setUser(null))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      setUser(null);
      location.hash = "#/login";
    }
  }, []);

  const can = useCallback((p: string) => !!user?.perms.includes(p), [user]);
  return <AuthCtx.Provider value={{ user, loading, setUser, logout, can }}>{children}</AuthCtx.Provider>;
}
