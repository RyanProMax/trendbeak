export const DATA_VERSION = "bars-v1";
export const VERSION_HEADER = "X-Trendbeak-Data";

export async function fetchQuote(url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set(VERSION_HEADER, DATA_VERSION);
  const response = await fetch(url, { ...init, headers });
  if (response.status === 426 && typeof window !== "undefined") {
    const expected = response.headers.get(VERSION_HEADER);
    if (expected && /^bars-v\d{1,3}$/.test(expected) && expected !== DATA_VERSION) {
      try {
        const key = "trendbeak:client-upgrade";
        if (sessionStorage.getItem(key) !== expected) {
          sessionStorage.setItem(key, expected);
          window.location.reload();
        }
      } catch { /* A blocked navigation remains a normal request failure, never a loop. */ }
    }
  }
  return response;
}

export function acknowledgeClientVersion() {
  navigator.serviceWorker?.addEventListener("message", event => {
    if (event.data?.type === "trendbeak:data-version") event.ports[0]?.postMessage(DATA_VERSION);
  });
}
