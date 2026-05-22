import { describe, expect, it } from "vitest";
import { applyVariables, renderTemplate, renderSection, validateTemplateId } from "../src/template.js";

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

describe("section helpers", () => {
  it("renders a section template with variable substitution", () => {
    const template = {
      description: "Room control section",
      variables: { area: "Living Room", light: "light.living_room" },
      section: {
        title: "${area} Controls",
        cards: [
          { type: "tile", entity: "${light}", name: "${area} Light" },
          { type: "tile", entity: "climate.living_room", name: "Climate" }
        ]
      }
    };
    const section = renderSection(template, { area: "Kitchen", light: "light.kitchen" });
    expect(section.title).toBe("Kitchen Controls");
    expect(section.cards[0].entity).toBe("light.kitchen");
    expect(section.cards[0].name).toBe("Kitchen Light");
    expect(section.cards[1].entity).toBe("climate.living_room");
    expect(section.cards[1].name).toBe("Climate");
  });

  it("applies default variables from the template when none overridden", () => {
    const template = {
      variables: { area: "Default Room", light: "light.default" },
      section: {
        title: "${area}",
        cards: [{ type: "tile", entity: "${light}" }]
      }
    };
    const section = renderSection(template, {});
    expect(section.title).toBe("Default Room");
    expect(section.cards[0].entity).toBe("light.default");
  });

  it("throws when template missing section", () => {
    expect(() => renderSection({ variables: {} }, {})).toThrow("section object");
  });

  it("throws when section not an object", () => {
    expect(() => renderSection({ section: "not-an-object" }, {})).toThrow("section object");
  });

  it("normalises missing cards to empty array", () => {
    const section = renderSection({ section: { title: "Empty", cards: null } }, {});
    expect(Array.isArray(section.cards)).toBe(true);
    expect(section.cards).toHaveLength(0);
  });
});
