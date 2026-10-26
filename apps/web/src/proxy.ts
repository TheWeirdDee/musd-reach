import { NextResponse, type NextRequest } from "next/server";
import { buildCsp } from "@/lib/csp";
import { apiUrl, reachConfig } from "@/lib/reach";

const policyFor = (nonce: string) =>
  buildCsp({
    nonce,
    dev: process.env.NODE_ENV === "development",
    rpcUrls: [...reachConfig.mezo.rpcUrls, ...reachConfig.base.rpcUrls],
    apiUrl,
    walletConnect: false,
  });

/**
 * Per-request CSP nonce. Next.js reads the nonce from the request's CSP header and applies it to
 * the scripts it renders, which is why pages render dynamically (see the root layout).
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
  const csp = policyFor(nonce);

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // HTML routes only; hashed static assets and images carry no script context.
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
