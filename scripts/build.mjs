import { build } from "esbuild";
import { mkdirSync, copyFileSync } from "node:fs";

mkdirSync("dist", { recursive: true });
mkdirSync("custom_components/linked_cards/www", { recursive: true });
await build({
  entryPoints: ["src/linked-card.js"],
  bundle: true,
  format: "esm",
  minify: true,
  sourcemap: true,
  target: "es2020",
  outfile: "dist/linked-card.js",
});
copyFileSync("dist/linked-card.js", "custom_components/linked_cards/www/linked-card.js");
copyFileSync("dist/linked-card.js.map", "custom_components/linked_cards/www/linked-card.js.map");
console.log("Built dist/linked-card.js and custom_components/linked_cards/www/linked-card.js");
