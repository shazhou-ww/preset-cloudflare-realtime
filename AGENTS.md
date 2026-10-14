# Project Guidelines

## Development

- This preset extends the React/Vite, Hono, and Auth.js workspace with
  authenticated WebSocket rooms backed by a Durable Object.
- Use Node.js 22.13 or newer and pnpm 11.22 or newer.
- Install dependencies with `pnpm install`.
- Run `pnpm check` before submitting changes; use `pnpm dev` for local
  development.
- Keep shared third-party versions in the pnpm catalog and internal workspace
  dependencies on `workspace:*`.
- Keep each workspace's build, lint, test, and typecheck scripts aligned with
  `turbo.json`.
- Preserve the same-origin static asset and `/api/*` Worker routing, including
  the WebSocket upgrade route described in `README.md`.

## Skills

- Manage project skills with `npx skills`.
- Keep all project skills under `.agent/skills/<skill-name>/`, with each skill's
  `SKILL.md` in its directory.

## Authentication and deployment

- Authenticate WebSocket upgrades on the server. Derive room and display
  identity only from the verified session; never trust client-supplied identity
  headers or room ownership.
- Preserve Durable Object WebSocket hibernation behavior and serialized socket
  attachments so identity survives eviction.
- Treat deployed Durable Object migration tags as immutable. Add a new tag for
  each class migration.
- Never commit `.dev.vars` or real credentials. Update only `.dev.vars.example`
  when documenting required variables.
- Keep push deployment disabled by default. Do not deploy or enable production
  deployment unless explicitly requested.
