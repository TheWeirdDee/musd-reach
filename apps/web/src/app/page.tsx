import { Hero } from "@/components/landing/Hero";
import { Problem } from "@/components/landing/Problem";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Anatomy } from "@/components/landing/Anatomy";
import { Architecture } from "@/components/landing/Architecture";
import { Backing } from "@/components/landing/Backing";
import { Security } from "@/components/landing/Security";
import { IntegrationStatus, ProofTeaser, DeveloperSection, Faq, FinalCta } from "@/components/landing/Closing";

export default function Home() {
  return (
    <>
      <Hero />
      <Problem />
      <HowItWorks />
      <Anatomy />
      <Architecture />
      <Backing />
      <Security />
      <IntegrationStatus />
      <ProofTeaser />
      <DeveloperSection />
      <Faq />
      <FinalCta />
    </>
  );
}
