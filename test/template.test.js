import { describe, expect, it } from "vitest";
import { applyVariables, processCardMod, renderTemplate, renderSection, validateTemplateId } from "../src/template.js";

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

  it("recursively resolves variables using the merged instance overrides", () => {
    const card = renderTemplate({
      variables: {
        entity_base_name: "plug_1",
        switch_entity: "switch.${entity_base_name}_switch",
        label: "Control ${switch_entity}",
      },
      card: { type: "tile", entity: "${switch_entity}", name: "${label}" },
    }, { entity_base_name: "plug_2" });

    expect(card).toEqual({
      type: "tile",
      entity: "switch.plug_2_switch",
      name: "Control switch.plug_2_switch",
    });
  });

  it("honours an instance override for a derived variable", () => {
    const card = renderTemplate({
      variables: {
        entity_base_name: "plug_1",
        power_entity: "sensor.${entity_base_name}_power",
      },
      card: { type: "tile", entity: "${power_entity}" },
    }, {
      entity_base_name: "plug_3",
      power_entity: "sensor.plug_3_helper_power",
    });

    expect(card.entity).toBe("sensor.plug_3_helper_power");
  });

  it("resolves nested variable paths without flattening the variable object", () => {
    const card = renderTemplate({
      variables: {
        entity_base_name: "plug_1",
        entities: { power: "sensor.${entity_base_name}_power" },
        power_entity: "${entities.power}",
      },
      card: { type: "tile", entity: "${power_entity}" },
    }, {});

    expect(card.entity).toBe("sensor.plug_1_power");
  });

  it("rejects circular variable references with the dependency chain", () => {
    expect(() => renderTemplate({
      variables: { first: "${second}", second: "${first}" },
      card: { type: "markdown", content: "${first}" },
    }, {})).toThrow("Circular variable reference detected: first -> second -> first");
  });

  it("bounds deeply nested variable dependency chains", () => {
    const variables = { value0: "done" };
    for (let index = 1; index <= 33; index++) {
      variables[`value${index}`] = `\${value${index - 1}}`;
    }

    expect(() => renderTemplate({
      variables,
      card: { type: "markdown", content: "${value33}" },
    }, {})).toThrow("Variable reference depth exceeds 32");
  });

  it("bounds acyclic variable output expansion", () => {
    const variables = { value0: "x" };
    for (let index = 1; index <= 20; index++) {
      variables[`value${index}`] = `\${value${index - 1}}\${value${index - 1}}`;
    }

    expect(() => renderTemplate({
      variables,
      card: { type: "markdown", content: "${value20}" },
    }, {})).toThrow("Variable expansion exceeds 262144 characters");
  });

  it("fails loudly when a stored template does not contain a child card", () => {
    expect(() => renderTemplate({ variables: {} }, {})).toThrow(/card object/);
  });

  it("leaves undeclared ${...} placeholders untouched, e.g. JS template literals in button-card JS blocks", () => {
    const rendered = applyVariables({
      code: "return `<div style=\"width: ${state}%;\"></div>`;",
    }, {});
    expect(rendered).toEqual({
      code: "return `<div style=\"width: ${state}%;\"></div>`;",
    });
  });

  it("still substitutes an explicit null variable as an empty string", () => {
    const rendered = applyVariables({ name: "${name}" }, { name: null });
    expect(rendered).toEqual({ name: "" });
  });

  it("leaves a placeholder alone when only part of a nested path resolves", () => {
    const rendered = applyVariables({ type: "${nested.kind}" }, { nested: {} });
    expect(rendered).toEqual({ type: "${nested.kind}" });
  });

  it("honours a null template default so the placeholder still collapses to an empty string", () => {
    const card = renderTemplate({
      variables: { name: null },
      card: { type: "tile", name: "${name}" },
    }, {});

    expect(card).toEqual({ type: "tile", name: "" });
  });
});

describe("card_mod style normalization", () => {
  it("passes through a config with no card_mod untouched", () => {
    const config = { type: "tile", entity: "light.kitchen" };
    expect(processCardMod(config)).toEqual(config);
  });

  it("leaves a string card_mod.style unchanged", () => {
    const config = { type: "tile", card_mod: { style: "ha-card { color: red; }" } };
    expect(processCardMod(config)).toEqual(config);
  });

  it("converts a CSS property dict to a CSS block string", () => {
    const result = processCardMod({
      type: "tile",
      card_mod: { style: { "ha-card": { color: "red", "font-size": "14px" } } },
    });
    expect(result.card_mod.style).toBe("ha-card {\n  color: red; font-size: 14px;\n}\n");
  });

  it("handles a shadow-piercing $ key by normalizing its inner CSS dict to a string", () => {
    const result = processCardMod({
      type: "tile",
      card_mod: { style: { "$": { "ha-card": { color: "blue" } } } },
    });
    expect(result.card_mod.style).toEqual({ "$": "ha-card {\n  color: blue;\n}\n" });
  });

  it("flattens an array of CSS property objects into a single CSS block", () => {
    const result = processCardMod({
      type: "tile",
      card_mod: { style: { "ha-card": [{ color: "red" }, { background: "blue" }] } },
    });
    expect(result.card_mod.style).toBe("ha-card {\n  color: red; background: blue;\n}\n");
  });

  it("preserves string items alongside objects in a mixed value array", () => {
    const result = processCardMod({
      type: "tile",
      card_mod: { style: { "ha-card": ["color: red;", { background: "blue" }] } },
    });
    expect(result.card_mod.style).toBe("ha-card {\n  color: red; background: blue;\n}\n");
  });

  it("ignores plain CSS string items in a top-level style array", () => {
    const result = processCardMod({
      type: "tile",
      card_mod: { style: ["ha-card { color: red; }", { ".foo": { background: "blue" } }] },
    });
    expect(result.card_mod.style).toBe(".foo {\n  background: blue;\n}\n");
  });

  it("normalizes a top-level array of CSS dicts by converting and joining them", () => {
    const result = processCardMod({
      type: "tile",
      card_mod: { style: [{ "ha-card": { color: "red" } }, { ".foo": { background: "blue" } }] },
    });
    expect(result.card_mod.style).toBe("ha-card {\n  color: red;\n}\n\n.foo {\n  background: blue;\n}\n");
  });

  it("recursively normalizes card_mod in nested card arrays", () => {
    const result = processCardMod({
      type: "grid",
      cards: [
        { type: "tile", card_mod: { style: { "ha-card": { color: "green" } } } },
        { type: "entity", card_mod: { style: "ha-card { background: white; }" } },
      ],
    });
    expect(result.cards[0].card_mod.style).toBe("ha-card {\n  color: green;\n}\n");
    expect(result.cards[1].card_mod.style).toBe("ha-card { background: white; }");
  });

  it("renderTemplate resolves card_mod style dicts in the rendered card", () => {
    const card = renderTemplate({
      variables: { color: "red" },
      card: {
        type: "tile",
        entity: "light.kitchen",
        card_mod: { style: { "ha-card": { color: "${color}" } } },
      },
    }, {});
    expect(card.card_mod.style).toBe("ha-card {\n  color: red;\n}\n");
  });

  it("renderSection resolves card_mod style dicts in section cards", () => {
    const section = renderSection({
      section: {
        cards: [{ type: "tile", card_mod: { style: { "ha-card": { color: "blue" } } } }],
      },
    }, {});
    expect(section.cards[0].card_mod.style).toBe("ha-card {\n  color: blue;\n}\n");
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
