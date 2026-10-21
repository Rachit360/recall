import NetInfo from "@react-native-community/netinfo";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { ApiError } from "@recall/shared";
import { api, useAuth } from "./auth";
import { countDirty } from "./db";
import { syncNow } from "./sync-engine";

type SyncContextValue = {
  online: boolean;
  syncing: boolean;
  pending: number;
  error: string | null;
  /** Increments whenever local data changes, so screens know to re-read SQLite. */
  dataVersion: number;
  requestSync: () => void;
  /** Call after any local write. */
  notifyLocalChange: () => void;
};

const SyncContext = createContext<SyncContextValue | null>(null);

/**
 * Decides *when* to sync: after sign-in, when the network comes back,
 * when the app returns to the foreground, and right after a local change.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const { email, signOut } = useAuth();
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const onlineRef = useRef(online);
  onlineRef.current = online;

  const refreshLocal = useCallback(async () => {
    setPending(await countDirty());
    setDataVersion((v) => v + 1);
  }, []);

  const runSync = useCallback(async () => {
    if (!email || !onlineRef.current) return;
    setSyncing(true);
    try {
      await syncNow(api);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await signOut();
        return;
      }
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
      await refreshLocal();
    }
  }, [email, signOut, refreshLocal]);

  useEffect(
    () =>
      NetInfo.addEventListener((state) => {
        setOnline(state.isConnected !== false && state.isInternetReachable !== false);
      }),
    [],
  );

  useEffect(() => {
    void refreshLocal();
    if (online && email) void runSync();
  }, [online, email, runSync, refreshLocal]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void runSync();
    });
    return () => sub.remove();
  }, [runSync]);

  const notifyLocalChange = useCallback(() => {
    void refreshLocal();
    void runSync();
  }, [refreshLocal, runSync]);

  const value = useMemo(
    () => ({ online, syncing, pending, error, dataVersion, requestSync: () => void runSync(), notifyLocalChange }),
    [online, syncing, pending, error, dataVersion, runSync, notifyLocalChange],
  );
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync must be used inside SyncProvider");
  return ctx;
}
