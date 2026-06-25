const BASE = "/api/openclaw/";

async function request<T>(
  method: "GET" | "POST" | "PUT",
  route: string,
  body?: Record<string, unknown>,
  params?: Record<string, string>
): Promise<T> {
  let url = `${BASE}${route}`;
  if (params) {
    const qs = new URLSearchParams(params).toString();
    if (qs) url += `?${qs}`;
  }

  const opts: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };

  if (body && (method === "POST" || method === "PUT")) {
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(url, opts);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }

  return data as T;
}

export const api = {
  get: <T>(route: string, params?: Record<string, string>) =>
    request<T>("GET", route, undefined, params),
  post: <T>(route: string, body?: Record<string, unknown>) =>
    request<T>("POST", route, body),
  put: <T>(route: string, body: Record<string, unknown>) =>
    request<T>("PUT", route, body),
};
