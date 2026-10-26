import type { Metadata } from "next";
export const SITE_URL = "https://musd-reach.vercel.app";
export function pageMetadata(title: string, description: string, path: string, privateState = false): Metadata {
  return { title, description, alternates: { canonical: path }, robots: { index: !privateState, follow: true }, openGraph: { title: `${title} · MUSD Reach`, description, url: path, siteName: "MUSD Reach", type: "website", images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "MUSD Reach — Mezo savings, a verifiable claim on Base" }] }, twitter: { card: "summary_large_image", title: `${title} · MUSD Reach`, description, images: ["/opengraph-image"] } };
}
