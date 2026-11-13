"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { ContentPage } from "@/components/site/Page";
import { WalletButton } from "@/components/site/WalletButton";
import { PassportCard, StampList, RouteBoard } from "@/components/app/Passport";

export default function PassportPage() {
  const { address } = useAccount();
  return (
    <ContentPage
      kicker="Route passport"
      title={<>Mezo to Base and home again. <span className="font-serif font-normal italic text-ember-400">Stamp every leg.</span></>}
      lede={
        <p>
          A Reach position travels: savings start on Mezo, a receipt crosses to Base over Wormhole, and everything comes home. Each leg you complete on testnet earns a stamp, proven by an on-chain event, so your passport is public and anyone can recheck it. Start with the free <Link className="underline underline-offset-4" href="/start">route kit</Link>; your wallet can be empty. Stamps have no cash value.
        </p>
      }
    >
      <div className="space-y-12">
        {address ? <PassportCard address={address} mine /> : <div className="flex flex-wrap items-center gap-4"><WalletButton /><span className="text-sm text-ink-300">Connect to see your passport.</span></div>}
        <StampList address={address} />
        <RouteBoard />
      </div>
    </ContentPage>
  );
}
