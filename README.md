# Cloudflare realtime preset

A production-shaped Cloudflare starter for authenticated realtime rooms. It
combines React, Hono, Auth.js, Durable Objects, and the WebSocket Hibernation
API in one pnpm workspace and one deployment.

The included **Signal Room** interface is a working collaboration channel, not a
disconnected component demo. Derive it, rename the room model, and replace the
example language with your product.

## Derive a repository

```sh
git-lineage derive \
  https://github.com/shazhou-ww/preset-cloudflare-realtime.git \
  my-realtime-service \
  --branch main
cd my-realtime-service
pnpm install
```

This preset derives from
[`preset-cloudflare-fullstack`](https://github.com/shazhou-ww/preset-cloudflare-fullstack).
Its `.git-lineage.yaml` records that immediate parent. Run `git-lineage update`
to merge later fullstack baseline changes.

## Architecture

```text
apps/
  web/          React interface and WebSocket client
  worker/       Hono API, Auth.js, room router, Durable Object
packages/
  contracts/    HTTP and WebSocket contracts shared by both apps
```

The Worker serves the API and `apps/web/dist` from one origin. A browser signs
in through Auth.js, then upgrades:

```text
GET /api/rooms/:room/socket
```

`verifyAuth()` rejects anonymous upgrades. The Worker derives the room identity
from the verified session, chooses a Durable Object with `idFromName()`, and
forwards the upgrade through the `ROOMS` binding. A client cannot select its own
display identity with a request header.

Each named Durable Object:

- accepts sockets with `ctx.acceptWebSocket()`;
- stores identity with `serializeAttachment()`;
- recovers identity with `deserializeAttachment()`;
- discovers active sockets with `ctx.getWebSockets()`;
- handles messages in `webSocketMessage()`; and
- retains the newest 50 dispatches in durable storage.

Cloudflare may evict an inactive object while its clients stay connected. A new
event wakes the object and restores each socket attachment.

## Local development

Create the local secret file:

```sh
cp apps/worker/.dev.vars.example apps/worker/.dev.vars
```

Generate `AUTH_SECRET` with a cryptographically secure random value:

```sh
openssl rand -base64 32
```

Then run:

```sh
pnpm dev
```

- React development server: `http://localhost:5173`
- Worker development server: `http://localhost:8787`
- Vite proxies HTTP and WebSocket requests under `/api/*` to the Worker.

`AUTH_URL` in `.dev.vars.example` points to the proxied browser origin. This
keeps OAuth callbacks, session cookies, and room upgrades on `localhost:5173`.

Open two signed-in browser windows to see presence and dispatches synchronize
through the `operations` room.

## Identity providers

At least one provider needs credentials. Providers without both an ID and secret
are omitted from the interface.

### GitHub

```text
Homepage URL: http://localhost:5173
Authorization callback URL:
http://localhost:5173/api/auth/callback/github
```

Set `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET`.

### Google

```text
Authorized JavaScript origin: http://localhost:5173
Authorized redirect URI:
http://localhost:5173/api/auth/callback/google
```

Set `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`.

### Microsoft Entra ID

```text
http://localhost:5173/api/auth/callback/microsoft-entra-id
```

Set `AUTH_MICROSOFT_ENTRA_ID_ID`, `AUTH_MICROSOFT_ENTRA_ID_SECRET`, and
optionally `AUTH_MICROSOFT_ENTRA_ID_ISSUER`.

Use the production origin in every provider console before deployment.

## Worker configuration

The `ROOMS` binding and first SQLite-backed class migration live in
`apps/worker/wrangler.jsonc`:

```jsonc
{
  "durable_objects": {
    "bindings": [
      {
        "name": "ROOMS",
        "class_name": "RoomDurableObject",
      },
    ],
  },
  "migrations": [
    {
      "tag": "v1",
      "new_sqlite_classes": ["RoomDurableObject"],
    },
  ],
}
```

Do not edit a migration tag after deploying it. Add a new tag for every later
class addition, rename, or deletion.

Set production secrets from the Worker workspace:

```sh
pnpm --filter @workspace/worker exec wrangler secret put AUTH_SECRET
pnpm --filter @workspace/worker exec wrangler secret put AUTH_URL
pnpm --filter @workspace/worker exec wrangler secret put AUTH_GITHUB_ID
pnpm --filter @workspace/worker exec wrangler secret put AUTH_GITHUB_SECRET
```

Repeat the provider commands for Google or Microsoft. `AUTH_URL` must be the
full production auth base, for example:

```text
https://example.com/api/auth
```

Never commit `.dev.vars`; only `.dev.vars.example` belongs in Git.

## Commands

| Command       | Purpose                                                      |
| ------------- | ------------------------------------------------------------ |
| `pnpm dev`    | Build initial assets, then run Vite and Wrangler             |
| `pnpm check`  | Format, lint, type-check, test, and dry-run the Worker build |
| `pnpm build`  | Build contracts, web assets, and the Worker bundle           |
| `pnpm deploy` | Validate everything and deploy the Worker plus assets        |
| `pnpm clean`  | Remove all generated outputs                                 |

## Continuous deployment

Push deployment is disabled by default. Configure the `production` GitHub
environment with:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

Set `CLOUDFLARE_DEPLOY_ENABLED=true` as a repository variable to deploy every
push to `main`. A manual workflow dispatch always attempts a deployment. Use a
narrowly scoped token that can edit Workers scripts and Durable Objects.

## Before shipping a derived app

1. Change package and repository metadata.
2. Change the Worker name and compatibility date.
3. Choose room naming and authorization rules for your domain.
4. Replace Signal Room content and branding.
5. Configure production callback URLs and secrets.
6. Add a new Durable Object migration for every class change.
7. Enable deployment only after the Cloudflare environment is configured.

## License

MIT
