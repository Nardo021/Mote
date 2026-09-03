import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AdminEventBus, type AdminEventPayload } from "../src/admin/eventBus.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe("AdminEventBus", () => {
  it("coalesces the same topic into one event", async () => {
    const bus = new AdminEventBus(15);
    const received: AdminEventPayload[] = [];
    bus.subscribe((event) => {
      received.push(event);
    });
    bus.publish("devices");
    bus.publish("devices");
    bus.publish("devices");
    await delay(40);
    assert.deepEqual(received, [{ topics: ["devices"] }]);
  });

  it("merges different topics in the same window", async () => {
    const bus = new AdminEventBus(15);
    const received: AdminEventPayload[] = [];
    bus.subscribe((event) => {
      received.push(event);
    });
    bus.publish("activity");
    bus.publish("devices");
    bus.publish("tokens");
    await delay(40);
    assert.deepEqual(received, [
      { topics: ["devices", "activity", "tokens"] },
    ]);
  });

  it("delivers the merged event to every subscriber", async () => {
    const bus = new AdminEventBus(15);
    const first: AdminEventPayload[] = [];
    const second: AdminEventPayload[] = [];
    const unsubscribe = bus.subscribe((event) => {
      first.push(event);
    });
    bus.subscribe((event) => {
      second.push(event);
    });
    assert.equal(bus.subscriberCount, 2);
    bus.publish("pairing");
    await delay(40);
    assert.deepEqual(first, [{ topics: ["pairing"] }]);
    assert.deepEqual(second, [{ topics: ["pairing"] }]);
    unsubscribe();
    assert.equal(bus.subscriberCount, 1);
    bus.publish("pairing");
    await delay(40);
    assert.equal(first.length, 1);
    assert.equal(second.length, 2);
  });
});
