import type { NextRequest } from "next/server";
export function requestOrigin(req: NextRequest) {
  const url = new URL(req.url);
  // Next dev can normalise req.url to localhost even when a browser uses 127.0.0.1.
  // Host is the browser's actual destination. No cross-origin allowlist is needed.
  const forwarded = req.headers.get("x-forwarded-proto");
  if (forwarded === "https" || forwarded === "http")
    url.protocol = `${forwarded}:`;
  const host = req.headers.get("host");
  if (host && /^[a-zA-Z0-9.[\]:-]+$/.test(host)) url.host = host;
  return url.origin;
}
export function requireSameOrigin(req: NextRequest, required = false) {
  const origin = req.headers.get("origin");
  if ((required && !origin) || (origin && origin !== requestOrigin(req)))
    throw Error("Unauthorized origin");
}
