# Production image: install, build, then ship only the runtime artifacts.
#
# This is not a local-development dependency. Local development runs through
# docker/Dockerfile.dev (see compose.dev.yaml); production remains Vercel + Neon.
FROM node:22-alpine AS build

ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
ENV CI=1
ENV NEXT_TELEMETRY_DISABLED=1

RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps ./apps
COPY --from=build /app/packages ./packages

EXPOSE 3000

CMD ["pnpm", "--filter", "@battle-agents/web", "run", "start"]
