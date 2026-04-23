const BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(
  /\/$/,
  "",
);
const SESSION_STORAGE_KEY = "busbuddy.session.v1";

export function getApiBaseUrl() {
  return BASE_URL;
}

export async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = endpoint.startsWith("http") ? endpoint : `${BASE_URL}${normalizedEndpoint}`;

  const headers = new Headers(options?.headers);

  if (options?.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (typeof window !== "undefined" && !headers.has("x-busbuddy-user-id")) {
    try {
      const rawSession = window.localStorage.getItem(SESSION_STORAGE_KEY);

      if (rawSession) {
        const parsedSession = JSON.parse(rawSession) as {
          user?: {
            id?: string;
          };
        };

        if (parsedSession.user?.id) {
          headers.set("x-busbuddy-user-id", parsedSession.user.id);
        }
      }
    } catch {
      // Ignore malformed local session payloads.
    }
  }

  const response = await fetch(url, {
    cache: options?.cache ?? "no-store",
    ...options,
    headers: Object.fromEntries(headers.entries()),
  });

  if (!response.ok) {
    let errorMessage = `API error: ${response.status} ${response.statusText}`;

    try {
      const errorPayload = (await response.json()) as {
        message?: string | string[];
      };

      if (Array.isArray(errorPayload.message)) {
        errorMessage = errorPayload.message.join(", ");
      } else if (typeof errorPayload.message === "string") {
        errorMessage = errorPayload.message;
      }
    } catch {
      // Ignore malformed error responses and keep the default message.
    }

    throw new Error(errorMessage);
  }

  // Handle No Content
  if (response.status === 204) return {} as T;

  return response.json();
}
