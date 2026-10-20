// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(async () => {
  await import("../src/linked-card.js");
});

describe("linked-card visual editor recovery", () => {
  it("moves legacy overrides to variables on an unrelated template edit", () => {
    const editor = document.createElement("linked-card-editor");
    editor._templates = { Room_Card_Plus: {}, Updated: {} };
    editor.setConfig({
      type: "custom:linked-card",
      template: "Room_Card_Plus",
      template_vars: { room_name: "Hall" },
      fallback: { type: "markdown", content: "Fallback" },
    });
    expect(JSON.parse(editor.shadowRoot.getElementById("variables").value)).toEqual({ room_name: "Hall" });

    const onChange = vi.fn();
    editor.addEventListener("config-changed", onChange);
    const select = editor.shadowRoot.getElementById("template");
    select.value = "Updated";
    select.dispatchEvent(new Event("change"));

    expect(onChange).toHaveBeenCalledTimes(1);
    const config = onChange.mock.calls[0][0].detail.config;
    expect(config).toEqual({
      type: "custom:linked-card",
      template: "Updated",
      variables: { room_name: "Hall" },
      fallback: { type: "markdown", content: "Fallback" },
    });
    expect(() => document.createElement("linked-card").setConfig(config)).not.toThrow();
  });

  it("keeps supported variables when both override keys are present", () => {
    const editor = document.createElement("linked-card-editor");
    editor.setConfig({ template: "Room_Card_Plus", variables: { room_name: "Kitchen" }, template_vars: { room_name: "Hall" } });
    expect(JSON.parse(editor.shadowRoot.getElementById("variables").value)).toEqual({ room_name: "Kitchen" });

    const onChange = vi.fn();
    editor.addEventListener("config-changed", onChange);
    const textarea = editor.shadowRoot.getElementById("variables");
    textarea.value = '{"room_name":"Dining"}';
    textarea.dispatchEvent(new Event("change"));
    expect(onChange.mock.calls[0][0].detail.config).toMatchObject({ variables: { room_name: "Dining" } });
    expect(onChange.mock.calls[0][0].detail.config).not.toHaveProperty("template_vars");
  });

  it("discards template overrides when switching to source mode", () => {
    const editor = document.createElement("linked-card-editor");
    editor.setConfig({ template: "Room_Card_Plus", template_vars: { room_name: "Hall" } });
    const onChange = vi.fn();
    editor.addEventListener("config-changed", onChange);
    const mode = editor.shadowRoot.getElementById("editor-mode");
    mode.value = "source";
    mode.dispatchEvent(new Event("change"));

    const config = onChange.mock.calls[0][0].detail.config;
    expect(config).not.toHaveProperty("template_vars");
    expect(config).not.toHaveProperty("variables");
    expect(config).toMatchObject({ mode: "source", source_dashboard: "lovelace" });
    expect(() => document.createElement("linked-card").setConfig(config)).not.toThrow();
  });
});
