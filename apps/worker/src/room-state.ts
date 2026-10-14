import {
  roomHistoryLimit,
  type RoomAuthor,
  type RoomMessage,
} from "@workspace/contracts";

export { roomHistoryLimit } from "@workspace/contracts";

export function createRoomMessage(
  author: RoomAuthor,
  text: string,
  id: string = crypto.randomUUID(),
  sentAt: string = new Date().toISOString(),
): RoomMessage {
  return {
    id,
    author,
    sentAt,
    text,
  };
}

export function appendRoomMessage(
  history: readonly RoomMessage[],
  message: RoomMessage,
  limit = roomHistoryLimit,
): readonly RoomMessage[] {
  return [...history, message].slice(-limit);
}
