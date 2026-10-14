import type { BootstrapResponse } from "@workspace/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  Dashboard,
  type DashboardState,
  type RoomConnectionStatus,
} from "../src/ui.js";

const bootstrap: BootstrapResponse = {
  appName: "Signal Room",
  providers: [
    { id: "github", label: "GitHub" },
    { id: "google", label: "Google" },
    { id: "microsoft-entra-id", label: "Microsoft" },
  ],
};

describe("Dashboard", () => {
  it("renders provider actions for an anonymous visitor", () => {
    const html = renderToStaticMarkup(
      <Dashboard
        state={{
          kind: "ready",
          bootstrap,
          session: null,
        }}
      />,
    );

    expect(html).toContain("Continue with GitHub");
    expect(html).toContain("/api/auth/signin/microsoft-entra-id");
  });

  it("renders the current identity", () => {
    const html = renderToStaticMarkup(
      <Dashboard
        state={{
          kind: "ready",
          bootstrap,
          session: {
            user: {
              email: "operator@example.com",
              name: "Operator",
            },
          },
        }}
      />,
    );

    expect(html).toContain("Operator");
    expect(html).toContain("operator@example.com");
    expect(html).toContain("/api/auth/signout");
  });

  it("renders an image or safe fallback for incomplete profiles", () => {
    const withImage = renderToStaticMarkup(
      <Dashboard
        state={{
          kind: "ready",
          bootstrap,
          session: {
            user: {
              image: "https://example.test/avatar.png",
            },
          },
        }}
      />,
    );
    const withoutProfileFields = renderToStaticMarkup(
      <Dashboard
        state={{
          kind: "ready",
          bootstrap,
          session: {
            user: {},
          },
        }}
      />,
    );

    expect(withImage).toContain("https://example.test/avatar.png");
    expect(withImage).toContain("Signed in");
    expect(withoutProfileFields).toContain(
      '<span class="avatar fallback" aria-hidden="true">S</span>',
    );
  });

  it("renders loading, empty-provider, and error guidance", () => {
    expect(
      renderToStaticMarkup(<Dashboard state={{ kind: "loading" }} />),
    ).toContain("Checking your session");

    expect(
      renderToStaticMarkup(
        <Dashboard
          state={{
            kind: "ready",
            bootstrap: { ...bootstrap, providers: [] },
            session: null,
          }}
        />,
      ),
    ).toContain(".dev.vars");

    expect(
      renderToStaticMarkup(
        <Dashboard state={{ kind: "error", message: "HTTP 503" }} />,
      ),
    ).toContain("HTTP 503");
  });

  it("renders live room messages and connection telemetry", () => {
    const html = renderToStaticMarkup(
      <Dashboard
        state={signedInState}
        room={{
          connections: 2,
          error: null,
          messages: [
            {
              id: "message-1",
              author: { id: "connection-1", name: "Operator" },
              sentAt: "2026-10-14T10:00:00.000Z",
              text: "Launch window confirmed.",
            },
            {
              id: "message-2",
              author: { id: "connection-2", name: "Coordinator" },
              sentAt: "not-a-date",
              text: "Monitoring the rollout.",
            },
          ],
          status: "open",
        }}
      />,
    );

    expect(html).toContain("Room connected");
    expect(html).toContain("2 connected");
    expect(html).toContain("Launch window confirmed.");
    expect(html).toContain("Unknown time");
    expect(html).not.toContain("disabled");
  });

  it("renders every room connection state and error guidance", () => {
    const states: readonly [RoomConnectionStatus, string][] = [
      ["idle", "Waiting to connect"],
      ["connecting", "Opening the room"],
      ["closed", "Room disconnected"],
      ["error", "Connection needs attention"],
    ];

    for (const [status, label] of states) {
      const html = renderToStaticMarkup(
        <Dashboard
          state={signedInState}
          room={{
            connections: 0,
            error: status === "error" ? "Reconnect to continue." : null,
            messages: [],
            status,
          }}
        />,
      );

      expect(html).toContain(label);
      expect(html).toContain("No dispatches yet");
      expect(html).toContain("disabled");
      if (status === "error") {
        expect(html).toContain("Reconnect to continue.");
      }
    }
  });
});

const signedInState: DashboardState = {
  kind: "ready",
  bootstrap,
  session: {
    user: {
      email: "operator@example.com",
      name: "Operator",
    },
  },
};
