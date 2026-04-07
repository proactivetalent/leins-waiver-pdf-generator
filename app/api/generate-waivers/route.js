import { NextResponse } from "next/server";
import { parseWaiverWorkbook } from "@/lib/excel-parser";
import { buildWaiverZip } from "@/lib/build-waiver-zip";
import { closePdfBrowser } from "@/lib/pdf-generator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ALLOWED_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

function isXlsxFilename(name) {
  return typeof name === "string" && name.toLowerCase().endsWith(".xlsx");
}

/** YYYY-MM-DD in UTC (same instant as `Date` on the server). */
function lienWaiversZipFilename() {
  const d = new Date().toISOString().slice(0, 10);
  return `Leins-Waivers-${d}.zip`;
}

/**
 * POST /api/generate-waivers — multipart field "file" (.xlsx).
 * Returns application/zip on success, or JSON errors.
 */
export async function POST(request) {
  let formData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Expected multipart form data with a file field." },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json(
      { ok: false, error: 'Missing file. Use form field name "file".' },
      { status: 400 }
    );
  }

  const filename = "name" in file ? file.name : "";
  if (!isXlsxFilename(filename)) {
    return NextResponse.json(
      { ok: false, error: "Only .xlsx files are accepted." },
      { status: 400 }
    );
  }

  const mime = "type" in file ? file.type : "";
  if (mime && !ALLOWED_TYPES.has(mime) && mime !== "application/octet-stream") {
    return NextResponse.json(
      { ok: false, error: "File must be an Excel spreadsheet (.xlsx)." },
      { status: 400 }
    );
  }

  let buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not read uploaded file." },
      { status: 400 }
    );
  }

  if (buffer.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Uploaded file is empty." },
      { status: 400 }
    );
  }

  const parsed = parseWaiverWorkbook(buffer);
  if ("error" in parsed) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  const { validRows, skipped } = parsed;

  if (validRows.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "No valid rows to generate PDFs. Fix your spreadsheet or skipped rows.",
        skippedRowCount: skipped.length,
        skipped,
      },
      { status: 400 }
    );
  }

  try {
    const { zipBuffer, manifest } = await buildWaiverZip(validRows, skipped);
    const { pdfCounts } = manifest;
    const zipName = lienWaiversZipFilename();

    /** @type {Record<string, string>} */
    const headers = {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipName}"`,
      "X-Waiver-Valid-Rows": String(manifest.validRowCount),
      "X-Waiver-Pdf-Count": String(manifest.pdfCount),
      "X-Waiver-Pdf-Conditional": String(pdfCounts.conditional),
      "X-Waiver-Pdf-Unconditional": String(pdfCounts.unconditional),
      "X-Waiver-Pdf-Partial": String(pdfCounts.partial),
      "X-Waiver-Skipped-Count": String(skipped.length),
    };
    // Let the UI list skip reasons without opening the ZIP (omit if too large for proxies).
    if (skipped.length > 0) {
      const payload = Buffer.from(JSON.stringify(skipped), "utf8").toString("base64");
      if (payload.length < 6000) {
        headers["X-Waiver-Skipped-Detail"] = payload;
      }
    }

    return new NextResponse(zipBuffer, {
      status: 200,
      headers,
    });
  } catch (err) {
    console.error("[generate-waivers]", err);
    await closePdfBrowser().catch(() => {});
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "PDF or ZIP generation failed. Check server logs.",
      },
      { status: 500 }
    );
  }
}
