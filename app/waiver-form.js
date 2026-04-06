"use client";

import { useState, useCallback, useRef } from "react";

function UploadIcon({ className }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 16V4m0 0 4 4m-4-4L8 8" />
      <path d="M4 14.5V18a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3.5" />
    </svg>
  );
}

function CheckIcon({ className }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function Spinner({ className }) {
  return (
    <svg
      className={`animate-spin ${className ?? ""}`}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        className="opacity-25"
      />
      <path
        fill="currentColor"
        className="opacity-80"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

export default function WaiverForm() {
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const resetFeedback = useCallback(() => {
    setError(null);
    setSummary(null);
  }, []);

  const pickFile = useCallback(
    (f) => {
      if (!f) return;
      if (/\.xlsx$/i.test(f.name)) {
        setFile(f);
        resetFeedback();
      } else {
        setFile(null);
        setError("Please choose a .xlsx file.");
      }
    },
    [resetFeedback]
  );

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    setSummary(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/generate-waivers", {
        method: "POST",
        body: formData,
      });

      const ct = res.headers.get("content-type") || "";

      if (res.ok && ct.includes("application/zip")) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "lien-waivers.zip";
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);

        setSummary({
          downloaded: true,
          validRowCount: Number(res.headers.get("X-Waiver-Valid-Rows") || 0),
          pdfCount: Number(res.headers.get("X-Waiver-Pdf-Count") || 0),
          pdfConditional: Number(res.headers.get("X-Waiver-Pdf-Conditional") || 0),
          pdfUnconditional: Number(res.headers.get("X-Waiver-Pdf-Unconditional") || 0),
          pdfPartial: Number(res.headers.get("X-Waiver-Pdf-Partial") || 0),
          skippedCount: Number(res.headers.get("X-Waiver-Skipped-Count") || 0),
        });
        return;
      }

      const data = await res.json().catch(() => ({}));
      setError(data.error || res.statusText || "Request failed");

      if (Array.isArray(data.skipped) && data.skipped.length > 0) {
        setSummary({
          downloaded: false,
          skippedOnly: true,
          skipped: data.skipped,
          skippedCount: data.skipped.length,
        });
      }
    } catch (err) {
      setError(err?.message || "Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative min-h-screen px-4 py-14 sm:px-6 sm:py-20">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(24,24,27,0.06),transparent)]"
        aria-hidden
      />

      <div className="relative mx-auto w-full max-w-md">
        <header className="mb-10 text-center sm:mb-12">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
            Internal
          </p>
          <h1 className="mt-3 text-[1.65rem] font-semibold tracking-tight text-zinc-900 sm:text-3xl">
            Lien waiver PDFs
          </h1>
          <p className="mx-auto mt-4 max-w-[28rem] text-[13px] leading-relaxed text-zinc-500">
            Upload an Excel workbook with{" "}
            <span className="text-zinc-700">Company</span>,{" "}
            <span className="text-zinc-700">Amount</span>, and{" "}
            <span className="text-zinc-700">Type of Invoice</span>. Optional columns{" "}
            <span className="text-zinc-700">Owner</span> and{" "}
            <span className="text-zinc-700">Address</span> override the default hiring
            entity and job address when filled; optional{" "}
            <span className="text-zinc-700">Invoice ID</span> fills the document ID box
            (otherwise it stays blank); optional{" "}
            <span className="text-zinc-700">Project</span> prints on the waiver header
            (left). Invoice type only needs a
            keyword (week, month, final, one-time, deposit, progress, or a month
            name). You get a ZIP of PDFs plus{" "}
            <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[11px] text-zinc-600">
              manifest.json
            </code>{" "}
            for skipped rows.
          </p>
        </header>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-zinc-200/80 bg-[var(--surface)] p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_40px_-12px_rgba(0,0,0,0.08)] sm:p-8"
        >
          <label className="sr-only" htmlFor="file-input">
            Excel file
          </label>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              pickFile(f);
            }}
            className={`rounded-xl border-2 border-dashed transition-colors duration-200 ${
              dragOver
                ? "border-zinc-900/30 bg-zinc-50"
                : "border-zinc-200 bg-zinc-50/50"
            } ${file ? "border-emerald-200/80 bg-emerald-50/30" : ""}`}
          >
            <div className="flex flex-col items-center gap-3 px-4 py-10 text-center sm:py-12">
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-full ${
                  file ? "bg-emerald-100 text-emerald-700" : "bg-zinc-200/60 text-zinc-500"
                }`}
              >
                {file ? <CheckIcon /> : <UploadIcon />}
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-800">
                  {file ? file.name : "Drop .xlsx here or browse"}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {file
                    ? "Ready to generate"
                    : "One sheet · required + optional columns in row 1"}
                </p>
              </div>
              <input
                ref={fileInputRef}
                id="file-input"
                type="file"
                name="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) pickFile(f);
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-1 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-xs font-medium text-zinc-700 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50"
              >
                Choose file
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={!file || busy}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 py-3.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:pointer-events-none disabled:opacity-35"
          >
            {busy ? (
              <>
                <Spinner className="text-white" />
                Generating PDFs…
              </>
            ) : (
              "Generate & download ZIP"
            )}
          </button>
        </form>

        {error && (
          <div
            className="mt-6 rounded-xl border border-red-100 bg-red-50/90 px-4 py-3.5 text-sm text-red-900 shadow-sm"
            role="alert"
          >
            {error}
          </div>
        )}

        {summary?.downloaded && (
          <div className="mt-6 rounded-xl border border-emerald-100 bg-emerald-50/80 px-4 py-4 text-sm text-emerald-950 shadow-sm">
            <p className="font-medium text-emerald-900">Download started</p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-5">
              <div className="rounded-lg bg-white/60 py-2">
                <dt className="text-emerald-700/80">Rows</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-emerald-950">
                  {summary.validRowCount}
                </dd>
              </div>
              <div className="rounded-lg bg-white/60 py-2">
                <dt className="text-emerald-700/80">Skipped</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-emerald-950">
                  {summary.skippedCount}
                </dd>
              </div>
              <div className="rounded-lg bg-white/60 py-2">
                <dt className="text-emerald-700/80">Conditional</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-emerald-950">
                  {summary.pdfConditional}
                </dd>
              </div>
              <div className="rounded-lg bg-white/60 py-2">
                <dt className="text-emerald-700/80">Unconditional</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-emerald-950">
                  {summary.pdfUnconditional}
                </dd>
              </div>
              <div className="rounded-lg bg-white/60 py-2">
                <dt className="text-emerald-700/80">Partial</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-emerald-950">
                  {summary.pdfPartial}
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-center text-[11px] text-emerald-800/80">
              {summary.pdfCount} PDF{summary.pdfCount === 1 ? "" : "s"} total in ZIP
            </p>
          </div>
        )}

        {summary?.skippedOnly && summary.skipped?.length > 0 && (
          <div className="mt-6 rounded-xl border border-amber-100 bg-amber-50/80 px-4 py-3.5 text-xs text-amber-950 shadow-sm">
            <p className="text-sm font-medium text-amber-900">Skipped rows</p>
            <ul className="mt-2 max-h-36 space-y-1.5 overflow-y-auto text-amber-900/90">
              {summary.skipped.map((s) => (
                <li key={`${s.row}-${s.reason}`} className="leading-snug">
                  <span className="font-medium tabular-nums">Row {s.row}</span>
                  <span className="text-amber-800/90"> — {s.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
