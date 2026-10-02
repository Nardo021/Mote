import assert from "node:assert/strict";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { Toaster } from "sonner";

import { AdminEventsProvider } from "../../events/AdminEventsProvider.js";
import { AuthContext, type AuthState } from "../../hooks/useAuth.js";
import i18n from "../../i18n/index.js";
import type { AdminDevice } from "../../types/device.js";
import { DeviceDetailPage } from "./detail.js";

vi.mock("../../components/layout/dashboard-page.js", () => ({
  DashboardPage: ({
    ready,
    children,
  }: {
    ready: boolean;
    children?: ReactNode;
  }) => (ready ? children : <div>Loading</div>),
}));

const DEVICE_ID = "347c271e-f0ac-4eef-b5cf-74bd09c1096b";
const ISSUED = "synthetic-rotated-credential";
const LEAK = "synthetic-failure-body-secret";

type Call = { url: string; method: string };

const calls: Call[] = [];
let deviceOnline = true;
let rotateMode: "ok" | "fail" = "ok";
let copied = "";
let root: Root | null = null;

const signedIn: AuthState = {
  ready: true,
  configured: true,
  user: { id: "admin-1", username: "admin" },
  signIn: async () => undefined,
  signOut: async () => undefined,
};

class SilentEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  readyState = 0;

  constructor(_url: string, _init?: EventSourceInit) {}

  close(): void {
    this.readyState = 2;
  }
}

function device(): AdminDevice {
  return {
    id: DEVICE_ID,
    name: "LEOWIN",
    enabled: true,
    online: deviceOnline,
    connected_at: deviceOnline ? 1_700_000_000_000 : null,
    last_seen_at: 1_700_000_000_000,
    last_heartbeat_at: deviceOnline ? 1_700_000_000_000 : null,
    app_version: "2.0.0",
    platform: "windows",
    actions: ["lock"],
    created_at: 1_700_000_000_000,
    updated_at: 1_700_000_000_000,
    last_command: null,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function installFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ url, method });
      if (url === `/admin/api/devices/${DEVICE_ID}` && method === "GET") {
        return json(device());
      }
      if (url === "/admin/api/system" && method === "GET") {
        return json({
          environment: "test",
          public_url: "https://mote-rc.example.test",
          protocol_version: 1,
          database: "ok",
          uptime_ms: 1,
          command_ttl_ms: 1,
          heartbeat_stale_ms: 1,
        });
      }
      if (
        url === `/admin/api/devices/${DEVICE_ID}/credential/rotate` &&
        method === "POST"
      ) {
        if (rotateMode === "fail") {
          return json(
            {
              error: { code: "INTERNAL_ERROR", message: LEAK },
              credential: LEAK,
            },
            500,
          );
        }
        deviceOnline = false;
        return json({ credential: ISSUED });
      }
      return json(
        { error: { code: "INTERNAL_ERROR", message: "unexpected" } },
        500,
      );
    }),
  );
}

function shows(secret: string): boolean {
  return document.body.textContent?.includes(secret) === true;
}

function retained(secret: string): boolean {
  for (const storage of [localStorage, sessionStorage]) {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index) ?? "";
      if (key.includes(secret) || (storage.getItem(key)?.includes(secret) ?? false)) {
        return true;
      }
    }
  }
  return document.cookie.includes(secret) || window.location.href.includes(secret);
}

function buttonsNamed(name: string): HTMLButtonElement[] {
  return [...document.querySelectorAll("button")].filter(
    (button): button is HTMLButtonElement =>
      button instanceof HTMLButtonElement &&
      button.textContent?.replace(/\s+/g, " ").trim() === name,
  );
}

function renderPage(): void {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const page: ReactNode = (
    <AuthContext.Provider value={signedIn}>
      <AdminEventsProvider>
        <MemoryRouter initialEntries={[`/devices/${DEVICE_ID}`]}>
          <Routes>
            <Route path="/devices/:id" element={<DeviceDetailPage />} />
          </Routes>
        </MemoryRouter>
        <Toaster />
      </AdminEventsProvider>
    </AuthContext.Provider>
  );
  act(() => {
    root?.render(page);
  });
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (predicate()) {
      return;
    }
    await settle();
  }
  assert.equal(predicate(), true);
}

async function openRotateConfirm(): Promise<void> {
  await waitFor(() => buttonsNamed("Rotate credential").length === 1);
  await act(async () => {
    buttonsNamed("Rotate credential")[0]?.click();
  });
  await waitFor(() => buttonsNamed("Rotate credential").length >= 2);
}

async function confirmRotate(): Promise<void> {
  const confirm = buttonsNamed("Rotate credential").at(-1);
  await act(async () => {
    confirm?.click();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(async () => {
  calls.length = 0;
  deviceOnline = true;
  rotateMode = "ok";
  copied = "";
  localStorage.clear();
  sessionStorage.clear();
  document.body.replaceChildren();
  await i18n.changeLanguage("en");
  vi.stubGlobal("EventSource", SilentEventSource);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (value: string) => {
        copied = value;
      },
    },
  });
  installFetch();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("device credential rotation", () => {
  it("shows the rotated credential once and drops it when dismissed", async () => {
    renderPage();
    await waitFor(() => shows("LEOWIN"));
    assert.equal(shows(ISSUED), false);
    assert.equal(retained(ISSUED), false);

    await openRotateConfirm();
    assert.equal(shows(ISSUED), false);
    await confirmRotate();

    await waitFor(() => shows(ISSUED));
    assert.equal(
      calls.some(
        (call) =>
          call.method === "POST" &&
          call.url === `/admin/api/devices/${DEVICE_ID}/credential/rotate`,
      ),
      true,
    );
    assert.equal(
      shows(
        "Save this credential now. It will not be shown again. Closing this dialog removes the only copy shown here.",
      ),
      true,
    );
    assert.equal(shows("Credential rotated"), true);
    assert.equal(shows("Offline"), true);
    assert.equal(retained(ISSUED), false);

    await act(async () => {
      buttonsNamed("Copy")[0]?.click();
      await Promise.resolve();
    });
    assert.equal(copied === ISSUED, true);

    await act(async () => {
      buttonsNamed("Done")[0]?.click();
    });
    await waitFor(() => !shows(ISSUED));
    assert.equal(retained(ISSUED), false);
    assert.equal(shows("LEOWIN"), true);
  });

  it("does not keep the credential in a new page instance", async () => {
    renderPage();
    await waitFor(() => shows("LEOWIN"));
    await openRotateConfirm();
    await confirmRotate();
    await waitFor(() => shows(ISSUED));

    act(() => {
      root?.unmount();
    });
    root = null;
    document.body.replaceChildren();

    renderPage();
    await waitFor(() => shows("LEOWIN"));
    assert.equal(shows(ISSUED), false);
    assert.equal(retained(ISSUED), false);
  });

  it("does not render a failed rotation body", async () => {
    rotateMode = "fail";
    renderPage();
    await waitFor(() => shows("LEOWIN"));
    await openRotateConfirm();
    await confirmRotate();
    await waitFor(() => shows("Could not complete that action."));
    assert.equal(shows(LEAK), false);
    assert.equal(shows(ISSUED), false);
    assert.equal(retained(LEAK), false);
    assert.equal(shows("Online"), true);
  });
});
