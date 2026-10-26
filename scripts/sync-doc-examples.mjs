import { readFileSync, writeFileSync } from "node:fs";
const code = readFileSync(new URL("./examples/read-only-integration.ts", import.meta.url), "utf8");
writeFileSync(new URL("../apps/web/src/generated/developer-example.json", import.meta.url), JSON.stringify({ path: "scripts/examples/read-only-integration.ts", code }, null, 2) + "\n");
