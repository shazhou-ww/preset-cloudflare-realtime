export const authProviderIds = [
  "github",
  "google",
  "microsoft-entra-id",
] as const;

export type AuthProviderId = (typeof authProviderIds)[number];

export interface AuthProviderDescriptor {
  readonly id: AuthProviderId;
  readonly label: string;
}

export interface BootstrapResponse {
  readonly appName: string;
  readonly providers: readonly AuthProviderDescriptor[];
}

export interface HealthResponse {
  readonly service: string;
  readonly status: "ok";
}

export interface SessionUser {
  readonly email?: string | null;
  readonly image?: string | null;
  readonly name?: string | null;
}

export interface SessionResponse {
  readonly expires?: string;
  readonly user?: SessionUser;
}

export const roomMessageMaxLength = 500;
export const roomHistoryLimit = 50;

export interface RoomAuthor {
  readonly id: string;
  readonly name: string;
}

export interface RoomMessage {
  readonly id: string;
  readonly author: RoomAuthor;
  readonly sentAt: string;
  readonly text: string;
}

export interface RoomClientMessage {
  readonly type: "message";
  readonly text: string;
}

export type RoomServerEvent =
  | {
      readonly type: "snapshot";
      readonly connections: number;
      readonly messages: readonly RoomMessage[];
    }
  | {
      readonly type: "message";
      readonly message: RoomMessage;
    }
  | {
      readonly type: "presence";
      readonly connections: number;
    }
  | {
      readonly type: "error";
      readonly message: string;
    };

export type DecodeResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

export function getAuthProviderLabel(id: AuthProviderId): string {
  switch (id) {
    case "github":
      return "GitHub";
    case "google":
      return "Google";
    case "microsoft-entra-id":
      return "Microsoft";
  }
}

export function decodeRoomClientMessage(
  payload: string | ArrayBuffer,
): DecodeResult<RoomClientMessage> {
  const decoded = decodeJson(
    typeof payload === "string" ? payload : new TextDecoder().decode(payload),
  );

  if (
    !decoded.ok ||
    !isRecord(decoded.value) ||
    decoded.value.type !== "message" ||
    typeof decoded.value.text !== "string"
  ) {
    return {
      ok: false,
      error: decoded.ok
        ? "Room messages must contain a text field."
        : decoded.error,
    };
  }

  const text = decoded.value.text.trim();
  if (!text) {
    return { ok: false, error: "Room messages cannot be empty." };
  }

  if (text.length > roomMessageMaxLength) {
    return {
      ok: false,
      error: `Room messages cannot exceed ${roomMessageMaxLength} characters.`,
    };
  }

  return { ok: true, value: { type: "message", text } };
}

export function decodeRoomServerEvent(
  payload: string,
): DecodeResult<RoomServerEvent> {
  const decoded = decodeJson(payload);
  if (!decoded.ok || !isRecord(decoded.value)) {
    return {
      ok: false,
      error: decoded.ok ? "Room event must be an object." : decoded.error,
    };
  }

  const event = decoded.value;
  switch (event.type) {
    case "snapshot":
      if (
        !isConnectionCount(event.connections) ||
        !Array.isArray(event.messages) ||
        !event.messages.every(isRoomMessage)
      ) {
        return { ok: false, error: "Invalid room snapshot." };
      }
      return {
        ok: true,
        value: {
          type: "snapshot",
          connections: event.connections,
          messages: event.messages,
        },
      };
    case "message":
      return isRoomMessage(event.message)
        ? { ok: true, value: { type: "message", message: event.message } }
        : { ok: false, error: "Invalid room message event." };
    case "presence":
      return isConnectionCount(event.connections)
        ? {
            ok: true,
            value: {
              type: "presence",
              connections: event.connections,
            },
          }
        : { ok: false, error: "Invalid room presence event." };
    case "error":
      return typeof event.message === "string" && event.message.length > 0
        ? {
            ok: true,
            value: { type: "error", message: event.message },
          }
        : { ok: false, error: "Invalid room error event." };
    default:
      return { ok: false, error: "Unknown room event type." };
  }
}

function decodeJson(payload: string): DecodeResult<unknown> {
  try {
    return { ok: true, value: JSON.parse(payload) as unknown };
  } catch {
    return { ok: false, error: "Room payload must be valid JSON." };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isConnectionCount(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= 0;
}

function isRoomMessage(value: unknown): value is RoomMessage {
  if (!isRecord(value) || !isRecord(value.author)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.author.id === "string" &&
    typeof value.author.name === "string" &&
    typeof value.sentAt === "string" &&
    typeof value.text === "string"
  );
}
