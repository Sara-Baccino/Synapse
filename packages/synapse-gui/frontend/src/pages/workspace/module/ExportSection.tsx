/**
 * synapse-gui frontend ExportSection
 * -------------------------------------------
 *
 * Operates on currentRunId instead of the old singular jobId. Download
 * buttons wired to real endpoints (buildMatchingDownloadUrl/
 * buildMatchingReportUrl already exist), but disabled until a real
 * run's jobId is available -- Phase A has no real runs yet by
 * construction (CompareGuard/RunGuard gate this), so this mostly
 * verifies layout.
 */

import { Link } from "react-router-dom";

import { buildMatchingReportUrl, downloadAuthenticatedFile } from "../../../api/client";
import { useWorkspace } from "../../../context/WorkspaceContext";

export function ExportSection() {
  const { runs, currentRunId } = useWorkspace();
  const currentRun = runs.find((r) => r.id === currentRunId);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800 mb-4">Export</h1>

      {currentRun ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <p className="mb-4 text-sm text-slate-600">Exporting: {currentRun.label}</p>
          <button
            onClick={() => downloadAuthenticatedFile(buildMatchingReportUrl(currentRun.jobId), `synapse-report-${currentRun.jobId}.pdf`)}
            className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white"
          >
            Download PDF report
          </button>
        </div>
      ) : (
        <p className="text-sm text-slate-400">No run selected yet.</p>
      )}

      <div className="mt-8 flex items-center gap-3">
        <button disabled title="Coming soon" className="rounded bg-slate-200 px-4 py-2 text-sm text-slate-400 cursor-not-allowed">
          Continue composing pipeline
        </button>
        <Link to="/" className="ml-auto rounded border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
          ← Back to Home
        </Link>
      </div>
    </div>
  );
}