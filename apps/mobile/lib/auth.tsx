import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createApiClient, type Credentials } from "@recall/shared";
import { clearLocalData } from "./db";

const TOKEN_KEY = "recall.token";
const EMAIL_KEY = "recall.email";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

/** Same typed client as the web app, authenticated with a token from the Keychain/Keystore. */
export const api = createApiClient({
  baseUrl: API_URL.replace(/\/$/, ""),
  getToken: () => SecureStore.getItemAsync(TOKEN_KEY),
});

type AuthContextValue = {
  ready: boolean;
  email: string | null;
  signIn: (mode: "login" | "register", credentials: Credentials) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [token, storedEmail] = await Promise.all([
        SecureStore.getItemAsync(TOKEN_KEY),
        SecureStore.getItemAsync(EMAIL_KEY),
      ]);
      setEmail(token ? storedEmail : null);
      setReady(true);
    })();
  }, []);

  const signIn = useCallback(async (mode: "login" | "register", credentials: Credentials) => {
    const res = mode === "login" ? await api.login(credentials) : await api.register(credentials);
    await SecureStore.setItemAsync(TOKEN_KEY, res.token);
    await SecureStore.setItemAsync(EMAIL_KEY, res.user.email);
    setEmail(res.user.email);
  }, []);

  const signOut = useCallback(async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(EMAIL_KEY);
    await clearLocalData();
    setEmail(null);
  }, []);

  const value = useMemo(() => ({ ready, email, signIn, signOut }), [ready, email, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
