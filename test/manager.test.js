// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from "vitest";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const roomTemplate = {
  card: { type: "tile", entity: "light.living_room" },
};
const expanderTemplate = {
  card: { type: "entities", entities: ["light.wled"] },
};

function makeHass(initialTemplates = {}) {
  const templates = structuredClone(initialTemplates);
  const callApi = vi.fn(async (method, path, payload) => {
    if (method === "GET" && path === "linked_cards/templates") return { templates: structuredClone(templates) };
    if (method === "POST") {
      const id = decodeURIComponent(path.split("/").at(-1));
      templates[id] = structuredClone(payload);
      return { template_id: id, template: structuredClone(payload) };
    }
    if (method === "DELETE") {
      const id = decodeURIComponent(path.split("/").at(-1));
      delete templates[id];
      return { template_id: id, deleted: true };
    }
    throw new Error(`Unexpected API request: ${method} ${path}`);
  });
  return { hass: { callApi }, templates, callApi };
}

beforeAll(async () => {
  await import("../src/linked-card.js");
});

describe("linked-card-manager template selection", () => {
  it("opens the template configured for each manager card", async () => {
    const { hass } = makeHass({
      "room-summary": roomTemplate,
      expander_WLED: expanderTemplate,
    });
    const roomManager = document.createElement("linked-card-manager");
    roomManager.setConfig({ type: "custom:linked-card-manager", template: "room-summary" });
    roomManager.hass = hass;
    const expanderManager = document.createElement("linked-card-manager");
    expanderManager.setConfig({ type: "custom:linked-card-manager", template: "expander_WLED" });
    expanderManager.hass = hass;
    await flush();

    expect(roomManager.shadowRoot.getElementById("template-id").value).toBe("room-summary");
    expect(expanderManager.shadowRoot.getElementById("template-id").value).toBe("expander_WLED");
    expect(JSON.parse(roomManager.shadowRoot.getElementById("template-json").value)).toEqual(roomTemplate);
    expect(JSON.parse(expanderManager.shadowRoot.getElementById("template-json").value)).toEqual(expanderTemplate);
  });

  it("switches between all stored templates without changing their contents", async () => {
    const { hass } = makeHass({
      "room-summary": roomTemplate,
      expander_WLED: expanderTemplate,
    });
    const manager = document.createElement("linked-card-manager");
    manager.setConfig({ type: "custom:linked-card-manager", template: "room-summary" });
    manager.hass = hass;
    await flush();

    const select = manager.shadowRoot.getElementById("stored-template");
    select.value = "expander_WLED";
    select.dispatchEvent(new Event("change"));

    expect(manager.shadowRoot.getElementById("template-id").value).toBe("expander_WLED");
    expect(JSON.parse(manager.shadowRoot.getElementById("template-json").value)).toEqual(expanderTemplate);
  });

  it("treats in-card selection as temporary and persists changes through the HA editor", async () => {
    const { hass } = makeHass({ "room-summary": roomTemplate, expander_WLED: expanderTemplate });
    const configured = { type: "custom:linked-card-manager", template: "room-summary" };
    const manager = document.createElement("linked-card-manager");
    manager.setConfig(configured);
    manager.hass = hass;
    await flush();

    const listener = vi.fn();
    manager.addEventListener("config-changed", listener);
    const select = manager.shadowRoot.getElementById("stored-template");
    select.value = "expander_WLED";
    select.dispatchEvent(new Event("change"));
    expect(listener).not.toHaveBeenCalled();
    expect(manager.config).toEqual(configured);
    expect(manager.shadowRoot.getElementById("template-id").value).toBe("expander_WLED");

    const afterReload = document.createElement("linked-card-manager");
    afterReload.setConfig(configured);
    afterReload.hass = hass;
    await flush();
    expect(afterReload.shadowRoot.getElementById("template-id").value).toBe("room-summary");

    const editor = document.createElement("linked-card-manager-editor");
    editor.setConfig(configured);
    const changes = [];
    editor.addEventListener("config-changed", (event) => changes.push(event.detail.config));
    const input = editor.shadowRoot.getElementById("template");
    input.value = "expander_WLED";
    input.dispatchEvent(new Event("change"));
    expect(changes).toEqual([{ type: "custom:linked-card-manager", template: "expander_WLED" }]);

    const afterEditorSave = document.createElement("linked-card-manager");
    afterEditorSave.setConfig(changes[0]);
    afterEditorSave.hass = hass;
    await flush();
    expect(afterEditorSave.shadowRoot.getElementById("template-id").value).toBe("expander_WLED");
  });

  it("keeps an existing template when a differently named template is saved", async () => {
    const { hass, templates } = makeHass({ "room-summary": roomTemplate });
    const manager = document.createElement("linked-card-manager");
    manager.setConfig({ type: "custom:linked-card-manager", template: "room-summary" });
    manager.hass = hass;
    await flush();

    manager.shadowRoot.getElementById("template-id").value = "expander_WLED";
    manager.shadowRoot.getElementById("template-json").value = JSON.stringify(expanderTemplate);
    await manager.save();

    expect(templates["room-summary"]).toEqual(roomTemplate);
    expect(templates.expander_WLED).toEqual(expanderTemplate);
    expect(manager.shadowRoot.getElementById("stored-template").value).toBe("expander_WLED");
    expect(manager.config.template).toBe("room-summary");
  });

  it.each(["save", "delete"])("keeps controls and reports a successful %s with failed reload", async (action) => {
    const { hass, templates, callApi } = makeHass({ "room-summary": roomTemplate });
    const manager = document.createElement("linked-card-manager");
    manager.setConfig({ type: "custom:linked-card-manager", template: "room-summary" });
    manager.hass = hass;
    await flush();

    if (action === "save") {
      manager.shadowRoot.getElementById("template-id").value = "expander_WLED";
      manager.shadowRoot.getElementById("template-json").value = JSON.stringify(expanderTemplate);
    }
    const normalCall = callApi.getMockImplementation();
    callApi.mockImplementation((method, ...args) => method === "GET"
      ? Promise.reject(new Error("GET unavailable"))
      : normalCall(method, ...args));
    await manager[action]();

    expect(templates[action === "save" ? "expander_WLED" : "room-summary"])
      .toEqual(action === "save" ? expanderTemplate : undefined);
    expect(manager.shadowRoot.getElementById("reload")).not.toBeNull();
    expect(manager.shadowRoot.getElementById("status").textContent).toContain("GET unavailable");
    expect(manager.shadowRoot.getElementById("status").textContent).toContain(action === "save" ? "Saved" : "Deleted");
    expect(manager.config.template).toBe("room-summary");

    callApi.mockImplementation(normalCall);
    await manager.load();
    expect(manager.shadowRoot.getElementById("stored-template")).not.toBeNull();
  });

  it("keeps a configured new id instead of falling back to the first template", async () => {
    const { hass, templates } = makeHass({ "room-summary": roomTemplate });
    const manager = document.createElement("linked-card-manager");
    manager.setConfig({ type: "custom:linked-card-manager", template: "new-template" });
    manager.hass = hass;
    await flush();

    expect(manager.shadowRoot.getElementById("stored-template").value).toBe("");
    expect(manager.shadowRoot.getElementById("template-id").value).toBe("new-template");
    expect(JSON.parse(manager.shadowRoot.getElementById("template-json").value)).toHaveProperty("card");

    await manager.save();
    expect(templates["room-summary"]).toEqual(roomTemplate);
    expect(templates["new-template"]).toHaveProperty("card");
  });

  it("reloads when Home Assistant applies a different configured template", async () => {
    const { hass } = makeHass({
      "room-summary": roomTemplate,
      expander_WLED: expanderTemplate,
    });
    const manager = document.createElement("linked-card-manager");
    manager.setConfig({ type: "custom:linked-card-manager", template: "room-summary" });
    manager.hass = hass;
    await flush();

    manager.setConfig({ type: "custom:linked-card-manager", template: "expander_WLED" });
    await flush();

    expect(manager.shadowRoot.getElementById("template-id").value).toBe("expander_WLED");
    expect(JSON.parse(manager.shadowRoot.getElementById("template-json").value)).toEqual(expanderTemplate);
  });
});

describe("linked-card-manager visual editor", () => {
  it("persists the selected template id in the card config", () => {
    const editor = document.createElement("linked-card-manager-editor");
    editor.setConfig({ type: "custom:linked-card-manager", template: "room-summary" });
    const listener = vi.fn();
    editor.addEventListener("config-changed", listener);

    const input = editor.shadowRoot.getElementById("template");
    input.value = "expander_WLED";
    input.dispatchEvent(new Event("change"));

    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0].detail.config).toEqual({
      type: "custom:linked-card-manager",
      template: "expander_WLED",
    });
  });
});
