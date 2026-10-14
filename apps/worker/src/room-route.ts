import type { Session } from "@auth/core/types";

export const roomIdentityHeader = "x-signal-room-identity";

export interface RoomIdentity {
  readonly displayName: string;
}

export interface RoomSocketAttachment extends RoomIdentity {
  readonly connectionId: string;
}

interface RoomStub {
  fetch(request: Request): Promise<Response>;
}

export interface RoomNamespace<Id> {
  get(id: Id): RoomStub;
  idFromName(name: string): Id;
}

export function parseRoomName(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9](?:[a-z0-9-]{0,62})$/.test(normalized) ? normalized : null;
}

export function getRoomIdentity(session: Session): RoomIdentity {
  const displayName =
    session.user?.name?.trim() || session.user?.email?.trim() || "Member";
  return { displayName };
}

export function encodeRoomIdentity(identity: RoomIdentity): string {
  return encodeURIComponent(JSON.stringify(identity));
}

export function decodeRoomIdentity(value: string | null): RoomIdentity | null {
  if (!value) {
    return null;
  }

  try {
    const decoded: unknown = JSON.parse(decodeURIComponent(value));
    return isRoomIdentity(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

export function isRoomSocketAttachment(
  value: unknown,
): value is RoomSocketAttachment {
  return (
    isRoomIdentity(value) &&
    "connectionId" in value &&
    typeof value.connectionId === "string"
  );
}

export async function forwardRoomSocket<Id>(
  request: Request,
  namespace: RoomNamespace<Id>,
  roomName: string,
  identity: RoomIdentity,
): Promise<Response> {
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("Expected a WebSocket upgrade.", { status: 426 });
  }

  const headers = new Headers(request.headers);
  headers.set(roomIdentityHeader, encodeRoomIdentity(identity));

  const id = namespace.idFromName(roomName);
  const room = namespace.get(id);
  return room.fetch(new Request(request, { headers }));
}

function isRoomIdentity(value: unknown): value is RoomIdentity {
  return (
    typeof value === "object" &&
    value !== null &&
    "displayName" in value &&
    typeof value.displayName === "string" &&
    value.displayName.length > 0
  );
}
