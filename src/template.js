export const TEMPLATE_ID_PATTERN = /^[a-zA-Z0-9_.-]{1,80}$/;

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
    if (replacement === undefined || replacement === null) return "";
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

export function mergeVariables(defaults = {}, overrides = {}) {
  return { ...(defaults || {}), ...(overrides || {}) };
}

export function renderTemplate(template, variables = {}) {
  if (!template || typeof template !== "object") throw new Error("Template is missing or invalid");
  if (!template.card || typeof template.card !== "object") throw new Error("Template must contain a card object");
  return applyVariables(template.card, mergeVariables(template.variables, variables));
}
