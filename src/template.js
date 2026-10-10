export const TEMPLATE_ID_PATTERN = /^[a-zA-Z0-9_.-]{1,80}$/;
const VARIABLE_PATTERN = /\$\{\s*([a-zA-Z0-9_.-]+)\s*\}/g;
const MAX_VARIABLE_RESOLUTION_DEPTH = 32;
const MAX_VARIABLE_EXPANSION_SIZE = 256 * 1024;

function convertStyleValue(val) {
  if (typeof val === "string") return val;
  const toProps = (obj) => Object.entries(obj).map(([p, v]) => `${p}: ${v};`);
  if (Array.isArray(val)) {
    return val.flatMap((item) => {
      if (!item) return [];
      if (typeof item === "string") return [item];
      if (typeof item === "object") return toProps(item);
      return [];
    }).join(" ");
  }
  if (val && typeof val === "object") return toProps(val).join(" ");
  return String(val);
}

function normalizeCardModStyle(style) {
  if (!style || typeof style === "string") return style;
  if (Array.isArray(style)) {
    return style
      .filter((item) => item && typeof item === "object" && !Array.isArray(item))
      .map(normalizeCardModStyle)
      .filter(Boolean)
      .join("\n");
  }
  if (typeof style !== "object") return style;
  const entries = Object.entries(style);
  const hasPiercingKey = entries.some(([k]) => k.trim().endsWith("$"));
  if (hasPiercingKey) {
    const result = {};
    for (const [selector, val] of entries) {
      result[selector] = val && typeof val === "object" && !Array.isArray(val)
        ? normalizeCardModStyle(val)
        : convertStyleValue(val);
    }
    return result;
  }
  let css = "";
  for (const [selector, val] of entries) {
    const props = convertStyleValue(val);
    if (props) css += `${selector} {\n  ${props}\n}\n`;
  }
  return css;
}

export function processCardMod(config) {
  if (!config || typeof config !== "object") return config;
  if (Array.isArray(config)) return config.map(processCardMod);
  const result = {};
  for (const [key, val] of Object.entries(config)) {
    if (key === "card_mod" && val && typeof val === "object" && "style" in val) {
      result[key] = { ...val, style: normalizeCardModStyle(val.style) };
    } else {
      result[key] = processCardMod(val);
    }
  }
  return result;
}

export function validateTemplateId(id) {
  return typeof id === "string" && TEMPLATE_ID_PATTERN.test(id);
}

export function resolvePath(source, path) {
  if (!path) return source;
  return String(path).split(".").reduce((value, part) => {
    if (value === undefined || value === null) return undefined;
    if (/^\d+$/.test(part) && Array.isArray(value)) return value[Number(part)];
    return value[part];
  }, source);
}

function renderString(value, variables) {
  return value.replace(/\$\{\s*([a-zA-Z0-9_.-]+)\s*\}/g, (match, path) => {
    const replacement = resolvePath(variables, path);
    if (replacement === undefined) return match;
    if (replacement === null) return "";
    if (typeof replacement === "object") return JSON.stringify(replacement);
    return String(replacement);
  });
}

export function applyVariables(value, variables = {}) {
  if (typeof value === "string") return renderString(value, variables);
  if (Array.isArray(value)) return value.map((item) => applyVariables(item, variables));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [renderString(key, variables), applyVariables(child, variables)]),
    );
  }
  return value;
}

