import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setAuthToken, setUnauthorizedHandler } from './api';
import type { User } from './types';

const TOKEN_KEY = 'team-alert-token';
const USER_KEY = 'team-alert-user';

interface AuthState {
  loading: boolean;
  user: User | null;
  signIn: (token: string, user: User) => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (user: User) => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUserState] = useState<User | null>(null);

  const setUser = useCallback((u: User) => {
    setUserState(u);
    SecureStore.setItemAsync(USER_KEY, JSON.stringify(u)).catch(() => undefined);
  }, []);

  const forget = useCallback(async () => {
    setAuthToken(null);
    setUserState(null);
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => void forget());
    (async () => {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (token) {
        setAuthToken(token);
        // Сохранённый профиль позволяет открыть приложение сразу, даже без сети.
        const cached = await SecureStore.getItemAsync(USER_KEY);
        if (cached) setUserState(JSON.parse(cached) as User);
      }
      setLoading(false);
      if (token) api.me().then(setUser, () => undefined);
    })();
    return () => setUnauthorizedHandler(null);
  }, [forget, setUser]);

  const signIn = useCallback(
    async (token: string, u: User) => {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
      setAuthToken(token);
      setUser(u);
    },
    [setUser],
  );

  const signOut = useCallback(async () => {
    await api.logout().catch(() => undefined);
    await forget();
  }, [forget]);

  const refresh = useCallback(async () => {
    setUser(await api.me());
  }, [setUser]);

  const value = useMemo(
    () => ({ loading, user, signIn, signOut, setUser, refresh }),
    [loading, user, signIn, signOut, setUser, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth вне AuthProvider');
  return ctx;
}
