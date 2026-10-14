import {
  decodeRoomServerEvent,
  roomHistoryLimit,
  type BootstrapResponse,
  type SessionResponse,
} from "@workspace/contracts";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Dashboard, type DashboardState, type RoomViewState } from "./ui.js";

const roomName = "operations";
const initialRoomState: RoomViewState = {
  connections: 0,
  error: null,
  messages: [],
  status: "idle",
};

export function App() {
  const [state, setState] = useState<DashboardState>({ kind: "loading" });
  const [room, setRoom] = useState<RoomViewState>(initialRoomState);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    void loadDashboard(controller.signal)
      .then(({ bootstrap, session }) => {
        setState({
          kind: "ready",
          bootstrap,
          session,
        });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setState({
          kind: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      controller.abort();
    };
  }, []);

  const shouldConnect = state.kind === "ready" && Boolean(state.session?.user);

  useEffect(() => {
    if (!shouldConnect) {
      return;
    }

    let closedByClient = false;
    const socket = new WebSocket(createRoomSocketUrl(roomName));
    socketRef.current = socket;
    setRoom({ ...initialRoomState, status: "connecting" });

    socket.addEventListener("open", () => {
      setRoom((current) => ({ ...current, error: null, status: "open" }));
    });
    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") {
        setRoom((current) => ({
          ...current,
          error: "The room sent an unsupported binary event.",
          status: "error",
        }));
        return;
      }

      const decoded = decodeRoomServerEvent(event.data);
      if (!decoded.ok) {
        setRoom((current) => ({
          ...current,
          error: decoded.error,
          status: "error",
        }));
        return;
      }

      const roomEvent = decoded.value;
      switch (roomEvent.type) {
        case "snapshot":
          setRoom({
            connections: roomEvent.connections,
            error: null,
            messages: roomEvent.messages,
            status: "open",
          });
          break;
        case "message": {
          const { message } = roomEvent;
          setRoom((current) => ({
            ...current,
            messages: [...current.messages, message].slice(-roomHistoryLimit),
          }));
          break;
        }
        case "presence": {
          const { connections } = roomEvent;
          setRoom((current) => ({
            ...current,
            connections,
          }));
          break;
        }
        case "error": {
          const { message } = roomEvent;
          setRoom((current) => ({
            ...current,
            error: message,
          }));
        }
      }
    });
    socket.addEventListener("error", () => {
      setRoom((current) => ({
        ...current,
        error: "The room connection failed.",
        status: "error",
      }));
    });
    socket.addEventListener("close", () => {
      socketRef.current = null;
      if (!closedByClient) {
        setRoom((current) => ({ ...current, status: "closed" }));
      }
    });

    return () => {
      closedByClient = true;
      socketRef.current = null;
      socket.close(1000, "Client disconnected");
    };
  }, [shouldConnect]);

  function sendRoomMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const socket = socketRef.current;
    const form = event.currentTarget;
    const text = new FormData(form).get("message");

    if (
      socket?.readyState !== WebSocket.OPEN ||
      typeof text !== "string" ||
      !text.trim()
    ) {
      return;
    }

    socket.send(JSON.stringify({ type: "message", text }));
    form.reset();
  }

  return <Dashboard state={state} room={room} onRoomSubmit={sendRoomMessage} />;
}

async function loadDashboard(signal: AbortSignal): Promise<{
  readonly bootstrap: BootstrapResponse;
  readonly session: SessionResponse | null;
}> {
  const [bootstrap, session] = await Promise.all([
    fetchJson<BootstrapResponse>("/api/bootstrap", signal),
    fetchJson<SessionResponse | null>("/api/auth/session", signal),
  ]);

  return { bootstrap, session };
}

async function fetchJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    headers: {
      accept: "application/json",
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

function createRoomSocketUrl(name: string): string {
  const url = new URL(`/api/rooms/${name}/socket`, window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.href;
}
