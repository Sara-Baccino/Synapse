import { useWorkspace } from "../../../context/WorkspaceContext";
import { useStructureRun } from "../../../hooks/useStructureRun";
import { buildDownloadUrl, buildReportUrl, downloadAuthenticatedFile } from "../../../api/client";
import { Link } from "react-router-dom"

export function ExportSection() {
  const { jobId } = useWorkspace();
  const { statusQuery, resultQuery, isFinished } = useStructureRun(jobId);

  if (!jobId) {
    return <div className="text-slate-600">No job selected.</div>;
  }

  if (!isFinished) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-slate-700">{statusQuery.data?.progress.message ?? "Analysis in progress..."}</p>
        {statusQuery.data?.progress.percentage != null && (
          <div className="mt-3 h-2 w-full rounded bg-slate-100">
            <div
              className="h-2 rounded bg-blue-600 transition-all"
              style={{ width: `${statusQuery.data.progress.percentage}%` }}
            />
          </div>
        )}
      </div>
    );
  }

  if (resultQuery.isError || !resultQuery.data) {
    return <div className="text-red-600">Failed to load export options.</div>;
  }

  const { success, tables, datasets } = resultQuery.data;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-800">Export & Reports</h1>

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-medium text-slate-800">Reports & Downloads</h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() =>
              downloadAuthenticatedFile(buildReportUrl(jobId), `synapse-report-${jobId}.pdf`)
            }
            className="rounded bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700 transition"
          >
            Download PDF report
          </button>
        </div>
      </div>

      {success && (
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-medium text-slate-800">Dataset & Table Exports</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[...tables, ...datasets].map((table) => (
              <div key={table.name} className="flex items-center justify-between rounded border border-slate-200 p-3">
                <span className="text-sm font-medium text-slate-700">{table.name}</span>
                <button
                  onClick={() =>
                    downloadAuthenticatedFile(
                      buildDownloadUrl(
                        jobId,
                        tables.includes(table) ? "tables" : "datasets",
                        table.name
                      ),
                      `${table.name}.csv`
                    )
                  }
                  className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50 transition"
                >
                  Download CSV
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-medium text-slate-800">Integration</h2>
        <div>
          <button
            disabled
            title="Use an artifact from this run as input for another module (coming soon)"
            className="rounded border border-slate-200 px-3 py-1.5 text-sm text-slate-400 cursor-not-allowed bg-slate-50"
          >
            Use as input (coming soon)
          </button>
        </div>
      </div>

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