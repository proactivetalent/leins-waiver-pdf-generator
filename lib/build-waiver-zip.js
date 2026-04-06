import archiver from "archiver";
import { buffer } from "node:stream/consumers";
import { companyToFilePart, nextPdfFilename } from "./waiver-filenames";
import { htmlForWaiver, htmlToPdfBuffer } from "./pdf-generator";

/**
 * @param {Array<{ company: string, amount: number, pdfKinds: string[], owner?: string, address?: string, invoiceId?: string, project?: string }>} validRows
 * @param {Array<{ row: number, reason: string }>} skipped
 */
export async function buildWaiverZip(validRows, skipped) {
  const usage = new Map();
  /** @type {Array<{ name: string, buffer: Buffer }>} */
  const entries = [];
  /** @type {{ conditional: number, unconditional: number, partial: number }} */
  const pdfCounts = { conditional: 0, unconditional: 0, partial: 0 };

  for (const row of validRows) {
    const part = companyToFilePart(row.company) || "Company";
    for (const kind of row.pdfKinds) {
      pdfCounts[/** @type {"conditional"|"unconditional"|"partial"} */ (kind)]++;
      const name = nextPdfFilename(part, kind, usage);
      const html = await htmlForWaiver(
        /** @type {"conditional"|"unconditional"|"partial"} */ (kind),
        row
      );
      const pdfBuffer = await htmlToPdfBuffer(html);
      entries.push({ name, buffer: pdfBuffer });
    }
  }

  const manifest = {
    validRowCount: validRows.length,
    pdfCount: entries.length,
    pdfCounts,
    skipped,
  };
  const manifestBuf = Buffer.from(JSON.stringify(manifest, null, 2), "utf8");

  const archive = archiver("zip", { zlib: { level: 9 } });
  const done = buffer(archive);

  for (const { name, buffer: b } of entries) {
    archive.append(b, { name });
  }
  archive.append(manifestBuf, { name: "manifest.json" });

  await archive.finalize();
  const zipBuffer = await done;

  return { zipBuffer, manifest };
}
