import {
  decodeRoomClientMessage,
  type RoomMessage,
  type RoomServerEvent,
} from "@workspace/contracts";

import {
  decodeRoomIdentity,
  isRoomSocketAttachment,
  roomIdentityHeader,
  type RoomSocketAttachment,
} from "./room-route.js";
import {
  appendRoomMessage,
  createRoomMessage,
  roomHistoryLimit,
} from "./room-state.js";

const roomHistoryKey = "messages";

export class RoomDurableObject {
  constructor(private readonly ctx: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade.", { status: 426 });
    }

    const identity = decodeRoomIdentity(
      request.headers.get(roomIdentityHeader),
    );
    if (!identity) {
      return new Response("Missing room identity.", { status: 401 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const attachment: RoomSocketAttachment = {
      ...identity,
      connectionId: crypto.randomUUID(),
    };

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(attachment);

    const messages =
      (await this.ctx.storage.get<readonly RoomMessage[]>(roomHistoryKey)) ??
      [];
    server.send(
      serializeRoomEvent({
        type: "snapshot",
        connections: this.ctx.getWebSockets().length,
        messages,
      }),
    );
    this.broadcastPresence(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(
    webSocket: WebSocket,
    payload: string | ArrayBuffer,
  ): Promise<void> {
    const decoded = decodeRoomClientMessage(payload);
    if (!decoded.ok) {
      webSocket.send(
        serializeRoomEvent({ type: "error", message: decoded.error }),
      );
      return;
    }

    const attachment: unknown = webSocket.deserializeAttachment();
    if (!isRoomSocketAttachment(attachment)) {
      webSocket.send(
        serializeRoomEvent({
          type: "error",
          message: "The room connection has no identity.",
        }),
      );
      webSocket.close(1011, "Missing room identity");
      return;
    }

    const message = createRoomMessage(
      {
        id: attachment.connectionId,
        name: attachment.displayName,
      },
      decoded.value.text,
    );
    const history =
      (await this.ctx.storage.get<readonly RoomMessage[]>(roomHistoryKey)) ??
      [];
    await this.ctx.storage.put(
      roomHistoryKey,
      appendRoomMessage(history, message, roomHistoryLimit),
    );
    this.broadcast({ type: "message", message });
  }

  webSocketClose(webSocket: WebSocket): void {
    this.broadcastPresence(webSocket);
  }

  webSocketError(webSocket: WebSocket, error: unknown): void {
    console.error("Room WebSocket failed.", error);
    webSocket.close(1011, "Room WebSocket failed");
    this.broadcastPresence(webSocket);
  }

  private broadcast(event: RoomServerEvent, except?: WebSocket): void {
    const payload = serializeRoomEvent(event);
    for (const webSocket of this.ctx.getWebSockets()) {
      if (webSocket !== except) {
        webSocket.send(payload);
      }
    }
  }

  private broadcastPresence(except?: WebSocket): void {
    const connections = this.ctx
      .getWebSockets()
      .filter((webSocket) => webSocket !== except).length;
    this.broadcast({ type: "presence", connections }, except);
  }
}

function serializeRoomEvent(event: RoomServerEvent): string {
  return JSON.stringify(event);
}
