// Copies the recorded deployment and evidence runs into apps/web/src/generated/site-data.json.
// Public-testnet runs and local-fork rehearsals are kept in separate lists and never mixed.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => {
  const bytes = readFileSync(p);
  // PowerShell redirects may produce UTF-16 evidence. Preserve those records on disk.
  const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le"
    : bytes[0] === 0xfe && bytes[1] === 0xff ? "utf-16be" : "utf-8";
  try {
    return JSON.parse(new TextDecoder(encoding, { fatal: true }).decode(bytes).replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new Error(`Cannot read JSON from ${p}: ${error.message}`, { cause: error });
  }
};
const runs = (dir) => {
  const p = join(root, dir);
  if (!existsSync(p)) return [];
  return readdirSync(p)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => read(join(p, f)));
};

const deploymentPath = join(root, "deployments", "testnet.json");
const data = {
  generatedAt: new Date().toISOString(),
  deployment: existsSync(deploymentPath) ? read(deploymentPath) : null,
  // Superseded deployments stay listed for historical evidence and known-issue disclosure.
  previousDeployments: ["testnet-v1.json"]
    .map((f) => join(root, "deployments", f))
    .filter((p) => existsSync(p))
    .map((p) => read(p)),
  publicRuns: runs("evidence/real-chain").filter((r) => r.kind === "PUBLIC_TESTNET_RUN"),
  rehearsals: runs("evidence/fork-rehearsal").filter((r) => r.kind === "LOCAL_FORK_REHEARSAL"),
};
const out = join(root, "apps/web/src/generated/site-data.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(data, null, 2) + "\n");
console.log(`site data: deployment=${data.deployment ? "yes" : "none"} public=${data.publicRuns.length} rehearsals=${data.rehearsals.length}`);
