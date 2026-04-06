import fs from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer";
import { formatUsd, usdAmountToWords } from "./amount-to-words";
import { renderTemplateEscaped } from "./render-template";

const PROJECT_NAME = "2 Park Avenue, New York, NY 10016";

/** Employer / general contractor (matches sample form; override with WAIVER_HIRING_ENTITY). */
const HIRING_ENTITY =
  process.env.WAIVER_HIRING_ENTITY || "Sorora Land Development LLC";

const NOTARY_STATE = "NEW YORK";
const NOTARY_COUNTY = "NEW YORK";

const FOREGOING_DOC_LABEL = {
  conditional: "Conditional Waiver and Release",
  unconditional: "Unconditional Waiver and Release",
  partial: "Partial Waiver and Release",
};

const TEMPLATE_FILES = {
  conditional: "conditional-waiver.html",
  unconditional: "unconditional-waiver.html",
  partial: "partial-waiver.html",
};

/** @type {Promise<import("puppeteer").Browser> | null} */
let browserPromise = null;

async function launchBrowser() {
  const base = {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  };

  const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (fromEnv) {
    return puppeteer.launch({ ...base, executablePath: fromEnv });
  }

  try {
    return await puppeteer.launch({ ...base, channel: "chrome" });
  } catch (err) {
    console.warn(
      "[pdf-generator] Launch with channel \"chrome\" failed; trying Puppeteer-managed Chrome. Install it with: npm run install:browsers",
      err instanceof Error ? err.message : err
    );
  }

  return puppeteer.launch(base);
}

function getBrowser() {
  if (!browserPromise) {
    browserPromise = launchBrowser();
  }
  return browserPromise;
}

export async function closePdfBrowser() {
  if (browserPromise) {
    const b = await browserPromise;
    browserPromise = null;
    await b.close().catch(() => {});
  }
}

async function readTemplateFile(name) {
  const dir = path.join(process.cwd(), "templates", name);
  return fs.readFile(dir, "utf8");
}

/**
 * @param {"conditional"|"unconditional"|"partial"} kind
 * @param {{ company: string, amount: number, rowNumber?: number, owner?: string, address?: string, invoiceId?: string, project?: string }} row
 * @param {string} [dateStr] optional display date
 */
export async function htmlForWaiver(kind, row, dateStr) {
  const amountFormatted = formatUsd(row.amount);
  const amountWords = usdAmountToWords(row.amount);
  const date =
    dateStr ??
    new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date());

  const documentId = String(row.invoiceId ?? "").trim();
  const owner = String(row.owner ?? "").trim();
  const address = String(row.address ?? "").trim();
  const project = String(row.project ?? "").trim();
  const vars = {
    company: row.company,
    amountFormatted,
    amountWords,
    projectName: address || PROJECT_NAME,
    hiringEntity: owner || HIRING_ENTITY,
    project,
    notaryState: NOTARY_STATE,
    notaryCounty: NOTARY_COUNTY,
    foregoingDoc: FOREGOING_DOC_LABEL[kind],
    documentId,
    date,
  };

  const file = TEMPLATE_FILES[kind];
  const template = await readTemplateFile(file);
  return renderTemplateEscaped(template, vars);
}

/**
 * @param {string} html
 * @returns {Promise<Buffer>}
 */
export async function htmlToPdfBuffer(html) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 816, height: 1056, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "load" });
    const buf = await page.pdf({
      format: "Letter",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    return Buffer.from(buf);
  } finally {
    await page.close();
  }
}
