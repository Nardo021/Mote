import assert from "node:assert/strict";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, it, vi } from "vitest";

import { AuthContext, type AuthState } from "../hooks/useAuth.js";
import { AdminEventsProvider, useAdminEvents } from "./AdminEventsProvider.js";
import type { AdminEventTopic } from "./topics.js";

class FakeEventSource {
  static instances: FakeEventSource[] = [];

  url: string;
  withCredentials: boolean;
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  closed = false;

  constructor(url: string, init?: EventSourceInit) {
    this.url = url;
    this.withCredentials = init?.withCredentials === true;
    FakeEventSource.instances.push(this);
  }

  close(): void {
    this.closed = true;
    this.readyState = 2;
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }

  emit(payload: unknown): void {
    this.onmessage?.(
      new MessageEvent("message", { data: JSON.stringify(payload) }),
    );
  }
}

const signedIn: AuthState = {
  ready: true,
  configured: true,
  user: { id: "admin-1", username: "admin" },
  signIn: async () => undefined,
  signOut: async () => undefined,
};

function TopicProbe({
  topics,
  onRefresh,
}: {
  topics: readonly AdminEventTopic[];
  onRefresh: () => void;
}) {
  useAdminEvents(topics, onRefresh);
  return null;
}

function renderWithAuth(ui: ReactNode): Root {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <AuthContext.Provider value={signedIn}>
        <AdminEventsProvider>{ui}</AdminEventsProvider>
      </AuthContext.Provider>,
    );
  });
  return root;
}

afterEach(() => {
  FakeEventSource.instances = [];
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("useAdminEvents", () => {
  it("filters topics and closes EventSource on unmount", () => {
    vi.stubGlobal("EventSource", FakeEventSource);
    const devicesRefresh = vi.fn();
    const tokensRefresh = vi.fn();
    const root = renderWithAuth(
      <>
        <TopicProbe topics={["devices"]} onRefresh={devicesRefresh} />
        <TopicProbe topics={["tokens"]} onRefresh={tokensRefresh} />
      </>,
    );

    assert.equal(FakeEventSource.instances.length, 1);
    const source = FakeEventSource.instances[0];
    assert.ok(source);
    assert.equal(source.url, "/admin/api/events");
    assert.equal(source.withCredentials, true);

    act(() => {
      source.open();
      source.emit({ topics: ["devices"] });
    });
    assert.equal(devicesRefresh.mock.calls.length, 1);
    assert.equal(tokensRefresh.mock.calls.length, 0);

    act(() => {
      source.emit({ topics: ["tokens", "activity"] });
    });
    assert.equal(devicesRefresh.mock.calls.length, 1);
    assert.equal(tokensRefresh.mock.calls.length, 1);

    act(() => {
      root.unmount();
    });
    assert.equal(source.closed, true);
  });
});
