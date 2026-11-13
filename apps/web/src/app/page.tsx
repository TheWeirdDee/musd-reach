import { Hero } from "@/components/landing/Hero";
import { Problem } from "@/components/landing/Problem";
import { WhoItsFor } from "@/components/landing/WhoItsFor";
import { WhyItPays } from "@/components/landing/WhyItPays";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { BuiltOnMezo } from "@/components/landing/BuiltOnMezo";
import { Anatomy } from "@/components/landing/Anatomy";
import { Architecture } from "@/components/landing/Architecture";
import { Backing } from "@/components/landing/Backing";
import { Security } from "@/components/landing/Security";
import { IntegrationStatus, ProofTeaser, DeveloperSection, Faq } from "@/components/landing/Closing";
import { SiteFooter } from "@/components/site/SiteFooter";

export default function Home() {
  return (
    <>
      <Hero />
      <Problem />
      <WhoItsFor />
      <WhyItPays />
      <HowItWorks />
      <BuiltOnMezo />
      <Anatomy />
      <Architecture />
      <Backing />
      <Security />
      <IntegrationStatus />
      <ProofTeaser />
      <DeveloperSection />
      <Faq />
      <SiteFooter />
    </>
  );
}
