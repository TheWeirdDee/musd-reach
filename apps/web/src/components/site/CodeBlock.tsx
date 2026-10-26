"use client";
import { useState } from "react";
export function CodeBlock({ children, label = "TypeScript" }: { children: string; label?: string }) {
  const [message, setMessage] = useState("Copy");
  const tokens = children.split(/(\/\/[^\n]*|"[^"\n]*"|'[^'\n]*'|\b(?:import|from|export|const|let|async|await|function|return|if|throw|new|type)\b)/g);
  return <div className="overflow-hidden rounded-md border border-ink-700 bg-ink-900"><div className="flex items-center justify-between gap-4 border-b border-ink-700 px-4 py-2"><span className="kicker text-ink-300">{label}</span><button className="min-h-9 text-xs text-ink-200 underline underline-offset-4" aria-label={`Copy ${label}`} onClick={async () => { try { await navigator.clipboard.writeText(children); setMessage("Copied"); } catch { setMessage("Select and copy the code below"); } }}>{message}</button></div><pre tabIndex={0} aria-label={`${label} code`} className="overflow-x-auto p-5 text-xs leading-7"><code className="num">{tokens.map((t, i) => <span key={i} className={t.startsWith("//") ? "text-ink-400" : /^["']/.test(t) ? "text-sage-300" : /^(import|from|export|const|let|async|await|function|return|if|throw|new|type)$/.test(t) ? "text-ember-300" : "text-bone-200"}>{t}</span>)}</code></pre><span className="sr-only" role="status">{message === "Copy" ? "" : message}</span></div>;
}
