/** OAuth return path after Supabase exchanges the code (must be in Supabase redirect allow list). */
export function getAuthCallbackUrl(origin: string, next = "/") {
  const safeNext = next.startsWith("/") ? next : "/";
  return `${origin}/auth/callback?next=${encodeURIComponent(safeNext)}`;
}

/** App origin for OAuth redirects (env override for production). */
export function getSiteUrl(requestOrigin?: string) {
  if (requestOrigin) {
    return requestOrigin;
  }
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export const GOOGLE_LOGIN_PATH = "/auth/login/google";
