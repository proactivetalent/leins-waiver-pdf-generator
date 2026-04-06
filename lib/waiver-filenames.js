/**
 * @param {string} company
 * @returns {string} safe segment for filenames (spaces → underscores)
 */
export function companyToFilePart(company) {
  return company
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "");
}

const KIND_LABEL = {
  conditional: "Conditional",
  unconditional: "Unconditional",
  partial: "Partial",
};

/**
 * @param {string} companyPart from companyToFilePart
 * @param {"conditional"|"unconditional"|"partial"} kind
 * @param {Map<string, number>} usage key: `${companyPart}_${kind}`
 */
export function nextPdfFilename(companyPart, kind, usage) {
  const label = KIND_LABEL[kind];
  const key = `${companyPart}_${kind}`;
  const n = (usage.get(key) ?? 0) + 1;
  usage.set(key, n);
  if (n === 1) return `${companyPart}_${label}.pdf`;
  return `${companyPart}_${label}_${n}.pdf`;
}
