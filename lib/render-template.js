import { escapeHtml } from "./html-escape";

/**
 * @param {string} template
 * @param {Record<string, string>} values
 */
export function renderTemplate(template, values) {
  let out = template;
  for (const [k, v] of Object.entries(values)) {
    const re = new RegExp(`\\{\\{${k}\\}\\}`, "g");
    out = out.replace(re, v);
  }
  return out;
}

/**
 * @param {Record<string, string>} raw user-facing strings to escape
 */
export function renderTemplateEscaped(template, raw) {
  /** @type {Record<string, string>} */
  const safe = {};
  for (const [k, v] of Object.entries(raw)) {
    safe[k] = escapeHtml(v);
  }
  return renderTemplate(template, safe);
}
