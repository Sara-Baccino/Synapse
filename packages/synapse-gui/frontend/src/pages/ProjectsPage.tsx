/**
 * synapse-gui frontend ProjectsPage
 * -----------------------------------------
 * Pre-workspace landing page: list of resumable Projects, each
 * associated with its own datasets/configs/runs (tagging wired in
 * Block B). Selecting a project ("Use Project") sets it in
 * ProjectContext and enters the existing workspace unchanged.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { createProject, deleteProject, listProjects, renameProject } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useProject } from "../context/ProjectContext";
import { useWorkspace } from "../context/WorkspaceContext";
import type { ProjectDTO } from "../types/api";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

export function ProjectsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, logout } = useAuth();
  const { setCurrentProject } = useProject();
  const { reset: resetWorkspace } = useWorkspace();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);

  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: () => listProjects() });

  const createMutation = useMutation({
    mutationFn: (name: string) => createProject({ name }),
    onSuccess: () => {
      setNewProjectName("");
      setShowCreateForm(false);
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({ projectId, name }: { projectId: string; name: string }) => renameProject(projectId, { name }),
    onSuccess: () => {
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (projectId: string) => deleteProject(projectId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects"] }),
  });

  function handleUseProject(project: ProjectDTO) {
    setCurrentProject({ projectId: project.project_id, name: project.name });
    // A different project means a clean slate: the dataset/config/run
    // state of whichever project was open before must not leak in.
    resetWorkspace();
    navigate("/workspace/modules/matching/data");
  }

  function startRename(project: ProjectDTO) {
    setEditingId(project.project_id);
    setEditingName(project.name);
  }

  function commitRename(projectId: string) {
    const trimmed = editingName.trim();
    if (!trimmed) {
      setEditingId(null);
      return;
    }
    renameMutation.mutate({ projectId, name: trimmed });
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className="flex w-64 flex-shrink-0 flex-col justify-between border-r border-slate-200 bg-white p-4">
        <div>
          <div className="mb-8 flex items-center gap-2 px-2">
            <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-violet-500 via-pink-500 to-amber-400 bg-clip-text text-transparent">
              Synapse
            </span>
          </div>
          <button className="flex w-full items-center gap-2 rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white">
            All Projects
          </button>
        </div>

        <div className="space-y-3">
          {user && <p className="px-2 text-xs text-slate-400 truncate" title={user.full_name}>{user.full_name}</p>}
          <button
            onClick={logout}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-800">Projects</h1>
          <button
            onClick={() => setShowCreateForm((v) => !v)}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-blue-700"
          >
            Create Project +
          </button>
        </div>

        {showCreateForm && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <input
              autoFocus
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && newProjectName.trim() && createMutation.mutate(newProjectName.trim())}
              placeholder="Project name"
              className="flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm"
            />
            <button
              onClick={() => newProjectName.trim() && createMutation.mutate(newProjectName.trim())}
              disabled={!newProjectName.trim() || createMutation.isPending}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-40"
            >
              {createMutation.isPending ? "Creazione..." : "Create"}
            </button>
          </div>
        )}

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-400">
                <th className="px-4 py-3">Project Name</th>
                <th className="px-4 py-3">Created By</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {projectsQuery.isLoading && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">Caricamento...</td></tr>
              )}
              {projectsQuery.data?.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">Nessun progetto. Creane uno per iniziare.</td></tr>
              )}
              {projectsQuery.data?.map((project) => (
                <tr key={project.project_id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {editingId === project.project_id ? (
                      <input
                        autoFocus
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={() => commitRename(project.project_id)}
                        onKeyDown={(e) => e.key === "Enter" && commitRename(project.project_id)}
                        className="rounded border border-slate-300 px-2 py-1 text-sm"
                      />
                    ) : (
                      <button onClick={() => startRename(project)} className="hover:underline" title="Click to rename">
                        {project.name}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{project.created_by}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(project.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleUseProject(project)}
                        className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Use Project
                      </button>
                      <button
                        onClick={() => confirm(`Eliminare il progetto "${project.name}"?`) && deleteMutation.mutate(project.project_id)}
                        className="rounded border border-red-200 px-2 py-1.5 text-xs text-red-500 hover:bg-red-50"
                        title="Delete"
                      >
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}