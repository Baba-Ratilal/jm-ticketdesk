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
  if (!res.ok) throw new Error((data as any).error || `Request failed (${res.status})`);
  return data as T;
}
