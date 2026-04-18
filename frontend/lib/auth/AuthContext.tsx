"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { LoginInput, RegisterInput, Session } from "@/types/auth";
import {
  clearStoredSession,
  login as loginRequest,
  readStoredSession,
  register as registerRequest,
} from "@/services/auth";

interface AuthContextType {
  session: Session | null;
  status: "authenticated" | "unauthenticated" | "loading";
  login: (input: LoginInput) => Promise<Session>;
  register: (input: RegisterInput) => Promise<Session>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<"authenticated" | "unauthenticated" | "loading">("loading");

  useEffect(() => {
    const storedSession = readStoredSession();

    if (storedSession) {
      setSession(storedSession);
      setStatus("authenticated");
      return;
    }

    setSession(null);
    setStatus("unauthenticated");
  }, []);

  const login = async (input: LoginInput) => {
    const nextSession = await loginRequest(input);
    setSession(nextSession);
    setStatus("authenticated");
    return nextSession;
  };

  const register = async (input: RegisterInput) => {
    const nextSession = await registerRequest(input);
    setSession(nextSession);
    setStatus("authenticated");
    return nextSession;
  };

  const logout = () => {
    clearStoredSession();
    setSession(null);
    setStatus("unauthenticated");
  };

  return (
    <AuthContext.Provider value={{ session, status, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useSession() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useSession must be used within an AuthProvider");
  }
  return context;
}
