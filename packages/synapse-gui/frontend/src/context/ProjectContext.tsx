/**
 * synapse-gui frontend ProjectContext
 * -----------------------------------------
 * Tracks which Project is currently open. Deliberately separate from
 * WorkspaceContext (dataset/config/run state): selecting a project is a
 * pre-workspace concern, and keeping it in its own context means it can
 * survive a WorkspaceContext.reset() (e.g. "start a new analysis in the
 * same project") without extra plumbing.
 *
 * currentProjectId is mirrored to sessionStorage so a page refresh while
 * inside a project's workspace doesn't silently drop back to "no
 * project" -- it does NOT use localStorage, since a project selection is
 * meant to be scoped to this browser tab/session, not to persist forever
 * across logins the way the auth token does.
 */

import { createContext, useContext, useState, type ReactNode } from "react";

const CURRENT_PROJECT_STORAGE_KEY = "synapse_current_project";

interface CurrentProject {
  projectId: string;
  name: string;
}

interface ProjectContextValue {
  currentProject: CurrentProject | null;
  setCurrentProject: (project: CurrentProject) => void;
  clearCurrentProject: () => void;
}

const ProjectContext = createContext<ProjectContextValue | undefined>(undefined);

function readStoredProject(): CurrentProject | null {
  const raw = sessionStorage.getItem(CURRENT_PROJECT_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CurrentProject;
  } catch {
    return null;
  }
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [currentProject, setCurrentProjectState] = useState<CurrentProject | null>(readStoredProject);

  function setCurrentProject(project: CurrentProject): void {
    setCurrentProjectState(project);
    sessionStorage.setItem(CURRENT_PROJECT_STORAGE_KEY, JSON.stringify(project));
  }

  function clearCurrentProject(): void {
    setCurrentProjectState(null);
    sessionStorage.removeItem(CURRENT_PROJECT_STORAGE_KEY);
  }

  return (
    <ProjectContext.Provider value={{ currentProject, setCurrentProject, clearCurrentProject }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject(): ProjectContextValue {
  const context = useContext(ProjectContext);
  if (context === undefined) throw new Error("useProject() must be used within a <ProjectProvider>.");
  return context;
}