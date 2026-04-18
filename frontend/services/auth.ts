import { fetchApi } from "@/lib/api-client";
import { LoginInput, RegisterInput, Session, UserRole } from "@/types/auth";

const SESSION_STORAGE_VERSION = 1;
const SESSION_STORAGE_KEY = `busbuddy.session.v${SESSION_STORAGE_VERSION}`;
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

interface AuthResponse {
  user: {
    id: string;
    email: string;
    name?: string | null;
    role: UserRole;
  };
}

function buildSession(user: AuthResponse["user"]): Session {
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isGuest: false,
    },
    expires: new Date(Date.now() + SESSION_DURATION_MS).toISOString(),
  };
}

export function readStoredSession() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(SESSION_STORAGE_KEY);

    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue) as Session;

    if (!parsedValue?.user?.id || !parsedValue?.expires) {
      return null;
    }

    if (new Date(parsedValue.expires).getTime() <= Date.now()) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }

    return {
      ...parsedValue,
      user: {
        ...parsedValue.user,
        role: parsedValue.user.role ?? "USER",
      },
    };
  } catch {
    return null;
  }
}

export function storeSession(session: Session) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredSession() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

export async function login(loginInput: LoginInput) {
  const response = await fetchApi<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(loginInput),
  });
  const session = buildSession(response.user);
  storeSession(session);
  return session;
}

export async function register(registerInput: RegisterInput) {
  const response = await fetchApi<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(registerInput),
  });
  const session = buildSession(response.user);
  storeSession(session);
  return session;
}
