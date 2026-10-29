import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Company } from "../shared/types";
import { api, type Me } from "./api";
import { useT } from "./i18n";

interface AuthState {
  me: Me | null;
  company: Company | null;
  emailEnabled: boolean;
  loading: boolean;
  refresh: () => Promise<Me | null>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { setLang } = useT();
  const [me, setMe] = useState<Me | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await api.get<{ user: Me | null; company: Company | null; email_enabled?: boolean }>("/auth/me");
      setMe(r.user);
      setEmailEnabled(Boolean(r.email_enabled));
      setCompany(r.company);
      if (r.user) setLang(r.user.lang);
      return r.user;
    } catch {
      setMe(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [setLang]);

  const logout = useCallback(async () => {
    await api.post("/auth/logout");
    setMe(null);
    setCompany(null);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return <Ctx.Provider value={{ me, company, emailEnabled, loading, refresh, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("AuthProvider missing");
  return c;
}
