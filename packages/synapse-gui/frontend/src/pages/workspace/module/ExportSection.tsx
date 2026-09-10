/**
 * synapse-gui frontend ExportSection
 * -------------------------------------------
 * Downloads (matched dataset CSV, PDF report) for the currently selected
 * run (WorkspaceContext.currentRunId), via the real authenticated
 * download endpoints.
 */

import { Link } from "react-router-dom";

import { buildMatchingDownloadUrl, buildMatchingReportUrl, downloadAuthenticatedFile } from "../../../api/client";
import { useWorkspace } from "../../../context/WorkspaceContext";

export function ExportSection() {
  const { runs, currentRunId } = useWorkspace();
  const currentRun = runs.find((r) => r.id === currentRunId);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800 mb-4">Export</h1>

      {currentRun ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm space-y-3">
          <p className="mb-1 text-sm text-slate-600">Exporting: {currentRun.label}</p>
          <div className="flex gap-2">
            <button
              onClick={() => downloadAuthenticatedFile(buildMatchingDownloadUrl(currentRun.jobId, "datasets", "matched_dataset"), `matched_dataset-${currentRun.jobId}.csv`)}
              className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700"
            >
              Download matched dataset (CSV)
            </button>
            <button
              onClick={() => downloadAuthenticatedFile(buildMatchingReportUrl(currentRun.jobId), `synapse-report-${currentRun.jobId}.pdf`)}
              className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700"
            >
              Download PDF report
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-400">No run selected yet.</p>
      )}

      <div className="mt-8 flex items-center gap-3">
        <Link to="/" className="ml-auto rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
          ← Back to Home
        </Link>
      </div>
    </div>
  );
}