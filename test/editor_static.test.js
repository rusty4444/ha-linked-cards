import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("linked-card visual editor wiring", () => {
  const source = readFileSync("src/linked-card.js", "utf8");

  it("registers a visual editor for linked-card", () => {
    expect(source).toContain("customElements.define(\"linked-card-editor\"");
    expect(source).toContain("static getConfigElement()");
    expect(source).toContain("document.createElement(\"linked-card-editor\")");
  });

  it("lets the editor configure template mode and source dashboard mode", () => {
    expect(source).toContain("Template");
    expect(source).toContain("Source dashboard");
    expect(source).toContain("source_dashboard");
    expect(source).toContain("source_view");
    expect(source).toContain("source_display");
  });

  it("emits Home Assistant config-changed events", () => {
    expect(source).toContain("config-changed");
    expect(source).toContain("bubbles: true");
    expect(source).toContain("composed: true");
  });
});
