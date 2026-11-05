/** Small fetch wrapper used by every page. Throws Error(message) on failure. */
export async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const isForm = typeof FormData !== "undefined" && init?.body instanceof FormData;
  const res = await fetch(url, {
    credentials: "same-origin",
    ...init,
    headers: {
      ...(init?.body && !isForm ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
  });
  if (res.status === 401 && typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    window.location.href = "/login";
    throw new Error("Please sign in again");
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 403 && (data as any).error === "PASSWORD_CHANGE_REQUIRED" && typeof window !== "undefined") {
    if (!window.location.pathname.startsWith("/change-password")) window.location.href = "/change-password";
    throw new Error("Please set a new password first");
  }
  if (!res.ok) throw new Error((data as any).error || `Request failed (${res.status})`);
  return data as T;
}
