import { User } from "../types/document";

const AUTH_TOKEN_KEY = "docflow_session_jwt";
const AUTH_USER_KEY = "docflow_session_user";

type AuthListener = (user: User | null) => void;

const listeners = new Set<AuthListener>();
let memoryToken: string | null = null;
let memoryUser: User | null = null;
let initialized = false;

function initFromBrowser() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  try {
    memoryToken = localStorage.getItem(AUTH_TOKEN_KEY);
    const rawUser = localStorage.getItem(AUTH_USER_KEY);
    memoryUser = rawUser ? (JSON.parse(rawUser) as User) : null;
  } catch {
    memoryToken = null;
    memoryUser = null;
  }
}

function notify() {
  listeners.forEach((cb) => {
    try {
      cb(memoryUser);
    } catch {
      // Ignore subscriber error
    }
  });
}

export function getAuthToken(): string | null {
  initFromBrowser();
  return memoryToken;
}

export function getStoredUser(): User | null {
  initFromBrowser();
  return memoryUser;
}

export function setAuthSession(token: string, user: User): void {
  initialized = true;
  memoryToken = token;
  memoryUser = user;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    } catch {
      // In-memory fallback
    }
  }
  notify();
}

export function clearAuthSession(): void {
  initialized = true;
  memoryToken = null;
  memoryUser = null;
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(AUTH_USER_KEY);
    } catch {
      // Ignore
    }
  }
  notify();
}

export function subscribeAuthChange(cb: AuthListener): () => void {
  initFromBrowser();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

