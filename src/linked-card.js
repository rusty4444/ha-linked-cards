import { renderTemplate, validateTemplateId } from "./template.js";
import { countSourceCards, extractSourceStructure, fetchDashboardConfig } from "./source-dashboard.js";

const API_ROOT = "linked_cards/templates";
const VERSION = "0.1.1";

const templateCache = new Map();
const templateInflight = new Map();
let allTemplatesInflight = null;
let allTemplatesPrimed = false;

function cacheGet(id) {
  return templateCache.has(id) ? templateCache.get(id) : undefined;
}

function cacheSet(id, value) {
  templateCache.set(id, value);
}

function cacheInvalidate(id) {
  if (id) templateCache.delete(id);
  else templateCache.clear();
  allTemplatesPrimed = false;
}

async function fetchTemplate(hass, id) {
  const cached = cacheGet(id);
  if (cached !== undefined) return cached;
  if (templateInflight.has(id)) return templateInflight.get(id);
  const promise = (async () => {
    try {
      const response = await hass.callApi("GET", `${API_ROOT}/${encodeURIComponent(id)}`);
      const template = response && response.template ? response.template : null;
      cacheSet(id, template);
      return template;
    } catch (err) {
      if (err && (err.status_code === 404 || err.status === 404)) {
        cacheSet(id, null);
        return null;
      }
      if (allTemplatesPrimed === false) {
        const all = await fetchAllTemplates(hass);
        return all[id] ?? null;
      }
      throw err;
    } finally {
      templateInflight.delete(id);
    }
  })();
  templateInflight.set(id, promise);
  return promise;
}

async function fetchAllTemplates(hass) {
  if (allTemplatesInflight) return allTemplatesInflight;
  allTemplatesInflight = (async () => {
    try {
      const response = await hass.callApi("GET", API_ROOT);
      const templates = (response && response.templates) || {};
      for (const [id, tpl] of Object.entries(templates)) cacheSet(id, tpl);
      allTemplatesPrimed = true;
      return templates;
    } finally {
      allTemplatesInflight = null;
    }
  })();
  return allTemplatesInflight;
}

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

function configKey(config) {
  if (!config) return "";
  return JSON.stringify({
    mode: config.mode || null,
    template: config.template || null,
    source_dashboard: config.source_dashboard || null,
    source_view: config.source_view || null,
    variables: config.variables || null,
    fallback: config.fallback || null,
    card_size: config.card_size ?? null,
  });
}

function isSourceMode(config) {
  return config?.mode === "source" || Boolean(config?.source_dashboard);
}

function findHuiRoot() {
  return document.querySelector("home-assistant")
    ?.shadowRoot?.querySelector("home-assistant-main")
    ?.shadowRoot?.querySelector("ha-drawer")
    ?.querySelector("partial-panel-resolver ha-panel-lovelace")
    ?.shadowRoot?.querySelector("hui-root") || null;
}

function isEditMode() {
  try {
    return Boolean(findHuiRoot()?.lovelace?.editMode);
  } catch (_) {
    return false;
  }
}

function statusCard({ sourceDashboard, sourceView, count, mode }) {
  const element = document.createElement("ha-card");
  const content = document.createElement("div");
  content.className = "card-content";
  const title = document.createElement("b");
  title.textContent = "Linked Card source";
  const lines = [
    `Dashboard: ${sourceDashboard || "not set"}`,
    `View: ${sourceView || "all views"}`,
    `Mode: ${mode}`,
    `Loaded cards: ${count}`,
  ];
  content.append(title);
  for (const lineText of lines) {
    content.append(document.createElement("br"));
    const line = document.createElement("span");
    line.textContent = lineText;
    content.append(line);
  }
  element.append(content);
  return element;
}

class LinkedCard extends HTMLElement {
  constructor() {
    super();
    this._renderToken = 0;
    this._lastConfigKey = null;
    this._lastChildKey = null;
    this._lastChildSize = null;
    this._connected = false;
  }

  setConfig(config) {
    if (isSourceMode(config)) {
      if (!config.source_dashboard || typeof config.source_dashboard !== "string") {
        throw new Error("linked-card source mode requires `source_dashboard`");
      }
    } else if (!config.template || !validateTemplateId(config.template)) {
      throw new Error("linked-card requires a safe template id in `template`");
    }
    const key = configKey(config);
    if (this._lastConfigKey === key) {
      this.config = config;
      return;
    }
    this.config = config;
    this._lastConfigKey = key;
    this.attachShadowIfNeeded();
    this.renderRequested = true;
    if (this._hass) this._scheduleRender();
  }

  attachShadowIfNeeded() {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this._connected = true;
    this._editModeChanged = () => {
      if (isSourceMode(this.config) && this._hass) this._scheduleRender();
    };
    window.addEventListener("lovelace-edit-mode-changed", this._editModeChanged);
  }

  disconnectedCallback() {
    this._connected = false;
    this._renderToken++;
    this._externalSourceContainer?.remove();
    this._externalSourceContainer = null;
    if (this._editModeChanged) window.removeEventListener("lovelace-edit-mode-changed", this._editModeChanged);
  }

  set hass(hass) {
    this._hass = hass;
    if (this._child) this._child.hass = hass;
    this._cards?.forEach((card) => { card.hass = hass; });
    if (this.renderRequested) this._scheduleRender();
  }

  _scheduleRender() {
    this.renderRequested = false;
    const token = ++this._renderToken;
    this.render(token).catch((err) => {
      if (token === this._renderToken) this.showError(err);
    });
  }

