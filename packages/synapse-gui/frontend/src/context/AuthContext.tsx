/**
 * synapse-gui frontend AuthContext
 * -------------------------------------
 * Client-side authentication state: login/logout, current user, and an
 * initial "isInitializing" phase that verifies any token already
 * present in localStorage against GET /auth/me.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  AUTH_TOKEN_STORAGE_KEY,
  ApiError,
  getCurrentUser,
  login as apiLogin,
} from "../api/client";
import type { CurrentUserResponse } from "../types/api";

interface AuthContextValue {
  user: CurrentUserResponse | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUserResponse | null>(null);

  // Inizializza isInitializing a true solo se c'è un token salvato
  const [isInitializing, setIsInitializing] = useState(() => {
    return Boolean(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY));
  });

  useEffect(() => {
    const existingToken = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    if (!existingToken) {
      setIsInitializing(false);
      return;
    }

    let isMounted = true;
    const controller = new AbortController();

    getCurrentUser(controller.signal)
      .then((currentUser) => {
        if (isMounted) {
          setUser(currentUser);
        }
      })
      .catch((error: unknown) => {
        // Ignora gli errori di abort provocati da React Strict Mode
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        if (isMounted) {
          if (error instanceof ApiError && error.status === 401) {
            localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
          }
          setUser(null);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsInitializing(false);
        }
      });

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, []);

  async function login(username: string, password: string): Promise<void> {
    const token = await apiLogin(username, password);
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token.access_token);
    const currentUser = await getCurrentUser();
    setUser(currentUser);
  }

  function logout(): void {
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    setUser(null);
  }

  const value: AuthContextValue = {
    user,
    isAuthenticated: user !== null,
    isInitializing,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth() must be used within an <AuthProvider>.");
  }
  return context;
}