const AUTH_TOKEN_STORAGE_KEY = "tip.auth.token";
export const AUTH_CLEARED_EVENT = "tip:auth-cleared";

type HttpMethod = "GET" | "POST" | "PUT";

export function getStoredAuthToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
}

export function setStoredAuthToken(token: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
}

export function clearStoredAuthToken(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
}

function dispatchAuthCleared(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(AUTH_CLEARED_EVENT));
}

function handleUnauthorized(path: string): void {
  const hadToken = Boolean(getStoredAuthToken());
  clearStoredAuthToken();
  dispatchAuthCleared();

  if (typeof window === "undefined" || !hadToken) {
    return;
  }

  const isAuthScreen = window.location.pathname === "/login" || window.location.pathname === "/register";
  const isAuthRequest = path.startsWith("/api/auth/login") || path.startsWith("/api/auth/register");

  if (!isAuthScreen && !isAuthRequest) {
    window.location.assign("/login");
  }
}

async function parseResponse<T>(response: Response, path: string): Promise<T> {
  const text = await response.text();
  let payload: unknown = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (response.status === 401) {
    handleUnauthorized(path);
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String(payload.message)
        : `Request failed with status ${response.status}.`;
    throw new Error(message);
  }

  return payload as T;
}

async function request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
  const headers: HeadersInit = {
    Accept: "application/json",
  };
  const token = getStoredAuthToken();

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  return parseResponse<T>(response, path);
}

export const api = {
  get<T>(path: string): Promise<T> {
    return request<T>("GET", path);
  },
  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>("POST", path, body);
  },
  put<T>(path: string, body?: unknown): Promise<T> {
    return request<T>("PUT", path, body);
  },
};

