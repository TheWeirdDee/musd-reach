"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { parseAbi, type Address } from "viem";
import { ContentPage, H2 } from "@/components/site/Page";
import { Chip, Panel } from "@/components/ui/primitives";
import { WalletButton } from "@/components/site/WalletButton";
import { useClients } from "@/lib/hooks";
import { reachConfig } from "@/lib/reach";
import { markets } from "@/lib/markets";
import { cn } from "@/lib/cn";

const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)"]);

function useBalances(address?: Address) {
  const c = useClients();
  const d = reachConfig.deployment;
  return useQuery({
    queryKey: ["start-balances", address],
    enabled: !!c && !!address,
    refetchInterval: 15_000,
    queryFn: async () => {
      const zero = Promise.resolve(0n);
      const [btc, eth, musd, usdc, rw, vault] = await Promise.all([
        c!.mezo.getBalance({ address: address! }),
        c!.base.getBalance({ address: address! }),
        c!.mezo.readContract({ address: reachConfig.mezo.musd, abi: erc20, functionName: "balanceOf", args: [address!] }),
        markets ? c!.base.readContract({ address: markets.loanToken, abi: erc20, functionName: "balanceOf", args: [address!] }) : zero,
        d ? c!.base.readContract({ address: d.receipt, abi: erc20, functionName: "balanceOf", args: [address!] }) : zero,
        markets ? c!.base.readContract({ address: markets.vault, abi: erc20, functionName: "balanceOf", args: [address!] }) : zero,
      ]);
      return { btc, eth, musd, usdc, rw, vault };
    },
  });
}

function Step({ n, title, done, children }: { n: string; title: string; done?: boolean; children: ReactNode }) {
  return (
    <li className={cn("rounded-md border p-5", done ? "border-sage-500/30 bg-sage-500/[0.04]" : "border-ink-700 bg-ink-850")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="num grid h-7 w-7 place-items-center rounded-full border border-ink-600 text-xs text-ink-300">{n}</span>
          <p className="font-medium text-bone-50">{title}</p>
        </div>
        {done !== undefined && <Chip tone={done ? "verified" : "neutral"}>{done ? "Done" : "To do"}</Chip>}
      </div>
      <div className="mt-3 text-sm leading-6 text-ink-300 [&_a]:text-bone-100 [&_a]:underline [&_a]:underline-offset-4">{children}</div>
    </li>
  );
}

export default function StartPage() {
  const { address } = useAccount();
  const b = useBalances(address);
  const has = (v?: bigint) => (address && b.data ? (v ?? 0n) > 0n : undefined);
  return (
    <ContentPage
      kicker="Try it on testnet"
      title={<>Borrow on Base against Mezo savings. <span className="font-serif font-normal italic text-ember-400">In ten minutes.</span></>}
      lede={<p>Everything runs on public testnets with free faucet tokens. Pick the quick lending path, or do the full loop: save on Mezo, borrow on Base, bring it home. Steps tick themselves off as your balances arrive.</p>}
    >
      <div className="mb-8 flex flex-wrap items-center gap-4">
        <WalletButton />
        {address && <span className="text-sm text-ink-300">Checking balances on Mezo testnet and Base Sepolia live.</span>}
      </div>
      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <H2>Quick path: lend USDC</H2>
          <p className="mt-2 text-sm text-ink-300">Base Sepolia only. Two faucets, two transactions.</p>
          <ol className="mt-5 space-y-3">
            <Step n="1" title="Get Base Sepolia ETH for gas" done={has(b.data?.eth)}>
              Sign in with GitHub at the <a href="https://console.optimism.io/faucet" target="_blank" rel="noreferrer">Superchain faucet</a>, pick <strong>Base Sepolia</strong> and claim. 0.01 ETH is plenty. Backup: the <a href="https://portal.cdp.coinbase.com/products/faucet" target="_blank" rel="noreferrer">Coinbase developer faucet</a>.
            </Step>
            <Step n="2" title="Get test USDC" done={has(b.data?.usdc)}>
              Choose <strong>Base Sepolia</strong> at <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">faucet.circle.com</a> and paste your address.
            </Step>
            <Step n="3" title="Deposit into the Reach USDC Vault" done={has(b.data?.vault)}>
              Open <Link href="/app/lend">Lend</Link>. Your USDC is supplied to the rwSMUSD market, where every borrower has posted a claim on Mezo savings.
            </Step>
          </ol>
        </section>
        <section>
          <H2>Full loop: save, borrow, return</H2>
          <p className="mt-2 text-sm text-ink-300">Mezo testnet and Base Sepolia.</p>
          <ol className="mt-5 space-y-3">
            <Step n="1" title="Get testnet BTC on Mezo" done={has(b.data?.btc)}>
              Claim at <a href="https://faucet.test.mezo.org" target="_blank" rel="noreferrer">faucet.test.mezo.org</a>. It pays gas on Mezo and backs MUSD.
            </Step>
            <Step n="2" title="Mint MUSD against your BTC" done={has(b.data?.musd)}>
              Open a testnet MUSD loan at <a href="https://testnet.mezo.org/borrow" target="_blank" rel="noreferrer">testnet.mezo.org/borrow</a>. The minimum loan is 1,800 MUSD, so post about 0.04 testnet BTC as collateral (BTC is about $74,000 on testnet; stay above a 150% collateral ratio).
            </Step>
            <Step n="3" title="Make your savings portable" done={has(b.data?.rw)}>
              <Link href="/app/portable/new">Make portable</Link> deposits MUSD into Mezo&apos;s Savings Vault and sends you rwSMUSD on Base (Wormhole delivery takes tens of minutes on testnet).
            </Step>
            <Step n="4" title="Borrow USDC on Base">
              <Link href="/app/borrow">Borrow</Link>: post rwSMUSD as Morpho collateral and borrow USDC. Your savings keep earning on Mezo.
            </Step>
            <Step n="5" title="Repay and bring it home">
              Repay on <Link href="/app/borrow">Borrow</Link>, then <Link href="/app/redeem">Redeem</Link> burns rwSMUSD and releases your savings on Mezo.
            </Step>
          </ol>
        </section>
      </div>
      <Panel className="mt-10 p-6">
        <H2>Tell us how it went</H2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-300">
          Hit a confusing step or an error? <a className="text-bone-100 underline underline-offset-4" href="https://github.com/TheWeirdDee/musd-reach/issues/new?title=Testnet%20feedback&labels=feedback" target="_blank" rel="noreferrer">Open a quick issue</a> with your address and what you saw. Every tester address shows up on the <Link className="text-bone-100 underline underline-offset-4" href="/proof">proof page</Link>.
        </p>
      </Panel>
    </ContentPage>
  );
}