export function resolveVariables(variables = {}) {
  const source = variables && typeof variables === "object" && !Array.isArray(variables)
    ? variables
    : {};
  const resolved = new Map();
  const resolvedDepth = new Map();
  const resolving = [];
  const depthFrames = [];
  let expansionBudget = MAX_VARIABLE_EXPANSION_SIZE;

  function appendWithinBudget(result, fragment) {
    const text = String(fragment);
    expansionBudget -= text.length;
    if (expansionBudget < 0) {
      throw new Error(`Variable expansion exceeds ${MAX_VARIABLE_EXPANSION_SIZE} characters`);
    }
    return result + text;
  }

  function readRawPath(parts) {
    let value = source;
    for (const part of parts) {
      if (value === null || value === undefined || typeof value !== "object") {
        return { found: false };
      }
      if (!Object.prototype.hasOwnProperty.call(value, part)) return { found: false };
      value = value[part];
    }
    return { found: value !== undefined, value };
  }

  function resolvePathParts(parts) {
    const cacheKey = JSON.stringify(parts);
    if (resolved.has(cacheKey)) {
      includeDependencyDepth(resolvedDepth.get(cacheKey));
      return resolved.get(cacheKey);
    }

    const cycleStart = resolving.indexOf(cacheKey);
    if (cycleStart !== -1) {
      const cycle = [...resolving.slice(cycleStart), cacheKey]
        .map((key) => JSON.parse(key).join("."))
        .join(" -> ");
      throw new Error(`Circular variable reference detected: ${cycle}`);
    }

    const raw = readRawPath(parts);
    if (!raw.found) return undefined;
    if (resolving.length >= MAX_VARIABLE_RESOLUTION_DEPTH) {
      throw new Error(`Variable reference depth exceeds ${MAX_VARIABLE_RESOLUTION_DEPTH}`);
    }

    resolving.push(cacheKey);
    depthFrames.push(1);
    const value = resolveValue(raw.value, parts);
    const depth = depthFrames.pop();
    resolving.pop();
    resolved.set(cacheKey, value);
    resolvedDepth.set(cacheKey, depth);
    includeDependencyDepth(depth);
    return value;
  }

  function includeDependencyDepth(depth) {
    if (!depthFrames.length) return;
    const index = depthFrames.length - 1;
    depthFrames[index] = Math.max(depthFrames[index], depth + 1);
    if (depthFrames[index] > MAX_VARIABLE_RESOLUTION_DEPTH) {
      throw new Error(`Variable reference depth exceeds ${MAX_VARIABLE_RESOLUTION_DEPTH}`);
    }
  }

  function resolveString(value) {
    let output = "";
    let cursor = 0;
    for (const match of value.matchAll(VARIABLE_PATTERN)) {
      output = appendWithinBudget(output, value.slice(cursor, match.index));
      const path = match[1];
      const parts = String(path).split(".");
      let replacement = match[0];
      if (readRawPath(parts).found) {
        replacement = resolvePathParts(parts);
        if (replacement === null) replacement = "";
        else if (typeof replacement === "object") replacement = JSON.stringify(replacement);
      }
      output = appendWithinBudget(output, replacement);
      cursor = match.index + match[0].length;
    }
    return appendWithinBudget(output, value.slice(cursor));
  }

  function resolveValue(value, parts) {
    if (typeof value === "string") return resolveString(value);
    if (Array.isArray(value)) {
      return value.map((_, index) => resolvePathParts([...parts, String(index)]));
    }
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.keys(value).map((key) => [
          resolveString(key),
          resolvePathParts([...parts, key]),
        ]),
      );
    }
    return value;
  }

  return Object.fromEntries(
    Object.keys(source).map((key) => [resolveString(key), resolvePathParts([key])]),
  );
}

export function mergeVariables(defaults = {}, overrides = {}) {
  return resolveVariables({ ...(defaults || {}), ...(overrides || {}) });
}

export function renderTemplate(template, variables = {}) {
  if (!template || typeof template !== "object") throw new Error("Template is missing or invalid");
  if (!template.card || typeof template.card !== "object") throw new Error("Template must contain a card object");
  return processCardMod(applyVariables(template.card, mergeVariables(template.variables, variables)));
}

export function renderSection(template, variables = {}) {
  if (!template || typeof template !== "object") throw new Error("Template is missing or invalid");
  if (!template.section || typeof template.section !== "object") throw new Error("Template must contain a section object");
  const section = applyVariables(template.section, mergeVariables(template.variables, variables));
  if (!Array.isArray(section.cards)) section.cards = [];
  return processCardMod(section);
}
