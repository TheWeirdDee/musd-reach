"use client";

import { Button } from "@/components/ui/primitives";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="shell flex min-h-[60vh] flex-col items-start justify-center gap-6 py-24">
      <p className="kicker text-rust-300">Something failed</p>
      <h1 className="text-title font-semibold text-bone-50">This page hit an error. No transaction was sent.</h1>
      <p className="num max-w-2xl text-sm text-ink-300">{error.message.split("\n")[0]}</p>
      <Button intent="secondary" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
