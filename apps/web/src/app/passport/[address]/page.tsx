import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAddress, isAddress, type Address } from "viem";
import { ContentPage } from "@/components/site/Page";
import { PassportCard, StampList } from "@/components/app/Passport";
import { readPassports, ROUTE_STAMPS } from "@/lib/passport";
import { pageMetadata } from "@/lib/metadata";

type Props = { params: Promise<{ address: string }> };

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Share page: the title and preview text carry how far this wallet has travelled, read from chain events. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  if (!isAddress(address)) return pageMetadata("Route passport", "MUSD Reach route passport.", "/passport", false);
  let line = "A route passport on MUSD Reach: Mezo to Base and home again, on testnet.";
  try {
    const board = await readPassports();
    const w = board.wallets.find((x) => x.address.toLowerCase() === address.toLowerCase());
    if (w) line = `${short(address)} is ${w.stage.label.toLowerCase()} with ${w.done.filter((id) => id !== "bug").length} of ${ROUTE_STAMPS} route stamps on MUSD Reach.`;
  } catch {}
  return pageMetadata(`Passport · ${short(address)}`, line, `/passport/${getAddress(address)}`, false);
}

export default async function WalletPassportPage({ params }: Props) {
  const { address } = await params;
  if (!isAddress(address)) notFound();
  const a = getAddress(address) as Address;
  return (
    <ContentPage kicker="Route passport" title={<>A traveller&apos;s passport</>} lede={<p>Read live from chain events. <Link className="underline underline-offset-4" href="/passport">See every stamp and the route board</Link>, or <Link className="underline underline-offset-4" href="/start">start your own</Link> with an empty wallet.</p>}>
      <div className="space-y-12">
        <PassportCard address={a} />
        <StampList address={a} />
      </div>
    </ContentPage>
  );
}
