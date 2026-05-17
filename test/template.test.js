import { describe, expect, it } from "vitest";
import { applyVariables, renderTemplate, validateTemplateId } from "../src/template.js";

describe("template helpers", () => {
  it("rejects unsafe template ids before any storage or API use", () => {
    expect(validateTemplateId("room-summary")).toBe(true);
    expect(validateTemplateId("lights.main_v2")).toBe(true);
    expect(validateTemplateId("../secrets")).toBe(false);
    expect(validateTemplateId("")).toBe(false);
  });

  it("renders variables recursively in strings, keys, arrays, and nested cards", () => {
    const rendered = applyVariables({
      "${area}_card": {
        type: "tile",
        entity: "light.${area}",
        name: "${label}",
        features: ["${feature}", { type: "${nested.kind}" }],
      },
    }, { area: "kitchen", label: "Kitchen", feature: "light-brightness", nested: { kind: "toggle" } });

    expect(rendered).toEqual({
      kitchen_card: {
        type: "tile",
        entity: "light.kitchen",
        name: "Kitchen",
        features: ["light-brightness", { type: "toggle" }],
      },
    });
  });

  it("combines template defaults and instance variables when rendering a linked card", () => {
    const card = renderTemplate({
      variables: { icon: "mdi:lightbulb", area: "living_room" },
      card: { type: "tile", entity: "light.${area}", icon: "${icon}" },
    }, { area: "bedroom" });

    expect(card).toEqual({ type: "tile", entity: "light.bedroom", icon: "mdi:lightbulb" });
  });

  it("fails loudly when a stored template does not contain a child card", () => {
    expect(() => renderTemplate({ variables: {} }, {})).toThrow(/card object/);
  });
});
