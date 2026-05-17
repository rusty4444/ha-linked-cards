import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("live update and export/import wiring", () => {
  const frontend = readFileSync("src/linked-card.js", "utf8");
  const backend = `${readFileSync("custom_components/linked_cards/const.py", "utf8")}\n${readFileSync("custom_components/linked_cards/__init__.py", "utf8")}`;

  it("fires a Home Assistant bus event when templates are saved or deleted", () => {
    expect(backend).toContain("linked_cards_template_updated");
    expect(backend).toContain("hass.bus.async_fire");
    expect(backend).toContain("template_id");
  });

  it("linked cards subscribe to template update events and invalidate cache", () => {
    expect(frontend).toContain("subscribeEvents");
    expect(frontend).toContain("linked_cards_template_updated");
    expect(frontend).toContain("cacheInvalidate(event.data.template_id)");
  });

  it("manager supports export and import controls", () => {
    expect(frontend).toContain("export-template");
    expect(frontend).toContain("export-all");
    expect(frontend).toContain("import-template");
    expect(frontend).toContain("URL.createObjectURL");
  });
});
