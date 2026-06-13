import type { AuthUser } from "./api";

const TOKEN_KEY = "mm.token";
const USER_KEY = "mm.user";

export const session = {
  save(token: string, user: AuthUser) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  token: () => (typeof window === "undefined" ? null : localStorage.getItem(TOKEN_KEY)),
  user(): AuthUser | null {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};
