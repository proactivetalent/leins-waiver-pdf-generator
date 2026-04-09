/**
 * @param {string} company
 * @returns {string} safe segment for filenames (keeps spaces)
 */
export function companyToFilePart(company) {
  return company
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^a-zA-Z0-9 _-]/g, "");
}

/**
 * @param {string} [invoiceId]
 * @returns {string} safe segment for filenames
 */
export function invoiceToFilePart(invoiceId) {
  const raw = String(invoiceId ?? "").trim();
  if (!raw) return "No_Invoice_ID";
  const part = raw
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "");
  return part || "No_Invoice_ID";
}

const KIND_LABEL = {
  conditional: "CWOL",
  unconditional: "UWOL",
  partial: "PWOL",
};

/**
 * SubcontractorName + WaiverOfLienType + "-" + InvoiceNumber (+ optional suffix if duplicate).
 *
 * @param {string} companyPart from companyToFilePart
 * @param {"conditional"|"unconditional"|"partial"} kind
 * @param {string} invoicePart from invoiceToFilePart
 * @param {Map<string, number>} usage key: `${companyPart}\0${kind}\0${invoicePart}`
 */
export function nextPdfFilename(companyPart, kind, invoicePart, usage) {
  const typePart = KIND_LABEL[kind];
  const key = `${companyPart}\0${kind}\0${invoicePart}`;
  const n = (usage.get(key) ?? 0) + 1;
  usage.set(key, n);
  const base = `${companyPart}_${typePart}-${invoicePart}`;
  if (n === 1) return `${base}.pdf`;
  return `${base}_${n}.pdf`;
}
