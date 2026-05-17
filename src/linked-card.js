import { renderTemplate, validateTemplateId } from "./template.js";

const API_ROOT = "linked_cards/templates";
const VERSION = "0.1.0";

async function createCardElement(config) {
  if (window.loadCardHelpers) {
    const helpers = await window.loadCardHelpers();
    return helpers.createCardElement(config);
  }
  await customElements.whenDefined("hui-card");
  const element = document.createElement("hui-card");
  element.setConfig(config);
  return element;
}

function errorCard(message, detail = "") {
  const element = document.createElement("ha-card");
  const content = document.createElement("div");
  content.className = "card-content";
  const title = document.createElement("b");
  title.textContent = "Linked Card error";
  const line = document.createElement("div");
  line.textContent = message;
  content.append(title, document.createElement("br"), line);
  if (detail) {
    const pre = document.createElement("pre");
    pre.textContent = detail;
    content.append(pre);
  }
  element.append(content);
  return element;
}

async function fetchTemplates(hass) {
  const response = await hass.callApi("GET", API_ROOT);
  return response.templates || {};
}

class LinkedCard extends HTMLElement {
  setConfig(config) {
    if (!config.template || !validateTemplateId(config.template)) {
      throw new Error("linked-card requires a safe template id in `template`");
    }
    this.config = config;
    this.attachShadowIfNeeded();
    this.renderRequested = true;
  }

  attachShadowIfNeeded() {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
  }

  set hass(hass) {
    this._hass = hass;
    if (this._child) this._child.hass = hass;
    if (this.renderRequested) {
      this.renderRequested = false;
      this.render().catch((err) => this.showError(err));
    }
  }

  async render() {
    if (!this._hass || !this.config) return;
    const templates = await fetchTemplates(this._hass);
    const template = templates[this.config.template];
    if (!template) {
      if (this.config.fallback) {
        this._child = await createCardElement(this.config.fallback);
        this._child.hass = this._hass;
        this.shadowRoot.replaceChildren(this._child);
        return;
      }
      throw new Error(`Template '${this.config.template}' was not found`);
    }
    const renderedConfig = renderTemplate(template, this.config.variables || {});
    this._child = await createCardElement(renderedConfig);
    this._child.hass = this._hass;
    this.shadowRoot.replaceChildren(this._child);
  }

  showError(err) {
    this.shadowRoot.replaceChildren(errorCard(err.message, err.stack));
  }

  getCardSize() {
    return this._child?.getCardSize?.() || 3;
  }
}

class LinkedCardManager extends HTMLElement {
  setConfig(config) {
    this.config = config || {};
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
  }

  set hass(hass) {
    this._hass = hass;
    if (!this.loaded) this.load();
  }

  async load() {
    this.loaded = true;
    try {
      const templates = await fetchTemplates(this._hass);
      this.render(templates);
    } catch (err) {
      this.shadowRoot.replaceChildren(errorCard(err.message, err.stack));
    }
  }

  render(templates) {
    const ids = Object.keys(templates).sort();
    const selected = this.config.template || ids[0] || "room-summary";
    const value = JSON.stringify(templates[selected] || demoTemplate(), null, 2);
    this.shadowRoot.innerHTML = `
      <style>
        ha-card { overflow: hidden; }
        .wrap { padding: 16px; display: grid; gap: 12px; }
        label { font-weight: 600; }
        input, textarea { box-sizing: border-box; width: 100%; font: inherit; }
        textarea { min-height: 340px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
        .row { display: grid; gap: 6px; }
        .actions { display: flex; flex-wrap: wrap; gap: 8px; }
        button { cursor: pointer; border: 0; border-radius: 8px; padding: 9px 12px; background: var(--primary-color); color: var(--text-primary-color, white); }
        button.secondary { background: var(--secondary-background-color); color: var(--primary-text-color); }
        .hint { color: var(--secondary-text-color); font-size: 12px; }
        .status { min-height: 20px; }
      </style>
      <ha-card header="Linked Card Manager">
        <div class="wrap">
          <div class="row">
            <label>Template id</label>
            <input id="template-id" placeholder="room-summary" />
            <div class="hint">Use letters, numbers, dots, underscores or dashes. Example: <code>room-summary</code>.</div>
          </div>
          <div class="row">
            <label>Master card template JSON</label>
            <textarea id="template-json"></textarea>
          </div>
          <div class="actions">
            <button id="save">Save master template</button>
            <button id="delete" class="secondary">Delete selected template</button>
            <button id="reload" class="secondary">Reload</button>
          </div>
          <div class="hint">Linked cards using this template update after dashboard refresh. No duplicated card YAML.</div>
          <div id="status" class="status"></div>
        </div>
      </ha-card>`;

    this.shadowRoot.getElementById("template-id").value = selected;
    this.shadowRoot.getElementById("template-json").value = value;
    this.shadowRoot.getElementById("save").addEventListener("click", () => this.save());
    this.shadowRoot.getElementById("delete").addEventListener("click", () => this.delete());
    this.shadowRoot.getElementById("reload").addEventListener("click", () => this.load());
  }

  status(message, error = false) {
    const node = this.shadowRoot.getElementById("status");
    node.textContent = message;
    node.style.color = error ? "var(--error-color, #db4437)" : "var(--success-color, #0b8043)";
  }

  async save() {
    const id = this.shadowRoot.getElementById("template-id").value.trim();
    if (!validateTemplateId(id)) return this.status("Invalid template id", true);
    let payload;
    try {
      payload = JSON.parse(this.shadowRoot.getElementById("template-json").value);
    } catch (err) {
      return this.status(`Invalid JSON: ${err.message}`, true);
    }
    if (!payload.card || typeof payload.card !== "object") return this.status("Template JSON must contain a card object", true);
    try {
      await this._hass.callApi("POST", `${API_ROOT}/${encodeURIComponent(id)}`, payload);
      this.status(`Saved '${id}'. Refresh dashboards that use it.`);
    } catch (err) {
      this.status(err.message, true);
    }
  }

  async delete() {
    const id = this.shadowRoot.getElementById("template-id").value.trim();
    if (!validateTemplateId(id)) return this.status("Invalid template id", true);
    try {
      await this._hass.callApi("DELETE", `${API_ROOT}/${encodeURIComponent(id)}`);
      this.status(`Deleted '${id}'.`);
      this.loaded = false;
      this.load();
    } catch (err) {
      this.status(err.message, true);
    }
  }

  getCardSize() { return 6; }
}

function demoTemplate() {
  return {
    description: "Reusable room tile grid. Override area, light and climate per instance.",
    variables: { area: "Living Room", light: "light.living_room", climate: "climate.living_room" },
    card: {
      type: "grid",
      title: "${area}",
      columns: 2,
      square: false,
      cards: [
        { type: "tile", entity: "${light}", name: "Lights", features: [{ type: "light-brightness" }] },
        { type: "tile", entity: "${climate}", name: "Climate", features: [{ type: "target-temperature" }] },
      ],
    },
  };
}

customElements.define("linked-card", LinkedCard);
customElements.define("linked-card-manager", LinkedCardManager);
window.customCards = window.customCards || [];
window.customCards.push(
  { type: "linked-card", name: "Linked Card", description: "Render a shared master dashboard card by template id." },
  { type: "linked-card-manager", name: "Linked Card Manager", description: "Create and edit shared master card templates." },
);
console.info(`%c LINKED-CARDS %c v${VERSION} `, "color:#fff;background:#03a9f4;font-weight:700", "color:#03a9f4;font-weight:700");
