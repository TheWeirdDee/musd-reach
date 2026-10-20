# MUSD Reach API + indexer. Build from the repository root:
#   docker build -f apps/api/Dockerfile -t musd-reach-api .
FROM node:22-bookworm-slim AS deps
WORKDIR /repo
RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/sdk/package.json packages/sdk/
COPY packages/protocol-registry/package.json packages/protocol-registry/
COPY packages/verifier/package.json packages/verifier/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY scripts/package.json scripts/
RUN pnpm install --frozen-lockfile --filter @musd-reach/api...

FROM node:22-bookworm-slim
WORKDIR /repo
ENV NODE_ENV=production
RUN corepack enable && useradd --create-home reach
COPY --from=deps /repo /repo
COPY packages/sdk packages/sdk
COPY packages/protocol-registry packages/protocol-registry
COPY apps/api apps/api
# Read-only inputs the API serves: recorded deployment and evidence runs.
COPY deployments deployments
COPY evidence evidence
RUN mkdir -p /data && chown reach /data
USER reach
ENV PGLITE_DIR=/data/pglite API_PORT=8787 ROLE=all
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["pnpm", "--filter", "@musd-reach/api", "start"]
