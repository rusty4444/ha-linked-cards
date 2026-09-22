import { describe, expect, it, vi } from "vitest";
import { TemplateSubscription } from "../src/template-subscription.js";

const EVENT = "linked_cards_template_updated";

function makeHass({ user, subscribe } = {}) {
  const subscribeEvents = subscribe || vi.fn(() => Promise.resolve(vi.fn()));
  return { hass: { user, connection: { subscribeEvents } }, subscribeEvents };
}

const ADMIN = { is_admin: true };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("template update subscription", () => {
  it("subscribes for administrators", async () => {
    const sub = new TemplateSubscription(EVENT, () => {});
    const { hass, subscribeEvents } = makeHass({ user: ADMIN });
    sub.ensure(hass);
    await flush();
    expect(subscribeEvents).toHaveBeenCalledTimes(1);
    expect(subscribeEvents.mock.calls[0][1]).toBe(EVENT);
  });

  it("never subscribes for non-admin users (Home Assistant would log an error each time)", async () => {
    const sub = new TemplateSubscription(EVENT, () => {});
    const { hass, subscribeEvents } = makeHass({ user: { is_admin: false } });
    for (let i = 0; i < 5; i++) sub.ensure(hass);
    await flush();
    expect(subscribeEvents).not.toHaveBeenCalled();
  });

  it("waits until the user is known instead of subscribing blindly", async () => {
    for (const user of [null, undefined]) {
      const sub = new TemplateSubscription(EVENT, () => {});
      const { hass, subscribeEvents } = makeHass({ user });
      sub.ensure(hass);
      await flush();
      expect(subscribeEvents).not.toHaveBeenCalled();
    }
  });

  it("subscribes once the user turns out to be an administrator", async () => {
    const sub = new TemplateSubscription(EVENT, () => {});
    const { hass, subscribeEvents } = makeHass({ user: null });
    sub.ensure(hass);
    sub.ensure({ ...hass, user: ADMIN });
    await flush();
    expect(subscribeEvents).toHaveBeenCalledTimes(1);
  });

  it("does nothing without a websocket connection", () => {
    const sub = new TemplateSubscription(EVENT, () => {});
    expect(() => sub.ensure(undefined)).not.toThrow();
    expect(() => sub.ensure({ user: ADMIN })).not.toThrow();
  });

  it("does not stack subscriptions while one is pending", async () => {
    const sub = new TemplateSubscription(EVENT, () => {});
    const { hass, subscribeEvents } = makeHass({ user: ADMIN });
    for (let i = 0; i < 5; i++) sub.ensure(hass);
    await flush();
    expect(subscribeEvents).toHaveBeenCalledTimes(1);
  });

  it("does not retry after a rejected subscription", async () => {
    const sub = new TemplateSubscription(EVENT, () => {});
    const subscribe = vi.fn(() => Promise.reject(new Error("unauthorized")));
    const { hass } = makeHass({ user: ADMIN, subscribe });
    sub.ensure(hass);
    await flush();
    sub.ensure(hass);
    await flush();
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it("forwards events to the handler", async () => {
    const onEvent = vi.fn();
    const sub = new TemplateSubscription(EVENT, onEvent);
    const { hass, subscribeEvents } = makeHass({ user: ADMIN });
    sub.ensure(hass);
    subscribeEvents.mock.calls[0][0]({ data: { template_id: "a" } });
    expect(onEvent).toHaveBeenCalledWith({ data: { template_id: "a" } });
  });

  it("unsubscribes on release and allows a fresh subscription afterwards", async () => {
    const sub = new TemplateSubscription(EVENT, () => {});
    const unsubscribe = vi.fn();
    const { hass, subscribeEvents } = makeHass({ user: ADMIN, subscribe: vi.fn(() => Promise.resolve(unsubscribe)) });
    sub.ensure(hass);
    await flush();
    sub.release();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    sub.ensure(hass);
    await flush();
    expect(subscribeEvents).toHaveBeenCalledTimes(2);
  });

  it("release without a subscription is a no-op", () => {
    const sub = new TemplateSubscription(EVENT, () => {});
    expect(() => sub.release()).not.toThrow();
  });

  it("unsubscribes immediately if released before the subscription resolves", async () => {
    const sub = new TemplateSubscription(EVENT, () => {});
    const unsubscribe = vi.fn();
    const { hass } = makeHass({ user: ADMIN, subscribe: vi.fn(() => Promise.resolve(unsubscribe)) });
    sub.ensure(hass);
    sub.release();
    await flush();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("keeps only the newest subscription when release and ensure overlap a pending one", async () => {
    const sub = new TemplateSubscription(EVENT, () => {});
    const unsubscribes = [vi.fn(), vi.fn()];
    const resolvers = [];
    const subscribe = vi.fn(() => new Promise((resolve) => resolvers.push(resolve)));
    const { hass } = makeHass({ user: ADMIN, subscribe });
    sub.ensure(hass);
    sub.release();
    sub.ensure(hass);
    resolvers[1](unsubscribes[1]);
    await flush();
    resolvers[0](unsubscribes[0]);
    await flush();
    expect(subscribe).toHaveBeenCalledTimes(2);
    expect(unsubscribes[0]).toHaveBeenCalledTimes(1);
    expect(unsubscribes[1]).not.toHaveBeenCalled();
    sub.release();
    expect(unsubscribes[1]).toHaveBeenCalledTimes(1);
  });

  it("swallows a rejected unsubscribe (connection already closed)", async () => {
    const sub = new TemplateSubscription(EVENT, () => {});
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      // a plain function, like the websocket library's; vi.fn would attach its own handlers
      const unsubscribe = () => Promise.reject(new Error("connection lost"));
      const { hass } = makeHass({ user: ADMIN, subscribe: () => Promise.resolve(unsubscribe) });
      sub.ensure(hass);
      await flush();
      sub.release();
      await flush();
      await flush();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
    expect(unhandled).not.toHaveBeenCalled();
  });
});
