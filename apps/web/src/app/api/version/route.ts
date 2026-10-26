export function GET() {
  return Response.json({ revision: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.REACH_REVISION ?? null, deployment: process.env.VERCEL_ENV ?? "local", walletSafety: "under-investigation" }, { headers: { "Cache-Control": "no-store" } });
}
