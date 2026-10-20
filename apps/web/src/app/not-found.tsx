import { ButtonLink, Arrow } from "@/components/ui/primitives";

export default function NotFound() {
  return (
    <div className="shell flex min-h-[60vh] flex-col items-start justify-center gap-6 py-24">
      <p className="kicker text-ink-300">404</p>
      <h1 className="text-[length:var(--text-headline)] font-semibold tracking-[-0.035em] text-bone-50">Nothing is recorded at this address.</h1>
      <ButtonLink href="/" intent="secondary">
        Back to overview <Arrow />
      </ButtonLink>
    </div>
  );
}
