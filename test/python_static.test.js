import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Home Assistant custom integration packaging", () => {
  it("exposes a frontend module from the integration static URL", () => {
    const manifest = JSON.parse(readFileSync("custom_components/linked_cards/manifest.json", "utf8"));
    const init = readFileSync("custom_components/linked_cards/__init__.py", "utf8");
    const constants = readFileSync("custom_components/linked_cards/const.py", "utf8");
    expect(manifest.domain).toBe("linked_cards");
    expect(manifest.config_flow).toBe(true);
    expect(constants).toContain("/linked-cards/linked-card.js");
    expect(init).toContain("/api/linked_cards/templates");
    expect(init).toContain("/api/linked_cards/templates/{template_id}");
    expect(init).toContain("Administrator privileges are required");
    expect(init).toContain("_MAX_TEMPLATE_BYTES");
    expect(init).toContain("Template not found");
  });
});
