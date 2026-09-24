# apps/web

Next.js app. Serves the human-facing surface, the auth mount, and the HTTP
endpoints that agent traffic and browsers both use.

## What this app owns, and what it must not

The auth layer in `src/auth/server.ts` is Better Auth, and it is scoped to
**human authentication only**. It decides who is logged in. It does not know
about agents, characters, game sessions, or progression.

That boundary is held by a test rather than by a comment. `server.test.ts`
reads the auth configuration and fails if any of the vocabulary the plan
reserves for features appears in it. If you find yourself adding an agent
concept to that file, the test will stop you, and that is the point.

Agent identity is a separate thing entirely: an `agents` row, a credential the
user never sees, and sessions belonging to that agent. A GitHub OAuth token is
never an agent identity.

## Running it

The whole stack, which is what you want for anything close to real:

```
docker compose up
```

Web on `http://127.0.0.1:3000`, Postgres in a container with a named volume, so
it survives `docker compose down && docker compose up`.

Just the app, against a database you already have:

```
pnpm db:migrate
pnpm db:seed
cd apps/web && pnpm dev
```

If `DATABASE_URL` points at a database that has not been migrated, the failure
appears later and further away than you would like. Run the two commands above
first.

## When it fails

Three ways, in rough order of how often they happen.

### 1. GitHub rejects the callback: `redirect_uri_mismatch`

**Symptom.** Everything starts. The login button works. GitHub shows an error
mentioning `redirect_uri_mismatch`.

**Why.** GitHub matches the callback URL exactly and treats `127.0.0.1` and
`localhost` as different origins. This is why the app checks the configured
base URL at startup instead of passing it through: a mismatch here is the most
likely reason a newcomer's first run fails, and it fails late.

**Fix.** The OAuth app has to be registered with exactly:

```
Homepage URL:               http://127.0.0.1:3000
Authorization callback URL: http://127.0.0.1:3000/api/auth/callback/github
```

Use `127.0.0.1`, not `localhost`. Register a separate OAuth app for production
so that reconfiguring for a deploy cannot break local testing. The values are
repeated in the repository's `.env.example` on purpose.

### 2. Auth environment is incomplete

**Symptom.** The app fails at startup with `auth is not configured`, followed by
a list of the missing variable names.

That is `MissingAuthConfigurationError` from `src/auth/server.ts`, which
carries the missing names as a `missing` property so a caller can act on them
rather than parse the message.

**Fix.** Copy `.env.example` to `.env` and fill in `BETTER_AUTH_SECRET`,
`GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`. The secret is generated with
`openssl rand -base64 32`.

### 3. The database is unreachable or empty

**Symptom.** Depends on where it surfaces. A connection error names the URL it
tried. A database that is up but has no tables shows up later, as a complaint
about a missing relation, often from the seed step rather than from auth.

`DATABASE_URL` is deliberately not part of the auth configuration's required
set. The database package reads it and reports a missing or wrong value better
than the auth file could, and a field carried in a place that never reads it
looks like it owns something it does not.

**Fix.** Check the URL first, then check that migrations ran:

```
pnpm db:generate     # only after editing the schema
pnpm db:migrate
pnpm db:seed
pnpm db:verify
```

`db:verify` is the one that tells you whether the tables are actually there. A
migration that reports success is not proof, because drizzle-kit keeps its own ledger
in a separate schema, so dropping the application schema leaves it believing
everything has been applied while no table exists. The pipeline's `migrations`
stage checks for the tables directly for exactly that reason.

## Environment

All server-side keys live in the repository's `.env.example` and are read at
startup. Nothing is read on the client, and no token belongs in a URL.
