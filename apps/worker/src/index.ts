import { authHandler, initAuthConfig, verifyAuth } from "@hono/auth-js";
import type { Session } from "@auth/core/types";
import type {
  BootstrapResponse,
  HealthResponse,
  SessionResponse,
} from "@workspace/contracts";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";

import { createAuthConfig, getConfiguredProviders } from "./auth.js";
import type { Bindings } from "./env.js";
import {
  forwardRoomSocket,
  getRoomIdentity,
  parseRoomName,
} from "./room-route.js";

const app = new Hono<{ Bindings: Bindings }>();

app.use(
  "*",
  initAuthConfig((context) => createAuthConfig(context.env as Bindings)),
);

app.use("/api/rooms/*", verifyAuth());
app.get("/api/rooms/:room/socket", async (context) => {
  const roomName = parseRoomName(context.req.param("room"));
  if (!roomName) {
    return context.json({ error: "Invalid room name." }, 400);
  }

  const identity = getRoomIdentity(context.get("authUser").session);
  return forwardRoomSocket(
    context.req.raw,
    context.env.ROOMS,
    roomName,
    identity,
  );
});

app.use("*", secureHeaders());
app.use("/api/auth/*", authHandler());

app.get("/api/health", (context) =>
  context.json<HealthResponse>({
    service: context.env.APP_NAME,
    status: "ok",
  }),
);

app.get("/api/bootstrap", (context) =>
  context.json<BootstrapResponse>({
    appName: context.env.APP_NAME,
    providers: getConfiguredProviders(context.env),
  }),
);

app.use("/api/me", verifyAuth());
app.get("/api/me", (context) => {
  const session = context.get("authUser").session;
  return context.json(toSessionResponse(session));
});

app.notFound((context) =>
  context.json(
    {
      error: "Not found",
    },
    404,
  ),
);

export default app;
export { RoomDurableObject } from "./room.js";

export function toSessionResponse(session: Session): SessionResponse {
  return {
    expires: session.expires,
    ...(session.user ? { user: session.user } : {}),
  };
}
