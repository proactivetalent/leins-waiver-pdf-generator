import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
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

/** @type {Promise<string> | null} */
let waiverPdfFontStylePromise = null;

/**
 * Sparticuz / Linux Chromium has no "Arial Narrow". Embed Archivo Narrow (OFL) so
 * deployed PDFs keep narrow body text; local Chrome still prefers Arial Narrow first.
 */
async function getWaiverPdfFontStyleBlock() {
  if (!waiverPdfFontStylePromise) {
    const base = path.join(
      process.cwd(),
      "node_modules",
      "@fontsource",
      "archivo-narrow",
      "files"
    );
    waiverPdfFontStylePromise = (async () => {
      try {
        const [w400, w700] = await Promise.all([
          fs.readFile(path.join(base, "archivo-narrow-latin-400-normal.woff2")),
          fs.readFile(path.join(base, "archivo-narrow-latin-700-normal.woff2")),
        ]);
        const b400 = w400.toString("base64");
        const b700 = w700.toString("base64");
        return `<style id="waiver-embedded-archivo-narrow">
@font-face{font-family:"Archivo Narrow";font-style:normal;font-weight:400;font-display:block;src:url(data:font/woff2;base64,${b400}) format("woff2");}
@font-face{font-family:"Archivo Narrow";font-style:normal;font-weight:700;font-display:block;src:url(data:font/woff2;base64,${b700}) format("woff2");}
</style>`;
      } catch (err) {
        console.error(
          "[pdf-generator] Embedded waiver fonts missing; PDFs may fall back to Arial.",
          err instanceof Error ? err.message : err
        );
        return "";
      }
    })();
  }
  return waiverPdfFontStylePromise;
}

async function injectWaiverPdfFonts(html) {
  const block = await getWaiverPdfFontStyleBlock();
  if (!block) return html;
  if (html.includes("</head>")) {
    return html.replace("</head>", `${block}</head>`);
  }
  if (/<head\b[^>]*>/i.test(html)) {
    return html.replace(/<head\b[^>]*>/i, (m) => `${m}${block}`);
  }
  return `${block}${html}`;
}

/** @type {Promise<import("puppeteer").Browser> | null} */
let browserPromise = null;

/** Vercel/AWS Lambda have no Chrome; use @sparticuz/chromium + puppeteer-core. */
const IS_SERVERLESS =
  process.env.VERCEL === "1" || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);

const TMP = tmpdir();

function sparticuzLibPath(name) {
  const bases = [
    path.join(TMP, "al2023", "lib"),
    path.join(TMP, "al2023", "lib64"),
    path.join(TMP, "al2", "lib"),
    path.join(TMP, "al2", "lib64"),
  ];
  return bases.find((b) => existsSync(path.join(b, name)));
}

/** Sparticuz only prepends .../lib; NSPR is often in lib64 — both must be on LD_LIBRARY_PATH. */
function mergeSparticuzLdLibraryPath() {
  const dirs = [
    path.join(TMP, "al2023", "lib"),
    path.join(TMP, "al2023", "lib64"),
    path.join(TMP, "al2", "lib"),
    path.join(TMP, "al2", "lib64"),
  ].filter((d) => existsSync(d));
  if (dirs.length === 0) return;
  const cur = process.env.LD_LIBRARY_PATH?.split(":").filter(Boolean) ?? [];
  const seen = new Set();
  process.env.LD_LIBRARY_PATH = [...dirs, ...cur]
    .filter((p) => (seen.has(p) ? false : (seen.add(p), true)))
    .join(":");
}

/** Broken warm /tmp: chromium exists but al2023 never extracted or lambdafs skipped a partial dir. */
async function resetSparticuzArtifactsIfIncomplete() {
  const chromiumBin = path.join(TMP, "chromium");
  if (!existsSync(chromiumBin)) return;
  const nspr = sparticuzLibPath("libnspr4.so");
  const nss = sparticuzLibPath("libnss3.so");
  if (nspr && nss) return;
  await fs.unlink(chromiumBin).catch(() => {});
  await fs.rm(path.join(TMP, "al2023"), { recursive: true, force: true }).catch(() => {});
  await fs.rm(path.join(TMP, "al2"), { recursive: true, force: true }).catch(() => {});
}

async function launchBrowser() {
  if (IS_SERVERLESS) {
    const [{ default: chromium }, { default: puppeteerCore }] = await Promise.all([
      import("@sparticuz/chromium"),
      import("puppeteer-core"),
    ]);
    await resetSparticuzArtifactsIfIncomplete();
    const executablePath = await chromium.executablePath();
    mergeSparticuzLdLibraryPath();
    return puppeteerCore.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: true,
    });
  }

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
    const htmlWithFonts = await injectWaiverPdfFonts(html);
    await page.setContent(htmlWithFonts, { waitUntil: "load" });
    await Promise.race([
      page.evaluate(() => document.fonts.ready),
      new Promise((r) => setTimeout(r, 4000)),
    ]);
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
