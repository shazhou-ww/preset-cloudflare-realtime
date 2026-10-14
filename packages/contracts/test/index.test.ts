import { describe, expect, it } from "vitest";

import {
  authProviderIds,
  decodeRoomClientMessage,
  decodeRoomServerEvent,
  getAuthProviderLabel,
  roomMessageMaxLength,
  type RoomMessage,
} from "../src/index.js";

describe("getAuthProviderLabel", () => {
  it("labels every supported provider", () => {
    expect(authProviderIds.map(getAuthProviderLabel)).toEqual([
      "GitHub",
      "Google",
      "Microsoft",
    ]);
  });
});

const message: RoomMessage = {
  id: "message-1",
  author: {
    id: "connection-1",
    name: "Operator",
  },
  sentAt: "2026-10-14T10:00:00.000Z",
  text: "Confirm the launch window.",
};

describe("room protocol", () => {
  it("decodes and normalizes client messages", () => {
    expect(
      decodeRoomClientMessage('{"type":"message","text":"  Ready.  "}'),
    ).toEqual({
      ok: true,
      value: { type: "message", text: "Ready." },
    });
    expect(
      decodeRoomClientMessage(
        new TextEncoder().encode('{"type":"message","text":"From bytes"}')
          .buffer,
      ),
    ).toEqual({
      ok: true,
      value: { type: "message", text: "From bytes" },
    });
  });

  it("rejects malformed client messages with actionable errors", () => {
    expect(decodeRoomClientMessage("not json")).toMatchObject({
      ok: false,
      error: "Room payload must be valid JSON.",
    });
    expect(decodeRoomClientMessage('{"type":"other"}')).toMatchObject({
      ok: false,
      error: "Room messages must contain a text field.",
    });
    expect(
      decodeRoomClientMessage('{"type":"message","text":"  "}'),
    ).toMatchObject({
      ok: false,
      error: "Room messages cannot be empty.",
    });
    expect(
      decodeRoomClientMessage(
        JSON.stringify({
          type: "message",
          text: "x".repeat(roomMessageMaxLength + 1),
        }),
      ),
    ).toMatchObject({
      ok: false,
      error: `Room messages cannot exceed ${roomMessageMaxLength} characters.`,
    });
  });

  it("decodes every server event", () => {
    expect(
      decodeRoomServerEvent(
        JSON.stringify({
          type: "snapshot",
          connections: 2,
          messages: [message],
        }),
      ),
    ).toMatchObject({
      ok: true,
      value: { type: "snapshot", connections: 2, messages: [message] },
    });
    expect(
      decodeRoomServerEvent(JSON.stringify({ type: "message", message })),
    ).toMatchObject({
      ok: true,
      value: { type: "message", message },
    });
    expect(
      decodeRoomServerEvent(
        JSON.stringify({ type: "presence", connections: 3 }),
      ),
    ).toEqual({
      ok: true,
      value: { type: "presence", connections: 3 },
    });
    expect(
      decodeRoomServerEvent(
        JSON.stringify({ type: "error", message: "Try again." }),
      ),
    ).toEqual({
      ok: true,
      value: { type: "error", message: "Try again." },
    });
  });

  it("rejects malformed server events", () => {
    const invalidEvents = [
      "not json",
      "null",
      JSON.stringify({ type: "snapshot", connections: -1, messages: [] }),
      JSON.stringify({ type: "snapshot", connections: 1, messages: [{}] }),
      JSON.stringify({ type: "message", message: {} }),
      JSON.stringify({ type: "presence", connections: 1.5 }),
      JSON.stringify({ type: "error", message: "" }),
      JSON.stringify({ type: "unknown" }),
    ];

    for (const event of invalidEvents) {
      expect(decodeRoomServerEvent(event).ok).toBe(false);
    }
  });
});
