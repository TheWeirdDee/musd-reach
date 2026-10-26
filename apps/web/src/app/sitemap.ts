import type { MetadataRoute } from "next";
import { articles } from "@/lib/docs";
import { publicRuns } from "@/lib/reach";
import { SITE_URL } from "@/lib/metadata";
export default function sitemap(): MetadataRoute.Sitemap { return ["", "/docs", "/proof", "/contracts", "/integrations", "/developers", "/status", "/risks", "/security", ...articles.map((a) => `/docs/${a.slug}`), ...publicRuns.map((r) => `/proof/${r.runId}`)].map((path) => ({ url: `${SITE_URL}${path}`, changeFrequency: path === "/status" ? "daily" : "weekly" })); }
