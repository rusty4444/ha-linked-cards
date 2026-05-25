import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync("src/linked-card.js", "utf8");

describe("card_mod shadow DOM style injection", () => {
  it("injects resolved card_mod.style into the card shadow root", () => {
    expect(source).toContain("card_mod?.style");
    expect(source).toContain('data-lc');
    expect(source).toContain("shadowRoot");
  });

  it("uses requestAnimationFrame to defer the injection until the element is rendered", () => {
    expect(source).toContain("requestAnimationFrame");
  });

  it("removes any pre-existing injected style before re-injecting", () => {
    expect(source).toContain('querySelector("style[data-lc]")');
  });
});

describe("linked-card visual editor wiring", () => {
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
