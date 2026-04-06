import * as XLSX from "xlsx";

export const REQUIRED_COLUMNS = ["Company", "Amount", "Type of Invoice"];

/** Optional; when present and non-empty, override PDF hiring entity / project (premises). */
export const OPTIONAL_COLUMNS = ["Owner", "Address", "Invoice ID", "Project"];

/** Canonical types used after inference (substring match on the cell). */
export const CANONICAL_INVOICE_TYPES = [
  "week",
  "month",
  "final",
  "one-time",
  "deposit",
  "progress",
];

const MONTH_KEYWORDS = [
  "january",
  "jan",
  "february",
  "feb",
  "march",
  "mar",
  "april",
  "apr",
  "may",
  "june",
  "jun",
  "july",
  "jul",
  "august",
  "aug",
  "september",
  "sept",
  "sep",
  "october",
  "oct",
  "november",
  "nov",
  "december",
  "dec",
];

/**
 * Normalize cell text for matching.
 * @param {unknown} raw
 */
function normalizeTypeCell(raw) {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Match a keyword as a full word to avoid accidental substring matches.
 * @param {string} text
 * @param {string} word
 */
function containsWord(text, word) {
  return new RegExp(`\\b${word}\\b`).test(text);
}

/**
 * Map a free-text "Type of Invoice" to a canonical type if the text **contains**
 * any known keyword. First matching rule wins (more specific phrases first).
 * @param {string} t normalized cell (lowercase, collapsed spaces)
 * @returns {string | null} canonical type or null
 */
export function inferCanonicalInvoiceType(t) {
  if (!t) return null;
  if (
    t.includes("one-time") ||
    t.includes("one time") ||
    t.includes("onetime")
  ) {
    return "one-time";
  }
  if (t.includes("deposit")) return "deposit";
  if (t.includes("progress")) return "progress";
  if (t.includes("week")) return "week";
  if (t.includes("month")) return "month";
  if (MONTH_KEYWORDS.some((m) => containsWord(t, m))) return "month";
  if (t.includes("final")) return "final";
  return null;
}

/**
 * @param {unknown} raw
 * @returns {number | null}
 */
export function parseAmount(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const cleaned = String(raw).replace(/[$,\s]/g, "");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {string} type
 * @returns {string[]}
 */
export function pdfKindsForInvoiceType(type) {
  const t = type.trim().toLowerCase();
  if (["week", "month", "final", "one-time"].includes(t)) {
    return ["conditional", "unconditional"];
  }
  if (["deposit", "progress"].includes(t)) {
    return ["partial"];
  }
  return [];
}

function isRowEmpty(row, colIndex) {
  const company = String(row[colIndex["Company"]] ?? "").trim();
  const amount = row[colIndex["Amount"]];
  const inv = String(row[colIndex["Type of Invoice"]] ?? "").trim();
  return !company && (amount === "" || amount === undefined) && !inv;
}

/**
 * @param {Buffer | ArrayBuffer | Uint8Array} buffer
 * @returns {{ error: string } | { validRows: object[], skipped: object[] }}
 */
export function parseWaiverWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { error: "The Excel file has no sheets." };
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });

  if (!rows.length) {
    return { error: "The first sheet is empty." };
  }

  const headerRow = rows[0].map((c) => String(c).trim());
  const colIndex = {};

  for (const name of REQUIRED_COLUMNS) {
    const idx = headerRow.indexOf(name);
    if (idx === -1) {
      return {
        error: `Missing required column "${name}". Expected headers: ${REQUIRED_COLUMNS.join(", ")}.`,
      };
    }
    colIndex[name] = idx;
  }

  for (const name of OPTIONAL_COLUMNS) {
    const idx = headerRow.indexOf(name);
    if (idx !== -1) colIndex[name] = idx;
  }

  const validRows = [];
  const skipped = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const sheetRow = i + 1;

    if (isRowEmpty(row, colIndex)) {
      continue;
    }

    const company = String(row[colIndex["Company"]] ?? "").trim();
    const amountRaw = row[colIndex["Amount"]];
    const typeNormalized = normalizeTypeCell(row[colIndex["Type of Invoice"]]);

    if (!company) {
      console.warn(`[generate-waivers] Skipping sheet row ${sheetRow}: missing company`);
      skipped.push({ row: sheetRow, reason: "Missing company name." });
      continue;
    }

    const amount = parseAmount(amountRaw);
    if (amount === null) {
      console.warn(
        `[generate-waivers] Skipping sheet row ${sheetRow}: invalid amount (${JSON.stringify(amountRaw)})`
      );
      skipped.push({ row: sheetRow, reason: "Invalid or empty amount." });
      continue;
    }

    const canonicalType = inferCanonicalInvoiceType(typeNormalized);
    if (!canonicalType) {
      console.warn(
        `[generate-waivers] Skipping sheet row ${sheetRow}: Type of Invoice has no recognized keyword (${JSON.stringify(typeNormalized)})`
      );
      skipped.push({
        row: sheetRow,
        reason:
          "Type of Invoice must contain one of: week, month, final, one-time (or one time), deposit, or progress.",
      });
      continue;
    }

    const pdfKinds = pdfKindsForInvoiceType(canonicalType);
    const owner =
      colIndex["Owner"] !== undefined
        ? String(row[colIndex["Owner"]] ?? "").trim()
        : "";
    const address =
      colIndex["Address"] !== undefined
        ? String(row[colIndex["Address"]] ?? "").trim()
        : "";
    const invoiceId =
      colIndex["Invoice ID"] !== undefined
        ? String(row[colIndex["Invoice ID"]] ?? "").trim()
        : "";
    const project =
      colIndex["Project"] !== undefined
        ? String(row[colIndex["Project"]] ?? "").trim()
        : "";

    validRows.push({
      rowNumber: sheetRow,
      company,
      amount,
      typeOfInvoice: canonicalType,
      typeOfInvoiceRaw: typeNormalized,
      owner,
      address,
      invoiceId,
      project,
      pdfKinds,
    });
  }

  return { validRows, skipped };
}
