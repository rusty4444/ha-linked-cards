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

describe("source lifecycle rendering", () => {
  it("restores an external popup container after reconnect", async () => {
    const { hass } = makeHass();
    hass.callWS = vi.fn(async () => ({
      views: [{ path: "popups", cards: [{ type: "tile", entity: "light.test" }] }],
    }));
    const el = document.createElement("linked-card");
    el.setConfig({
      type: "custom:linked-card",
      mode: "source",
      source_dashboard: "global-cards",
      source_view: "popups",
      source_display: "popup",
    });
    document.body.append(el);
    el.hass = hass;
    await flush();
    await flush();

    const firstContainer = el._externalSourceContainer;
    expect(firstContainer?.isConnected).toBe(true);
    el.remove();
    expect(firstContainer.isConnected).toBe(false);

    document.body.append(el);
    await flush();
    await flush();
    expect(el._externalSourceContainer?.isConnected).toBe(true);
    expect(el._externalSourceContainer).not.toBe(firstContainer);
    el.remove();
  });

  it("does not let stale source-card creation replace a newer source render", async () => {
    let releaseStale;
    const staleCard = new Promise((resolve) => { releaseStale = resolve; });
    const currentCard = document.createElement("ha-card");
    window.loadCardHelpers = vi.fn(async () => ({
      createCardElement: vi.fn((config) => (
        config.entity === "light.stale" ? staleCard : Promise.resolve(currentCard)
      )),
    }));

    const el = document.createElement("linked-card");
    el.setConfig({
      type: "custom:linked-card",
      mode: "source",
      source_dashboard: "global-cards",
    });
    el._hass = {};
    el._renderToken = 1;
    const staleRender = el._mountSourceStructure(
      { type: "masonry", cards: [{ type: "tile", entity: "light.stale" }] },
      "stale",
      1,
      1,
    );
    el._renderToken = 2;
    await el._mountSourceStructure(
      { type: "masonry", cards: [{ type: "tile", entity: "light.current" }] },
      "current",
      2,
      1,
    );
    releaseStale(document.createElement("ha-card"));
    await staleRender;

    expect(el._lastChildKey).toBe("current");
    expect(el._cards).toEqual([currentCard]);
    expect(el.shadowRoot.firstElementChild).toBe(el._child);
  });

  it("does not let a stale linked-section render replace a newer one", async () => {
    let releaseStale;
    const staleCard = new Promise((resolve) => { releaseStale = resolve; });
    const createCardElement = vi.fn((config) => (
      config.entity === "light.stale"
        ? staleCard
        : Promise.resolve(document.createElement("ha-card"))
    ));
    window.loadCardHelpers = vi.fn(async () => ({ createCardElement }));

    const el = document.createElement("linked-section");
    el.setConfig({ type: "custom:linked-section", template: "section" });
    el._hass = {};
    el._renderToken = 1;
    const staleRender = el._mountSection(
      { cards: [{ type: "tile", entity: "light.stale" }] },
      "stale",
      1,
    );
    el._renderToken = 2;
    await el._mountSection(
      { cards: [{ type: "tile", entity: "light.current" }] },
      "current",
      2,
    );
    releaseStale(document.createElement("ha-card"));
    await staleRender;

    expect(el._lastChildKey).toBe("current");
    expect(el._cards).toHaveLength(1);
    expect(createCardElement).toHaveBeenCalledTimes(2);
  });
});
