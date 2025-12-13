const BASE_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:4000';

function resolveUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  return `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export function gatewayFetch(path: string, init: RequestInit = {}) {
  const url = resolveUrl(path);
  const headers =
    init.headers instanceof Headers
      ? init.headers
      : init.headers
      ? new Headers(init.headers as Record<string, string>)
      : new Headers();
  return fetch(url, {
    ...init,
    headers,
    credentials: 'include'
  });
}
