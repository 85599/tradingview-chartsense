/**
 * Every API call goes through here so the access token travels with it. Local (loopback) use needs
 * no token; a public deployment is locked until CHARTSENSE_ACCESS_TOKEN is set and pasted in Settings.
 */

const TOKEN_KEY = "chartsense.accessToken";

export function getAccessToken(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setAccessToken(token: string): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode — the token then just lives for the page */
  }
}

export async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getAccessToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("x-chartsense-token", token);
  return fetch(path, { ...init, headers });
}
