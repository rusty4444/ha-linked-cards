// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from "vitest";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function makeHass(user = { is_admin: true }) {
  const unsubscribe = vi.fn();
  const subscribeEvents = vi.fn(() => Promise.resolve(unsubscribe));
  return { hass: { user, connection: { subscribeEvents } }, subscribeEvents, unsubscribe };
}

beforeAll(async () => {
  window.loadCardHelpers = vi.fn(async () => ({
    createCardElement: vi.fn(async () => document.createElement("ha-card")),
  }));
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

describe("linked-section child state", () => {
  it("propagates every hass update to mounted child cards", () => {
    const el = document.createElement("linked-section");
    const children = [{}, {}];
    el._cards = children;

    const firstHass = { states: { "switch.test": { state: "off" } } };
    el.hass = firstHass;
    expect(children[0].hass).toBe(firstHass);
    expect(children[1].hass).toBe(firstHass);

    const updatedHass = { states: { "switch.test": { state: "on" } } };
    el.hass = updatedHass;
    expect(children[0].hass).toBe(updatedHass);
    expect(children[1].hass).toBe(updatedHass);
  });
});

describe.each([
  ["linked-card", { card: { type: "tile", entity: "light.test" } }],
  ["linked-section", { section: { title: "Test", cards: [] } }],
])("%s reconnect rendering", (tag, template) => {
  it("restarts an initial render invalidated by a detach and re-attach", async () => {
    let resolveTemplate;
    const templateResponse = new Promise((resolve) => { resolveTemplate = resolve; });
    const { hass } = makeHass();
    hass.callApi = vi.fn(() => templateResponse);

    const el = document.createElement(tag);
    el.setConfig({ type: `custom:${tag}`, template: `reconnect-${tag}` });
    document.body.append(el);
    el.hass = hass;
    await flush();

    el.remove();
    document.body.append(el);
    resolveTemplate({ template });
    await flush();
    await flush();

    expect(el.shadowRoot.children).toHaveLength(1);
    expect(el._child).toBeTruthy();
    el.remove();
  });
});
