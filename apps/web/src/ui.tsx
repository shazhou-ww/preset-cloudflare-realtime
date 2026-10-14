import {
  roomMessageMaxLength,
  type AuthProviderDescriptor,
  type BootstrapResponse,
  type RoomMessage,
  type SessionResponse,
} from "@workspace/contracts";
import type { FormEventHandler } from "react";

export type DashboardState =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string }
  | {
      readonly kind: "ready";
      readonly bootstrap: BootstrapResponse;
      readonly session: SessionResponse | null;
    };

export type RoomConnectionStatus =
  "idle" | "connecting" | "open" | "closed" | "error";

export interface RoomViewState {
  readonly connections: number;
  readonly error: string | null;
  readonly messages: readonly RoomMessage[];
  readonly status: RoomConnectionStatus;
}

interface DashboardProps {
  readonly state: DashboardState;
  readonly room?: RoomViewState;
  readonly onRoomSubmit?: FormEventHandler<HTMLFormElement>;
}

const inactiveRoom: RoomViewState = {
  connections: 0,
  error: null,
  messages: [],
  status: "idle",
};

export function Dashboard({
  state,
  room = inactiveRoom,
  onRoomSubmit,
}: DashboardProps) {
  const isLive = state.kind === "ready" && Boolean(state.session?.user);

  return (
    <main className="shell">
      <header className="masthead">
        <a className="brand" href="/" aria-label="Signal Room home">
          <span className="brand-mark" aria-hidden="true" />
          <span>
            {state.kind === "ready" ? state.bootstrap.appName : "Signal Room"}
          </span>
        </a>
        <p>Cloudflare realtime starter</p>
      </header>

      <div className={`workspace${isLive ? " is-live" : ""}`}>
        <section className="briefing" aria-labelledby="briefing-title">
          <p className="context">A durable room for work in motion</p>
          <h1 id="briefing-title">Keep the room in sync while it sleeps.</h1>
          <p className="lede">
            One Durable Object owns each room. WebSocket hibernation preserves
            live connections without keeping compute awake.
          </p>

          {isLive ? (
            <RoomLedger room={room} />
          ) : (
            <ol
              className="signal-track"
              aria-label="Realtime application layers"
            >
              <li>
                <span className="track-node" aria-hidden="true" />
                <strong>Identity</strong>
                <span>Every room upgrade starts with an Auth.js session</span>
              </li>
              <li>
                <span className="track-node" aria-hidden="true" />
                <strong>Room state</strong>
                <span>One named Durable Object coordinates each channel</span>
              </li>
              <li>
                <span className="track-node" aria-hidden="true" />
                <strong>Hibernation</strong>
                <span>Connections survive while inactive compute sleeps</span>
              </li>
            </ol>
          )}
        </section>

        <aside className="access" aria-labelledby="access-title">
          <p className="context">
            {isLive ? "Operations channel" : "Workspace access"}
          </p>
          <AccessPanel state={state} room={room} onRoomSubmit={onRoomSubmit} />
        </aside>
      </div>

      <footer>
        <span>Room transport</span>
        <strong>Durable Objects + WebSocket hibernation</strong>
      </footer>
    </main>
  );
}

function RoomLedger({ room }: { readonly room: RoomViewState }) {
  return (
    <section className="room-ledger" aria-labelledby="room-ledger-title">
      <header>
        <h2 id="room-ledger-title">Room dispatches</h2>
        <span>{room.connections} connected</span>
      </header>
      <ol aria-live="polite">
        {room.messages.length > 0 ? (
          room.messages.map((message) => (
            <RoomLedgerEntry key={message.id} message={message} />
          ))
        ) : (
          <li className="room-empty">
            No dispatches yet. Send the first update.
          </li>
        )}
      </ol>
    </section>
  );
}

function RoomLedgerEntry({ message }: { readonly message: RoomMessage }) {
  return (
    <li className="room-entry">
      <time dateTime={message.sentAt}>{formatRoomTime(message.sentAt)}</time>
      <strong>{message.author.name}</strong>
      <p>{message.text}</p>
    </li>
  );
}

function AccessPanel({
  state,
  room,
  onRoomSubmit,
}: {
  readonly state: DashboardState;
  readonly room: RoomViewState;
  readonly onRoomSubmit: FormEventHandler<HTMLFormElement> | undefined;
}) {
  if (state.kind === "loading") {
    return (
      <div className="notice" role="status">
        <span className="activity" aria-hidden="true" />
        <p id="access-title">Checking your session...</p>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="notice error" role="alert">
        <h2 id="access-title">The Worker did not respond.</h2>
        <p>{state.message}</p>
        <a className="secondary-action" href="/">
          Try again
        </a>
      </div>
    );
  }

  if (state.session?.user) {
    const { user } = state.session;
    return (
      <div className="room-access">
        <div className="identity compact">
          {user.image ? (
            <img src={user.image} alt="" className="avatar" />
          ) : (
            <span className="avatar fallback" aria-hidden="true">
              {getInitial(user.name ?? user.email ?? "S")}
            </span>
          )}
          <div>
            <h2 id="access-title">{user.name ?? "Signed in"}</h2>
            {user.email ? <p>{user.email}</p> : null}
          </div>
        </div>

        <div className={`connection-state ${room.status}`} role="status">
          <span aria-hidden="true" />
          <div>
            <strong>{getRoomStatusLabel(room.status)}</strong>
            <p>{room.connections} active connection(s)</p>
          </div>
        </div>

        {room.error ? (
          <p className="room-error" role="alert">
            {room.error}
          </p>
        ) : null}

        <form className="composer" onSubmit={onRoomSubmit}>
          <label htmlFor="room-message">Send a dispatch</label>
          <textarea
            id="room-message"
            name="message"
            maxLength={roomMessageMaxLength}
            placeholder="Share the next concrete update."
            rows={4}
            disabled={room.status !== "open"}
            required
          />
          <button type="submit" disabled={room.status !== "open"}>
            Send update
          </button>
        </form>

        <a className="text-action" href="/api/auth/signout">
          Sign out
        </a>
      </div>
    );
  }

  return (
    <div className="signin">
      <h2 id="access-title">Choose an identity provider.</h2>
      <p>
        Sign in before opening a room. The WebSocket upgrade reuses the same
        edge session.
      </p>
      <div className="provider-list">
        {state.bootstrap.providers.length > 0 ? (
          state.bootstrap.providers.map((provider) => (
            <ProviderLink key={provider.id} provider={provider} />
          ))
        ) : (
          <p className="empty">
            Add provider secrets to <code>.dev.vars</code> to enable sign-in.
          </p>
        )}
      </div>
    </div>
  );
}

function ProviderLink({
  provider,
}: {
  readonly provider: AuthProviderDescriptor;
}) {
  return (
    <a
      className="provider"
      href={`/api/auth/signin/${provider.id}?callbackUrl=/`}
    >
      <span className={`provider-symbol ${provider.id}`} aria-hidden="true">
        {getInitial(provider.label)}
      </span>
      <span>Continue with {provider.label}</span>
    </a>
  );
}

function getRoomStatusLabel(status: RoomConnectionStatus): string {
  switch (status) {
    case "idle":
      return "Waiting to connect";
    case "connecting":
      return "Opening the room";
    case "open":
      return "Room connected";
    case "closed":
      return "Room disconnected";
    case "error":
      return "Connection needs attention";
  }
}

function formatRoomTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "Unknown time"
    : new Intl.DateTimeFormat("en", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}

function getInitial(value: string): string {
  return value.trim().charAt(0).toUpperCase() || "S";
}
