import React, { createContext, useEffect, useMemo, useState } from "react";
import { api, AUTH_CLEARED_EVENT, clearStoredAuthToken, getStoredAuthToken, setStoredAuthToken } from "../lib/api";
import type { AuthSession, Fingerprint, User, Wallet } from "../shared/types";

interface RegisterPayload {
  fullName: string;
  govId: string;
  email: string;
  mobile: string;
  password: string;
}

interface LoginPayload {
  email: string;
  password: string;
}

interface AuthMeResponse {
  user: User;
  wallet: Wallet;
  fingerprint: Fingerprint | null;
  requiresEnrollment: boolean;
}

interface AuthContextValue {
  user: User | null;
  wallet: Wallet | null;
  fingerprint: Fingerprint | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (payload: LoginPayload) => Promise<AuthSession>;
  register: (payload: RegisterPayload) => Promise<AuthSession>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function applySessionFromAuthResponse(
  setState: React.Dispatch<
    React.SetStateAction<{
      user: User | null;
      wallet: Wallet | null;
      fingerprint: Fingerprint | null;
      token: string | null;
      isLoading: boolean;
    }>
  >,
  payload: AuthSession | (AuthMeResponse & { token?: string | null }),
): void {
  setState({
    user: payload.user,
    wallet: payload.wallet,
    fingerprint: payload.fingerprint,
    token: payload.token ?? getStoredAuthToken(),
    isLoading: false,
  });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{
    user: User | null;
    wallet: Wallet | null;
    fingerprint: Fingerprint | null;
    token: string | null;
    isLoading: boolean;
  }>({
    user: null,
    wallet: null,
    fingerprint: null,
    token: getStoredAuthToken(),
    isLoading: true,
  });

  const clearSession = () => {
    clearStoredAuthToken();
    setState({
      user: null,
      wallet: null,
      fingerprint: null,
      token: null,
      isLoading: false,
    });
  };

  const refreshUser = async () => {
    const token = getStoredAuthToken();

    if (!token) {
      setState({
        user: null,
        wallet: null,
        fingerprint: null,
        token: null,
        isLoading: false,
      });
      return;
    }

    setState((current) => ({ ...current, token, isLoading: true }));

    try {
      const response = await api.get<AuthMeResponse>("/api/auth/me");
      applySessionFromAuthResponse(setState, { ...response, token });
    } catch {
      clearSession();
    }
  };

  useEffect(() => {
    const handleAuthCleared = () => {
      setState({
        user: null,
        wallet: null,
        fingerprint: null,
        token: null,
        isLoading: false,
      });
    };

    window.addEventListener(AUTH_CLEARED_EVENT, handleAuthCleared);
    void refreshUser();

    return () => {
      window.removeEventListener(AUTH_CLEARED_EVENT, handleAuthCleared);
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: state.user,
      wallet: state.wallet,
      fingerprint: state.fingerprint,
      token: state.token,
      isLoading: state.isLoading,
      isAuthenticated: Boolean(state.user && state.token),
      async login(payload) {
        const response = await api.post<AuthSession>("/api/auth/login", payload);
        setStoredAuthToken(response.token);
        applySessionFromAuthResponse(setState, response);
        return response;
      },
      async register(payload) {
        const response = await api.post<AuthSession>("/api/auth/register", payload);
        setStoredAuthToken(response.token);
        applySessionFromAuthResponse(setState, response);
        return response;
      },
      logout() {
        clearSession();
      },
      refreshUser,
    }),
    [state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export { AuthContext };