  async render(token = ++this._renderToken) {
    if (!this._hass || !this.config) return;
    if (isSourceMode(this.config)) {
      await this._renderSource(token);
      return;
    }
    const template = await fetchTemplate(this._hass, this.config.template);
    if (token !== this._renderToken) return;
    if (!template) {
      if (this.config.fallback) {
        await this._mountChild(this.config.fallback, `fallback:${configKey(this.config)}`, token);
        return;
      }
      throw new Error(`Template '${this.config.template}' was not found`);
    }
    const renderedConfig = renderTemplate(template, this.config.variables || {});
    const childKey = JSON.stringify(renderedConfig);
    await this._mountChild(renderedConfig, childKey, token);
  }

  async _renderSource(token) {
    const lovelaceConfig = await fetchDashboardConfig(this._hass, this.config.source_dashboard, this.config.source_view || "");
    if (token !== this._renderToken) return;
    const structure = extractSourceStructure(lovelaceConfig, this.config.source_view || "");
    const count = countSourceCards(structure);
    const childKey = `source:${JSON.stringify({
      source_dashboard: this.config.source_dashboard,
      source_view: this.config.source_view || "",
      structure,
      edit: isEditMode(),
    })}`;
    await this._mountSourceStructure(structure, childKey, token, count);
  }

  async _mountSourceStructure(structure, childKey, token, count) {
    if (this._child && childKey === this._lastChildKey) {
      this._cards?.forEach((card) => { card.hass = this._hass; });
      return;
    }

    this._externalSourceContainer?.remove();
    this._externalSourceContainer = null;

    const displayMode = this.config.source_display || this.config.display || "inline";
    const edit = isEditMode();
    const wrapper = document.createElement("div");
    wrapper.className = "linked-card-source";
    wrapper.style.display = "grid";
    wrapper.style.gap = "8px";
    this._cards = [];

    if (edit) {
      wrapper.append(statusCard({
        sourceDashboard: this.config.source_dashboard,
        sourceView: this.config.source_view || "",
        count,
        mode: `source/${displayMode}`,
      }));
    }

    if (structure.type === "sections") {
      const sections = await this._createSectionElements(structure);
      if (token !== this._renderToken) return;
      sections.forEach((section) => wrapper.append(section));
    } else {
      const cards = await Promise.all((structure.cards || []).map((cardConfig) => createCardElement(cardConfig)));
      if (token !== this._renderToken) return;
      cards.forEach((card) => {
        card.hass = this._hass;
        this._cards.push(card);
        wrapper.append(card);
      });
    }

    this._child = wrapper;
    this._lastChildKey = childKey;
    if (displayMode === "popup" && !edit) {
      wrapper.style.position = "fixed";
      wrapper.style.width = "0";
      wrapper.style.height = "0";
      wrapper.style.overflow = "hidden";
      wrapper.style.pointerEvents = "auto";
      const target = findHuiRoot()?.shadowRoot || document.body;
      target.append(wrapper);
      this._externalSourceContainer = wrapper;
      this.shadowRoot.replaceChildren(document.createComment("linked-card source popup container mounted"));
      return;
    }
    this.shadowRoot.replaceChildren(wrapper);
  }

  async _createSectionElements(structure) {
    const sections = [];
    for (const sectionConfig of structure.sections || []) {
      const section = document.createElement("div");
      section.className = "linked-card-source-section";
      section.style.display = "grid";
      section.style.gap = "8px";
      section.style.gridTemplateColumns = "repeat(12, minmax(0, 1fr))";
      const cards = await Promise.all((sectionConfig.cards || []).map((cardConfig) => createCardElement(cardConfig)));
      cards.forEach((card, index) => {
        const cardConfig = sectionConfig.cards[index] || {};
        const columns = cardConfig.grid_options?.columns || 12;
        card.style.gridColumn = `span ${Math.min(12, Math.max(1, Number(columns) || 12))}`;
        card.hass = this._hass;
        this._cards.push(card);
        section.append(card);
      });
      sections.push(section);
    }
    return sections;
  }

  async _mountChild(renderedConfig, childKey, token) {
    this._externalSourceContainer?.remove();
    this._externalSourceContainer = null;
    if (this._child && childKey === this._lastChildKey) {
      this._child.hass = this._hass;
      return;
    }
    const child = await createCardElement(renderedConfig);
    if (token !== this._renderToken) return;
    child.hass = this._hass;
    this._child = child;
    this._lastChildKey = childKey;
    this.shadowRoot.replaceChildren(child);
    queueMicrotask(() => {
      try {
        const size = child.getCardSize?.();
        if (typeof size === "number" && Number.isFinite(size)) this._lastChildSize = size;
      } catch (_) {}
    });
  }

  showError(err) {
    this.attachShadowIfNeeded();
    this.shadowRoot.replaceChildren(errorCard(err.message, err.stack));
    this._child = null;
    this._lastChildKey = null;
  }

  getCardSize() {
    const live = this._child?.getCardSize?.();
    if (typeof live === "number" && Number.isFinite(live)) return live;
    if (typeof this.config?.card_size === "number") return this.config.card_size;
    if (this._lastChildSize != null) return this._lastChildSize;
    return 3;
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
      cacheInvalidate();
      const templates = await fetchAllTemplates(this._hass);
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
      cacheInvalidate();
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
      cacheInvalidate();
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
