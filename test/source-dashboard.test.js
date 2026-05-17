import { describe, expect, it } from "vitest";
import { extractSourceStructure, createDashboardCacheKey } from "../src/source-dashboard.js";

describe("source dashboard helpers", () => {
  const config = {
    views: [
      { title: "Overview", path: "home", cards: [{ type: "markdown", content: "Home" }] },
      { title: "Popups", path: "popups", cards: [{ type: "custom:bubble-card", hash: "#lights" }] },
      {
        title: "Header",
        path: "header",
        sections: [
          {
            type: "grid",
            cards: [
              { type: "heading", heading: "Shared" },
              { type: "tile", entity: "light.kitchen", grid_options: { columns: 6, rows: 1 } },
            ],
            column_span: 2,
          },
        ],
      },
    ],
  };

  it("builds stable cache keys per dashboard and view", () => {
    expect(createDashboardCacheKey("global-cards", "popups")).toBe("global-cards::popups");
    expect(createDashboardCacheKey("global-cards", "")).toBe("global-cards::");
  });

  it("extracts flat cards from a selected source view by path or title", () => {
    expect(extractSourceStructure(config, "popups")).toEqual({
      type: "flat",
      cards: [{ type: "custom:bubble-card", hash: "#lights" }],
    });
    expect(extractSourceStructure(config, "Overview")).toEqual({
      type: "flat",
      cards: [{ type: "markdown", content: "Home" }],
    });
  });

  it("extracts section view cards without discarding section metadata", () => {
    expect(extractSourceStructure(config, "header")).toEqual({
      type: "sections",
      maxColumns: 4,
      sections: [
        {
          type: "grid",
          cards: [
            { type: "heading", heading: "Shared" },
            { type: "tile", entity: "light.kitchen", grid_options: { columns: 6, rows: 1 } },
          ],
          column_span: 2,
        },
      ],
    });
  });

  it("combines all source views when source_view is omitted", () => {
    const structure = extractSourceStructure(config, "");
    expect(structure.type).toBe("sections");
    expect(structure.sections).toHaveLength(1);
  });

  it("returns an empty flat structure when the requested source view is missing", () => {
    expect(extractSourceStructure(config, "missing")).toEqual({ type: "flat", cards: [] });
  });
});
