import type { BootstrapResponse, HealthResponse } from "@workspace/contracts";
import { encode } from "@auth/core/jwt";
import { describe, expect, it } from "vitest";

import { createAuthConfig } from "../src/auth.js";
import type { Bindings } from "../src/env.js";
import app, { toSessionResponse } from "../src/index.js";
import {
  decodeRoomIdentity,
  encodeRoomIdentity,
  forwardRoomSocket,
  getRoomIdentity,
  isRoomSocketAttachment,
  parseRoomName,
  roomIdentityHeader,
  type RoomNamespace,
} from "../src/room-route.js";
import {
  appendRoomMessage,
  createRoomMessage,
  roomHistoryLimit,
} from "../src/room-state.js";

const baseBindings = {
  APP_NAME: "Signal Room",
  AUTH_SECRET: "test-secret-that-is-long-enough-for-auth",
} as Bindings;

describe("Worker", () => {
  it("reports health", async () => {
    const response = await app.request(
      "http://example.test/api/health",
      {},
      baseBindings,
    );

    expect(response.status).toBe(200);
    await expect(response.json<HealthResponse>()).resolves.toEqual({
      service: "Signal Room",
      status: "ok",
    });
  });

  it("only exposes configured identity providers", async () => {
    const response = await app.request(
      "http://example.test/api/bootstrap",
      {},
      {
        ...baseBindings,
        AUTH_GITHUB_ID: "github-id",
        AUTH_GITHUB_SECRET: "github-secret",
        AUTH_GOOGLE_ID: "google-id",
        AUTH_GOOGLE_SECRET: "google-secret",
        AUTH_MICROSOFT_ENTRA_ID_ID: "microsoft-id",
        AUTH_MICROSOFT_ENTRA_ID_ISSUER:
          "https://login.microsoftonline.com/common/v2.0",
        AUTH_MICROSOFT_ENTRA_ID_SECRET: "microsoft-secret",
      },
    );

    const body = await response.json<BootstrapResponse>();
    expect(body.providers).toEqual([
      { id: "github", label: "GitHub" },
      { id: "google", label: "Google" },
      { id: "microsoft-entra-id", label: "Microsoft" },
    ]);
  });

  it("ignores incomplete credentials and supports the default Microsoft issuer", async () => {
    const bindings: Bindings = {
      ...baseBindings,
      AUTH_GITHUB_ID: "github-without-a-secret",
      AUTH_GOOGLE_ID: " ",
      AUTH_GOOGLE_SECRET: "google-secret",
      AUTH_MICROSOFT_ENTRA_ID_ID: "microsoft-id",
      AUTH_MICROSOFT_ENTRA_ID_SECRET: "microsoft-secret",
    };
    const response = await app.request(
      "http://example.test/api/bootstrap",
      {},
      bindings,
    );

    await expect(response.json<BootstrapResponse>()).resolves.toMatchObject({
      providers: [{ id: "microsoft-entra-id", label: "Microsoft" }],
    });
    expect(createAuthConfig(bindings).providers).toHaveLength(1);
  });

  it("protects the current-user endpoint", async () => {
    const response = await app.request(
      "http://example.test/api/me",
      {},
      baseBindings,
    );

    expect(response.status).toBe(401);
  });

  it("protects room sockets and validates room names after authentication", async () => {
    const unauthorized = await app.request(
      "http://example.test/api/rooms/launch/socket",
      { headers: { upgrade: "websocket" } },
      baseBindings,
    );
    const cookieName = "authjs.session-token";
    const token = await encode({
      salt: cookieName,
      secret: baseBindings.AUTH_SECRET,
      token: {
        email: "operator@example.test",
        name: "Operator",
        sub: "operator-1",
      },
    });
    const invalidRoom = await app.request(
      "http://example.test/api/rooms/not_valid/socket",
      {
        headers: {
          cookie: `${cookieName}=${token}`,
          upgrade: "websocket",
        },
      },
      baseBindings,
    );

    expect(unauthorized.status).toBe(401);
    expect(invalidRoom.status).toBe(400);
    await expect(invalidRoom.json()).resolves.toEqual({
      error: "Invalid room name.",
    });
  });

  it("returns a JSON 404 for unknown API routes", async () => {
    const response = await app.request(
      "http://example.test/api/unknown",
      {},
      baseBindings,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not found" });
  });

  it("maps Auth.js sessions to the public contract", () => {
    expect(
      toSessionResponse({
        expires: "2099-01-01T00:00:00.000Z",
        user: {
          email: "operator@example.test",
          name: "Operator",
        },
      }),
    ).toEqual({
      expires: "2099-01-01T00:00:00.000Z",
      user: {
        email: "operator@example.test",
        name: "Operator",
      },
    });
    expect(
      toSessionResponse({
        expires: "2099-01-01T00:00:00.000Z",
      }),
    ).toEqual({
      expires: "2099-01-01T00:00:00.000Z",
    });
  });

  describe("room routing", () => {
    it("normalizes safe room names", () => {
      expect(parseRoomName(" Launch-Room ")).toBe("launch-room");
      expect(parseRoomName("room_1")).toBeNull();
      expect(parseRoomName("-room")).toBeNull();
      expect(parseRoomName("x".repeat(64))).toBeNull();
    });

    it("derives a non-empty display name from a session", () => {
      expect(
        getRoomIdentity({
          expires: "2099-01-01T00:00:00.000Z",
          user: { email: "fallback@example.test", name: " Operator " },
        }),
      ).toEqual({ displayName: "Operator" });
      expect(
        getRoomIdentity({
          expires: "2099-01-01T00:00:00.000Z",
          user: { email: " fallback@example.test ", name: " " },
        }),
      ).toEqual({ displayName: "fallback@example.test" });
      expect(
        getRoomIdentity({
          expires: "2099-01-01T00:00:00.000Z",
          user: {},
        }),
      ).toEqual({ displayName: "Member" });
    });

    it("round-trips and validates room identities", () => {
      const encoded = encodeRoomIdentity({ displayName: "Operator Zhou" });

      expect(decodeRoomIdentity(encoded)).toEqual({
        displayName: "Operator Zhou",
      });
      expect(decodeRoomIdentity(null)).toBeNull();
      expect(decodeRoomIdentity("%")).toBeNull();
      expect(
        encodeRoomIdentity({ displayName: "Operator Zhou" }),
      ).not.toContain(" ");
      expect(
        isRoomSocketAttachment({
          connectionId: "connection-1",
          displayName: "Operator Zhou",
        }),
      ).toBe(true);
      expect(isRoomSocketAttachment({ displayName: "Operator Zhou" })).toBe(
        false,
      );
    });

    it("requires an upgrade before forwarding to a named Durable Object", async () => {
      const calls: Request[] = [];
      const namespace: RoomNamespace<string> = {
        idFromName: (name) => `id:${name}`,
        get: (id) => ({
          fetch: (request) => {
            calls.push(request);
            return Promise.resolve(new Response(id, { status: 202 }));
          },
        }),
      };

      const rejected = await forwardRoomSocket(
        new Request("https://example.test/api/rooms/launch/socket"),
        namespace,
        "launch",
        { displayName: "Operator" },
      );
      const forwarded = await forwardRoomSocket(
        new Request("https://example.test/api/rooms/launch/socket", {
          headers: { upgrade: "websocket" },
        }),
        namespace,
        "launch",
        { displayName: "Operator" },
      );

      expect(rejected.status).toBe(426);
      expect(forwarded.status).toBe(202);
      expect(await forwarded.text()).toBe("id:launch");
      expect(calls).toHaveLength(1);
      expect(
        decodeRoomIdentity(calls[0]?.headers.get(roomIdentityHeader) ?? null),
      ).toEqual({ displayName: "Operator" });
    });
  });

  describe("room state", () => {
    it("creates messages and retains only the newest history", () => {
      const author = { id: "connection-1", name: "Operator" };
      const first = createRoomMessage(
        author,
        "First",
        "message-1",
        "2026-10-14T10:00:00.000Z",
      );
      const second = createRoomMessage(
        author,
        "Second",
        "message-2",
        "2026-10-14T10:01:00.000Z",
      );

      expect(first).toEqual({
        id: "message-1",
        author,
        sentAt: "2026-10-14T10:00:00.000Z",
        text: "First",
      });
      expect(appendRoomMessage([first], second, 1)).toEqual([second]);
      expect(roomHistoryLimit).toBe(50);
    });

    it("generates message identifiers and timestamps by default", () => {
      const message = createRoomMessage(
        { id: "connection-1", name: "Operator" },
        "Ready",
      );

      expect(message.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
      );
      expect(Number.isNaN(Date.parse(message.sentAt))).toBe(false);
    });
  });
});
