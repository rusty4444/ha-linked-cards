// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from "vitest";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function makeHass(user = { is_admin: true }) {
  const unsubscribe = vi.fn();
  const subscribeEvents = vi.fn(() => Promise.resolve(unsubscribe));
  return { hass: { user, connection: { subscribeEvents } }, subscribeEvents, unsubscribe };
}

beforeAll(async () => {
  await import("../src/linked-card.js");
});

describe.each(["linked-card", "linked-section"])("%s template subscription lifecycle", (tag) => {
  it("does not subscribe while detached, and subscribes once attached", async () => {
    const el = document.createElement(tag);
    const { hass, subscribeEvents } = makeHass();
    el.hass = hass;
    await flush();
    expect(subscribeEvents).not.toHaveBeenCalled();
    document.body.append(el);
    await flush();
    expect(subscribeEvents).toHaveBeenCalledTimes(1);
    el.remove();
  });

  it("unsubscribes on detach and resubscribes when re-attached", async () => {
    const el = document.createElement(tag);
    const { hass, subscribeEvents, unsubscribe } = makeHass();
    document.body.append(el);
    el.hass = hass;
    await flush();
    el.remove();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    document.body.append(el);
    await flush();
    expect(subscribeEvents).toHaveBeenCalledTimes(2);
    el.remove();
  });

  it("never subscribes for non-admin users, however often hass is set", async () => {
    const el = document.createElement(tag);
    const { hass, subscribeEvents } = makeHass({ is_admin: false });
    document.body.append(el);
    for (let i = 0; i < 5; i++) el.hass = { ...hass };
    await flush();
    expect(subscribeEvents).not.toHaveBeenCalled();
    el.remove();
  });
});
