"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { articles, docGroups } from "@/lib/docs";
export function DocsNav() {
  const [search, setSearch] = useState("");
  const path = usePathname();
  const matches = articles.filter((a) => `${a.title} ${a.description} ${a.group}`.toLowerCase().includes(search.toLowerCase()));
  const content = (id: string) => <><label className="kicker text-ink-300" htmlFor={id}>Find a guide</label><input id={id} type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search documentation…" className="mt-3 h-11 w-full rounded-sm border border-ink-600 bg-ink-950 px-3 text-sm" /><p role="status" className="mt-2 text-xs text-ink-400">{search ? `${matches.length} matching guides` : "Guides, concepts and operations"}</p><nav aria-label="Documentation" className="mt-7 space-y-7">{docGroups.map((group) => { const list = matches.filter((a) => a.group === group); return list.length ? <div key={group}><p className="kicker mb-2 text-ink-400">{group}</p><ul className="space-y-1">{list.map((a) => <li key={a.slug}><Link aria-current={path === `/docs/${a.slug}` ? "page" : undefined} href={`/docs/${a.slug}`} className={`block rounded-sm px-2 py-2 text-sm leading-5 ${path === `/docs/${a.slug}` ? "bg-ember-500/10 text-ember-300" : "text-ink-200 hover:bg-ink-800"}`}>{a.title}</Link></li>)}</ul></div> : null; })}</nav></>;
  return <aside className="docs-sidebar"><details className="lg:hidden" key={path}><summary className="cursor-pointer py-3 text-sm font-medium">Browse documentation ↓</summary><div className="pt-3">{content("docs-filter-mobile")}</div></details><div className="hidden lg:block">{content("docs-filter-desktop")}</div></aside>;
}
