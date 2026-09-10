import { createBrowserRouter, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";

import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { ModuleInfoPage } from "./pages/ModuleInfoPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { DemoPage } from "./pages/demo/DemoPage";
import { ModuleSelectionPage } from "./pages/workspace/ModuleSelectionPage";

import { ModuleWorkspaceLayout } from "./pages/workspace/module/ModuleWorkspaceLayout";
import { DataSection } from "./pages/workspace/module/DataSection";
import { ExplorationSection } from "./pages/workspace/module/ExplorationSection";
import { MatchingDesignSection } from "./pages/workspace/module/MatchingDesignSection";
import { ResultsSection } from "./pages/workspace/module/ResultsSection";
import { CompareRunsSection } from "./pages/workspace/module/CompareRunsSection";
import { ExportSection } from "./pages/workspace/module/ExportSection";

export const router = createBrowserRouter([
  { path: "/", element: <LandingPage /> },
  { path: "/login", element: <LoginPage /> },
  { path: "/modules/:moduleId", element: <ModuleInfoPage /> },
  { path: "/demo", element: <DemoPage /> },

  // All Projects: nuova landing page pre-workspace, protetta da login.
  { path: "/projects", element: <ProtectedRoute><ProjectsPage /></ProtectedRoute> },

  // Ingresso diretto al Workspace: ora passa sempre da All Projects
  { path: "/workspace", element: <Navigate to="/projects" replace /> },
  { path: "/workspace/dataset", element: <Navigate to="/projects" replace /> },
  { path: "/workspace/modules", element: <ProtectedRoute><ModuleSelectionPage /></ProtectedRoute> },

  // Struttura fissa con Sidebar sempre presente
  {
    path: "/workspace/modules/:moduleId",
    element: <ProtectedRoute><ModuleWorkspaceLayout /></ProtectedRoute>,
    children: [
      { index: true, element: <Navigate to="data" replace /> },
      { path: "data", element: <DataSection /> },
      { path: "exploration", element: <ExplorationSection /> },
      { path: "design", element: <MatchingDesignSection /> },
      { path: "results", element: <ResultsSection /> },
      { path: "compare", element: <CompareRunsSection /> },
      { path: "export", element: <ExportSection /> },
    ],
  },
  { path: "*", element: <Navigate to="/projects" replace /> }
]);